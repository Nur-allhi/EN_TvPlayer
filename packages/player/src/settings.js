import { getSettings, saveSettings, getActivePlaylist, APP_VERSION } from './config.js';

let container = null;
let onPlaylistFetched = null;
let onClose = null;
let onRender = null;
let editIndex = -1;
let activeTab = 0;

const TABS = ['Channel Source', 'Proxy', 'About'];

export function init(settingsContainer, callbacks) {
  container = settingsContainer;
  onPlaylistFetched = callbacks.onPlaylistFetched;
  onClose = callbacks.onClose;
  onRender = callbacks.onRender;
}

export function show() {
  if (!container) return;
  editIndex = -1;
  activeTab = 0;
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

export function switchTab(direction) {
  activeTab = (activeTab + direction + TABS.length) % TABS.length;
  render();
  const tabEl = container.querySelector('.settings-tab.active');
  if (tabEl) tabEl.focus();
}

export function getActiveTab() {
  return activeTab;
}

function render() {
  const s = getSettings();
  const lastFetched = s.channelsFetched ? timeAgo(s.channelsFetched) : 'Never';

  let entriesHtml = '';
  for (let i = 0; i < s.playlists.length; i++) {
    const p = s.playlists[i];
    const isActive = i === s.activePlaylistIndex;
    entriesHtml += '<div class="playlist-entry' + (isActive ? ' active' : '') + '">' +
      '<span class="playlist-indicator">' + (isActive ? '\u25B6' : '\u25CB') + '</span>';

    if (editIndex === i) {
      entriesHtml +=
        '<input id="pl-name-input-' + i + '" class="settings-input playlist-name-input" value="' + escapeHtml(p.name || '') + '" placeholder="Playlist name" />' +
        '<input id="pl-url-input-' + i + '" class="settings-input playlist-url-input" value="' + escapeHtml(p.url || '') + '" placeholder="https://..." />' +
        '<div class="playlist-actions">' +
          '<button id="pl-save-btn-' + i + '" class="settings-btn-primary">Save</button>' +
          '<button id="pl-cancel-btn-' + i + '" class="settings-btn">Cancel</button>' +
        '</div>';
    } else {
      entriesHtml +=
        '<span class="playlist-name">' + escapeHtml(p.name || 'Unnamed') + '</span>' +
        '<span class="playlist-url">' + escapeHtml(p.url || '') + '</span>' +
        '<div class="playlist-actions">' +
          '<button id="pl-select-btn-' + i + '" class="settings-btn' + (isActive ? ' active' : '') + '">' + (isActive ? 'Selected' : 'Select') + '</button>' +
          '<button id="pl-edit-btn-' + i + '" class="settings-btn">Edit</button>' +
          '<button id="pl-delete-btn-' + i + '" class="settings-btn">Delete</button>' +
        '</div>';
    }
    entriesHtml += '</div>';
  }

  const addBtnHtml = s.playlists.length < 8
    ? '<button id="pl-add-btn" class="settings-btn">+ Add Playlist</button>'
    : '';

  const tabHtml = TABS.map((tab, i) =>
    '<button id="settings-tab-' + i + '" class="settings-tab' + (i === activeTab ? ' active' : '') + '" data-tab="' + i + '">' + tab + '</button>'
  ).join('');

  let contentHtml = '';
  if (activeTab === 0) {
    contentHtml =
      '<div class="settings-section">' +
        '<h3 class="settings-section-title">Channel Source</h3>' +
        '<p class="settings-desc">Saved playlists (' + s.playlists.length + '/8). Select one, then click Fetch.</p>' +
        '<div id="settings-playlist-list">' + entriesHtml + '</div>' +
        addBtnHtml +
        '<button id="settings-fetch-btn" class="settings-btn-primary">Fetch Active</button>' +
        '<div id="settings-fetch-status" class="settings-status hidden"></div>' +
        '<p class="settings-info">Last fetched: <span id="settings-last-fetched">' + lastFetched + '</span></p>' +
      '</div>';
  } else if (activeTab === 1) {
    contentHtml =
      '<div class="settings-section">' +
        '<h3 class="settings-section-title">Proxy Server</h3>' +
        '<p class="settings-desc">Proxy URL for channels marked with proxy="true" in the playlist.</p>' +
        '<input id="settings-proxy-url" class="settings-input" type="text" placeholder="http://localhost:5000/proxy/" value="' + escapeHtml(s.proxyUrl || '') + '" />' +
        '<button id="settings-proxy-save-btn" class="settings-btn-primary">Save Proxy</button>' +
        '<div id="settings-proxy-status" class="settings-status hidden"></div>' +
      '</div>';
  } else {
    contentHtml =
      '<div class="settings-section">' +
        '<h3 class="settings-section-title">About</h3>' +
        '<p class="settings-info">EN IPTV Player</p>' +
        '<p class="settings-info">Version <span id="settings-app-version">' + APP_VERSION + '</span></p>' +
        '<p class="settings-info">Open-source IPTV player for Samsung Tizen TVs and desktop browsers.</p>' +
        '<p class="settings-info">Powered by Shaka Player with a local CORS proxy.</p>' +
      '</div>';
  }

  container.innerHTML =
    '<div class="settings-header">' +
      '<span class="settings-title">Settings</span>' +
      '<button id="settings-close-btn" class="settings-close">&times;</button>' +
    '</div>' +
    '<div class="settings-tabs" role="tablist">' + tabHtml + '</div>' +
    '<div class="settings-content">' + contentHtml + '</div>';

  // Tab click handlers
  const tabEls = container.querySelectorAll('.settings-tab');
  tabEls.forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      activeTab = parseInt(tabEl.dataset.tab, 10);
      render();
      const firstFocusable = container.querySelector('.settings-content input, .settings-content button');
      if (firstFocusable) firstFocusable.focus();
    });
  });

  // Event listeners
  document.getElementById('settings-close-btn').addEventListener('click', () => {
    if (onClose) onClose();
  });

  for (let i = 0; i < s.playlists.length; i++) {
    const selectBtn = document.getElementById('pl-select-btn-' + i);
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        saveSettings({ activePlaylistIndex: i });
        render();
      });
    }

    const editBtn = document.getElementById('pl-edit-btn-' + i);
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        editIndex = i;
        render();
      });
    }

    const deleteBtn = document.getElementById('pl-delete-btn-' + i);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const playlists = getSettings().playlists.filter((_, j) => j !== i);
        let active = getSettings().activePlaylistIndex;
        if (active >= playlists.length) active = playlists.length - 1;
        if (active < 0) active = -1;
        saveSettings({ playlists, activePlaylistIndex: active });
        editIndex = -1;
        render();
      });
    }

    const saveBtn = document.getElementById('pl-save-btn-' + i);
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('pl-name-input-' + i);
        const urlInput = document.getElementById('pl-url-input-' + i);
        const playlists = getSettings().playlists;
        playlists[i] = { name: nameInput.value.trim() || 'Unnamed', url: urlInput.value.trim() };
        saveSettings({ playlists });
        editIndex = -1;
        render();
      });
    }

    const cancelBtn = document.getElementById('pl-cancel-btn-' + i);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        editIndex = -1;
        render();
      });
    }
  }

  const addBtn = document.getElementById('pl-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const s = getSettings();
      const playlists = s.playlists;
      playlists.push({ name: 'New Playlist', url: '' });
      const newIdx = playlists.length - 1;
      saveSettings({ playlists, activePlaylistIndex: newIdx });
      editIndex = newIdx;
      render();
    });
  }

  document.getElementById('settings-fetch-btn').addEventListener('click', handleFetch);

  document.getElementById('settings-proxy-save-btn').addEventListener('click', handleProxySave);
  document.getElementById('settings-proxy-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleProxySave();
  });

  if (typeof onRender === 'function') onRender();
}

