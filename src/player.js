import shaka from 'shaka-player';
import config from './config.js';

let player = null;
let videoElement = null;
let bufferingCallback = null;
let isBuffering = false;
let currentChannel = null;
let loadToken = 0;
let reconnectTimer = null;
let reconnectPending = false;
let reconnectAttempts = 0;

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

  // Create player instance
  player = new shaka.Player(videoEl);

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

  // Keep the buffering percentage fresh as data arrives
  videoEl.addEventListener('progress', notifyBufferingProgress);
  videoEl.addEventListener('timeupdate', notifyBufferingProgress);

  // Reflect play/pause state in the UI
  videoEl.addEventListener('play', () => showPlayState(false));
  videoEl.addEventListener('pause', () => showPlayState(true));

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

export async function loadChannel(channel) {
  if (!player || !channel) return false;

  const myToken = ++loadToken;
  currentChannel = channel;

  // A manual (user) load cancels any pending auto-reconnect
  clearTimeout(reconnectTimer);
  reconnectPending = false;

  hideError();
  showLoading(true);

  // Build the URL (with or without proxy)
  let url = channel.url;
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
      scheduleReconnect();
      return false;
    }

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

  if (isRecoverable(error)) {
    scheduleReconnect();
    return;
  }

  showError(getErrorMessage(error));
}

function isRecoverable(error) {
  if (!error) return false;
  if (error.code === 1000 || error.code === 1001) return true; // network/timeout
  if (error.code === 1002) {
    // HTTP_ERROR: only retry on transient server failures (5xx, 429).
    // Client errors (401/403/404) are permanent and must not loop.
    const status = error.data && error.data[0];
    if (!status) return true;
    return status >= 500 || status === 429;
  }
  return false;
}

function scheduleReconnect() {
  if (reconnectPending || !currentChannel) return;
  reconnectPending = true;
  reconnectAttempts++;
  const delay = Math.min(2000 * reconnectAttempts, 15000);
  showReconnectMessage(reconnectAttempts);

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
    el.textContent = 'Connection lost. Reconnecting… (attempt ' + attempt + ')';
    el.classList.remove('hidden');
  }
}

export function stop() {
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
    if (status === 403) return 'Stream blocked (403 Forbidden) — the source rejected the request';
    if (status === 401) return 'Stream blocked (401 Unauthorized)';
    if (status) return 'Stream error (HTTP ' + status + ')';
    return 'Network connection lost';
  }

  if (messages[code]) {
    return messages[code];
  }

  if (error.message) {
    return error.message.substring(0, 100);
  }

  return 'Playback error (' + code + ')';
}
