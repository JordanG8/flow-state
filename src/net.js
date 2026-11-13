'use strict';
// Net: lobbies and the link for the Arena.
// Topology is a star: the host's browser runs the match and every player has one WebSocket to the relay server
// (server/relay.js), which forwards bytes between the host and its joiners. The relay URL comes from
// window.FLOW_RELAY (src/config.js); empty means the same origin at /relay.
const Net = (() => {
  const MAXP = 8;
  const st = {role: null, code: '', key: '', id: -1, name: '', roster: [], peers: [], host: null, nextId: 1, ws: null, byP: {}, t0: 0, gen: 0};
  const on = {msg() {}, roster() {}, joined() {}, closed() {}};
  let timers = [];
  const nowS = () => performance.now() / 1e3;
  const cleanName = (n) => String(n || '').replace(/[^\w \-.]/g, '').trim().slice(0, 12) || 'Player';

  function relayUrl(q) {
    let base = (typeof window !== 'undefined' && window.FLOW_RELAY) || '';
    if (!base) base = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay';
    return base + '?' + q;
  }
  // Open a socket to the relay and resolve once it is open (or reject with a readable reason).
  const connect = (q, gen) =>
    new Promise((res, rej) => {
      let ws;
      try {
        ws = new WebSocket(relayUrl(q));
      } catch (e) {
        return rej(new Error('Cannot reach the game server'));
      }
      const t = setTimeout(() => {
        try {
          ws.close();
        } catch (e) {}
        rej(new Error('Cannot reach the game server'));
      }, 10000);
      // frames that arrive before the caller installs its handler are kept, not lost
      ws._q = [];
      ws.onmessage = (ev) => ws._q.push(ev);
      ws.onopen = () => {
        clearTimeout(t);
        res(ws);
      };
      ws.onclose = (e) => {
        clearTimeout(t);
        ws._closed = e;
        rej(new Error(e.reason || 'Cannot reach the game server'));
      };
    });
  const listen = (ws, fn) => {
    ws.onmessage = fn;
    for (const ev of ws._q.splice(0)) fn(ev);
  };
  // A channel-shaped wrapper, so the message code below does not care what carries the bytes.
  const chan = (raw) => ({readyState: 'open', bufferedAmount: 0, send: raw});
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tx = (ch, s) => {
    if (ch && ch.readyState === 'open')
      try {
        ch.send(s);
        return true;
      } catch (e) {}
    return false;
  };

  function reset() {
    st.gen++;
    for (const t of timers) clearInterval(t);
    timers = [];
    if (st.ws) {
      st.ws.onclose = st.ws.onmessage = null;
      try {
        st.ws.close();
      } catch (e) {}
    }
    Object.assign(st, {role: null, code: '', key: '', id: -1, roster: [], peers: [], host: null, nextId: 1, ws: null, byP: {}});
  }
  function closed(why) {
    if (!st.role) return;
    reset();
    on.closed(why);
  }

  // ---- host -----------------------------------------------------------------------------------------------
  async function host(name) {
    reset();
    const gen = st.gen;
    const ws = await connect('host=1', gen);
    if (gen !== st.gen) {
      ws.close();
      return null;
    }
    const code = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('The game server did not create a lobby')), 8000);
      listen(ws, (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m._created) {
            clearTimeout(t);
            res(m._created);
          }
        } catch (e) {}
      });
      ws.onclose = (e) => {
        clearTimeout(t);
        rej(new Error(e.reason || 'The game server closed the connection'));
      };
    });
    if (gen !== st.gen) return null;
    Object.assign(st, {role: 'host', code, id: 0, name: cleanName(name), t0: nowS(), ws});
    st.roster = [{id: 0, name: st.name}];
    listen(ws, (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (m._p == null) return;
      if (m.ev === 'open') accept(m._p);
      else if (m.ev === 'close') {
        const p = st.byP[m._p];
        if (p) drop(p);
      } else if (typeof m.d === 'string') {
        const p = st.byP[m._p];
        if (p) hostRecv(p, m.d, false);
      }
    });
    ws.onclose = () => closed('Lost the connection to the game server');
    timers.push(
      setInterval(() => {
        const t = nowS();
        for (const p of st.peers.slice()) {
          if (p.ready && t - p.last > 10) drop(p);
          else if (!p.ready && t - p.born > 25) drop(p);
          else if (p.ready) tx(p.r, '{"t":"_ka"}');
        }
      }, 2500),
    );
    on.roster();
    return code;
  }
  function accept(rp) {
    if (st.peers.length >= MAXP - 1) return;
    const ch = chan((s) => st.ws.send(JSON.stringify({_to: rp, d: s})));
    const p = {rp, id: st.nextId++, name: '', r: ch, u: ch, ready: false, last: nowS(), born: nowS()};
    st.peers.push(p);
    st.byP[rp] = p;
  }
  function drop(p) {
    const i = st.peers.indexOf(p);
    if (i < 0) return;
    st.peers.splice(i, 1);
    delete st.byP[p.rp];
    if (!p.ready) return;
    st.roster = st.roster.filter((r) => r.id !== p.id);
    sendRoster();
    on.roster();
  }
  function sendRoster() {
    const s = JSON.stringify({t: '_ros', r: st.roster});
    for (const p of st.peers) if (p.ready) tx(p.r, s);
  }
  function hostRecv(p, data, unrel) {
    let m;
    try {
      m = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (!m || typeof m.t !== 'string') return;
    p.last = nowS();
    if (m.t === '_ka') return;
    if (m.t === '_hi') {
      if (p.ready) return;
      p.name = cleanName(m.n);
      p.ready = true;
      st.roster.push({id: p.id, name: p.name});
      tx(p.r, JSON.stringify({t: '_wel', id: p.id, r: st.roster}));
      sendRoster();
      on.roster();
      on.joined(p.id);
      return;
    }
    if (!p.ready || m.t[0] === '_') return;
    m.f = p.id; // the sender is whoever the channel belongs to, whatever the message claims
    if (m.to != null) {
      if (m.to === 0) on.msg(m);
      else {
        const q = st.peers.find((x) => x.id === m.to);
        if (q) tx(unrel ? q.u : q.r, JSON.stringify(m));
      }
      return;
    }
    on.msg(m);
    const s = JSON.stringify(m);
    for (const q of st.peers) if (q !== p && q.ready) tx(unrel ? q.u : q.r, s);
  }

  // ---- join -----------------------------------------------------------------------------------------------
  async function join(code, name) {
    reset();
    const gen = st.gen;
    const dead = () => gen !== st.gen;
    code = String(code || '').toUpperCase();
    if (!/^[A-Z]{6}$/.test(code)) throw new Error('A lobby code is six letters');
    const ws = await connect('code=' + code, gen);
    if (dead()) {
      ws.close();
      throw new Error('Cancelled');
    }
    const ch = chan((s) => ws.send(s));
    const h = {r: ch, u: ch, last: nowS()};
    Object.assign(st, {role: 'client', code, name: cleanName(name), host: h, ws});
    let refused = ws._closed && ws._closed.reason; // e.g. 'No lobby with that code', sent as the socket closes
    let settle = null;
    const welcomed = new Promise((res) => {
      const t = setTimeout(() => res(false), 8000);
      settle = res;
      h.onWel = () => {
        clearTimeout(t);
        res(true);
      };
      if (ws._closed) res(false);
    });
    listen(ws, (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (!m || typeof m.t !== 'string') return;
      h.last = nowS();
      if (m.t === '_ka') return;
      if (m.t === '_wel') {
        st.id = m.id;
        st.roster = m.r;
        if (h.onWel) h.onWel();
        on.roster();
      } else if (m.t === '_ros') {
        st.roster = m.r;
        on.roster();
      } else if (m.t === '_bye') closed('The host closed the lobby');
      else on.msg(m);
    });
    ws.onclose = (e) => {
      if (st.id < 0) {
        refused = e.reason;
        settle(false);
      } else closed(e.reason || 'Lost the connection to the host');
    };
    tx(ch, JSON.stringify({t: '_hi', n: st.name}));
    if (!(await welcomed)) {
      reset();
      throw new Error(refused || 'The host did not respond');
    }
    timers.push(
      setInterval(() => {
        if (nowS() - h.last > 10) closed('Lost the connection to the host');
        else tx(h.r, '{"t":"_ka"}');
      }, 2500),
    );
    return st.id;
  }

  // ---- messages -------------------------------------------------------------------------------------------
  // m.to (a player id) sends to one player; otherwise everyone else gets it. unrel: drop rather than queue.
  function send(m, unrel) {
    if (!st.role) return;
    if (st.role === 'client') {
      // positions and shots are disposable: skip them while the socket is backed up rather than queue them
      if (unrel && st.ws.bufferedAmount > 32768) return;
      tx(st.host.r, JSON.stringify(m));
      return;
    }
    m.f = 0;
    const s = JSON.stringify(m);
    for (const p of st.peers) {
      if (!p.ready || (m.to != null && m.to !== p.id)) continue;
      if (unrel && st.ws.bufferedAmount > 32768) continue;
      tx(p.r, s);
    }
  }
  function leave() {
    if (st.role === 'host') {
      for (const p of st.peers) tx(p.r, '{"t":"_bye"}');
    }
    reset();
  }
  addEventListener('pagehide', leave);

  return {
    st, on, host, join, send, leave, MAXP, cleanName,
    get isHost() {
      return st.role === 'host';
    },
    setPoll() {},
  };
})();
