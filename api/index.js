
const express = require('express');
const axios = require('axios');
const app = express();

// تفعيل CORS لضمان قبول الاتصال من تطبيق Nuvio
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

// تعريف الإضافة (Manifest)
app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.nuvio.torrserver.addon',
    version: '1.0.0',
    name: 'TorrServer Streams',
    description: 'بث التورنت محلياً ومجاناً عبر TorrServer الداخلي',
    resources: ['stream'],
    types: ['movie'],
    idPrefixes: ['tt']
  });
});

// جلب وتوليد الروابط (Streams)
app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const imdbId = id.replace('.json', '');

  if (type !== 'movie') {
    return res.json({ streams: [] });
  }

  try {
    // جلب التورنتات المتاحة للفيلم عبر YTS بالاعتماد على IMDb ID
    const response = await axios.get(`https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}`, {
      timeout: 5000
    });

    const movies = response.data?.data?.movies;
    if (!movies || movies.length === 0 || !movies[0].torrents) {
      return res.json({ streams: [] });
    }

    const movie = movies[0];
    const streams = movie.torrents.map(t => {
      // تركيب رابط المغناطيس
      const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}&tr=udp://open.demonii.com:1337/announce&tr=udp://tracker.openbittorrent.com:80`;
      
      // توجيه الرابط للـ TorrServer الداخلي على الجهاز
      const torrServerStreamUrl = `http://127.0.0.1:8090/stream?link=${encodeURIComponent(magnet)}`;

      return {
        name: 'TorrServer',
        title: `${t.quality} (${t.type}) | Seeds: ${t.seeds}`,
        url: torrServerStreamUrl
      };
    });

    res.json({ streams });
  } catch (error) {
    res.json({ streams: [] });
  }
});

module.exports = app;
