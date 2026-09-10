# 🌑 Shadow Bot

Bot WhatsApp créé par **Olsen-dev**, basé sur [Baileys](https://github.com/WhiskeySockets/Baileys) (librairie non-officielle, connexion par code de pairing — sans navigateur).

## 📦 Contenu

- Menu stylé, catégories : MAIN, AI, GROUP, TOOLS, STICKER, DOWNLOADER, FUN, OWNER, GAMES, LOGO
- Préfixe modifiable (`.setprefix`)
- Modération de groupe (kick/promote/anti-lien/liste noire de mots/avertissements)
- Commandes IA connectables à une clé API
- Téléchargeur YouTube (`.play`, `.ytmp3`, `.ytmp4`)
- Effets de texte, conversion de médias (sticker, audio, image, GIF)
- Toutes les commandes affichent `-Olszn` en signature

**Non inclus** (volontairement) : toute commande de surveillance de tiers, d'usurpation, de spam de notifications, ou de perturbation d'autres comptes/bots — voir la conversation pour le détail de ce qui a été exclu et pourquoi.

## 🚀 Installation locale

```bash
npm install
cp .env.example .env
# édite .env : mets ton numéro dans OWNER_PHONE si tu veux éviter la question interactive
npm start
```

Au premier lancement, le bot affiche un **code de pairing** dans le terminal. Sur ton téléphone : WhatsApp > Paramètres > Appareils liés > Lier un appareil > "Lier avec un numéro de téléphone à la place" > entre le code.

## ☁️ Déploiement sur Render

1. Pousse ce dossier sur un dépôt GitHub (le `.gitignore` exclut déjà `node_modules/`, `session/`, `.env`).
2. Sur [render.com](https://render.com) : **New > Web Service**, connecte le dépôt.
3. Render détecte `render.yaml` automatiquement (ou configure manuellement : Build = `npm install`, Start = `npm start`).
4. Dans **Environment**, ajoute au minimum `OWNER_PHONE` (ton numéro sans le `+`).
5. Déploie. Ouvre l'onglet **Logs** : le code de pairing y apparaît — lie ton téléphone comme en local.

### ⚠️ Limite importante du plan gratuit Render

Le plan gratuit **ne fournit pas de disque persistant** : à chaque redémarrage du service (mise en veille après inactivité, redeploy), le dossier `session/` est réinitialisé et **le bot doit être re-lié** (nouveau code de pairing à chaque fois). Pour une session qui persiste :
- passe sur un plan payant Render avec un disque persistant (le `render.yaml` fourni configure déjà un disque, mais celui-ci n'est disponible qu'à partir du plan payant), **ou**
- héberge plutôt sur une machine qui reste allumée en continu (VPS, Railway avec volume, etc.).

Le service gratuit se met aussi en veille après ~15 minutes sans requête HTTP entrante ; le petit serveur web intégré (`index.js`) répond sur `/` pour permettre un ping externe (ex: UptimeRobot) si tu veux le garder éveillé.

## 🐛 Erreurs anticipées et déjà corrigées dans le code

| Risque | Ce qui a été fait |
|---|---|
| Crash si une commande lève une erreur | Chaque message est traité dans un `try/catch` global (`index.js`) ; l'utilisateur reçoit un message d'erreur au lieu de faire planter le process |
| Perte de connexion réseau | Reconnexion automatique sur `connection.update`, sauf si déconnexion volontaire (`loggedOut`) |
| Promesses rejetées non gérées | `process.on('unhandledRejection'/'uncaughtException')` interceptent et loguent sans arrêter le bot |
| Fichiers temporaires (audio/vidéo) qui s'accumulent | Chaque commande média supprime ses fichiers temporaires dans un bloc `finally` |
| Port manquant sur Render (le service est vu comme "down") | Serveur Express minimal qui écoute sur `process.env.PORT` |
| `ytdl-core` cassé par un changement YouTube | Erreur interceptée et message clair renvoyé (nécessite parfois `npm update ytdl-core`) |
| Commandes admin exécutées sans droits | Vérification systématique `isBotAdmin` / `isSenderAdmin` / `isOwner` avant toute action de groupe |
| Session perdue → boucle de reconnexion infinie | Le code détecte `DisconnectReason.loggedOut` et arrête de retenter (évite de spammer les serveurs WhatsApp) |
| `.env` absent | `dotenv` ne plante pas si le fichier manque ; chaque commande dépendante d'une clé API répond avec des instructions au lieu de crasher |
| Numéro de téléphone mal formaté | `.replace(/\D/g, '')` nettoie les espaces/`+` avant l'envoi à Baileys |
| **Le bot reste bloqué au démarrage sur Render sans jamais démarrer ni planter** | Render n'a pas de terminal interactif : si `OWNER_PHONE` n'est pas défini, l'ancien code attendait une réponse clavier qui n'arrivait jamais. Le bot détecte maintenant l'absence de terminal (`process.stdin.isTTY`) et s'arrête avec un message clair au lieu de bloquer indéfiniment |
| **Téléchargement de média cité qui échoue silencieusement** (`.sticker`, `.toimg`, `.viewonce`, tous les effets audio/image) | La clé utilisée pour déchiffrer le message cité pointait par erreur vers le message contenant la commande, pas vers le message d'origine. Corrigé : reconstruction d'une clé (`id`, `participant`) propre au message cité |
| Erreurs sur les statuts/story et les chaînes WhatsApp | Ces types de conversation (`status@broadcast`, `@newsletter`) sont maintenant ignorés dès l'entrée du gestionnaire de messages |
| Mentions/citations non détectées quand la commande est envoyée en légende d'une image (pas en texte) | Le contexte de citation est maintenant lu aussi sur `imageMessage`/`videoMessage`, pas seulement sur le texte |

### ℹ️ Limite connue non "corrigeable" côté code

WhatsApp masque parfois les numéros des membres de groupe derrière un identifiant `@lid` (fonctionnalité de confidentialité récente) au lieu du `@s.whatsapp.net` habituel. Certaines commandes qui comparent des JID (ex: `deletegroup`, détection admin) peuvent alors se comporter de façon incohérente selon les groupes — c'est une limitation de Baileys/WhatsApp, pas un bug du bot. Si tu rencontres ce cas, dis-le-moi pour qu'on ajoute une normalisation spécifique.

## 🔎 Seconde passe d'analyse — bugs plus profonds trouvés et corrigés

| Bug | Impact | Correction |
|---|---|---|
| **Le créateur ne pouvait jamais commander son propre bot** | Le bot se connecte avec le numéro du créateur lui-même. WhatsApp marque alors ses propres messages `fromMe: true`, et l'ancien code ignorait systématiquement ces messages — Olsen-dev n'aurait donc jamais pu utiliser une seule commande | Les messages `fromMe` sont maintenant traités comme venant du créateur ; seuls ceux qui commencent par le préfixe sont pris en compte (pour ne pas boucler sur les propres réponses du bot) |
| **`.ban` sans aucune vérification de droits** | N'importe quel membre — pas seulement les admins — pouvait bannir n'importe qui de l'usage du bot | Ajout d'une vérification `isOwner`/`isSenderAdmin`, comme pour `.unban` |
| **`.audio-speed` cassait pour toute vitesse hors 0.5–2.0** | Le filtre ffmpeg `atempo` ne supporte pas plus de 2x ou moins de 0.5x en une seule fois — la commande annonçait pourtant "jusqu'à 4x" | Chaînage de plusieurs filtres `atempo` pour couvrir toute la plage 0.25x–4x |
| **`.calc` pouvait bloquer tout le process** | La regex de validation autorisait `**` (exponentiation JS) — une expression comme `9**9**9` peut geler le serveur entier en calculant un nombre à des millions de chiffres | Longueur d'expression limitée à 50 caractères, opérateur `**` bloqué, résultat vérifié fini avant l'envoi |
| **`.viewonce` renvoyait toujours un "document" illisible** | Une photo ou vidéo "vue unique" arrivait comme fichier brut sans type, illisible pour le destinataire | Détection du vrai type (image/vidéo/audio) du message cité et envoi avec le bon format |
| **Photo de profil jamais appliquée** | `{ url: cheminLocal }` n'est pas un format d'image valide pour Baileys (il attend une URL http(s) ou un Buffer) | Lecture du fichier en `Buffer` avant l'envoi |
| **`.play`/`.ytmp4` pouvaient épuiser la mémoire du serveur** | Aucune limite de durée — une vidéo longue chargée entièrement en RAM (souvent ~512 Mo sur un hébergement gratuit) peut faire planter tout le bot | Refus des vidéos de plus de 10 min (audio) / 5 min (vidéo) |
| **Mention manquante dans `.warn` au 3e avertissement** | `reply()` ne prend qu'un seul argument — passer les mentions en 2e argument ne faisait rien, la mention ne s'affichait pas | Passage correct via `{ text, mentions }` |

## 🔎 Troisième passe — vérification exhaustive fichier par fichier

| Bug | Impact | Correction |
|---|---|---|
| **Le footer `-Olszn` manquait sur une partie des commandes** | Toute commande renvoyant un objet `{ text, mentions }` (tagall, hidetag, tag-admins, warn, ship, compliment...) passait à côté de l'ajout du footer, car seule la réponse en texte simple l'ajoutait — non conforme à la demande "sur chaque commande" | `reply()` ajoute maintenant le footer à tout contenu texte, objet ou chaîne, en laissant intacts les médias binaires purs |
| **Boucle de reconnexion sans délai** | En cas de coupure réseau persistante, le bot retentait de se reconnecter en continu sans pause, ce qui peut faire repérer le compte comme suspect par WhatsApp | Ajout d'un délai de 5 secondes avant chaque tentative de reconnexion |
| **`.roll` / `.dice` avec un argument négatif ou nul** | Donnait un résultat incohérent (0 ou négatif) | La valeur max est maintenant forcée à au moins 1 |

## 🔧 Pour activer les commandes actuellement en "🔧 à connecter"

Plusieurs commandes (génération d'image, TikTok/Instagram downloader, logos, reconnaissance musicale, capture d'écran web...) nécessitent une clé d'API tierce que je ne peux pas générer à ta place. Elles renvoient un message explicatif au lieu de planter. Pour les activer : ouvre le fichier de commande concerné dans `/commands`, ajoute ta clé dans `.env`, et remplace le message de stub par l'appel `fetch()` vers l'API choisie.

## 📁 Structure

```
shadow-bot/
├── index.js              # connexion + routage des messages
├── config.js              # paramètres (nom, prefix, owner, sudo...)
├── lib/menu.js            # génération du menu stylé
├── commands/
│   ├── registry.js        # regroupe toutes les catégories
│   ├── main.js             # menu, ping, pair, viewonce...
│   ├── text.js              # effets de texte
│   ├── media.js             # stickers, audio, image
│   ├── group.js              # modération, admin
│   ├── ai.js                  # chatbot + traduction
│   ├── owner.js                # broadcast, sudo, contrôle serveur
│   ├── downloader.js            # YouTube et alias
│   └── misc.js                   # outils, jeux, logos
├── settings.json          # généré au 1er lancement (prefix, etc.)
├── groupdata.json         # généré : modération par groupe
└── autoreplies.json       # généré : réponses automatiques
```
