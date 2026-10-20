const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('redis');
function call(handler, body, query = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const res = { setHeader() {}, status(status) { this.s = status; return this; }, json(j) { resolve({ s: this.s, j }); } };
    Promise.resolve(handler({ method: body ? 'POST' : 'GET', body, query, headers }, res)).catch(reject);
  });
}
async function startRedis() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ror-redis-'));
  const socketPath = path.join(dir, 'redis.sock');
  const server = spawn(process.env.REDIS_SERVER || 'redis-server', ['--port', '0', '--unixsocket', socketPath, '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis startup timed out')), 10000);
    server.once('error', (e) => { clearTimeout(timer); reject(new Error('Install redis-server or set REDIS_SERVER to its path: ' + e.message)); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error('Redis exited: ' + code)); });
    server.stdout.on('data', (chunk) => { if (chunk.toString().toLowerCase().includes('ready to accept connections')) { clearTimeout(timer); resolve(); } });
  }).catch((error) => { server.kill(); fs.rmSync(dir, { recursive: true, force: true }); throw error; });
  const client = createClient({ socket: { path: socketPath } });
  client.on('error', () => {});
  await client.connect();
  const fault = { unavailable: false, dropNextWrite: false, stall: false };
  const sockets = new Set();
  const bridge = http.createServer(async (req, res) => {
    try {
      let data = ''; for await (const chunk of req) data += chunk;
      if (fault.stall) return;
      if (fault.unavailable) { res.writeHead(503); return res.end(JSON.stringify({ error: 'Unavailable' })); }
      const command = JSON.parse(data);
      // sendCommand returns raw Redis arrays, matching Upstash's REST format.
      const result = await client.sendCommand(command.map(String));
      if (fault.dropNextWrite && command[0] === 'EVAL' && command[1].includes('local cur')) {
        fault.dropNextWrite = false; req.socket.destroy(); return;
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result }));
    } catch (error) { res.end(JSON.stringify({ error: error.message })); }
  });
  bridge.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve));
  return {
    client, fault, url: `http://127.0.0.1:${bridge.address().port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => bridge.close(resolve));
      await client.quit();
      await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
module.exports = { call, startRedis };
