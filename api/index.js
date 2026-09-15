const express = require('express');
const axios = require('axios');
const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce'
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

function buildTorrServerUrl(hash, title) {
  const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${TRACKERS}`;
  return `http://127.0.0.1:8090/stream?link=${encodeURIComponent(magnet)}`;
}

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.nuvio.torrserver.addon',
    version: '1.2.0',
    name: 'TorrServer Multi',
    description: 'بث مباشر عبر TorrServer من YTS و The Pirate Bay و EZTV',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
  });
});

app.get(['/stream/:type/:id', '/stream/:type/:id.json'], async (req, res) => {
  const { type, id } = req.params;
  const rawId = id.replace('.json', '');
  const parts = rawId.split(':');
  const imdbId = parts[0];
  const season = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;

  let streams = [];

  // 1. جلب من YTS (للأفلام فقط)
  if (type === 'movie') {
    try {
      const ytsRes = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 4000
      });
      const movie = ytsRes.data?.data?.movies?.[0];
      if (movie && movie.torrents) {
        movie.torrents.forEach(t => {
          streams.push({
            name: 'TorrServer (YTS)',
            title: `🎬 ${t.quality} (${t.type}) | Seeds: ${t.seeds}`,
            url: buildTorrServerUrl(t.hash, movie.title)
          });
        });
      }
    } catch (e) {}
  }

  // 2. جلب من The Pirate Bay عبر apibay
  try {
    const tpbRes = await axios.get(`https://apibay.org/q.php?q=${imdbId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 4000
    });
    if (Array.isArray(tpbRes.data)) {
      tpbRes.data.forEach(item => {
        if (!item.info_hash || item.name === 'No results returned') return;

        // في حال المسلسلات، نتأكد من رقم الموسم والحلقة
        if (type === 'series' && season !== null && episode !== null) {
          const s = season < 10 ? `0${season}` : `${season}`;
          const ep = episode < 10 ? `0${episode}` : `${episode}`;
          const pattern = new RegExp(`s${s}e${ep}`, 'i');
          if (!pattern.test(item.name)) return;
        }

        const sizeGB = (item.size / (1024 * 1024 * 1024)).toFixed(2);
        streams.push({
          name: 'TorrServer (TPB)',
          title: `⚡ ${item.name}\n💾 ${sizeGB} GB | Seeds: ${item.seeders}`,
          url: buildTorrServerUrl(item.info_hash, item.name)
        });
      });
    }
  } catch (e) {}

  // 3. جلب من EZTV (للمسلسلات)
  if (type === 'series') {
    try {
      const numericImdb = imdbId.replace('tt', '');
      const eztvRes = await axios.get(`https://eztv.re/api/get-torrents?imdb_id=${numericImdb}&limit=100`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 4000
      });
      const torrents = eztvRes.data?.torrents;
      if (Array.isArray(torrents)) {
        torrents.forEach(t => {
          if (season !== null && episode !== null) {
            if (parseInt(t.season, 10) !== season || parseInt(t.episode, 10) !== episode) return;
          }
          const sizeGB = (t.size_bytes / (1024 * 1024 * 1024)).toFixed(2);
          streams.push({
            name: 'TorrServer (EZTV)',
            title: `📺 ${t.title}\n💾 ${sizeGB} GB | Seeds: ${t.seeds}`,
            url: buildTorrServerUrl(t.hash, t.title)
          });
        });
      }
    } catch (e) {}
  }

  res.json({ streams });
});

module.exports = app;
