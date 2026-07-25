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
      return;
    }

    if (!oldCurrent || oldCurrent.id !== newCurrent.id) {
      console.log(`[Room: ${this.roomId}] Playing new current song: ${newCurrent.title}`);
      this.playSong(newCurrent);
    }
  }

  playSong(song) {
    this.stopStream();
    if (!this.isPlaying) {
      console.log(`[Room: ${this.roomId}] Room is currently paused. Preparing song but waiting.`);
      return;
    }
    this.startStream(song);
  }

  startStream(song) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log(`[Room: ${this.roomId}] Initializing yt-dlp + ffmpeg pipeline for ${song.title}`);

    try {
      const ytDlp = spawn('yt-dlp', [
      '--cookies', '/home/2h1m/muzik-dc12/muzik-dc12/cookies.txt',
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '-f', 'bestaudio',
      '-o', '-',
      `https://www.youtube.com/watch?v=${song.videoId}`
    ]);

      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-acodec', 'libmp3lame',
        '-ab', '128k',
        '-f', 'mp3',
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

      ytDlp.stderr.on('data', (data) => {
        console.log(`[YT-DLP] ${data.toString()}`);
      });

      ffmpeg.stderr.on('data', (data) => {
        console.log(`[FFMPEG] ${data.toString()}`);
      });

      ffmpeg.on('close', (code) => {
        console.log(`[Room: ${this.roomId}] ffmpeg stream pipeline exited with code: ${code}`);
        this.handleTrackEnd();
      });

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
    if (this.emptyTimeout) clearTimeout(this.emptyTimeout);
    if (this.channel) this.channel.unsubscribe();
    if (this.onClose) this.onClose(this.roomId);
    console.log(`[Room: ${this.roomId}] Worker destroyed.`);
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
