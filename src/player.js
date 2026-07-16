import shaka from 'shaka-player';
import config from './config.js';

// Fire-and-forget log sender — posts events to the proxy's /log endpoint
// which writes them to logs/proxy.log with timestamps.
function logEvent(level, message) {
  try {
    fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message }),
    }).catch(() => {});
  } catch (e) {
    // ignore
  }
}

let player = null;
let videoElement = null;
let bufferingCallback = null;
let trackCallback = null;
let isBuffering = false;
let currentChannel = null;
let loadToken = 0;
let reconnectTimer = null;
let reconnectPending = false;
let reconnectAttempts = 0;
let consecutiveErrors = 0;
let stallWatchdogTimer = null;
let lastStallTime = 0;
let lastStallCheck = 0;
// Last-resort retry for Amazon CDN 403
let lastResortAttempts = 0;
let advancePending = false;
let channelAdvanceCallback = null;

// Proactive MPD refresh — reloads the manifest every 5 minutes so segment
// URLs never use stale ?m= tokens from the Amazon CDN.
let mpdRefreshTimer = null;
const MPD_REFRESH_INTERVAL = 5 * 60 * 1000;

export function initPlayer(videoEl) {
  videoElement = videoEl;

  // Some TV browsers falsely report navigator.onLine === false, which makes
  // Shaka throw NETWORK_OFFLINE (1002) and skip ABR switches even when the
  // network is actually available. Force it to report online so our own
  // reconnect logic handles real outages.
  try {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
  } catch (e) {
    /* ignore if the property is not overridable */
  }

  // Install polyfills for older TV browsers
  shaka.polyfill.installAll();

  // Check browser support
  if (!shaka.Player.isBrowserSupported()) {
    console.error('Shaka Player not supported in this browser');
    return false;
  }

  // Create player instance (v5+ uses attach() instead of passing mediaElement)
  player = new shaka.Player();

  // Route ALL Shaka networking requests through the proxy when enabled.
  // Without this, segment URLs inside the MPD (which are absolute CDN URLs
  // like otte.cache.aiv-cdn.net/...) are fetched directly by the browser
  // with the app's origin, which Amazon's CDN rejects as 403.
  const networkingEngine = player.getNetworkingEngine();
  if (networkingEngine) {
    networkingEngine.registerRequestFilter((type, request) => {
      if (!config.useProxy) return;
      if (currentChannel && currentChannel.useProxy === false) return;
      const url = request.uris && request.uris[0];
      if (!url || !url.startsWith('http')) return;
      // Skip URLs already going through the proxy (live manifest refresh, etc.)
      if (url.startsWith(self.location.origin)) return;
      request.uris[0] = config.proxyUrl + url;
    });
  }

  // Apply optimized config
  player.configure(config.player);

  // Listen for errors
  player.addEventListener('error', (event) => {
    handlePlayerError(event.detail);
  });

  // Listen for buffering state changes
  player.addEventListener('buffering', (event) => {
    isBuffering = event.buffering;
    showLoading(event.buffering);
    if (bufferingCallback) {
      bufferingCallback(event.buffering);
    }
  });

  // Listen for ABR or manual track switches (resolution changes)
  player.addEventListener('variantchanged', (event) => {
    const newTrack = event.detail && event.detail.newTrack;
    if (trackCallback && newTrack) {
      trackCallback(newTrack.height);
    }
  });

  // Keep the buffering percentage fresh as data arrives
  videoEl.addEventListener('progress', notifyBufferingProgress);
  videoEl.addEventListener('timeupdate', notifyBufferingProgress);

  // Reflect play/pause state in the UI
  videoEl.addEventListener('play', () => showPlayState(false));
  videoEl.addEventListener('pause', () => showPlayState(true));

  // Attach to the video element (v5+)
  player.attach(videoEl).catch((e) => console.error('Player attach failed:', e));

  return true;
}

function notifyBufferingProgress() {
  if (isBuffering && bufferingCallback) {
    bufferingCallback(true, getBufferingPercent());
  }
}

export function onBuffering(callback) {
  bufferingCallback = callback;
}

export function onTrackChange(callback) {
  trackCallback = callback;
}

export function onChannelAdvance(callback) {
  channelAdvanceCallback = callback;
}

export function getActiveHeight() {
  if (!player) return null;
  const tracks = player.getVariantTracks();
  const active = tracks.find((t) => t.active);
  return active ? active.height : null;
}

