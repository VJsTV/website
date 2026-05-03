const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const cron = require('node-cron');

const SCHEDULE_FILE   = path.join(__dirname, '../schedule/schedule.json');
const CHANNELS_DIR    = path.join(__dirname, '../channels');
const STATE_DIR       = path.join(__dirname, '../state');
const RESTART_SOCKET  = process.env.RESTART_SOCKET || '/run/restart.sock';
const SIGNING_KEY     = process.env.SCHEDULE_SIGNING_KEY || '';
const HB_SECRET       = process.env.HEARTBEAT_SECRET || '';
const HB_ENDPOINT     = process.env.HEARTBEAT_ENDPOINT || '';

const CONTAINER_MAP = {
  'ch1-live':         'vjstv_ch1',
  'ch2-loop-gallery': 'vjstv_ch2',
  'ch3-vj-education': 'vjstv_ch3',
};

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getCurrentBlock(blocks, nowMins) {
  for (const block of blocks) {
    const startM = timeToMinutes(block.start);
    let endM = timeToMinutes(block.end);
    if (endM === 0) endM = 1440;
    if (nowMins >= startM && nowMins < endM) return block;
  }
  return blocks[0];
}

function verifySchedule(envelope) {
  if (!SIGNING_KEY) {
    console.warn('[Scheduler] SCHEDULE_SIGNING_KEY not set — running without signature verification');
    if (envelope && envelope.payload) return envelope.payload;
    return envelope;
  }

  if (!envelope.alg || !envelope.sig || !envelope.payload) {
    throw new Error('schedule.json is not a signed envelope — refusing to apply');
  }

  const payloadStr = JSON.stringify(envelope.payload);
  const expected = crypto.createHmac('sha256', SIGNING_KEY).update(payloadStr).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(envelope.sig, 'hex'))) {
    throw new Error('schedule.json signature invalid — refusing to apply');
  }

  return envelope.payload;
}

function restartChannel(channel) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: RESTART_SOCKET, path: `/restart/${channel}`, method: 'POST' },
      res => {
        res.resume();
        if (res.statusCode === 200) {
          console.log(`[Scheduler] ${channel} restart accepted by sidecar`);
          resolve();
        } else {
          reject(new Error(`Sidecar returned ${res.statusCode} for ${channel}`));
        }
      }
    );
    req.on('error', reject);
    req.setTimeout(35000, () => { req.destroy(); reject(new Error('Sidecar timeout')); });
    req.end();
  });
}

async function postHeartbeat(channel, lastTick, playlistKey) {
  if (!HB_ENDPOINT) return;

  const body = JSON.stringify({ channel, last_tick: lastTick, playlist_key: playlistKey });
  const sig = HB_SECRET
    ? crypto.createHmac('sha256', HB_SECRET).update(body).digest('hex')
    : '';

  try {
    const res = await fetch(HB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Heartbeat-Sig': sig },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.warn(`[Heartbeat] ${channel} → ${res.status}`);
  } catch (e) {
    console.warn(`[Heartbeat] ${channel} POST failed:`, e.message);
  }
}

let lastActivePlaylist = {};

cron.schedule('* * * * *', async () => {
  const now = new Date();
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nowSecs = Math.floor(now.getTime() / 1000);

  let schedule;
  try {
    const raw = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    schedule = verifySchedule(raw);
  } catch (err) {
    console.error('[Scheduler] Schedule load/verify failed:', err.message);
    return;
  }

  for (const [channel, chData] of Object.entries(schedule.channels)) {
    const blocks = chData.blocks;
    if (!blocks || blocks.length === 0) continue;

    let activeBlock = null;

    if (chData.special_events) {
      const today = now.toISOString().slice(0, 10);
      for (const ev of chData.special_events) {
        if (ev.date === today) {
          const startM = timeToMinutes(ev.start);
          let endM = timeToMinutes(ev.end);
          if (endM === 0) endM = 1440;
          if (nowMins >= startM && nowMins < endM) { activeBlock = ev; break; }
        }
      }
    }

    if (!activeBlock) activeBlock = getCurrentBlock(blocks, nowMins);
    if (!activeBlock) continue;

    const playlistKey = activeBlock.playlist || '__live__';
    const heartbeatFile = path.join(STATE_DIR, `heartbeat-${channel}.json`);
    fs.writeFileSync(heartbeatFile, JSON.stringify({ channel, last_tick: nowSecs, playlist_key: playlistKey }));
    postHeartbeat(channel, nowSecs, playlistKey).catch(() => {});

    if (!activeBlock.playlist) {
      console.log(`[Scheduler] ${channel}: live event "${activeBlock.title}" — no playlist switch`);
      continue;
    }

    const compositeKey = channel + ':' + activeBlock.playlist;
    if (lastActivePlaylist[channel] === compositeKey) continue;

    const targetPlaylist  = path.join(CHANNELS_DIR, channel, activeBlock.playlist);
    const activePlaylistFile = path.join(CHANNELS_DIR, channel, 'playlist.txt');

    if (fs.existsSync(targetPlaylist)) {
      console.log(`[Scheduler] ${channel}: switching to "${activeBlock.title}" (${activeBlock.playlist})`);
      fs.copyFileSync(targetPlaylist, activePlaylistFile);
      lastActivePlaylist[channel] = compositeKey;

      try {
        await restartChannel(channel);
      } catch (err) {
        console.error(`[Scheduler] Restart failed for ${channel}:`, err.message);
      }
    } else {
      console.error(`[Scheduler] Missing playlist: ${targetPlaylist}`);
    }
  }
});

process.on('uncaughtException', err => { console.error('[Scheduler] Uncaught exception:', err); });
process.on('unhandledRejection', reason => { console.error('[Scheduler] Unhandled rejection:', reason); });

console.log('VJSTV Scheduler started.');
console.log('Timezone:', process.env.TZ || 'UTC');
console.log('Signing:', SIGNING_KEY ? 'enabled' : 'DISABLED (set SCHEDULE_SIGNING_KEY)');
console.log('Heartbeat endpoint:', HB_ENDPOINT || 'not configured');
