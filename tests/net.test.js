'use strict';
// End to end: the real src/net.js, a host and two joiners, through the real relay (server/relay.js) in this process.
const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WS = require('../server/node_modules/ws');
const {attach} = require('../server/relay.js');

const src = fs.readFileSync(path.join(__dirname, '../src/net.js'), 'utf8');
function makeNet(port) {
  const ctx = {WebSocket: WS, performance, location: {protocol: 'http:', host: 'localhost:' + port}, window: {}, addEventListener() {}, console, setTimeout, clearTimeout, setInterval, clearInterval};
  ctx.window = ctx;
  vm.createContext(ctx);
  return vm.runInContext(src + '\n;Net', ctx);
}
const until = async (f, ms = 3000) => {
  const t = Date.now();
  while (!f()) {
    if (Date.now() - t > ms) throw new Error('timeout waiting for ' + f);
    await new Promise((r) => setTimeout(r, 20));
  }
};

(async () => {
  const server = http.createServer();
  const relay = attach(server);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const H = makeNet(port), A = makeNet(port), B = makeNet(port);
  const got = {H: [], A: [], B: []};
  H.on.msg = (m) => got.H.push(m);
  A.on.msg = (m) => got.A.push(m);
  B.on.msg = (m) => got.B.push(m);
  let closedWhy = null;
  A.on.closed = (w) => (closedWhy = w);

  const code = await H.host('Hosty');
  assert(/^[A-Z]{6}$/.test(code), 'lobby code');
  assert.strictEqual(await A.join(code.toLowerCase(), 'Ann'), 1);
  assert.strictEqual(await B.join(code, 'Bob'), 2);
  await until(() => H.st.roster.length === 3 && A.st.roster.length === 3 && B.st.roster.length === 3);

  A.send({t: 'x', n: 1}, true); // joiner -> everyone else, stamped with the sender
  await until(() => got.H.length && got.B.length);
  assert.strictEqual(got.H[0].f, 1);
  assert.strictEqual(got.B[0].f, 1);
  assert.strictEqual(got.A.length, 0, 'sender does not hear itself');

  H.send({t: 'y', to: 2}); // host -> one joiner
  await until(() => got.B.some((m) => m.t === 'y'));
  assert(!got.A.some((m) => m.t === 'y'));

  B.leave(); // a joiner leaves, the roster shrinks
  await until(() => H.st.roster.length === 2 && A.st.roster.length === 2);

  // many joins and leaves never leave the lobby "busy"
  for (let i = 0; i < 20; i++) {
    const N = makeNet(port);
    await N.join(code, 'T' + i);
    N.leave();
  }
  await until(() => H.st.roster.length === 2);

  await assert.rejects(makeNet(port).join('ZZZZZZ', 'Nope'), /No lobby/);

  H.leave(); // closing the lobby tells the joiners and frees the code
  await until(() => closedWhy);
  assert(/host closed/i.test(closedWhy), closedWhy);
  assert.strictEqual(relay.rooms.size, 0);

  relay.close();
  server.close();
  for (const w of relay.wss.clients) w.terminate();
  console.log('net.test.js ok');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
