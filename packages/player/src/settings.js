import { getSettings, saveSettings } from './config.js';

let container = null;
let onPlaylistFetched = null;
let onPlaySingle = null;
let onClose = null;

export function init(settingsContainer, callbacks) {
  container = settingsContainer;
  onPlaylistFetched = callbacks.onPlaylistFetched;
  onPlaySingle = callbacks.onPlaySingle;
  onClose = callbacks.onClose;
}

export function show() {
  if (!container) return;
  container.classList.remove('hidden');
  render();
}

export function hide() {
  if (!container) return;
  container.classList.add('hidden');
}

export function isVisible() {
  return container && !container.classList.contains('hidden');
}

function render() {
  const s = getSettings();
  const lastFetched = s.channelsFetched ? timeAgo(s.channelsFetched) : 'Never';

  container.innerHTML =
    '<div class="settings-page">' +
      '<div class="settings-header">' +
        '<span class="settings-title">Settings</span>' +
        '<button id="settings-close-btn" class="settings-close">&times;</button>' +
      '</div>' +
      '<div class="settings-content">' +

        '<div class="settings-section">' +
          '<h3 class="settings-section-title">1. Add Playlist</h3>' +
          '<p class="settings-desc">Enter a playlist URL (M3U or JSON) to fetch channels.</p>' +
          '<input id="settings-playlist-url" class="settings-input" type="text" placeholder="https://server:5000/api/playlist.m3u" value="' + escapeHtml(s.playlistUrl || '') + '" />' +
          '<button id="settings-fetch-btn" class="settings-btn-primary">Fetch Playlist</button>' +
          '<div id="settings-fetch-status" class="settings-status hidden"></div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<h3 class="settings-section-title">2. Re-fetch Playlist</h3>' +
          '<p class="settings-desc">Re-fetch channels from the saved playlist URL.</p>' +
          '<p class="settings-info">Last fetched: <span id="settings-last-fetched">' + lastFetched + '</span></p>' +
          '<button id="settings-refresh-btn" class="settings-btn"' + (s.playlistUrl ? '' : ' disabled') + '>Refresh Now</button>' +
          '<div id="settings-refresh-status" class="settings-status hidden"></div>' +
        '</div>' +

        '<div class="settings-section">' +
          '<h3 class="settings-section-title">3. Play Single Channel</h3>' +
          '<p class="settings-desc">Play a single channel URL without a playlist.</p>' +
          '<input id="settings-single-url" class="settings-input" type="text" placeholder="https://stream.example.com/playlist.m3u8" value="' + escapeHtml(s.singleChannelUrl || '') + '" />' +
          '<label class="settings-checkbox-label"><input type="checkbox" id="settings-single-proxy"' + (s.singleUseProxy ? ' checked' : '') + ' /> Use Proxy</label>' +
          '<button id="settings-play-single-btn" class="settings-btn-primary">Play</button>' +
        '</div>' +

      '</div>' +
    '</div>';

  document.getElementById('settings-close-btn').addEventListener('click', () => {
    if (onClose) onClose();
  });

  document.getElementById('settings-fetch-btn').addEventListener('click', handleFetch);
  document.getElementById('settings-playlist-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetch();
  });

  document.getElementById('settings-refresh-btn').addEventListener('click', handleRefresh);
  document.getElementById('settings-single-proxy').addEventListener('change', (e) => {
    saveSettings({ singleUseProxy: e.target.checked });
  });
  document.getElementById('settings-single-url').addEventListener('change', (e) => {
    saveSettings({ singleChannelUrl: e.target.value });
  });
  document.getElementById('settings-play-single-btn').addEventListener('click', handlePlaySingle);
  document.getElementById('settings-single-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePlaySingle();
  });
}

async function handleFetch() {
  const urlInput = document.getElementById('settings-playlist-url');
  const statusEl = document.getElementById('settings-fetch-status');
  const url = urlInput.value.trim();
  if (!url) return;

  saveSettings({ playlistUrl: url });
  statusEl.className = 'settings-status';
  statusEl.textContent = 'Fetching...';

  try {
    const channels = await fetchPlaylist(url);
    saveSettings({ channels, channelsFetched: new Date().toISOString() });
    statusEl.textContent = 'Fetched ' + channels.length + ' channels';
    if (onPlaylistFetched) onPlaylistFetched(channels);
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function handleRefresh() {
  const s = getSettings();
  const statusEl = document.getElementById('settings-refresh-status');
  if (!s.playlistUrl) return;

  statusEl.className = 'settings-status';
  statusEl.textContent = 'Refreshing...';

  try {
    const channels = await fetchPlaylist(s.playlistUrl);
    saveSettings({ channels, channelsFetched: new Date().toISOString() });
    const fetchedEl = document.getElementById('settings-last-fetched');
    if (fetchedEl) fetchedEl.textContent = 'Just now';
    statusEl.textContent = 'Refreshed ' + channels.length + ' channels';
    if (onPlaylistFetched) onPlaylistFetched(channels);
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function handlePlaySingle() {
  const url = document.getElementById('settings-single-url').value.trim();
  const useProxy = document.getElementById('settings-single-proxy').checked;
  if (!url) return;

  saveSettings({ singleChannelUrl: url, singleUseProxy: useProxy });

  const channel = {
    name: url.split('/').pop() || 'Single Channel',
    url: url,
    channelNumber: 0,
    useProxy: useProxy,
    drm: null,
  };

  if (onPlaySingle) onPlaySingle(channel);
}

async function fetchPlaylist(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);

  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  if (contentType.includes('json') || text.trim().startsWith('[')) {
    return JSON.parse(text);
  }

  if (text.startsWith('#EXTM3U')) {
    return parseM3u(text);
  }

  throw new Error('Unknown playlist format');
}

function parseM3u(text) {
  const lines = text.split('\n');
  const channels = [];
  let index = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Channel ' + (index + 1);
      const url = lines[i + 1] ? lines[i + 1].trim() : '';
      if (url && !url.startsWith('#')) {
        channels.push({
          name: name,
          url: url,
          channelNumber: index + 1,
          useProxy: false,
          drm: null,
        });
        index++;
      }
    }
  }

  return channels;
}

export function refreshLastFetched() {
  const s = getSettings();
  const el = document.getElementById('settings-last-fetched');
  if (el) el.textContent = s.channelsFetched ? timeAgo(s.channelsFetched) : 'Never';
}

function timeAgo(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return new Date(isoString).toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