export async function loadChannel(channel) {
  if (!player || !channel) return false;

  const myToken = ++loadToken;
  currentChannel = channel;

  // A manual (user) load cancels any pending auto-reconnect
  clearTimeout(reconnectTimer);
  reconnectPending = false;
  stopStallWatchdog();
  stopMpdRefresh();

  hideError();
  showLoading(true);
  advancePending = false;
  lastResortAttempts = 0;

  // Build the URL (with or without proxy)
  let url = channel.url;
  // Append cache-buster on retries to force a fresh CDN edge assignment
  if (reconnectAttempts > 0) {
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    url += sep + '_t=' + Date.now();
  }
  if (channel.useProxy !== false && config.useProxy) {
    url = config.proxyUrl + url;
  }

  try {
    // Set DRM if present
    if (channel.drm) {
      player.configure({
        drm: {
          clearKeys: {
            [channel.drm.keyId]: channel.drm.key,
          },
        },
      });
    } else {
      // Clear any previous DRM config
      player.configure({
        drm: {
          clearKeys: {},
        },
      });
    }

    // Load the stream
    await player.load(url);

    // A newer load started while this one was in flight; ignore the result
    if (myToken !== loadToken) return false;

    showLoading(false);
    reconnectAttempts = 0;
    consecutiveErrors = 0;
    startStallWatchdog();
    startMpdRefresh();
    logEvent('INFO', 'Loaded channel: ' + (channel.name || channel.url.slice(0, 80)));
    return true;
  } catch (error) {
    // A newer load started; this failure is just an interruption
    if (myToken !== loadToken) return false;

    showLoading(false);

    // LOAD_INTERRUPTED (7000): caused by switching channels quickly. Ignore.
    if (error && error.code === 7000) {
      return false;
    }

    // Network/offline errors: auto-reconnect instead of a stuck error
    if (isRecoverable(error)) {
      logEvent('WARN', 'Load failed (recoverable ' + error.code + ') — will reconnect');
      scheduleReconnect();
      return false;
    }

    logEvent('ERROR', 'Failed to load channel — ' + getErrorMessage(error));
    showError(getErrorMessage(error));
    console.error('Failed to load channel:', error);
    return false;
  }
}

function handlePlayerError(error) {
  if (!error) return;

  // Ignore interruptions from switching channels
  if (error.code === 7000) return;

  console.error('Shaka error:', error);

  // Suppress errors while auto-advance is pending
  if (advancePending) return;

  consecutiveErrors++;

  // 403 on segment: retry up to 3 times with 2s gap to get fresh ?m= tokens
  if (error.code === 1002 && currentChannel) {
    const status = error.data && error.data[0];
    if (status === 403) {
      lastResortAttempts++;
      logEvent('WARN', '403 on segment — retry ' + lastResortAttempts + '/3');
      if (lastResortAttempts <= 3) {
        reconnectAttempts = Math.max(reconnectAttempts, 1);
        showReconnectMessage('Refreshing session (' + lastResortAttempts + '/3)...');
        setTimeout(() => {
          logEvent('INFO', '403 retry ' + lastResortAttempts + '/3 — reloading MPD');
          loadChannel(currentChannel);
        }, 2000);
        return;
      }
    }
  }

  if (isRecoverable(error)) {
    // After 3 consecutive errors, force a hard reload (cache-bust + fresh edge)
    if (consecutiveErrors >= 3) {
      consecutiveErrors = 0;
      showReconnectMessage('reloading');
      loadChannel(currentChannel);
      return;
    }
    scheduleReconnect();
    return;
  }

  logEvent('ERROR', 'Unrecoverable error ' + error.code + ' — ' + getErrorMessage(error));
  showError(getErrorMessage(error));

  // Auto-advance to next channel after 3 failed 403 retries
  if (error.code === 1002 && channelAdvanceCallback) {
    const status = error.data && error.data[0];
    if (status === 403 && lastResortAttempts > 3) {
      advancePending = true;
      logEvent('INFO', '3 retries exhausted — advancing to next channel');
      showError('Stream expired \u2014 advancing to next channel...');
      setTimeout(() => {
        advancePending = false;
        logEvent('INFO', 'Advancing channel');
        channelAdvanceCallback();
      }, 4000);
    }
  }
}

function isRecoverable(error) {
  if (!error) return false;
  // Network request errors (timeout / offline) — always retry
  if (error.code === 1000 || error.code === 1001) return true;
  // HTTP_ERROR on segment fetch — retry server failures, timeouts, and 0 (no response)
  if (error.code === 1002) {
    const status = error.data && error.data[0];
    if (!status) return true;
    return status >= 500 || status === 429;
  }
  // Manifest HTTP error — only retry transient server failures, same as HTTP_ERROR
  if (error.code === 1004) {
    const status = error.data && error.data[0];
    if (!status) return true;
    return status >= 500 || status === 429;
  }
  // Manifest request timeout — always retry (no response at all)
  if (error.code === 1005) return true;
  return false;
}

function scheduleReconnect() {
  if (reconnectPending || !currentChannel) return;
  reconnectPending = true;
  reconnectAttempts++;
  logEvent('WARN', 'Reconnecting (attempt ' + reconnectAttempts + ')');
  // Live recovery: fast initial retry, cap at 10s
  const delay = Math.min(1000 * reconnectAttempts, 10000);
  showReconnectMessage(String(reconnectAttempts));

  reconnectTimer = setTimeout(() => {
    reconnectPending = false;
    if (currentChannel) {
      loadChannel(currentChannel);
    }
  }, delay);
}

function showReconnectMessage(attempt) {
  const el = document.getElementById('error');
  if (el) {
    el.textContent = 'Connection lost. Reconnecting\u2026 (attempt ' + attempt + ')';
    el.classList.remove('hidden');
  }
}

