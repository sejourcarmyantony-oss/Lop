const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const Jimp = require('jimp');
ffmpeg.setFfmpegPath(ffmpegPath);

const TMP = path.join(__dirname, '..', 'media', 'tmp');
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

function tmpFile(ext) {
  return path.join(TMP, `${Date.now()}_${Math.floor(Math.random() * 9999)}.${ext}`);
}

// ffmpeg's "atempo" filter only accepts values between 0.5 and 2.0 in a single
// instance — passing 3 or 4 directly (as the bot used to) makes ffmpeg fail outright.
// On chaîne plusieurs atempo pour couvrir la plage complète 0.25x à 4x.
function atempoChain(speed) {
  const filters = [];
  let remaining = speed;
  if (remaining > 2) {
    while (remaining > 2) { filters.push('atempo=2.0'); remaining /= 2; }
    filters.push(`atempo=${remaining.toFixed(3)}`);
  } else if (remaining < 0.5) {
    while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
    filters.push(`atempo=${remaining.toFixed(3)}`);
  } else {
    filters.push(`atempo=${remaining.toFixed(3)}`);
  }
  return filters.join(',');
}

function runFfmpeg(inputPath, outputPath, applyFilters) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    cmd = applyFilters(cmd);
    cmd.on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

// ---- Catégorie STICKER ----
const sticker = [
  {
    name: 'sticker',
    description: 'Convertit une image/vidéo (en réponse) en sticker',
    run: async ({ reply, downloadQuoted, ownerName }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une image ou une courte vidéo avec .sticker');
      try {
        const stickerObj = new Sticker(buffer, {
          pack: 'Shadow Bot',
          author: ownerName,
          type: StickerTypes.FULL,
          quality: 70
        });
        const stickerBuffer = await stickerObj.toBuffer();
        reply({ sticker: stickerBuffer });
      } catch (e) {
        reply('⚠️ Erreur pendant la conversion en sticker : ' + e.message);
      }
    }
  },
  {
    name: 'sticker-convert',
    description: 'Alias de sticker',
    run: async (ctx) => sticker[0].run(ctx)
  },
  {
    name: 'toimg',
    description: "Convertit un sticker (en réponse) en image",
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à un sticker avec .toimg');
      reply({ image: buffer, caption: '✅ Converti en image' });
    }
  },
  {
    name: 'extract-sticker',
    description: 'Alias de toimg',
    run: async (ctx) => module.exports.sticker.find(c => c.name === 'toimg').run(ctx)
  },
  { name: 'stickercrop', description: "Recadre l'image en carré avant conversion en sticker", run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une image avec .stickercrop');
      try {
        const img = await Jimp.read(buffer);
        const size = Math.min(img.bitmap.width, img.bitmap.height);
        img.crop(0, 0, size, size);
        const stickerObj = new Sticker(await img.getBufferAsync(Jimp.MIME_PNG), { pack: 'Shadow Bot', author: 'Olsen-dev', type: StickerTypes.FULL });
        reply({ sticker: await stickerObj.toBuffer() });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  { name: 'emojimix', description: "Fusionne deux emojis en sticker. Ex: .emojimix 😂+😭", run: async ({ reply }) => reply('🔧 emojimix nécessite l\'API publique Emoji Kitchen (non officielle). Voir README pour la connecter.') },
  { name: 'attp', description: 'Génère un sticker de texte animé', run: async ({ reply }) => reply('🔧 attp nécessite un rendu GIF texte-animé (ex: via Jimp + gif-encoder). Voir README.') },
  { name: 'qc', description: 'Génère un sticker "quote" à partir du message cité', run: async ({ reply }) => reply('🔧 qc (quote card) nécessite un rendu d\'image avec la photo de profil et le texte — à ajouter avec Jimp dans commands/media.js.') },
  { name: 'simage', description: 'Recherche une image similaire à un sticker', run: async ({ reply }) => reply('🔧 simage nécessite une API de recherche d\'image inversée. Voir README.') }
];

// ---- Catégorie TOOLS (effets média) ----
const effects = [
  {
    name: 'audio-speed',
    description: "Change la vitesse d'un audio (réponse à un vocal). Ex: .audio-speed 1.5",
    run: async ({ reply, downloadQuoted, args }) => {
      const speed = Math.min(4, Math.max(0.25, parseFloat(args[0]) || 1.5));
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à un audio avec .audio-speed <vitesse>');
      const input = tmpFile('ogg'); const output = tmpFile('ogg');
      fs.writeFileSync(input, buffer);
      try {
        // Bug corrigé : atempo ne supporte que 0.5–2.0 par instance, d'où l'usage
        // d'une chaîne de filtres pour couvrir toute la plage annoncée (0.25x à 4x).
        await runFfmpeg(input, output, cmd => cmd.audioFilters(atempoChain(speed)));
        reply({ audio: fs.readFileSync(output), mimetype: 'audio/ogg; codecs=opus', ptt: true });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
      finally { [input, output].forEach(f => fs.existsSync(f) && fs.unlinkSync(f)); }
    }
  },
  {
    name: 'bass-boost',
    description: 'Renforce les basses fréquences d\'un audio (réponse à un vocal)',
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à un audio avec .bass-boost');
      const input = tmpFile('ogg'); const output = tmpFile('ogg');
      fs.writeFileSync(input, buffer);
      try {
        await runFfmpeg(input, output, cmd => cmd.audioFilters('bass=g=20'));
        reply({ audio: fs.readFileSync(output), mimetype: 'audio/ogg; codecs=opus', ptt: true });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
      finally { [input, output].forEach(f => fs.existsSync(f) && fs.unlinkSync(f)); }
    }
  },
  {
    name: 'reverse-audio',
    description: "Inverse un audio (réponse à un vocal)",
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à un audio avec .reverse-audio');
      const input = tmpFile('ogg'); const output = tmpFile('ogg');
      fs.writeFileSync(input, buffer);
      try {
        await runFfmpeg(input, output, cmd => cmd.audioFilters('areverse'));
        reply({ audio: fs.readFileSync(output), mimetype: 'audio/ogg; codecs=opus', ptt: true });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
      finally { [input, output].forEach(f => fs.existsSync(f) && fs.unlinkSync(f)); }
    }
  },
  {
    name: 'voice-changer',
    description: 'Applique un effet de voix (robot). Réponse à un vocal',
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à un audio avec .voice-changer');
      const input = tmpFile('ogg'); const output = tmpFile('ogg');
      fs.writeFileSync(input, buffer);
      try {
        await runFfmpeg(input, output, cmd => cmd.audioFilters('asetrate=44100*0.8,atempo=1.25'));
        reply({ audio: fs.readFileSync(output), mimetype: 'audio/ogg; codecs=opus', ptt: true });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
      finally { [input, output].forEach(f => fs.existsSync(f) && fs.unlinkSync(f)); }
    }
  },
  {
    name: 'audio-extract',
    description: "Extrait l'audio d'une vidéo (réponse à une vidéo)",
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une vidéo avec .audio-extract');
      const input = tmpFile('mp4'); const output = tmpFile('mp3');
      fs.writeFileSync(input, buffer);
      try {
        await runFfmpeg(input, output, cmd => cmd.noVideo());
        reply({ audio: fs.readFileSync(output), mimetype: 'audio/mp4' });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
      finally { [input, output].forEach(f => fs.existsSync(f) && fs.unlinkSync(f)); }
    }
  },
  {
    name: 'video-gif',
    description: 'Convertit une courte vidéo en GIF (réponse à une vidéo)',
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une vidéo avec .video-gif');
      const input = tmpFile('mp4'); const output = tmpFile('gif');
      fs.writeFileSync(input, buffer);
      try {
        await runFfmpeg(input, output, cmd => cmd.size('480x?').fps(10));
        reply({ video: fs.readFileSync(output), gifPlayback: true });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
      finally { [input, output].forEach(f => fs.existsSync(f) && fs.unlinkSync(f)); }
    }
  },
  {
    name: 'img-compress',
    description: 'Compresse une image (réponse à une image)',
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une image avec .img-compress');
      try {
        const img = await Jimp.read(buffer);
        const out = await img.quality(20).getBufferAsync(Jimp.MIME_JPEG);
        reply({ image: out, caption: '✅ Image compressée' });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'deep-fry',
    description: 'Effet "deep fry" humoristique (réponse à une image)',
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une image avec .deep-fry');
      try {
        const img = await Jimp.read(buffer);
        img.contrast(0.6).color([{ apply: 'saturate', params: [80] }]).quality(10);
        const out = await img.getBufferAsync(Jimp.MIME_JPEG);
        reply({ image: out, caption: '🔥 Deep fried' });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'glitch-img',
    description: 'Effet visuel glitché (réponse à une image)',
    run: async ({ reply, downloadQuoted }) => {
      const buffer = await downloadQuoted();
      if (!buffer) return reply('❓ Réponds à une image avec .glitch-img');
      try {
        const img = await Jimp.read(buffer);
        img.posterize(4).pixelate(3);
        const out = await img.getBufferAsync(Jimp.MIME_JPEG);
        reply({ image: out, caption: '📼 Glitché' });
      } catch (e) { reply('⚠️ Erreur : ' + e.message); }
    }
  },
  {
    name: 'shazam',
    description: 'Identifie une musique depuis un extrait audio',
    run: async ({ reply }) => {
      reply('🔧 shazam nécessite une clé API de reconnaissance audio (ex: AudD). Ajoute AUDD_API_KEY dans .env pour l\'activer — voir README.');
    }
  }
];

module.exports = { sticker, effects };
