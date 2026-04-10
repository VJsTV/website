const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cron = require('node-cron');

const SCHEDULE_FILE = path.join(__dirname, '../schedule/schedule.json');
const CHANNELS_DIR = path.join(__dirname, '../channels');

const CONTAINER_MAP = {
  'ch1-live': 'vjstv_ch1',
  'ch2-loop-gallery': 'vjstv_ch2',
  'ch3-vj-education': 'vjstv_ch3'
};

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

let lastActivePlaylist = {};

cron.schedule('* * * * *', () => {
  const now = new Date();
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();

  try {
    const rawData = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const schedule = JSON.parse(rawData);

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
            if (nowMins >= startM && nowMins < endM) {
              activeBlock = ev;
              break;
            }
          }
        }
      }

      if (!activeBlock) {
        activeBlock = getCurrentBlock(blocks, nowMins);
      }

      if (!activeBlock) continue;
      if (!activeBlock.playlist) {
        console.log(`[Scheduler] ${channel}: live event "${activeBlock.title}" — no playlist switch needed`);
        continue;
      }

      const playlistKey = channel + ':' + activeBlock.playlist;
      if (lastActivePlaylist[channel] === playlistKey) continue;

      const targetPlaylist = path.join(CHANNELS_DIR, channel, activeBlock.playlist);
      const activePlaylistFile = path.join(CHANNELS_DIR, channel, 'playlist.txt');

      if (fs.existsSync(targetPlaylist)) {
        console.log(`[Scheduler] ${channel}: switching to "${activeBlock.title}" (${activeBlock.playlist})`);
        fs.copyFileSync(targetPlaylist, activePlaylistFile);
        lastActivePlaylist[channel] = playlistKey;

        const containerName = CONTAINER_MAP[channel];
        if (containerName) {
          console.log(`[Docker] Restarting container: ${containerName}`);
          try {
            execSync(`docker restart ${containerName}`, { timeout: 30000 });
            console.log(`[Docker] ${containerName} restarted successfully`);
          } catch (err) {
            console.error(`[Docker] Failed to restart ${containerName}:`, err.message);
          }
        }
      } else {
        console.error(`[Scheduler] Missing playlist file: ${targetPlaylist}`);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err.message);
  }
});

console.log('VJSTV Scheduler started.');
console.log('Timezone:', process.env.TZ || 'UTC');
console.log('Checking schedule every minute...');