function startStallWatchdog() {
  stopStallWatchdog();
  lastStallTime = videoElement ? videoElement.currentTime : 0;
  lastStallCheck = Date.now();
  stallWatchdogTimer = setInterval(() => {
    if (!videoElement || videoElement.paused) return;
    const now = videoElement.currentTime;
    if (now === lastStallTime && Date.now() - lastStallCheck > 15000) {
      consecutiveErrors++;
      logEvent('WARN', 'Stall detected (no progress for 15s)');
      if (consecutiveErrors >= 3) {
        consecutiveErrors = 0;
        logEvent('INFO', '3 stalls — hard reloading channel');
        showReconnectMessage('reloading');
        loadChannel(currentChannel);
      } else {
        scheduleReconnect();
      }
      return;
    }
    if (now !== lastStallTime) {
      lastStallTime = now;
      lastStallCheck = Date.now();
    }
  }, 2000);
}

function stopStallWatchdog() {
  if (stallWatchdogTimer) {
    clearInterval(stallWatchdogTimer);
    stallWatchdogTimer = null;
  }
}

function startMpdRefresh() {
  stopMpdRefresh();
  mpdRefreshTimer = setInterval(() => {
    if (currentChannel) {
      logEvent('INFO', 'MPD refresh — reloading ' + (currentChannel.name || ''));
      loadChannel(currentChannel);
    }
  }, MPD_REFRESH_INTERVAL);
}

function stopMpdRefresh() {
  if (mpdRefreshTimer) {
    clearInterval(mpdRefreshTimer);
    mpdRefreshTimer = null;
  }
}

// Force-reload the current channel (e.g. from R key or remote)
export function reloadChannel() {
  if (!currentChannel) return;
  consecutiveErrors = 0;
  advancePending = false;
  lastResortAttempts = 0;
  clearTimeout(reconnectTimer);
  reconnectPending = false;
  loadChannel(currentChannel);
}

export function stop() {
  stopStallWatchdog();
  stopMpdRefresh();
  if (player) {
    player.unload();
  }
  showLoading(false);
  hideError();
}

export function togglePlay() {
  if (!videoElement) return;

  if (videoElement.paused) {
    videoElement.play();
  } else {
    videoElement.pause();
  }
}

export function getPlayer() {
  return player;
}

export function getBufferingPercent() {
  if (!videoElement) return 0;
  const buffered = videoElement.buffered;
  let end = 0;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= videoElement.currentTime &&
        videoElement.currentTime <= buffered.end(i)) {
      end = buffered.end(i);
    }
  }
  const ahead = Math.max(0, end - videoElement.currentTime);
  return Math.min(100, Math.round((ahead / 20) * 100));
}

export function getResolutions() {
  if (!player) return [];
  const tracks = player.getVariantTracks();
  const heights = [...new Set(tracks.map((t) => t.height))]
    .filter(Boolean)
    .sort((a, b) => a - b);
  return heights;
}

export function selectResolution(height) {
  if (!player) return;

  if (height == null) {
    player.configure({ abr: { enabled: true } });
    return;
  }

  const tracks = player.getVariantTracks().filter((t) => t.height === height);
  if (tracks.length) {
    player.configure({ abr: { enabled: false } });
    player.selectVariantTrack(tracks[0], true);
  }
}

export function getVideoElement() {
  return videoElement;
}

function showLoading(show) {
  const el = document.getElementById('loading');
  if (el) {
    el.classList.toggle('hidden', !show);
  }
}

function showPlayState(paused) {
  const el = document.getElementById('play-state');
  if (el) {
    el.classList.toggle('hidden', !paused);
  }
}

function showError(message) {
  const el = document.getElementById('error');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

function hideError() {
  const el = document.getElementById('error');
  if (el) {
    el.classList.add('hidden');
  }
}

function getErrorMessage(error) {
  if (!error) return 'Unknown error';

  // Shaka error codes
  const code = error.code;
  const severity = error.severity;

  // Common error messages
  const messages = {
    1000: 'Network error',
    1001: 'Network timeout',
    7000: 'Loading interrupted',
    2000: 'Media error',
    2001: 'Media decoding error',
    2002: 'Media not supported',
    2003: 'Source not found',
    2004: 'Source Access error',
    2005: 'DRM error',
    2006: 'DRM license request failed',
    3000: 'Player error',
    3001: 'Invalid stream',
    3002: 'Stream not found',
    3003: 'Could not load manifest',
    4000: 'Seek error',
  };

  if (code === 1002) {
    const status = error.data && error.data[0];
    if (status === 403) return 'Stream blocked (403 Forbidden) \u2014 the source rejected the request';
    if (status === 401) return 'Stream blocked (401 Unauthorized)';
    if (status === 404) return 'Stream not found (404)';
    if (status) return 'Stream error (HTTP ' + status + ')';
    return 'Network connection lost';
  }
  if (code === 1004) {
    return 'Manifest could not be loaded';
  }
  if (code === 1005) {
    return 'Manifest request timed out';
  }

  if (messages[code]) {
    return messages[code];
  }

  if (error.message) {
    return error.message.substring(0, 100);
  }

  return 'Playback error (' + code + ')';
}
