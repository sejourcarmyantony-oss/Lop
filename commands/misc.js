const fetch = require('node-fetch');

const tools = [
  {
    name: 'calc',
    description: 'Calculatrice simple. Ex: .calc 5*(3+2)',
    run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .calc <expression>');
      // Bug corrigé : la regex autorisait '**' (exponentiation JS), ce qui permettait
      // des expressions comme 9**9**9 capables de bloquer le process entier (calcul
      // synchrone sur un nombre à des millions de chiffres). On limite la longueur et
      // on bloque l'opérateur d'exponentiation.
      if (text.length > 50) return reply('❌ Expression trop longue (50 caractères max).');
      if (!/^[0-9+\-*/().\s]+$/.test(text) || text.includes('**')) return reply('❌ Expression invalide (chiffres et opérateurs +-*/() uniquement).');
      try {
        const result = Function('"use strict"; return (' + text + ')')();
        if (!Number.isFinite(result)) return reply('❌ Résultat invalide (division par zéro ou nombre trop grand).');
        reply(`🧮 = ${result}`);
      }
      catch { reply('❌ Expression invalide.'); }
    }
  },
  {
    name: 'quote',
    description: 'Citation inspirante aléatoire',
    run: async ({ reply }) => {
      const quotes = [
        "Le succès, c'est se déplacer d'échec en échec sans perdre son enthousiasme.",
        "La vie, c'est comme une bicyclette. Il faut avancer pour ne pas perdre l'équilibre.",
        "Ce qui ne nous tue pas nous rend plus forts.",
        "Le doute est le commencement de la sagesse."
      ];
      reply('💬 ' + quotes[Math.floor(Math.random() * quotes.length)]);
    }
  },
  {
    name: 'fact',
    description: 'Un fait aléatoire',
    run: async ({ reply }) => {
      const facts = [
        "Le miel ne se périme jamais.",
        "Les poulpes ont trois cœurs.",
        "Le Mont Everest grandit d'environ 4mm par an.",
        "Un jour sur Vénus dure plus longtemps qu'une année sur Vénus."
      ];
      reply('📚 ' + facts[Math.floor(Math.random() * facts.length)]);
    }
  },
  { name: 'meme', description: 'Envoie un meme aléatoire', run: async ({ reply }) => reply('🔧 meme nécessite une API de memes (ex: meme-api.com). Voir README.') },
  { name: 'shorturl', description: 'Raccourcit un lien. Ex: .shorturl https://...', run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .shorturl <lien>');
      try {
        const res = await fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(text));
        reply(await res.text());
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  { name: 'qrcode', description: 'Génère un QR code. Ex: .qrcode texte', run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .qrcode <texte>');
      reply({ image: { url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}` }, caption: '✅ QR code généré' });
    }
  },
  { name: 'ip-lookup', description: 'Infos publiques sur une IP. Ex: .ip-lookup 8.8.8.8', run: async ({ reply, args }) => {
      if (!args[0]) return reply('❓ Utilisation : .ip-lookup <adresse IP>');
      try {
        const res = await fetch(`http://ip-api.com/json/${args[0]}`);
        const data = await res.json();
        if (data.status !== 'success') return reply('❌ IP invalide ou introuvable.');
        reply(`🌐 ${data.query}\nPays : ${data.country}\nVille : ${data.city}\nFAI : ${data.isp}`);
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  { name: 'dns-lookup', description: 'Enregistrements DNS publics. Ex: .dns-lookup exemple.com', run: async ({ reply, args }) => {
      if (!args[0]) return reply('❓ Utilisation : .dns-lookup <domaine>');
      try {
        const dns = require('dns').promises;
        const records = await dns.resolve(args[0]).catch(() => []);
        reply(records.length ? '📡 ' + records.join('\n') : '❌ Aucun enregistrement trouvé.');
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  { name: 'headers', description: "En-têtes HTTP d'un site. Ex: .headers https://exemple.com", run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .headers <URL>');
      try {
        const res = await fetch(text, { method: 'HEAD' });
        let out = '';
        res.headers.forEach((v, k) => out += `${k}: ${v}\n`);
        reply('📋 ' + (out || 'Aucun en-tête reçu.'));
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  { name: 'proxy-status', description: 'Vérifie la connectivité réseau du bot', run: async ({ reply }) => {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        reply(`✅ Connecté — IP sortante : ${data.ip}`);
      } catch (e) { reply('❌ Problème réseau : ' + e.message); }
    }
  },
  { name: 'temp-mail', description: 'Explique comment obtenir un email jetable', run: async ({ reply }) => reply('🔧 temp-mail nécessite une API dédiée (ex: mail.tm). Voir README pour l\'intégrer.') },
  { name: 'web-screenshot', description: "Capture d'écran d'un site (nécessite un navigateur headless, lourd pour un hébergement gratuit)", run: async ({ reply }) => reply('🔧 web-screenshot nécessite Puppeteer/Playwright — gourmand en RAM, peu adapté au plan gratuit de Render. Voir README pour l\'activer sur un plan payant.') },
  {
    name: 'base64encode',
    description: 'Encode un texte en base64',
    run: async ({ reply, text }) => text ? reply('🔐 ' + Buffer.from(text).toString('base64')) : reply('❓ Utilisation : .base64encode <texte>')
  },
  {
    name: 'base64decode',
    description: 'Décode un texte base64',
    run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .base64decode <texte encodé>');
      try { reply('🔓 ' + Buffer.from(text, 'base64').toString('utf-8')); }
      catch { reply('❌ Texte base64 invalide.'); }
    }
  },
  {
    name: 'hash',
    description: 'Calcule le hash SHA-256 d\'un texte',
    run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .hash <texte>');
      const crypto = require('crypto');
      reply('🔑 ' + crypto.createHash('sha256').update(text).digest('hex'));
    }
  },
  {
    name: 'unitconvert',
    description: 'Convertit km <-> miles ou kg <-> lb. Ex: .unitconvert 10 km',
    run: async ({ reply, args }) => {
      const value = parseFloat(args[0]);
      const unit = (args[1] || '').toLowerCase();
      if (isNaN(value) || !unit) return reply('❓ Utilisation : .unitconvert <valeur> <km|miles|kg|lb>');
      const table = {
        km: (v) => `${v} km = ${(v * 0.621371).toFixed(2)} miles`,
        miles: (v) => `${v} miles = ${(v * 1.60934).toFixed(2)} km`,
        kg: (v) => `${v} kg = ${(v * 2.20462).toFixed(2)} lb`,
        lb: (v) => `${v} lb = ${(v * 0.453592).toFixed(2)} kg`
      };
      if (!table[unit]) return reply('❓ Unités supportées : km, miles, kg, lb');
      reply('📐 ' + table[unit](value));
    }
  },
  {
    name: 'weather',
    description: 'Météo actuelle. Ex: .weather Paris',
    run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .weather <ville>');
      try {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=1`).then(r => r.json());
        const loc = geo.results?.[0];
        if (!loc) return reply('❌ Ville introuvable.');
        const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`).then(r => r.json());
        const cw = w.current_weather;
        reply(`🌤️ Météo à ${loc.name}, ${loc.country}\n🌡️ ${cw.temperature}°C\n💨 Vent : ${cw.windspeed} km/h`);
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'dictionary',
    description: "Définition d'un mot en anglais. Ex: .dictionary hello",
    run: async ({ reply, args }) => {
      if (!args[0]) return reply('❓ Utilisation : .dictionary <mot en anglais>');
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`);
        const data = await res.json();
        if (!Array.isArray(data)) return reply('❌ Mot introuvable.');
        const def = data[0]?.meanings?.[0]?.definitions?.[0]?.definition;
        reply(`📖 *${args[0]}* : ${def || 'définition indisponible'}`);
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'wikipedia',
    description: 'Résumé Wikipédia. Ex: .wikipedia Haïti',
    run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .wikipedia <sujet>');
      try {
        const res = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`);
        const data = await res.json();
        if (data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return reply('❌ Page introuvable.');
        reply(`📚 *${data.title}*\n${data.extract}`);
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'currency',
    description: 'Convertit une devise. Ex: .currency 10 USD HTG',
    run: async ({ reply, args }) => {
      const [amount, from, to] = args;
      if (!amount || !from || !to) return reply('❓ Utilisation : .currency <montant> <de> <vers> — ex: .currency 10 USD HTG');
      try {
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`);
        const data = await res.json();
        const rate = data.rates?.[to.toUpperCase()];
        if (!rate) return reply('❌ Devise non reconnue.');
        reply(`💱 ${amount} ${from.toUpperCase()} = ${(parseFloat(amount) * rate).toFixed(2)} ${to.toUpperCase()}`);
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'pastebin',
    description: 'Explique comment publier un texte en ligne',
    run: async ({ reply }) => reply('🔧 pastebin nécessite une clé API Pastebin (developer key). Voir README pour l\'ajouter.')
  }
];

const games = [
  {
    name: 'riddle',
    description: 'Devinette aléatoire',
    run: async ({ reply }) => {
      const riddles = [
        { q: "Je n'ai pas de bouche mais je peux parler. Qui suis-je ?", r: "Un écho" },
        { q: "Plus je sèche, plus je deviens mouillé. Qui suis-je ?", r: "Une serviette" },
        { q: "Qu'est-ce qui a des clés mais n'ouvre aucune porte ?", r: "Un clavier / un piano" }
      ];
      const pick = riddles[Math.floor(Math.random() * riddles.length)];
      reply(`🧩 ${pick.q}\n\n(Réponse dans 15s...)`);
    }
  },
  {
    name: 'animequiz',
    description: 'Petit quiz anime',
    run: async ({ reply }) => {
      const quiz = [
        { q: "Quel est le nom du héros de 'Naruto' ?", r: "Naruto Uzumaki" },
        { q: "Dans 'One Piece', comment s'appelle le bateau de l'équipage principal ?", r: "Le Thousand Sunny (ou le Going Merry au début)" }
      ];
      const pick = quiz[Math.floor(Math.random() * quiz.length)];
      reply(`🎌 ${pick.q}`);
    }
  },
  {
    name: 'truth',
    description: 'Question "action ou vérité" — vérité',
    run: async ({ reply }) => {
      const list = ["Quelle est ta plus grande peur ?", "Quel est ton plus grand regret ?", "As-tu déjà menti à un ami proche ?", "Quel est ton secret le mieux gardé (que tu peux partager ici) ?"];
      reply('🤫 ' + list[Math.floor(Math.random() * list.length)]);
    }
  },
  {
    name: 'dare',
    description: 'Défi "action ou vérité" — action',
    run: async ({ reply }) => {
      const list = ["Envoie un emoji qui décrit ta journée.", "Écris ton message à l'envers.", "Complimente la dernière personne qui a parlé.", "Raconte une blague."];
      reply('🔥 ' + list[Math.floor(Math.random() * list.length)]);
    }
  },
  {
    name: 'trivia',
    description: 'Question de culture générale',
    run: async ({ reply }) => {
      const list = [
        { q: "Quelle est la capitale du Japon ?", r: "Tokyo" },
        { q: "Combien de continents y a-t-il ?", r: "7" },
        { q: "Quel est le plus grand océan du monde ?", r: "L'océan Pacifique" }
      ];
      const pick = list[Math.floor(Math.random() * list.length)];
      reply(`❓ ${pick.q}`);
    }
  },
  {
    name: 'guess-number',
    description: 'Devine un nombre entre 1 et 100 (une tentative). Ex: .guess-number 42',
    run: async ({ reply, args }) => {
      const target = Math.floor(Math.random() * 100) + 1;
      const guess = parseInt(args[0]);
      if (isNaN(guess)) return reply('❓ Utilisation : .guess-number <ton nombre entre 1 et 100>');
      if (guess === target) reply(`🎉 Exact ! C'était ${target} !`);
      else reply(`❌ Raté ! C'était ${target}. ${guess < target ? 'Tu visais trop bas.' : 'Tu visais trop haut.'}`);
    }
  },
  {
    name: 'hangman',
    description: 'Lance un mot à deviner (pendu) — affiche le mot masqué',
    run: async ({ reply }) => {
      const words = ['whatsapp', 'ordinateur', 'shadow', 'bonjour', 'programmation'];
      const word = words[Math.floor(Math.random() * words.length)];
      reply(`🪢 Mot à deviner : ${'_ '.repeat(word.length)}(${word.length} lettres)`);
    }
  },
  {
    name: 'tictactoe',
    description: 'Affiche une grille de morpion vide pour jouer en groupe',
    run: async ({ reply }) => reply('⭕❌ Grille :\n1️⃣2️⃣3️⃣\n4️⃣5️⃣6️⃣\n7️⃣8️⃣9️⃣\n\nRépondez avec le numéro de la case voulue (jeu à arbitrer manuellement pour l\'instant).')
  },
  {
    name: 'ship',
    description: 'Calcule un pourcentage de compatibilité entre deux mentions',
    run: async ({ reply, mentioned }) => {
      if (mentioned.length < 2) return reply('❓ Mentionne deux personnes : .ship @personne1 @personne2');
      const percent = Math.floor(Math.random() * 101);
      reply({ text: `💘 @${mentioned[0].split('@')[0]} + @${mentioned[1].split('@')[0]} = ${percent}% de compatibilité`, mentions: mentioned.slice(0, 2) });
    }
  },
  {
    name: 'rate',
    description: 'Note un mot ou une personne sur 10 (au hasard, pour rire)',
    run: async ({ reply, text }) => {
      if (!text) return reply('❓ Utilisation : .rate <quelque chose>');
      reply(`📊 Je note "${text}" : ${Math.floor(Math.random() * 11)}/10`);
    }
  },
  {
    name: 'wouldyourather',
    description: 'Question "tu préfères..."',
    run: async ({ reply }) => {
      const list = [
        "Tu préfères pouvoir voler ou être invisible ?",
        "Tu préfères vivre sans musique ou sans films ?",
        "Tu préfères parler toutes les langues ou jouer de tous les instruments ?"
      ];
      reply('🤔 ' + list[Math.floor(Math.random() * list.length)]);
    }
  },
  {
    name: 'compliment',
    description: 'Envoie un compliment aléatoire (mentionne quelqu\'un en option)',
    run: async ({ reply, mentioned }) => {
      const list = ["a un excellent sens de l'humour", "illumine toujours la conversation", "a beaucoup de style", "est quelqu'un de fiable"];
      const c = list[Math.floor(Math.random() * list.length)];
      if (mentioned.length) reply({ text: `✨ @${mentioned[0].split('@')[0]} ${c} !`, mentions: [mentioned[0]] });
      else reply(`✨ Tu ${c} !`);
    }
  },
  {
    name: 'joke',
    description: 'Blague aléatoire',
    run: async ({ reply }) => {
      const list = [
        "Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant ? Parce que sinon ils tombent dans le bateau.",
        "Qu'est-ce qu'un crocodile qui surveille la pharmacie ? Un Lacoste garde."
      ];
      reply('😂 ' + list[Math.floor(Math.random() * list.length)]);
    }
  },
  {
    name: 'slot',
    description: 'Machine à sous (pour le fun, sans argent réel)',
    run: async ({ reply }) => {
      const symbols = ['🍒', '🍋', '🍇', '⭐', '💎', '🔔'];
      const result = [0, 0, 0].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
      reply(`🎰 ${result.join(' | ')} ${result[0] === result[1] && result[1] === result[2] ? '— JACKPOT 🎉' : ''}`);
    }
  },
  {
    name: 'dice',
    description: 'Alias de roll',
    run: async ({ reply, args }) => {
      const max = Math.max(1, parseInt(args[0]) || 6);
      reply(`🎲 ${Math.floor(Math.random() * max) + 1} / ${max}`);
    }
  }
];

const logoNames = ['1917','arena','blackpink','devil','fire','glitch','hacker','ice','impressive','leaves','light','matrix','metallic','neon','purple','sand','snow','thunder'];
const logo = logoNames.map(name => ({
  name,
  description: `Génère un logo style "${name}" à partir d'un texte`,
  run: async ({ reply, text }) => {
    if (!text) return reply(`❓ Utilisation : .${name} <texte>`);
    reply(`🔧 Génération de logo "${name}" nécessite une API de logo-maker (ex: ephoto360 via scraper). Voir README pour la connecter dans commands/misc.js.`);
  }
})).concat([{ name: 'logolist', description: 'Liste tous les styles de logo disponibles', run: async ({ reply }) => reply('🖼️ Styles disponibles : ' + logoNames.join(', ')) }]);

module.exports = { tools, games, logo };
