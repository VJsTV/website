const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SOCKET_PATH = process.env.RESTART_SOCKET || '/run/restart.sock';

const CONTAINER_MAP = {
  'ch1-live':          'vjstv_ch1',
  'ch2-loop-gallery':  'vjstv_ch2',
  'ch3-vj-education':  'vjstv_ch3',
};

if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  const channel = req.url.replace(/^\/restart\//, '').replace(/\/$/, '');
  const container = CONTAINER_MAP[channel];

  if (!container) {
    res.writeHead(404).end(`Unknown channel: ${channel}`);
    return;
  }

  try {
    execSync(`docker restart ${container}`, { timeout: 30000 });
    console.log(`[Sidecar] Restarted ${container}`);
    res.writeHead(200).end('ok');
  } catch (err) {
    console.error(`[Sidecar] Failed to restart ${container}:`, err.message);
    res.writeHead(500).end(err.message);
  }
});

server.listen(SOCKET_PATH, () => {
  fs.chmodSync(SOCKET_PATH, 0o660);
  console.log(`[Sidecar] Listening on ${SOCKET_PATH}`);
});

process.on('SIGTERM', () => {
  server.close();
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  process.exit(0);
});
