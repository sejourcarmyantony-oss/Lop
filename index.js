require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const express = require('express');
const readline = require('readline');

const config = require('./config');
const { flat: commands } = require('./commands/registry');

const SESSION_DIR = path.join(__dirname, 'session');
const logger = pino({ level: 'silent' });

// ---------------------------------------------------------------
// Petit serveur HTTP : obligatoire sur Render (Web Service) pour
// que la plateforme considère le service comme "en ligne".
// ---------------------------------------------------------------
const app = express();
app.get('/', (req, res) => res.send('✅ Shadow Bot est en ligne.'));
app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Serveur HTTP de statut démarré sur le port ${process.env.PORT || 3000}`);
});

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: ['Shadow Bot', 'Chrome', '1.0.0']
  });

  // ---- Connexion par code de pairing (pas de QR) ----
  if (!sock.authState.creds.registered) {
    let phone = process.env.OWNER_PHONE;
    if (!phone) {
      if (!process.stdin.isTTY) {
        // Sur Render (et tout hébergeur sans terminal interactif), il n'y a personne
        // pour répondre à un readline.question() : ça bloquerait le process indéfiniment
        // sans jamais planter ni afficher d'erreur claire. On arrête proprement à la place.
        console.error('❌ OWNER_PHONE manquant. Sur un hébergeur comme Render, ajoute la variable d\'environnement OWNER_PHONE (ton numéro avec indicatif, sans le +) dans Dashboard > Environment, puis redéploie.');
        process.exit(1);
      }
      phone = await askQuestion('📱 Entre le numéro WhatsApp du bot (avec indicatif, ex: 50931277118) : ');
    }
    try {
      const code = await sock.requestPairingCode(phone.replace(/\D/g, ''));
      console.log(`\n🔗 Code de pairing : ${code}\n`);
      console.log('👉 Ouvre WhatsApp > Appareils liés > Lier un appareil > Lier avec un numéro de téléphone, puis entre ce code.\n');
    } catch (e) {
      console.error('❌ Impossible de générer le code de pairing :', e.message);
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('✅ Shadow Bot connecté et prêt !');
      // Applique la photo de profil fournie une seule fois (marqueur .picset)
      const marker = path.join(SESSION_DIR, '.picset');
      const picPath = path.join(__dirname, 'media', 'botpic.jpg');
      if (!fs.existsSync(marker) && fs.existsSync(picPath)) {
        try {
          // Bug corrigé : { url: cheminLocal } n'est pas un format d'image valide pour
          // Baileys (il attend une URL http(s) ou un Buffer) — on lit le fichier en Buffer.
          await sock.updateProfilePicture(sock.user.id, fs.readFileSync(picPath));
          fs.writeFileSync(marker, 'done');
          console.log('🖼️ Photo de profil appliquée.');
        } catch (e) {
          console.error('⚠️ Impossible de définir la photo de profil :', e.message);
        }
      }
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Connexion fermée.', statusCode, shouldReconnect ? '→ reconnexion...' : '→ déconnecté définitivement, supprime le dossier session/ pour relier le bot.');
      if (shouldReconnect) {
        // Bug corrigé : aucun délai avant de retenter — en cas de coupure persistante
        // (réseau, erreur serveur WhatsApp), le bot pouvait entrer dans une boucle de
        // reconnexion immédiate en continu, ce qui consomme du CPU/réseau inutilement
        // et peut faire repérer le compte comme suspect par WhatsApp.
        setTimeout(() => {
          startBot().catch(err => console.error('Erreur au redémarrage :', err));
        }, 5000);
      }
    }
  });

  // ---- Données de modération persistées par commands/group.js ----
  const groupdataPath = path.join(__dirname, 'groupdata.json');
  function loadGroupData() {
    if (!fs.existsSync(groupdataPath)) return {};
    try { return JSON.parse(fs.readFileSync(groupdataPath, 'utf-8')); } catch { return {}; }
  }
  function saveGroupData(d) { fs.writeFileSync(groupdataPath, JSON.stringify(d, null, 2)); }

  const autorepliesPath = path.join(__dirname, 'autoreplies.json');
  function loadAutoReplies() {
    if (!fs.existsSync(autorepliesPath)) return {};
    try { return JSON.parse(fs.readFileSync(autorepliesPath, 'utf-8')); } catch { return {}; }
  }

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message) return;
    // Bug corrigé : le bot connecte avec le numéro du créateur lui-même (usage "self-bot").
    // Ignorer systématiquement fromMe (comme le fait la plupart des tutoriels Baileys pour
    // un bot "compte séparé") empêchait Olsen-dev d'envoyer la moindre commande depuis son
    // propre téléphone. On laisse maintenant passer ses propres messages ; handleMessage()
    // ne les traite que s'ils commencent par le préfixe, pour ne pas boucler sur les
    // réponses que le bot envoie lui-même.

    try {
      await handleMessage(sock, msg, { loadGroupData, saveGroupData, loadAutoReplies });
    } catch (err) {
      console.error('❌ Erreur en traitant un message :', err);
      try {
        await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Une erreur est survenue en exécutant cette commande. Elle a été notée dans les logs du serveur.' });
      } catch {}
    }
  });

  // ---- Messages de bienvenue / départ (setwelcome, setgoodbye, welcome on/off, goodbye on/off) ----
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id: groupJid, participants, action } = update;
      const data = loadGroupData();
      const g = data[groupJid];
      if (!g) return;
      for (const jid of participants) {
        if (action === 'add' && g.welcome && g.welcomeMsg) {
          const text = g.welcomeMsg.replace(/{user}/g, `@${jid.split('@')[0]}`);
          await sock.sendMessage(groupJid, { text, mentions: [jid] });
        }
        if (action === 'remove' && g.goodbye && g.goodbyeMsg) {
          const text = g.goodbyeMsg.replace(/{user}/g, `@${jid.split('@')[0]}`);
          await sock.sendMessage(groupJid, { text, mentions: [jid] });
        }
      }
    } catch (err) {
      console.error('❌ Erreur bienvenue/départ :', err);
    }
  });

  return sock;
}

function getMessageText(message) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

async function handleMessage(sock, msg, { loadGroupData, saveGroupData, loadAutoReplies }) {
  const chatJid = msg.key.remoteJid;

  // Statuts (stories) et chaînes : pas des conversations, on les ignore pour
  // éviter des erreurs sur des appels (groupMetadata, etc.) qui n'ont pas de sens ici.
  if (chatJid === 'status@broadcast' || chatJid?.endsWith('@newsletter')) return;

  const isGroup = chatJid.endsWith('@g.us');
  const isFromOwnAccount = msg.key.fromMe;
  const sender = isFromOwnAccount ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : (isGroup ? msg.key.participant : chatJid);
  if (!sender) return; // message système sans expéditeur identifiable

  const bodyMessage = msg.message.viewOnceMessageV2?.message || msg.message.viewOnceMessage?.message || msg.message;
  const text = getMessageText(bodyMessage);
  const prefix = config.get('prefix');

  // Un message envoyé depuis le compte du bot lui-même (le créateur, qui pilote son
  // bot depuis son propre téléphone) est toujours considéré comme le créateur — et on
  // ignore tout de suite ce qui n'est pas une commande, pour ne jamais boucler sur les
  // réponses que le bot vient d'envoyer lui-même (modération, réponses automatiques...).
  if (isFromOwnAccount) {
    if (!text.startsWith(prefix)) return;
  } else {
    const ownerJid = config.get('ownerNumber') + '@s.whatsapp.net';
    const sudo = config.get('sudo') || [];
    const bannedUsers = config.get('bannedUsers') || [];
    if (bannedUsers.includes(sender)) return;

    // ---- Modération passive (anti-lien / liste noire de mots / suivi d'activité) ----
    if (isGroup) {
      const data = loadGroupData();
      const g = data[chatJid];
      if (g) {
        g.lastSeen = g.lastSeen || {};
        g.lastSeen[sender] = Date.now();
        saveGroupData(data);

        const linkRegex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me)/i;
        if (g.antilink && linkRegex.test(text) && !text.startsWith(prefix)) {
          try {
            await sock.sendMessage(chatJid, { delete: msg.key });
            await sock.sendMessage(chatJid, { text: `🔗 Lien supprimé (anti-lien actif) — @${sender.split('@')[0]}`, mentions: [sender] });
          } catch {}
          return;
        }
        if (g.blacklist?.length && g.blacklist.some(w => text.toLowerCase().includes(w))) {
          try {
            await sock.sendMessage(chatJid, { delete: msg.key });
            await sock.sendMessage(chatJid, { text: `🚫 Message supprimé (mot interdit) — @${sender.split('@')[0]}`, mentions: [sender] });
          } catch {}
          return;
        }
      }
    }

    if (!text.startsWith(prefix)) {
      // Pas une commande : vérifier les réponses automatiques par mot-clé
      const replies = loadAutoReplies();
      const lower = text.toLowerCase().trim();
      if (replies[lower]) {
        await sock.sendMessage(chatJid, { text: replies[lower] }, { quoted: msg });
      }
      return;
    }
  }

  const ownerJid = config.get('ownerNumber') + '@s.whatsapp.net';
  const sudo = config.get('sudo') || [];
  const isOwner = isFromOwnAccount || sender === ownerJid || sudo.includes(sender);

  const withoutPrefix = text.slice(prefix.length).trim();
  const [cmdName, ...args] = withoutPrefix.split(/\s+/);
  const command = commands[cmdName?.toLowerCase()];
  if (!command) return;

  const argText = args.join(' ');
  const commandContextInfo = bodyMessage.extendedTextMessage?.contextInfo
    || bodyMessage.imageMessage?.contextInfo
    || bodyMessage.videoMessage?.contextInfo
    || {};
  const mentioned = commandContextInfo.mentionedJid || [];
  const quotedParticipant = commandContextInfo.participant;
  if (quotedParticipant && !mentioned.includes(quotedParticipant)) mentioned.push(quotedParticipant);

  let isBotAdmin = false, isSenderAdmin = false, groupJid = null;
  if (isGroup) {
    groupJid = chatJid;
    try {
      const meta = await sock.groupMetadata(chatJid);
      const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      isBotAdmin = meta.participants.some(p => p.id === botId && p.admin);
      isSenderAdmin = meta.participants.some(p => p.id === sender && p.admin) || isOwner;
    } catch (e) {
      console.error('⚠️ Impossible de lire les infos du groupe (le bot est peut-être encore en train de se synchroniser) :', e.message);
    }
  }

  const isViewOnceQuoted = !!(
    commandContextInfo.quotedMessage?.viewOnceMessage ||
    commandContextInfo.quotedMessage?.viewOnceMessageV2
  );

  async function downloadQuoted() {
    const quoted = commandContextInfo.quotedMessage;
    if (!quoted) return null;
    const target = quoted.viewOnceMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
    try {
      // Important : on reconstruit une clé propre au message CITÉ (id + participant du
      // message original), pas celle du message qui contient la commande. Réutiliser
      // msg.key ici pointe vers le mauvais message et fait échouer le téléchargement.
      const quotedKey = {
        remoteJid: chatJid,
        id: commandContextInfo.stanzaId,
        participant: commandContextInfo.participant,
        fromMe: commandContextInfo.participant === sock.user?.id?.split(':')[0] + '@s.whatsapp.net'
      };
      return await downloadMediaMessage({ key: quotedKey, message: target }, 'buffer', {});
    } catch (e) {
      console.error('Erreur téléchargement média :', e.message);
      return null;
    }
  }

  // Détecte le vrai type du média cité (image/vidéo/audio) pour que les commandes
  // qui renvoient ce média (.viewonce notamment) le fassent avec le bon type au lieu
  // de tout envoyer comme "document" générique.
  function getQuotedMediaType() {
    const quoted = commandContextInfo.quotedMessage;
    if (!quoted) return null;
    const target = quoted.viewOnceMessage?.message || quoted.viewOnceMessageV2?.message || quoted;
    if (target.imageMessage) return { type: 'image', mimetype: target.imageMessage.mimetype };
    if (target.videoMessage) return { type: 'video', mimetype: target.videoMessage.mimetype };
    if (target.audioMessage) return { type: 'audio', mimetype: target.audioMessage.mimetype };
    return null;
  }

  async function reply(content) {
    const footer = config.get('footerTag');
    if (typeof content === 'string') {
      const withFooter = `${content}\n\n${footer}`;
      return sock.sendMessage(chatJid, { text: withFooter }, { quoted: msg });
    }
    // Bug corrigé : les commandes qui renvoient un objet { text, mentions } (tagall,
    // hidetag, warn, ship, compliment...) passaient à côté du footer "-Olszn" demandé
    // sur CHAQUE commande, puisque seule la branche "string" l'ajoutait. On l'ajoute
    // maintenant aussi pour tout objet contenant un champ texte, en laissant les
    // médias binaires purs (sticker/image/audio/video/document) sans footer.
    if (content && typeof content === 'object' && typeof content.text === 'string') {
      return sock.sendMessage(chatJid, { ...content, text: `${content.text}\n\n${footer}` }, { quoted: msg });
    }
    return sock.sendMessage(chatJid, content, { quoted: msg });
  }

  const ctx = {
    sock, msg, reply, text: argText, args, mentioned,
    isGroup, groupJid, chatJid, sender,
    isOwner, isBotAdmin, isSenderAdmin,
    isViewOnceQuoted, downloadQuoted, quotedMediaType: getQuotedMediaType(),
    ownerName: config.get('ownerName')
  };

  await command.run(ctx);
}

startBot().catch(err => {
  console.error('❌ Erreur fatale au démarrage :', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => console.error('⚠️ Rejection non gérée :', err));
process.on('uncaughtException', (err) => console.error('⚠️ Exception non capturée :', err));
