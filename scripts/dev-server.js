'use strict';
// Dev server: serves src/ uncached and mounts api/lobby.js, so the Arena lobby works locally.
//   node scripts/dev-server.js [port]
// Without BLOB_READ_WRITE_TOKEN the lobby API keeps its data in memory.
const http = require('http');
const fs = require('fs');
const path = require('path');
const lobby = require('../api/lobby.js');
const ROOT = path.join(__dirname, '..', 'src');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};
const port = +process.argv[2] || 5173;
http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/lobby') return lobby(req, res);
    let f = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
    if (!f.startsWith(ROOT)) {
      res.statusCode = 403;
      return res.end();
    }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (err, data) => {
      if (err) {
        res.statusCode = 404;
        return res.end('not found');
      }
      res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.end(data);
    });
  })
  .listen(port, '0.0.0.0', () => console.log('flow-state dev server on http://localhost:' + port));
