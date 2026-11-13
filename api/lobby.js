'use strict';
// Lobby signaling for the Arena mode. Players connect to each other directly over WebRTC; this function only carries
// the handshake (one offer and one answer per joiner) and stores it in a Vercel Blob store, one small JSON document
// per lobby at lobbies/<CODE>.json. Reads are uncached and writes are conditional on the ETag, so two friends joining
// in the same second cannot overwrite each other.
//
// Without BLOB_READ_WRITE_TOKEN (local dev, tests) the same code runs against an in-memory store.
const crypto = require('crypto');

const TTL = 6 * 3600e3; // a lobby code lives six hours
const MAX_SDP = 12000;
const MAX_PENDING = 12;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const path = (code) => 'lobbies/' + code + '.json';

// ---- storage ----------------------------------------------------------------------------------------------
class Conflict extends Error {}
const mem = new Map();
const memStore = {
  async read(code) {
    const e = mem.get(code);
    return e ? {doc: JSON.parse(e.body), etag: e.etag} : null;
  },
  async write(code, doc, etag) {
    const cur = mem.get(code);
    if (etag !== undefined && (cur ? cur.etag : null) !== etag) throw new Conflict();
    mem.set(code, {body: JSON.stringify(doc), etag: crypto.randomBytes(6).toString('hex')});
  },
  async remove(code) {
    mem.delete(code);
  },
  async sweep() {},
};
function blobStore() {
  const B = require('@vercel/blob');
  return {
    async read(code) {
      const r = await B.get(path(code), {access: 'private', useCache: false});
      if (!r || r.statusCode !== 200 || !r.stream) return null;
      const txt = await new Response(r.stream).text();
      return {doc: JSON.parse(txt), etag: r.blob.etag};
    },
    // etag: null = must not exist yet, string = must still match, undefined = overwrite
    async write(code, doc, etag) {
      const o = {access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60};
      if (etag === null) o.allowOverwrite = false;
      else {
        o.allowOverwrite = true;
        if (etag) o.ifMatch = etag;
      }
      try {
        await B.put(path(code), JSON.stringify(doc), o);
      } catch (e) {
        const n = (e && (e.name || '')) + ' ' + (e && e.message);
        if (e instanceof B.BlobPreconditionFailedError || /Precondition|already exists/i.test(n)) throw new Conflict();
        throw e;
      }
    },
    async remove(code) {
      await B.del(path(code));
    },
    // Lobbies whose host never closed them: drop anything older than a day.
    async sweep() {
      const r = await B.list({prefix: 'lobbies/', limit: 200});
      const old = r.blobs.filter((b) => Date.now() - new Date(b.uploadedAt).getTime() > 24 * 3600e3).map((b) => b.url);
      if (old.length) await B.del(old);
    },
  };
}
let store = null;
const getStore = () => store || (store = process.env.BLOB_READ_WRITE_TOKEN ? blobStore() : memStore);

