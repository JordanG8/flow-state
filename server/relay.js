'use strict';
// Arena relay. The host's browser still runs the match; this server replaces the peer-to-peer links with one
// WebSocket per player and forwards bytes between the host and its joiners. It never reads game messages.
//
//   host:   connect to /relay?host=1          <- {"_created":"ABCDEF"}
//           <- {"_p":3,"ev":"open"|"close"}    a joiner connected / left
//           <- {"_p":3,"d":"<message>"}        a message from joiner 3
//           -> {"_to":3|"*","d":"<message>"}   send to joiner 3 / to every joiner
//   joiner: connect to /relay?code=ABCDEF      every frame goes to the host; every host frame comes back verbatim
//
// Run alone:  node server/relay.js   (PORT, default 8080). Or mount it: attach(httpServer).
const crypto = require('crypto');
const http = require('http');
const {WebSocketServer} = require('ws');

const MAX_PLAYERS = 8;
const MAX_FRAME = 16384;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function attach(server, pathname = '/relay') {
  const rooms = new Map(); // code -> {host, peers: Map<id, ws>, next}
  const wss = new WebSocketServer({noServer: true, maxPayload: MAX_FRAME});
  const newCode = () => {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (const x of crypto.randomBytes(6)) c += ALPHA[x % 26];
      if (!rooms.has(c)) return c;
    }
    return null;
  };
  const send = (ws, s) => {
    if (ws.readyState === 1) ws.send(s);
  };

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== pathname) return; // leave other upgrades to whoever owns them
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, u));
  });

  wss.on('connection', (ws, u) => {
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    if (u.searchParams.get('host')) return hostConn(ws);
    const code = String(u.searchParams.get('code') || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return ws.close(4004, 'No lobby with that code');
    if (room.peers.size >= MAX_PLAYERS - 1) return ws.close(4008, 'The lobby is full');
    const id = room.next++;
    room.peers.set(id, ws);
    send(room.host, JSON.stringify({_p: id, ev: 'open'}));
    ws.on('message', (data, isBinary) => {
      if (!isBinary) send(room.host, JSON.stringify({_p: id, d: data.toString()}));
    });
    ws.on('close', () => {
      if (room.peers.get(id) === ws) {
        room.peers.delete(id);
        send(room.host, JSON.stringify({_p: id, ev: 'close'}));
      }
    });
  });

  function hostConn(ws) {
    const code = newCode();
    if (!code) return ws.close(1013, 'Could not allocate a lobby code');
    const room = {host: ws, peers: new Map(), next: 1};
    rooms.set(code, room);
    send(ws, JSON.stringify({_created: code}));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch (e) {
        return;
      }
      if (!m || typeof m.d !== 'string') return;
      if (m._to === '*') for (const p of room.peers.values()) send(p, m.d);
      else if (room.peers.has(m._to)) send(room.peers.get(m._to), m.d);
    });
    ws.on('close', () => {
      rooms.delete(code);
      for (const p of room.peers.values()) p.close(4001, 'The host closed the lobby');
    });
  }

  // Drop connections that stopped answering pings (a phone that lost signal).
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 15000);
  timer.unref();
  return {wss, rooms, close: () => clearInterval(timer)};
}

module.exports = {attach, MAX_PLAYERS};

if (require.main === module) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('flow-state relay');
  });
  attach(server);
  const port = +process.env.PORT || 8080;
  server.listen(port, '0.0.0.0', () => console.log('flow-state relay on :' + port));
}
