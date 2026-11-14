'use strict';
// Net: lobbies and the link for the Arena. Topology is a star: the host's browser runs the match and relays.
// Two transports, tried in this order:
//  1. relay: one WebSocket per player to our relay server (server/relay.js on the VPS), which forwards between the
//     host and its joiners. Fast to join and works on any network.
//  2. peer-to-peer: WebRTC data channels straight to the host, with /api/lobby (Vercel Blob) for the handshake and
//     TURN for networks that cannot reach each other. Used when the relay cannot be reached.
// Above the transport everything is the same: each link looks like a reliable channel `r` and an unreliable `u`.
const Net = (() => {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const RELAY =
    (typeof window !== 'undefined' && window.FLOW_RELAY) ||
    (local ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay' : 'wss://srv859654.hstgr.cloud/relay');
  const useRelay = !/[?&]relay=off\b/.test(location.search); // ?relay=off forces peer-to-peer (for testing)
  const STUN = [{urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']}, {urls: 'stun:stun.cloudflare.com:3478'}];
  // STUN + TURN from the lobby API (TURN relays the link when the two networks cannot reach each other directly).
  // Fetched once per page; falls back to STUN only if the API does not answer.
  let iceP = null;
  const ice = () =>
    (iceP =
      iceP ||
      api({op: 'ice'})
        .then((r) => (r && Array.isArray(r.iceServers) && r.iceServers.length ? r.iceServers : STUN))
        .catch(() => {
          iceP = null;
          return STUN;
        }));
  const MAXP = 8;
  const st = {role: null, code: '', key: '', id: -1, name: '', roster: [], peers: [], host: null, nextId: 1, seen: {}, pollMs: 2000, t0: 0, gen: 0, wake: null, mode: '', ws: null, byP: {}};
  const on = {msg() {}, roster() {}, joined() {}, closed() {}};
  let timers = [];
  const nowS = () => performance.now() / 1e3;
  const cleanName = (n) => String(n || '').replace(/[^\w \-.]/g, '').trim().slice(0, 12) || 'Player';

  async function api(body, keepalive) {
    let r;
    try {
      r = await fetch('/api/lobby', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), keepalive: !!keepalive});
    } catch (e) {
      throw new Error('Cannot reach the lobby service');
    }
    let j = null;
    try {
      j = await r.json();
    } catch (e) {}
    if (!r.ok) throw new Error((j && j.error) || 'Lobby service error (' + r.status + ')');
    return j;
  }
  // Wait until the browser has collected its network candidates, so one message carries the whole description.
  const gathered = (pc) =>
    new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      // Don't wait for every server: a TURN relay candidate is enough to connect from anywhere; without one, give
      // STUN 1.5 s; never wait longer than 4 s.
      let done = false, soon = null;
      const fin = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        clearTimeout(t2);
        clearTimeout(soon);
        res();
      };
      const t = setTimeout(fin, 4000);
      let srflx = false;
      const t2 = setTimeout(() => srflx && fin(), 1500);
      pc.addEventListener('icecandidate', (e) => {
        const c = e.candidate && e.candidate.candidate;
        if (!c) return;
        if (/ typ relay/.test(c)) soon = soon || setTimeout(fin, 300);
        else if (/ typ srflx/.test(c)) srflx = true;
      });
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') fin();
      });
    });
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
    for (const p of st.peers)
      try {
        p.pc.close();
      } catch (e) {}
    if (st.host)
      try {
        st.host.pc.close();
      } catch (e) {}
    if (st.ws) {
      st.ws.onclose = st.ws.onmessage = null;
      try {
        st.ws.close();
      } catch (e) {}
    }
    Object.assign(st, {role: null, code: '', key: '', id: -1, roster: [], peers: [], host: null, nextId: 1, seen: {}, pollMs: 2000, mode: '', ws: null, byP: {}});
  }
  function closed(why) {
    if (!st.role) return;
    reset();
    on.closed(why);
  }

  // ---- relay transport ------------------------------------------------------------------------------------
  // Open a socket to the relay; resolves once open, rejects with the server's reason (or a generic one).
  const connect = (q, ms) =>
    new Promise((res, rej) => {
      let ws;
      try {
        ws = new WebSocket(RELAY + '?' + q);
      } catch (e) {
        return rej(new Error('relay unreachable'));
      }
      const t = setTimeout(() => {
        ws.onclose = null;
        try {
          ws.close();
        } catch (e) {}
        rej(new Error('relay unreachable'));
      }, ms);
      ws._q = []; // frames that arrive before the caller installs its handler are kept, not lost
      ws.onmessage = (ev) => ws._q.push(ev);
      ws.onerror = () => {}; // the close event that follows carries what we need
      ws.onopen = () => {
        clearTimeout(t);
        res(ws);
      };
      ws.onclose = (e) => {
        clearTimeout(t);
        ws._closed = e;
        rej(new Error(e.reason || 'relay unreachable'));
      };
    });
  const listen = (ws, fn) => {
    ws.onmessage = fn;
    for (const ev of ws._q.splice(0)) fn(ev);
  };
  // a channel-shaped wrapper around the socket, so the code above the transport does not care
  const chan = (ws, raw) => ({
    get readyState() {
      return ws.readyState === 1 ? 'open' : 'closed';
    },
    get bufferedAmount() {
      return ws.bufferedAmount;
    },
    send: raw,
  });
  const NOOP_PC = {close() {}};
  function hostTimers() {
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
  }
  async function hostRelay(name, gen) {
    const ws = await connect('host=1', 5000);
    const code = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('relay did not create a lobby')), 5000);
      listen(ws, (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m._created) {
            clearTimeout(t);
            res(m._created);
          }
        } catch (e) {}
      });
      ws.onclose = () => {
        clearTimeout(t);
        rej(new Error('relay closed'));
      };
    }).catch((e) => {
      try {
        ws.close();
      } catch (x) {}
      throw e;
    });
    if (gen !== st.gen) {
      ws.close();
      return null;
    }
    Object.assign(st, {role: 'host', mode: 'relay', code, id: 0, name: cleanName(name), t0: nowS(), ws});
    st.roster = [{id: 0, name: st.name}];
    listen(ws, (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (m._p == null) return;
      const p = st.byP[m._p];
      if (m.ev === 'open') {
        if (st.peers.length >= MAXP - 1) return;
        const ch = chan(ws, (s) => ws.send(JSON.stringify({_to: m._p, d: s})));
        const np = {rp: m._p, pc: NOOP_PC, id: st.nextId++, name: '', r: ch, u: ch, ready: false, last: nowS(), born: nowS()};
        st.peers.push(np);
        st.byP[m._p] = np;
      } else if (m.ev === 'close') {
        if (p) drop(p);
      } else if (p && typeof m.d === 'string') hostRecv(p, m.d, false);
    });
    ws.onclose = () => closed('Lost the connection to the game server');
    hostTimers();
    on.roster();
    return code;
  }
  // resolves to the joiner's id, or null when the relay has no such lobby / cannot be reached (try peer-to-peer)
  async function joinRelay(code, name, say, gen) {
    let ws;
    try {
      ws = await connect('code=' + code, 5000);
    } catch (e) {
      return null;
    }
    if (gen !== st.gen) {
      ws.close();
      throw new Error('Cancelled');
    }
    say('Joining');
    const ch = chan(ws, (s) => ws.send(s));
    const h = {pc: NOOP_PC, r: ch, u: ch, last: nowS()};
    let refused = ws._closed && ws._closed.reason;
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
    Object.assign(st, {role: 'client', mode: 'relay', code, name: cleanName(name), host: h, ws});
    listen(ws, clientRecv(h));
    ws.onclose = (e) => {
      if (st.id < 0) {
        refused = e.reason;
        settle(false);
      } else closed(e.reason || 'Lost the connection to the host');
    };
    tx(ch, JSON.stringify({t: '_hi', n: st.name}));
    if (!(await welcomed)) {
      if (/No lobby/.test(refused || '')) {
        // maybe a peer-to-peer lobby with that code: let join() carry on (it resets the state itself)
        ws.onclose = ws.onmessage = null;
        return null;
      }
      reset();
      throw new Error(refused || 'The host did not respond');
    }
    clientTimers(h);
    return st.id;
  }

  // ---- host -----------------------------------------------------------------------------------------------
  async function host(name) {
    reset();
    const gen = st.gen;
    if (useRelay)
      try {
        const code = await hostRelay(name, gen);
        if (code || gen !== st.gen) return code;
      } catch (e) {
        console.warn('relay host failed, using peer-to-peer:', e.message);
        if (gen !== st.gen) return null;
        reset();
      }
    const g2 = st.gen;
    const r = await api({op: 'create'});
    ice(); // warm up, so the first joiner is not kept waiting for it
    if (g2 !== st.gen) return null;
    Object.assign(st, {role: 'host', mode: 'p2p', code: r.code, key: r.key, id: 0, name: cleanName(name), t0: nowS()});
    st.roster = [{id: 0, name: st.name}];
    pollLoop(g2);
    hostTimers();
    on.roster();
    return r.code;
  }
  async function pollLoop(gen) {
    while (gen === st.gen && st.role === 'host') {
      try {
        const r = await api({op: 'poll', code: st.code, key: st.key});
        if (gen !== st.gen) return;
        for (const o of r.offers)
          if (!st.seen[o.peer]) {
            st.seen[o.peer] = 1;
            accept(o.peer, o.sdp, gen).catch((e) => console.warn('accept', e));
          }
      } catch (e) {
        if (/No lobby/.test(e.message)) return; // expired: people already connected keep playing
      }
      // an idle lobby polls more slowly; returning to the page (e.g. from the share sheet) checks at once
      await new Promise((r) => {
        const t = setTimeout(r, Math.max(st.pollMs, nowS() - st.t0 > 600 ? 4000 : 0));
        st.wake = () => {
          clearTimeout(t);
          r();
        };
      });
      st.wake = null;
    }
  }
  async function accept(peer, sdp, gen) {
    if (st.peers.length >= MAXP - 1) return;
    const pc = new RTCPeerConnection({iceServers: await ice()});
    const p = {pc, id: st.nextId++, name: '', r: null, u: null, ready: false, last: nowS(), born: nowS()};
    st.peers.push(p);
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.label === 'r') p.r = ch;
      else p.u = ch;
      ch.onmessage = (ev) => hostRecv(p, ev.data, ch.label === 'u');
      if (ch.label === 'r') ch.onclose = () => drop(p);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(p);
    };
    await pc.setRemoteDescription({type: 'offer', sdp});
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    if (gen !== st.gen) return;
    await api({op: 'answer', code: st.code, key: st.key, peer, sdp: pc.localDescription.sdp});
  }
  function drop(p) {
    const i = st.peers.indexOf(p);
    if (i < 0) return;
    st.peers.splice(i, 1);
    if (p.rp != null) delete st.byP[p.rp];
    try {
      p.pc.close();
    } catch (e) {}
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
  async function join(code, name, say) {
    say = say || (() => {});
    reset();
    const gen = st.gen;
    let gen2 = gen;
    const dead = () => gen2 !== st.gen;
    code = String(code || '').toUpperCase();
    if (!/^[A-Z]{6}$/.test(code)) throw new Error('A lobby code is six letters');
    if (useRelay) {
      const id = await joinRelay(code, name, say, gen);
      if (id != null) return id;
      if (dead()) throw new Error('Cancelled');
      reset(); // not on the relay: look for a peer-to-peer lobby with that code
    }
    gen2 = st.gen;
    if (typeof RTCPeerConnection === 'undefined') throw new Error('This browser cannot make peer-to-peer connections');
    const peer = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('') + 'x';
    const pc = new RTCPeerConnection({iceServers: await ice()});
    const h = {pc, r: pc.createDataChannel('r'), u: pc.createDataChannel('u', {ordered: false, maxRetransmits: 0}), last: nowS()};
    const fail = (msg) => {
      try {
        pc.close();
      } catch (e) {}
      throw new Error(msg);
    };
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    try {
      await api({op: 'offer', code, peer, sdp: pc.localDescription.sdp});
    } catch (e) {
      fail(e.message);
    }
    say('Waiting for the host to answer');
    let ans = null;
    const t0 = nowS();
    for (let i = 0; !ans && nowS() - t0 < 75; i++) {
      await wait(i < 6 ? 800 : 1500);
      if (nowS() - t0 > 12) say('Still waiting for the host. They need the game open on their screen');
      if (dead()) fail('Cancelled');
      try {
        ans = (await api({op: 'wait', code, peer})).sdp;
      } catch (e) {
        fail(e.message);
      }
    }
    if (!ans) fail('The host did not answer. They need the game open on their screen (not in another app).');
    say('Connecting');
    await pc.setRemoteDescription({type: 'answer', sdp: ans});
    const opened = await new Promise((res) => {
      if (h.r.readyState === 'open') return res(true);
      const t = setTimeout(() => res(false), 15000);
      h.r.onopen = () => {
        clearTimeout(t);
        res(true);
      };
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') {
          clearTimeout(t);
          res(false);
        }
      });
    });
    if (dead()) fail('Cancelled');
    if (!opened) fail('Could not connect to the host. Try again, or try from another network (e.g. Wi-Fi instead of mobile data).');
    Object.assign(st, {role: 'client', mode: 'p2p', code, name: cleanName(name), host: h});
    const welcomed = new Promise((res) => {
      const t = setTimeout(() => res(false), 8000);
      h.onWel = () => {
        clearTimeout(t);
        res(true);
      };
    });
    const recv = clientRecv(h);
    h.r.onmessage = recv;
    h.u.onmessage = recv;
    h.r.onclose = () => closed('Lost the connection to the host');
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closed('Lost the connection to the host');
    };
    tx(h.r, JSON.stringify({t: '_hi', n: st.name}));
    if (!(await welcomed)) {
      reset();
      throw new Error('The host did not respond');
    }
    clientTimers(h);
    return st.id;
  }
  function clientRecv(h) {
    return (ev) => {
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
    };
  }
  function clientTimers(h) {
    timers.push(
      setInterval(() => {
        if (nowS() - h.last > 10) closed('Lost the connection to the host');
        else tx(h.r, '{"t":"_ka"}');
      }, 2500),
    );
  }

  // ---- messages -------------------------------------------------------------------------------------------
  // m.to (a player id) sends to one player; otherwise everyone else gets it. unrel: drop rather than queue.
  function send(m, unrel) {
    if (!st.role) return;
    if (st.role === 'client') {
      const ch = unrel ? st.host.u : st.host.r;
      if (unrel && ch.bufferedAmount > 32768) return;
      tx(ch, JSON.stringify(m));
      return;
    }
    m.f = 0;
    const s = JSON.stringify(m);
    for (const p of st.peers) {
      if (!p.ready || (m.to != null && m.to !== p.id)) continue;
      const ch = unrel ? p.u : p.r;
      if (unrel && ch && ch.bufferedAmount > 32768) continue;
      tx(ch, s);
    }
  }
  function leave() {
    if (st.role === 'host') {
      for (const p of st.peers) tx(p.r, '{"t":"_bye"}');
      if (st.mode === 'p2p') api({op: 'close', code: st.code, key: st.key}, true).catch(() => {});
    }
    reset();
  }
  addEventListener('pagehide', leave);
  // A phone suspends a backgrounded page, so a host who went to send the invite cannot answer until they come back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && st.wake) st.wake();
  });

  return {
    st, on, host, join, send, leave, MAXP, cleanName,
    get isHost() {
      return st.role === 'host';
    },
    get mode() {
      return st.mode;
    },
    setPoll(ms) {
      st.pollMs = ms;
    },
  };
})();
