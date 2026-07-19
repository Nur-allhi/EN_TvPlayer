import { getSettings, saveSettings } from './config.js';

let container = null;
let onPlaylistFetched = null;
let onClose = null;

export function init(settingsContainer, callbacks) {
  container = settingsContainer;
  onPlaylistFetched = callbacks.onPlaylistFetched;
  onClose = callbacks.onClose;
}

export function show() {
  if (!container) return;
  container.classList.remove('hidden');
  render();
  const firstInput = container.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstInput) firstInput.focus();
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
    '<div class="settings-header">' +
      '<span class="settings-title">Settings</span>' +
      '<button id="settings-close-btn" class="settings-close">&times;</button>' +
    '</div>' +
    '<div class="settings-content">' +

      '<div class="settings-section">' +
        '<h3 class="settings-section-title">Channel Source</h3>' +
        '<p class="settings-desc">Enter a playlist URL (JSON or M3U) to fetch channels.</p>' +
        '<input id="settings-playlist-url" class="settings-input" type="text" placeholder="https://server:5000/api/playlist.m3u" value="' + escapeHtml(s.playlistUrl || '') + '" />' +
        '<button id="settings-fetch-btn" class="settings-btn-primary">Fetch</button>' +
        '<div id="settings-fetch-status" class="settings-status hidden"></div>' +
        '<p class="settings-info">Last fetched: <span id="settings-last-fetched">' + lastFetched + '</span></p>' +
      '</div>' +

    '</div>';

  document.getElementById('settings-close-btn').addEventListener('click', () => {
    if (onClose) onClose();
  });

  document.getElementById('settings-fetch-btn').addEventListener('click', handleFetch);
  document.getElementById('settings-playlist-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetch();
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

async function fetchPlaylist(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);

  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  if (contentType.includes('json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.channels)) {
      const topProxy = data.proxyUrl;
      if (topProxy) {
        for (const ch of data.channels) {
          if (ch.useProxy === true && !ch.proxyUrl) ch.proxyUrl = topProxy;
        }
      }
      return data.channels;
    }
    throw new Error('Invalid JSON format — expected array or { proxyUrl, channels }');
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
      const proxyMatch = line.match(/\bproxy="([^"]*)"/);
      let drm = null;
      let urlIdx = i + 1;
      while (urlIdx < lines.length) {
        const next = lines[urlIdx].trim();
        if (next.startsWith('#KODIPROP:')) {
          if (next.includes('license_key=')) {
            const keyMatch = next.match(/license_key=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
            if (keyMatch) {
              drm = { keyId: keyMatch[1], key: keyMatch[2] };
            } else {
            }
          }
          urlIdx++;
        } else if (next.startsWith('#EXTSYS')) {
          urlIdx++;
        } else {
          break;
        }
      }
      const url = lines[urlIdx] ? lines[urlIdx].trim() : '';
      if (url && !url.startsWith('#')) {
        const ch = {
          name: name,
          url: url,
          channelNumber: index + 1,
          drm: drm,
        };
        if (proxyMatch) {
          const pv = proxyMatch[1];
          if (pv === 'false' || pv === 'no' || pv === '0') {
            ch.useProxy = false;
          } else if (pv === 'true' || pv === 'yes' || pv === '1') {
            ch.useProxy = true;
          } else {
            ch.useProxy = true;
            ch.proxyUrl = pv;
          }
        } else {
          ch.useProxy = false;
        }
        channels.push(ch);
        index++;
        i = urlIdx;
      }
    }
  }

  return channels;
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
