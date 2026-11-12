'use strict';
// Net: lobbies and the peer-to-peer link for the Arena.
// Topology is a star: every joiner holds one WebRTC connection to the host, and the host relays. The lobby API
// (/api/lobby, backed by Vercel Blob) is only used for the handshake; once the data channels are open nothing
// goes through a server. Each link has a reliable channel (events) and an unreliable one (positions, shots).
const Net = (() => {
  const ICE = [{urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']}, {urls: 'stun:stun.cloudflare.com:3478'}];
  const MAXP = 8;
  const st = {role: null, code: '', key: '', id: -1, name: '', roster: [], peers: [], host: null, nextId: 1, seen: {}, pollMs: 2000, t0: 0, gen: 0};
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
      const t = setTimeout(res, 2500);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          res();
        }
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
    Object.assign(st, {role: null, code: '', key: '', id: -1, roster: [], peers: [], host: null, nextId: 1, seen: {}, pollMs: 2000});
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
    const r = await api({op: 'create'});
    if (gen !== st.gen) return null;
    Object.assign(st, {role: 'host', code: r.code, key: r.key, id: 0, name: cleanName(name), t0: nowS()});
    st.roster = [{id: 0, name: st.name}];
    pollLoop(gen);
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
      // an idle lobby polls more slowly
      await wait(Math.max(st.pollMs, nowS() - st.t0 > 600 ? 5000 : 0));
    }
  }
  async function accept(peer, sdp, gen) {
    if (st.peers.length >= MAXP - 1) return;
    const pc = new RTCPeerConnection({iceServers: ICE});
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
  async function join(code, name) {
    reset();
    const gen = st.gen;
    const dead = () => gen !== st.gen;
    code = String(code || '').toUpperCase();
    if (!/^[A-Z]{6}$/.test(code)) throw new Error('A lobby code is six letters');
    if (typeof RTCPeerConnection === 'undefined') throw new Error('This browser cannot make peer-to-peer connections');
    const peer = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('') + 'x';
    const pc = new RTCPeerConnection({iceServers: ICE});
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
    let ans = null;
    for (let i = 0; i < 22 && !ans; i++) {
      await wait(i < 4 ? 900 : 1500);
      if (dead()) fail('Cancelled');
      try {
        ans = (await api({op: 'wait', code, peer})).sdp;
      } catch (e) {
        fail(e.message);
      }
    }
    if (!ans) fail('The host did not answer. The lobby may be full, or its host has gone.');
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
    if (!opened) fail('Could not connect to the host directly. One of the two networks blocks peer-to-peer traffic.');
    Object.assign(st, {role: 'client', code, name: cleanName(name), host: h});
    const welcomed = new Promise((res) => {
      const t = setTimeout(() => res(false), 8000);
      h.onWel = () => {
        clearTimeout(t);
        res(true);
      };
    });
    const recv = (ev) => {
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
      api({op: 'close', code: st.code, key: st.key}, true).catch(() => {});
    }
    reset();
  }
  addEventListener('pagehide', leave);

  return {
    st, on, host, join, send, leave, MAXP, cleanName,
    get isHost() {
      return st.role === 'host';
    },
    setPoll(ms) {
      st.pollMs = ms;
    },
  };
})();