async function handleFetch() {
  const statusEl = document.getElementById('settings-fetch-status');
  const active = getActivePlaylist();
  if (!active || !active.url) {
    statusEl.className = 'settings-status';
    statusEl.textContent = 'Select or add a playlist with a URL first';
    return;
  }

  statusEl.className = 'settings-status';
  statusEl.textContent = 'Fetching...';

  try {
    const channels = await fetchPlaylist(active.url);
    console.log('[DEBUG] handleFetch: active.url=', active.url, 'channels.length=', channels ? channels.length : 0);
    saveSettings({ channels, channelsFetched: new Date().toISOString() });
    statusEl.textContent = 'Fetched ' + channels.length + ' channels';
    if (onPlaylistFetched) onPlaylistFetched(channels);
  } catch (e) {
    console.log('[DEBUG] handleFetch error:', e.message);
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function handleProxySave() {
  const proxyInput = document.getElementById('settings-proxy-url');
  const statusEl = document.getElementById('settings-proxy-status');
  const url = proxyInput.value.trim();

  saveSettings({ proxyUrl: url });
  statusEl.className = 'settings-status';
  statusEl.textContent = 'Proxy URL saved';
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 2000);
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

  if (text.includes('#EXTM3U')) {
    return parseM3u(text);
  }

  throw new Error('Unknown playlist format');
}

function processStreamUrl(rawUrl) {
  const pipeIdx = rawUrl.indexOf('|');
  if (pipeIdx === -1) return { url: rawUrl, extraHeaders: null };

  const baseUrl = rawUrl.slice(0, pipeIdx);
  const suffix = rawUrl.slice(pipeIdx + 1);
  const extraHeaders = {};
  const extraParams = [];

  for (const part of suffix.split('&')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx);
    const value = part.slice(eqIdx + 1);
    if (key.startsWith('edge-')) {
      extraParams.push(key + '=' + value);
    } else {
      extraHeaders[key.toLowerCase()] = value;
    }
  }

  let finalUrl = baseUrl;
  if (extraParams.length > 0) {
    finalUrl += (baseUrl.includes('?') ? '&' : '?') + extraParams.join('&');
  }

  return { url: finalUrl, extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : null };
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
      let userAgent = null;
      let customHeaders = null;
      let urlIdx = i + 1;
      while (urlIdx < lines.length) {
        const next = lines[urlIdx].trim();
        if (next.startsWith('#KODIPROP:')) {
          if (next.includes('license_key=')) {
            const keyMatch = next.match(/license_key=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
            if (keyMatch) {
              drm = { keyId: keyMatch[1], key: keyMatch[2] };
            }
          }
          urlIdx++;
        } else if (next.startsWith('#EXTSYS')) {
          urlIdx++;
        } else if (next.startsWith('#EXTVLCOPT:')) {
          const uaMatch = next.match(/http-user-agent=(.+)/);
          if (uaMatch) {
            userAgent = uaMatch[1].trim();
          }
          urlIdx++;
        } else if (next.startsWith('#EXTHTTP:')) {
          try {
            const json = JSON.parse(next.slice('#EXTHTTP:'.length));
            if (json && typeof json === 'object') {
              customHeaders = {};
              for (const [k, v] of Object.entries(json)) {
                customHeaders[k] = String(v);
              }
            }
          } catch (e) {}
          urlIdx++;
        } else {
          break;
        }
      }
      const rawUrl = lines[urlIdx] ? lines[urlIdx].trim() : '';
      if (rawUrl && !rawUrl.startsWith('#')) {
        if (!drm) {
          const urlDrm = rawUrl.match(/[?&]drmLicense=([a-fA-F0-9]+):([a-fA-F0-9]+)/);
          if (urlDrm) drm = { keyId: urlDrm[1].toLowerCase(), key: urlDrm[2].toLowerCase() };
        }
        const { url, extraHeaders } = processStreamUrl(rawUrl);
        if (extraHeaders) {
          customHeaders = { ...(customHeaders || {}), ...extraHeaders };
        }
        const ch = {
          name: name,
          url: url,
          channelNumber: index + 1,
          drm: drm,
          userAgent: userAgent,
          customHeaders: customHeaders,
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
