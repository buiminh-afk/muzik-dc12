'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// Polyfill WebSocket for Node.js
global.WebSocket = require('ws');

// Simple helper to load .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const icecastUrl = process.env.ICECAST_URL || 'icecast://source:hackme@localhost:8000';

if (!supabaseUrl || !supabaseKey) {
  console.error('[Feeder Manager] Missing Supabase credentials in .env.local!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class RoomWorker {
  constructor(roomId, url, key, onClose) {
    this.roomId = roomId;
    this.supabase = createClient(url, key);
    this.onClose = onClose;
    this.channel = null;
    this.queue = [];
    this.isPlaying = false;
    this.currentProcess = { ytDlp: null, ffmpeg: null };
    this.isTransitioning = false;
    this.explicitStop = false;
    this.presenceUsers = [];
    this.emptyTimeout = null;
    this.preloadedSong = null; // { videoId, filePath, completed }
    this.preloadProcess = null; // { ytDlp, ffmpeg }

    this.init();
  }

  init() {
    this.channel = this.supabase.channel(`room_${this.roomId}`, {
      config: {
        presence: {
          key: 'server-feeder',
        }
      }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        const users = [];
        Object.keys(state).forEach(key => {
          users.push(...state[key]);
        });
        this.handlePresenceUpdate(users);
      })
      .on('broadcast', { event: 'queue_update' }, ({ payload }) => {
        console.log(`[Room: ${this.roomId}] Queue updated by client.`);
        this.updateQueue(payload.queue || []);
      })
      .on('broadcast', { event: 'playback_state' }, ({ payload }) => {
        console.log(`[Room: ${this.roomId}] Playback state change requested: isPlaying = ${payload.isPlaying}`);
        this.handlePlaybackChange(payload.isPlaying);
      })
      .on('broadcast', { event: 'sync_state' }, ({ payload }) => {
        // Only sync if we have no state, to prevent overriding
        if (this.queue.length === 0 && payload.queue && payload.queue.length > 0) {
          console.log(`[Room: ${this.roomId}] Synced initial state from client.`);
          this.isPlaying = payload.isPlaying;
          this.updateQueue(payload.queue);
        }
      });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Room: ${this.roomId}] Subscribed to Supabase channel.`);
        // Ask existing clients in the room to sync their queue/playback state to us
        this.channel.send({
          type: 'broadcast',
          event: 'request_sync',
          payload: { senderTabId: 'server-feeder' }
        });

        // Join Presence so clients know we're active
        await this.channel.track({
          username: 'Server Feeder',
          isHost: false,
          joinedAt: new Date().toISOString()
        });
      }
    });
  }

  handlePresenceUpdate(users) {
    this.presenceUsers = users.filter(u => u.username !== 'Server Feeder');
    console.log(`[Room: ${this.roomId}] Presence updated. Active users: ${this.presenceUsers.length}`);

    if (this.presenceUsers.length === 0) {
      if (!this.emptyTimeout) {
        console.log(`[Room: ${this.roomId}] Room is empty. Initiating 5-minute shutdown timer.`);
        this.emptyTimeout = setTimeout(() => {
          console.log(`[Room: ${this.roomId}] Room empty for 5 minutes. Stopping worker.`);
          this.destroy();
        }, 5 * 60 * 1000);
      }
    } else {
      if (this.emptyTimeout) {
        console.log(`[Room: ${this.roomId}] User active. Cancelling shutdown timer.`);
        clearTimeout(this.emptyTimeout);
        this.emptyTimeout = null;
      }
    }
  }

  updateQueue(newQueue) {
    const oldCurrent = this.queue[0];
    const newCurrent = newQueue[0];
    this.queue = newQueue;

    if (!newCurrent) {
      console.log(`[Room: ${this.roomId}] Queue is empty. Stopping streams.`);
      this.stopStream();
      this.cleanupPreload();
      return;
    }

    if (!oldCurrent || oldCurrent.id !== newCurrent.id) {
      console.log(`[Room: ${this.roomId}] Playing new current song: ${newCurrent.title}`);
      // NOTE: Do NOT call checkPreload() here.
      // playSong() has a 300ms delay before startStream() runs.
      // checkPreload() is called INSIDE startStream() after preload cache is consumed.
      this.playSong(newCurrent);
    } else {
      // Only the queue order changed, current song is unchanged.
      // Safe to trigger preload of new next song.
      this.checkPreload();
    }
  }

  playSong(song) {
    this.stopStream();
    if (!this.isPlaying) {
      console.log(`[Room: ${this.roomId}] Room is currently paused. Preparing song but waiting.`);
      return;
    }
    
    // Wait 300ms to allow Icecast mountpoint socket to close cleanly
    setTimeout(() => {
      // If queue changed or playing stopped during the timeout, abort
      if (!this.isPlaying || this.queue[0]?.id !== song.id) return;
      this.startStream(song);
    }, 300);
  }

  startStream(song) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    const startTime = Date.now();

    // Check if we have a fully completed preload for this videoId
    if (this.preloadedSong && this.preloadedSong.videoId === song.videoId && this.preloadedSong.completed && fs.existsSync(this.preloadedSong.filePath)) {
      console.log(`[Room: ${this.roomId}] Playing ${song.title} from PRELOADED CACHE!`);
      try {
        const ffmpeg = spawn('ffmpeg', [
          '-re',
          '-i', this.preloadedSong.filePath,
          '-acodec', 'copy',
          '-f', 'mp3',
          '-flush_packets', '1',
          '-content_type', 'audio/mpeg',
          `${icecastUrl}/${this.roomId}.mp3`
        ]);

        this.currentProcess = { ytDlp: null, ffmpeg };

        ffmpeg.on('error', (err) => {
          console.error(`[Room: ${this.roomId}] ffmpeg preloaded stream process error:`, err.message);
        });

        let streamStarted = false;
        ffmpeg.stderr.on('data', (data) => {
          const text = data.toString();
          if (!streamStarted && (text.includes('time=') || text.includes('size='))) {
            streamStarted = true;
            this.channel.send({
              type: 'broadcast',
              event: 'stream_ready',
              payload: { videoId: song.videoId }
            });
          }
          // console.log(`[FFMPEG-Cache] ${text}`); // Muted verbose logs
        });

        const cacheFileToDelete = this.preloadedSong.filePath;
        ffmpeg.on('close', (code) => {
          console.log(`[Room: ${this.roomId}] ffmpeg cache stream pipeline exited with code: ${code}`);
          // Delete the cache file
          try {
            if (fs.existsSync(cacheFileToDelete)) {
              fs.unlinkSync(cacheFileToDelete);
              console.log(`[Room: ${this.roomId}] Deleted used cache file: ${cacheFileToDelete}`);
            }
          } catch (e) {}

          // Check if this is still the active process
          if (this.currentProcess.ffmpeg === ffmpeg) {
            const elapsed = Date.now() - startTime;
            if (elapsed < 3000) {
              console.error(`[Room: ${this.roomId}] Cache stream exited too quickly (${elapsed}ms). Likely Icecast Conflict.`);
              this.isPlaying = false;
              this.currentProcess = { ytDlp: null, ffmpeg: null };
              this.broadcastPlaybackState();
            } else {
              this.handleTrackEnd();
            }
          } else {
            console.log(`[Room: ${this.roomId}] Old ffmpeg cache stream closed. Ignoring.`);
          }
        });

        this.preloadedSong = null;
        this.isTransitioning = false;
        // Preload cache consumed — now preload the NEXT song in queue.
        this.checkPreload();
        return;
      } catch (e) {
        console.error(`[Room: ${this.roomId}] Failed to stream preloaded file, falling back to live stream:`, e);
        this.cleanupPreload();
      }
    }

    // If no cache, fall back to standard stream pipeline
    console.log(`[Room: ${this.roomId}] Initializing live yt-dlp + ffmpeg pipeline for ${song.title}`);

    try {
      const ytDlpArgs = [
        '--force-ipv4',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416',
        '-f', 'bestaudio',
        '-o', '-',
        `https://www.youtube.com/watch?v=${song.videoId}`
      ];

      const masterCookiesPath = '/home/2h1m/muzik-dc12/muzik-dc12/cookies.txt';
      const workingCookiesPath = `/tmp/yt-dlp-cookies-${this.roomId}.txt`;

      if (fs.existsSync(masterCookiesPath)) {
        const content = fs.readFileSync(masterCookiesPath, 'utf8');
        if (content.includes('# Netscape HTTP Cookie File')) {
          // Copy to temp file — yt-dlp will write session updates there,
          // leaving the master cookies.txt untouched so it doesn't get stripped.
          fs.copyFileSync(masterCookiesPath, workingCookiesPath);
          ytDlpArgs.push('--cookies', workingCookiesPath);
        } else {
          console.warn(`[Room: ${this.roomId}] cookies.txt is invalid or empty, skipping --cookies.`);
        }
      }

      const ytDlp = spawn('yt-dlp', ytDlpArgs);


      const ffmpeg = spawn('ffmpeg', [
        '-re',                     // Pace output to 1x realtime. REQUIRED for Icecast streaming —
                                   // without it ffmpeg pushes the whole song in seconds and Icecast
                                   // ends the stream immediately before clients can connect.
        '-i', 'pipe:0',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-f', 'mp3',
        '-flush_packets', '1',     // Flush output packets immediately to Icecast
        '-content_type', 'audio/mpeg',
        `${icecastUrl}/${this.roomId}.mp3`
      ]);


      ytDlp.stdout.pipe(ffmpeg.stdin);
      this.currentProcess = { ytDlp, ffmpeg };

      ytDlp.on('error', (err) => {
        console.error(`[Room: ${this.roomId}] yt-dlp process error:`, err.message);
      });

      ffmpeg.on('error', (err) => {
        console.error(`[Room: ${this.roomId}] ffmpeg process error:`, err.message);
      });

      let ytDlpFailed = false; // Track if yt-dlp itself errored (auth, bot check, etc.)

      ytDlp.stderr.on('data', (data) => {
        const text = data.toString();
        console.log(`[YT-DLP] ${text}`);
        // Detect authentication / bot-check errors so we can skip instead of pause
        if (text.includes('Sign in to confirm') || text.includes('not a bot') || text.includes('ERROR:')) {
          ytDlpFailed = true;
        }
      });

      let streamStarted = false;
      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString();
        if (!streamStarted && (text.includes('time=') || text.includes('size='))) {
          streamStarted = true;
          this.channel.send({
            type: 'broadcast',
            event: 'stream_ready',
            payload: { videoId: song.videoId }
          });
        }
        
        // Only log meaningful ffmpeg errors, skip the verbose build info block
        if (text.includes('Error') || text.includes('error') || text.includes('[out#')) {
          console.log(`[FFMPEG] ${text.trim()}`);
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`[Room: ${this.roomId}] ffmpeg stream pipeline exited with code: ${code}`);

        if (this.currentProcess.ffmpeg === ffmpeg) {
          const elapsed = Date.now() - startTime;
          if (elapsed < 10000) {
            // Stream exited very quickly — either Icecast conflict or yt-dlp auth failure
            if (ytDlpFailed) {
              console.error(`[Room: ${this.roomId}] yt-dlp failed (auth/bot check). Skipping to next song.`);
              this.currentProcess = { ytDlp: null, ffmpeg: null };
              this.handleTrackEnd(); // skip instead of pause
            } else {
              console.error(`[Room: ${this.roomId}] Stream pipeline exited too quickly (${elapsed}ms). Likely Icecast conflict. Pausing.`);
              this.isPlaying = false;
              this.currentProcess = { ytDlp: null, ffmpeg: null };
              this.broadcastPlaybackState();
            }
          } else {
            this.handleTrackEnd();
          }
        } else {
          console.log(`[Room: ${this.roomId}] Old ffmpeg stream closed. Ignoring.`);
        }
      });

      this.isTransitioning = false;
      // Live stream started — now trigger preload for the next song.
      this.checkPreload();


    } catch (e) {
      console.error(`[Room: ${this.roomId}] Exception occurred when starting stream pipeline:`, e);
    } finally {
      this.isTransitioning = false;
    }
  }

  stopStream() {
    if (!this.currentProcess.ffmpeg && !this.currentProcess.ytDlp) return;

    this.explicitStop = true;
    console.log(`[Room: ${this.roomId}] Terminating stream pipeline.`);
    
    try {
      if (this.currentProcess.ytDlp) {
        this.currentProcess.ytDlp.kill('SIGKILL');
      }
      if (this.currentProcess.ffmpeg) {
        this.currentProcess.ffmpeg.kill('SIGKILL');
      }
    } catch (e) {
      console.error(`[Room: ${this.roomId}] Error terminating processes:`, e.message);
    }

    this.currentProcess = { ytDlp: null, ffmpeg: null };
    this.explicitStop = false;
  }

  handlePlaybackChange(isPlaying) {
    this.isPlaying = isPlaying;

    if (this.isPlaying) {
      if (this.currentProcess.ffmpeg) {
        this.resumeStream();
      } else if (this.queue.length > 0) {
        this.startStream(this.queue[0]);
      }
    } else {
      this.pauseStream();
    }
  }

  pauseStream() {
    if (!this.currentProcess.ffmpeg) return;
    console.log(`[Room: ${this.roomId}] Suspending stream processes (SIGSTOP).`);
    try {
      this.currentProcess.ytDlp.kill('SIGSTOP');
      this.currentProcess.ffmpeg.kill('SIGSTOP');
    } catch (e) {
      console.warn(`[Room: ${this.roomId}] SIGSTOP failed:`, e.message);
    }
  }

  resumeStream() {
    if (!this.currentProcess.ffmpeg) return;
    console.log(`[Room: ${this.roomId}] Resuming stream processes (SIGCONT).`);
    try {
      this.currentProcess.ytDlp.kill('SIGCONT');
      this.currentProcess.ffmpeg.kill('SIGCONT');
    } catch (e) {
      console.warn(`[Room: ${this.roomId}] SIGCONT failed:`, e.message);
    }
  }

  handleTrackEnd() {
    if (this.explicitStop) return;

    console.log(`[Room: ${this.roomId}] Song ended naturally.`);

    if (this.queue.length > 0) {
      this.queue.shift();

      // Broadcast updated queue to clients
      this.channel.send({
        type: 'broadcast',
        event: 'queue_update',
        payload: { queue: this.queue }
      });

      if (this.queue.length > 0) {
        this.playSong(this.queue[0]);
      } else {
        console.log(`[Room: ${this.roomId}] Queue ended. No more tracks to play.`);
      }
    }
  }

  destroy() {
    this.stopStream();
    this.cleanupPreload();
    if (this.emptyTimeout) clearTimeout(this.emptyTimeout);
    if (this.channel) this.channel.unsubscribe();
    if (this.onClose) this.onClose(this.roomId);
    console.log(`[Room: ${this.roomId}] Worker destroyed.`);
  }

  checkPreload() {
    // We only preload the next song in queue (index 1)
    if (this.queue.length <= 1) {
      this.cleanupPreload();
      return;
    }

    const nextSong = this.queue[1];

    // If already preloading/preloaded this video, do nothing
    if (this.preloadedSong && this.preloadedSong.videoId === nextSong.videoId) {
      return;
    }

    // Cancel old preload first
    this.cleanupPreload();

    console.log(`[Room: ${this.roomId}] Starting background preload for next song: ${nextSong.title}`);
    const tempPath = path.join('/tmp', `muzik_${this.roomId}_${nextSong.videoId}.mp3`);
    
    this.preloadedSong = {
      videoId: nextSong.videoId,
      filePath: tempPath,
      completed: false
    };

    try {
      const ytDlpArgs = [
        '--force-ipv4',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416',
        '-f', 'bestaudio',
        '-o', '-',
        `https://www.youtube.com/watch?v=${nextSong.videoId}`
      ];

      const cookiesPath = '/home/2h1m/muzik-dc12/muzik-dc12/cookies.txt';
      if (fs.existsSync(cookiesPath)) {
        const content = fs.readFileSync(cookiesPath, 'utf8');
        if (content.includes('# Netscape HTTP Cookie File')) {
          ytDlpArgs.push('--cookies', cookiesPath);
        }
      }

      const ytDlp = spawn('yt-dlp', ytDlpArgs);

      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-f', 'mp3',
        '-y',
        tempPath
      ]);

      ytDlp.stdout.pipe(ffmpeg.stdin);
      this.preloadProcess = { ytDlp, ffmpeg };

      ytDlp.on('error', (err) => {
        console.error(`[Preload] yt-dlp process error:`, err.message);
      });

      ffmpeg.on('error', (err) => {
        console.error(`[Preload] ffmpeg process error:`, err.message);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`[Room: ${this.roomId}] Preload completed successfully for: ${nextSong.title}`);
          if (this.preloadedSong && this.preloadedSong.videoId === nextSong.videoId) {
            this.preloadedSong.completed = true;
          }
        } else {
          console.warn(`[Room: ${this.roomId}] Preload pipeline closed/failed with code: ${code}`);
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (e) {}
        }
        this.preloadProcess = null;
      });

    } catch (e) {
      console.error(`[Room: ${this.roomId}] Failed to start background preload pipeline:`, e);
      this.preloadProcess = null;
    }
  }

  cleanupPreload() {
    if (this.preloadProcess) {
      console.log(`[Room: ${this.roomId}] Aborting active preload process.`);
      try {
        if (this.preloadProcess.ytDlp) this.preloadProcess.ytDlp.kill('SIGKILL');
        if (this.preloadProcess.ffmpeg) this.preloadProcess.ffmpeg.kill('SIGKILL');
      } catch (e) {}
      this.preloadProcess = null;
    }

    if (this.preloadedSong) {
      try {
        if (fs.existsSync(this.preloadedSong.filePath)) {
          fs.unlinkSync(this.preloadedSong.filePath);
          console.log(`[Room: ${this.roomId}] Deleted preloaded file: ${this.preloadedSong.filePath}`);
        }
      } catch (e) {}
      this.preloadedSong = null;
    }
  }
}

const activeWorkers = new Map();
const lobbyChannel = supabase.channel('room_lobby');

function handleRoomActive(roomId) {
  console.log(`[Manager] Received ping for Room: ${roomId}`);
  if (!roomId) return;
  if (!activeWorkers.has(roomId)) {
    console.log(`[Manager] Spawning new room worker for Room: ${roomId}`);
    const worker = new RoomWorker(roomId, supabaseUrl, supabaseKey, (deadRoomId) => {
      activeWorkers.delete(deadRoomId);
      console.log(`[Manager] Room worker for ${deadRoomId} removed from active tracking.`);
    });
    activeWorkers.set(roomId, worker);
  }
}

lobbyChannel.on('broadcast', { event: 'room_active' }, (payload) => {
  console.log('[Manager] Raw broadcast payload:', payload);
  if (payload && payload.payload) {
    handleRoomActive(payload.payload.roomId);
  }
});

lobbyChannel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log('[Manager] Successfully connected to Lobby channel. Listening for active room pings...');
  }
});
