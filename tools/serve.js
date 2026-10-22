// Small local server for development and browser tests; production uses Vercel.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/game');
const grandCon = require('../api/grand-con');
const lastTrain = require('../api/last-train');
const root = path.resolve(__dirname, '../public');
const types = { '.woff2': 'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (['/api/game','/api/grand-con','/api/last-train'].includes(url.pathname)) {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8000) { res.writeHead(413); res.end(); return; } }
    req.body = body; req.query = Object.fromEntries(url.searchParams);
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    return (url.pathname === '/api/last-train' ? lastTrain : url.pathname === '/api/grand-con' ? grandCon : handler)(req, res);
  }
  if (url.pathname === '/_vercel/insights/script.js') { res.writeHead(204); res.end(); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  const boardingMedia = /^\/last-train\/boarding\.[a-f0-9]{12}\.mp4$/.test(url.pathname);
  res.setHeader('Cache-Control', boardingMedia ? 'public, max-age=31536000, immutable' : 'no-store');
  if (boardingMedia) res.setHeader('ETag', '"' + path.basename(file) + '"');
  const size = fs.statSync(file).size;
  res.setHeader('Accept-Ranges', 'bytes');
  let start = 0, end = size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    start = match ? Number(match[1]) : size;
    end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); res.end(); return; }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Content-Length', Math.max(0, end - start + 1));
  if (req.method === 'HEAD' || size === 0) { res.end(); return; }
  fs.createReadStream(file, { start, end }).pipe(res);
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log('Local game server ready'));