// ---- operations -------------------------------------------------------------------------------------------
const fail = (status, error) => ({status, body: {error}});
const ok = (body) => ({status: 200, body});
const isCode = (c) => typeof c === 'string' && /^[A-Z]{6}$/.test(c);
const isPeer = (p) => typeof p === 'string' && /^[a-z0-9]{6,16}$/.test(p);
const isSdp = (s) => typeof s === 'string' && s.length > 20 && s.length <= MAX_SDP;
const live = (r) => r && r.doc && Date.now() - r.doc.t < TTL;
const hash = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');
const keyOk = (doc, key) => typeof key === 'string' && hash(key) === doc.kh;
function prune(doc) {
  const now = Date.now();
  for (const m of [doc.offers, doc.answers]) for (const p in m) if (now - m[p].t > 120e3) delete m[p];
}
// read, change, write back; retried when someone else wrote in between
async function mutate(code, fn) {
  const st = getStore();
  for (let i = 0; i < 5; i++) {
    const r = await st.read(code);
    if (!live(r)) return fail(404, 'No lobby with that code');
    // Drop expired offers/answers first, so stale ones never count against MAX_PENDING.
    prune(r.doc);
    const out = fn(r.doc);
    if (out) return out;
    try {
      await st.write(code, r.doc, r.etag);
      return ok({ok: true});
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  return fail(503, 'Lobby is busy, try again');
}

// ---- ICE servers --------------------------------------------------------------------------------------------
// STUN alone cannot connect two players when either is behind a carrier-grade or symmetric NAT (most mobile data),
// so the clients also get TURN relays. Short-lived credentials come from Cloudflare Realtime TURN
// (TURN_KEY_ID + TURN_KEY_API_TOKEN) or Metered (METERED_DOMAIN + METERED_API_KEY) when configured; otherwise the
// public Open Relay servers are the best-effort fallback.
const STUN = [{urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']}, {urls: 'stun:stun.cloudflare.com:3478'}];
const OPEN_RELAY = {
  urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'],
  username: 'openrelayproject',
  credential: 'openrelayproject',
};
async function iceServers() {
  const E = process.env;
  try {
    if (E.TURN_KEY_ID && E.TURN_KEY_API_TOKEN) {
      const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + E.TURN_KEY_ID + '/credentials/generate-ice-servers', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + E.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json'},
        body: JSON.stringify({ttl: 6 * 3600}),
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const j = await r.json();
        const list = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers];
        return STUN.concat(list.filter(Boolean));
      }
    }
    if (E.METERED_DOMAIN && E.METERED_API_KEY) {
      const r = await fetch('https://' + E.METERED_DOMAIN + '/api/v1/turn/credentials?apiKey=' + encodeURIComponent(E.METERED_API_KEY), {signal: AbortSignal.timeout(4000)});
      if (r.ok) return STUN.concat(await r.json());
    }
  } catch (e) {
    console.error('ice', e && e.message);
  }
  return STUN.concat([OPEN_RELAY]);
}

async function handle(b) {
  const st = getStore();
  const op = b && b.op;
  if (op === 'ice') return ok({iceServers: await iceServers()});
  if (op === 'create') {
    if (Math.random() < 0.1) st.sweep().catch(() => {});
    for (let i = 0; i < 8; i++) {
      let code = '';
      for (const x of crypto.randomBytes(6)) code += ALPHA[x % 26];
      const cur = await st.read(code);
      if (live(cur)) continue;
      const key = crypto.randomBytes(16).toString('hex');
      try {
        await st.write(code, {v: 1, t: Date.now(), kh: hash(key), offers: {}, answers: {}}, cur ? cur.etag : null);
      } catch (e) {
        if (e instanceof Conflict) continue;
        throw e;
      }
      return ok({code, key});
    }
    return fail(503, 'Could not allocate a lobby code');
  }
  if (!isCode(b.code)) return fail(400, 'A lobby code is six letters');
  if (op === 'offer') {
    if (!isPeer(b.peer) || !isSdp(b.sdp)) return fail(400, 'Bad offer');
    return mutate(b.code, (doc) => {
      if (Object.keys(doc.offers).length >= MAX_PENDING) return fail(429, 'Lobby is busy, try again');
      doc.offers[b.peer] = {sdp: b.sdp, t: Date.now()};
      delete doc.answers[b.peer];
    });
  }
  if (op === 'poll') {
    // host: which joiners are waiting for an answer
    const r = await st.read(b.code);
    if (!live(r)) return fail(404, 'No lobby with that code');
    if (!keyOk(r.doc, b.key)) return fail(403, 'Not the host');
    const offers = [];
    for (const p in r.doc.offers) if (!r.doc.answers[p]) offers.push({peer: p, sdp: r.doc.offers[p].sdp});
    return ok({offers});
  }
  if (op === 'answer') {
    if (!isPeer(b.peer) || !isSdp(b.sdp)) return fail(400, 'Bad answer');
    return mutate(b.code, (doc) => {
      if (!keyOk(doc, b.key)) return fail(403, 'Not the host');
      doc.answers[b.peer] = {sdp: b.sdp, t: Date.now()};
      delete doc.offers[b.peer];
    });
  }
  if (op === 'wait') {
    // joiner: has the host answered yet
    if (!isPeer(b.peer)) return fail(400, 'Bad peer');
    const r = await st.read(b.code);
    if (!live(r)) return fail(404, 'No lobby with that code');
    const a = r.doc.answers[b.peer];
    return ok({sdp: a ? a.sdp : null});
  }
  if (op === 'close') {
    const r = await st.read(b.code);
    if (!r) return ok({ok: true});
    if (!keyOk(r.doc, b.key)) return fail(403, 'Not the host');
    await st.remove(b.code);
    return ok({ok: true});
  }
  return fail(400, 'Unknown op');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({error: 'POST only'}));
  }
  let out;
  try {
    let body = req.body;
    if (body == null) {
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        n += c.length;
        if (n > 40000) throw Object.assign(new Error('too big'), {status: 413});
        chunks.push(c);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    out = await handle(body || {});
  } catch (e) {
    console.error('lobby', e);
    out = fail(e.status || 500, e.status === 413 ? 'Request too large' : 'Lobby service error');
  }
  res.statusCode = out.status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(out.body));
};
module.exports.handle = handle;
