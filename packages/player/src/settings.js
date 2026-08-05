import { getSettings, saveSettings, getActivePlaylist, APP_VERSION } from './config.js';

let container = null;
let onPlaylistFetched = null;
let onClose = null;
let onRender = null;
let editIndex = -1;
let activeSection = 'source';
let focusIdx = 0;
let focusOrder = [];
let resizeBound = false;
let addMode = false;

const NAV_ITEMS = [
  { id: 'source', icon: '\u{1F4E1}', label: 'Channel Source' },
  { id: 'connection', icon: '\u{1F517}', label: 'Connection' },
  { id: 'playback', icon: '\u25B6', label: 'Playback' },
  { id: 'about', icon: '\u2139', label: 'About' },
];

export function init(settingsContainer, callbacks) {
  container = settingsContainer;
  onPlaylistFetched = callbacks.onPlaylistFetched;
  onClose = callbacks.onClose;
  onRender = callbacks.onRender;
}

export function show() {
  if (!container) return;
  editIndex = -1;
  activeSection = 'source';
  focusIdx = 0;
  container.classList.remove('hidden');
  render();
  applyFocus();
  scheduleFit();
  if (!resizeBound) {
    window.addEventListener('resize', fit);
    resizeBound = true;
  }
}

export function hide() {
  if (!container) return;
  container.classList.add('hidden');
}

export function isVisible() {
  return container && !container.classList.contains('hidden');
}

export function navigate(dir) {
  buildFocusOrder();
  const total = focusOrder.length;
  if (total === 0) return;

  const navCount = document.querySelectorAll('.nav-item').length;
  const cur = document.querySelector('[data-focused]');
  const curIdx = focusOrder.indexOf(cur);
  const inNavZone = curIdx >= 0 && curIdx < navCount;
  const contentStart = navCount + 1; // +1 for back button

  if (dir > 0) {
    // DOWN
    if (inNavZone) {
      focusIdx = (curIdx + 1) % navCount;
    } else if (curIdx >= contentStart) {
      focusIdx = curIdx + 1;
      if (focusIdx >= total) focusIdx = contentStart;
    } else {
      focusIdx = Math.min(total - 1, focusIdx + 1);
    }
  } else {
    // UP
    if (inNavZone) {
      focusIdx = (curIdx - 1 + navCount) % navCount;
    } else if (curIdx >= contentStart) {
      focusIdx = curIdx - 1;
      if (focusIdx < contentStart) focusIdx = total - 1;
    } else {
      focusIdx = Math.max(0, focusIdx - 1);
    }
  }

  applyFocus();
}

export function navigateNav(dir) {
  const cur = document.querySelector('[data-focused]');
  if (!cur) return;

  const navCount = document.querySelectorAll('.nav-item').length;
  const curIdx = focusOrder.indexOf(cur);
  const inNavZone = curIdx >= 0 && curIdx < navCount;
  const contentStart = navCount + 1;

  const btnGroup = cur.closest('.btn-group');
  if (btnGroup) {
    const buttons = Array.from(btnGroup.querySelectorAll('.btn'));
    const btnIdx = buttons.indexOf(cur);
    if (btnIdx >= 0) {
      if (dir > 0 && btnIdx < buttons.length - 1) {
        const newIdx = focusOrder.indexOf(buttons[btnIdx + 1]);
        if (newIdx >= 0) { focusIdx = newIdx; applyFocus(); }
      } else if (dir < 0 && btnIdx > 0) {
        const newIdx = focusOrder.indexOf(buttons[btnIdx - 1]);
        if (newIdx >= 0) { focusIdx = newIdx; applyFocus(); }
      }
      return;
    }
  }

  if (dir > 0) {
    if (inNavZone) {
      focusIdx = contentStart;
      applyFocus();
    }
  } else {
    if (curIdx >= contentStart) {
      const activeTab = document.querySelector('.settings-tab.active');
      const tabs = Array.from(document.querySelectorAll('.nav-item'));
      const idx = tabs.indexOf(activeTab);
      focusIdx = idx >= 0 ? idx : 0;
      applyFocus();
    }
  }
}

export function selectFocused() {
  const el = document.querySelector('[data-focused]');
  if (!el) return;

  if (el.classList.contains('nav-item')) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    activeSection = el.dataset.section;
    focusIdx = 0;
    render();
    applyFocus();
    return;
  }

  if (el.id === 'btn-back') {
    if (onClose) onClose();
    return;
  }

  if (el.classList.contains('toggle')) {
    el.classList.toggle('on');
    return;
  }

  if (el.classList.contains('select-opt')) {
    document.querySelectorAll('.select-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    return;
  }

  if (el.tagName === 'INPUT') {
    el.focus();
    return;
  }

  if (el.id === 'pl-add-btn') {
    addMode = true;
    render();
    applyFocus();
    return;
  }

  if (el.id === 'pl-add-save') {
    const nameEl = document.getElementById('pl-add-name');
    const urlEl = document.getElementById('pl-add-url');
    const name = nameEl ? nameEl.value.trim() : '';
    const url = urlEl ? urlEl.value.trim() : '';
    if (url) {
      const playlists = getSettings().playlists;
      playlists.push({ name: name || 'Unnamed', url });
      saveSettings({ playlists, activePlaylistIndex: playlists.length - 1 });
      addMode = false;
      render();
      applyFocus();
    }
    return;
  }

  if (el.id === 'pl-add-cancel') {
    addMode = false;
    render();
    applyFocus();
    return;
  }

  if (el.classList.contains('btn') || el.classList.contains('playlist-entry')) {
    el.click();
    return;
  }
}

function buildFocusOrder() {
  focusOrder = [];
  document.querySelectorAll('.nav-item').forEach(el => focusOrder.push(el));
  focusOrder.push(document.getElementById('btn-back'));

  if (activeSection === 'source') {
    if (addMode) {
      focusOrder.push(document.getElementById('pl-add-name'));
      focusOrder.push(document.getElementById('pl-add-url'));
      focusOrder.push(document.getElementById('pl-add-save'));
      focusOrder.push(document.getElementById('pl-add-cancel'));
    } else {
      const s = getSettings();
      for (let i = 0; i < s.playlists.length; i++) {
        const entry = document.getElementById('playlist-entry-' + i);
        if (entry) focusOrder.push(entry);
      }
      const addBtn = document.getElementById('pl-add-btn');
      if (addBtn) focusOrder.push(addBtn);
      focusOrder.push(document.getElementById('settings-fetch-btn'));
    }
  } else if (activeSection === 'connection') {
    focusOrder.push(document.getElementById('settings-proxy-url'));
    focusOrder.push(document.getElementById('settings-proxy-save-btn'));
  } else if (activeSection === 'playback') {
    document.querySelectorAll('.select-opt').forEach(el => focusOrder.push(el));
    focusOrder.push(document.getElementById('toggle-autoq'));
    focusOrder.push(document.getElementById('toggle-audio'));
  }
}

function clearFocus() {
  document.querySelectorAll('[data-focused]').forEach(el => el.removeAttribute('data-focused'));
}

function applyFocus() {
  clearFocus();
  buildFocusOrder();
  if (focusIdx >= 0 && focusIdx < focusOrder.length) {
    const el = focusOrder[focusIdx];
    if (el) {
      el.setAttribute('data-focused', '');
      el.scrollIntoView({ block: 'nearest' });
    }
  }
}

function render() {
  const s = getSettings();
  const lastFetched = s.channelsFetched ? timeAgo(s.channelsFetched) : 'Never';

  const navHtml = NAV_ITEMS.map(item =>
    '<div class="nav-item' + (activeSection === item.id ? ' active' : '') + '" data-section="' + item.id + '">' +
      '<span class="nav-icon">' + item.icon + '</span> ' + item.label +
    '</div>'
  ).join('');

  let mainHtml = '';
  mainHtml += '<div class="page-title">';
  mainHtml += '<button class="back-btn" id="btn-back">\u2039</button>';
  mainHtml += 'Settings';
  mainHtml += '</div>';

  if (activeSection === 'source') {
    mainHtml += renderSourceCard(s, lastFetched);
  } else if (activeSection === 'connection') {
    mainHtml += renderConnectionCard(s);
  } else if (activeSection === 'playback') {
    mainHtml += renderPlaybackCard();
  } else {
    mainHtml += renderAboutCard();
  }

  mainHtml += '<div class="settings-footer">';
  mainHtml += '<span class="footer-info">All settings are saved automatically</span>';
  mainHtml += '<span class="footer-version">' + APP_VERSION + '</span>';
  mainHtml += '</div>';

  container.innerHTML =
    '<div class="bg-glow"></div>' +
    '<div class="settings-layout">' +
      '<nav class="settings-nav">' +
        '<div class="nav-header">' +
          '<div class="nav-logo">' +
            '<div class="icon">EN</div>' +
            '<div class="text">EN <span>IPTV</span></div>' +
          '</div>' +
          '<div class="nav-sub">Settings</div>' +
        '</div>' +
        '<div class="nav-items">' + navHtml + '</div>' +
      '</nav>' +
      '<main class="settings-main">' + mainHtml + '</main>' +
    '</div>' +
    '<div id="remote-hints">' +
      '<div class="hint-group"><kbd>&#9650;</kbd> <kbd>&#9660;</kbd> <span class="sep">|</span> Navigate</div>' +
      '<div class="hint-group"><kbd>Enter</kbd> <span class="sep">|</span> Select / Toggle</div>' +
      '<div class="hint-group"><kbd>&#9664;</kbd> <span class="sep">|</span> Back</div>' +
      '<div class="hint-group"><kbd>Back</kbd> <span class="sep">|</span> Close</div>' +
    '</div>';

  scheduleFit();
  buildFocusOrder();

  document.getElementById('btn-back').addEventListener('click', () => {
    if (onClose) onClose();
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      activeSection = item.dataset.section;
      focusIdx = 0;
      render();
      applyFocus();
    });
  });

  if (activeSection === 'source') {
    for (let i = 0; i < s.playlists.length; i++) {
      const entry = document.getElementById('playlist-entry-' + i);
      if (entry) {
        entry.addEventListener('click', () => {
          saveSettings({ activePlaylistIndex: i });
          render();
          applyFocus();
        });
      }
    }
    const addBtn = document.getElementById('pl-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addMode = true;
        render();
        applyFocus();
      });
    }
    const saveBtn = document.getElementById('pl-add-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('pl-add-name');
        const urlEl = document.getElementById('pl-add-url');
        const name = nameEl ? nameEl.value.trim() : '';
        const url = urlEl ? urlEl.value.trim() : '';
        if (url) {
          const playlists = getSettings().playlists;
          playlists.push({ name: name || 'Unnamed', url });
          saveSettings({ playlists, activePlaylistIndex: playlists.length - 1 });
          addMode = false;
          render();
          applyFocus();
        }
      });
    }
    const cancelBtn = document.getElementById('pl-add-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        addMode = false;
        render();
        applyFocus();
      });
    }
    document.getElementById('settings-fetch-btn').addEventListener('click', handleFetch);
  } else if (activeSection === 'connection') {
    document.getElementById('settings-proxy-save-btn').addEventListener('click', handleProxySave);
    document.getElementById('settings-proxy-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleProxySave();
    });
  } else if (activeSection === 'playback') {
    document.querySelectorAll('.select-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.select-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });
    document.querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', function() { this.classList.toggle('on'); });
    });
  }

  if (typeof onRender === 'function') onRender();
}

function renderSourceCard(s, lastFetched) {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u{1F4E1}</span> Channel Source</h3></div>';
  html += '<div class="card-body">';
  html += '<p class="hint" style="margin-bottom:16px;">Saved playlists (' + s.playlists.length + '/8). Select one, then click Fetch.</p>';
  if (addMode) {
    html += '<div class="input-group">';
    html += '<label for="pl-add-name">Playlist Name</label>';
    html += '<input id="pl-add-name" class="input-field" type="text" placeholder="My Playlist" />';
    html += '</div>';
    html += '<div class="input-group">';
    html += '<label for="pl-add-url">Playlist URL</label>';
    html += '<input id="pl-add-url" class="input-field" type="text" placeholder="https://..." />';
    html += '</div>';
    html += '<div class="btn-group">';
    html += '<button id="pl-add-save" class="btn btn-primary">Save</button>';
    html += '<button id="pl-add-cancel" class="btn btn-secondary">Cancel</button>';
    html += '</div>';
  } else {
    html += '<div class="playlist-list">';
    for (let i = 0; i < s.playlists.length; i++) {
      const p = s.playlists[i];
      const isActive = i === s.activePlaylistIndex;
      html += '<div id="playlist-entry-' + i + '" class="playlist-entry' + (isActive ? ' active' : '') + '">';
      html += '<span class="playlist-indicator">' + (isActive ? '\u25B6' : '\u25CB') + '</span>';
      html += '<span class="playlist-name">' + escapeHtml(p.name || 'Unnamed') + '</span>';
      html += '<span class="playlist-url">' + escapeHtml(p.url || '') + '</span>';
      html += '</div>';
    }
    html += '</div>';
    if (s.playlists.length < 8) {
      html += '<button id="pl-add-btn" class="btn btn-secondary">+ Add Playlist</button>';
    }
    html += '<button id="settings-fetch-btn" class="btn btn-primary">Fetch Active</button>';
    html += '<div id="settings-fetch-status" class="status-info hidden" style="margin-top:12px;"></div>';
    html += '<p class="hint" style="margin-top:16px;">Last fetched: ' + lastFetched + '</p>';
  }
  html += '</div></div>';
  return html;
}

function renderConnectionCard(s) {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u{1F517}</span> Connection</h3><span class="status-dot connected"></span></div>';
  html += '<div class="card-body">';
  html += '<div class="status-row">';
  html += '<span class="status-dot connected"></span>';
  html += '<div><div class="status-info">Proxy Server</div><div class="status-label">Configure proxy for channels that need it</div></div>';
  html += '</div>';
  html += '<div class="input-group">';
  html += '<label for="settings-proxy-url">Proxy URL</label>';
  html += '<div class="input-row">';
  html += '<input id="settings-proxy-url" class="input-field" type="text" placeholder="http://localhost:5000/proxy/" value="' + escapeHtml(s.proxyUrl || '') + '" />';
  html += '<button id="settings-proxy-save-btn" class="btn btn-primary">Save</button>';
  html += '</div>';
  html += '<div id="settings-proxy-status" class="status-info hidden" style="margin-top:8px;"></div>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderPlaybackCard() {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u25B6</span> Playback</h3></div>';
  html += '<div class="card-body">';
  html += '<div class="toggle-row">';
  html += '<div><div class="toggle-label">Auto quality</div><div class="toggle-desc">Automatically adjust resolution based on bandwidth</div></div>';
  html += '<div class="toggle on" id="toggle-autoq"><div class="knob"></div></div>';
  html += '</div>';
  html += '<div class="toggle-row">';
  html += '<div><div class="toggle-label">Audio passthrough</div><div class="toggle-desc">Pass through Dolby Digital / DTS to audio system</div></div>';
  html += '<div class="toggle" id="toggle-audio"><div class="knob"></div></div>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderAboutCard() {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u2139</span> About</h3></div>';
  html += '<div class="card-body">';
  html += '<div class="input-group">';
  html += '<label>EN IPTV Player</label>';
  html += '<div class="hint" style="margin-top:4px;">Tizen TV App &middot; Version ' + APP_VERSION + '</div>';
  html += '<div class="hint" style="margin-top:2px;">Open-source IPTV player for Samsung Tizen TVs and desktop browsers.</div>';
  html += '<div class="hint" style="margin-top:2px;">Powered by Shaka Player with a local CORS proxy.</div>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function fit() {
  const app = document.getElementById('settings-page');
  if (!app) return;
  let sw = window.innerWidth;
  let sh = window.innerHeight;
  if (!sw || !sh) {
    sw = screen.width || 1920;
    sh = screen.height || 1080;
  }
  const scale = Math.min(sw / 1920, sh / 1080);
  if (!isFinite(scale) || scale <= 0) return;
  const tx = (sw - 1920 * scale) / 2;
  const ty = (sh - 1080 * scale) / 2;
  app.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
}

function scheduleFit() {
  fit();
  setTimeout(fit, 100);
  setTimeout(fit, 500);
  setTimeout(fit, 1000);
}

async function handleFetch() {
  const statusEl = document.getElementById('settings-fetch-status');
  if (!statusEl) return;
  const active = getActivePlaylist();
  if (!active || !active.url) {
    statusEl.className = 'status-info';
    statusEl.textContent = 'Select or add a playlist with a URL first';
    statusEl.classList.remove('hidden');
    return;
  }
  statusEl.className = 'status-info';
  statusEl.textContent = 'Fetching...';
  statusEl.classList.remove('hidden');
  try {
    const channels = await fetchPlaylist(active.url);
    saveSettings({ channels, channelsFetched: new Date().toISOString() });
    statusEl.textContent = 'Fetched ' + channels.length + ' channels';
    if (onPlaylistFetched) onPlaylistFetched(channels);
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function handleProxySave() {
  const proxyInput = document.getElementById('settings-proxy-url');
  const statusEl = document.getElementById('settings-proxy-status');
  if (!proxyInput || !statusEl) return;
  const url = proxyInput.value.trim();
  saveSettings({ proxyUrl: url });
  statusEl.className = 'status-info';
  statusEl.textContent = 'Proxy URL saved';
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 2000);
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
    throw new Error('Invalid JSON format');
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
            if (keyMatch) drm = { keyId: keyMatch[1], key: keyMatch[2] };
          }
          urlIdx++;
        } else if (next.startsWith('#EXTSYS')) {
          urlIdx++;
        } else if (next.startsWith('#EXTVLCOPT:')) {
          const uaMatch = next.match(/http-user-agent=(.+)/);
          if (uaMatch) userAgent = uaMatch[1].trim();
          urlIdx++;
        } else if (next.startsWith('#EXTHTTP:')) {
          try {
            const json = JSON.parse(next.slice('#EXTHTTP:'.length));
            if (json && typeof json === 'object') {
              customHeaders = {};
              for (const [k, v] of Object.entries(json)) customHeaders[k] = String(v);
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
        if (extraHeaders) customHeaders = { ...(customHeaders || {}), ...extraHeaders };
        const ch = { name, url, channelNumber: index + 1, drm, userAgent, customHeaders };
        if (proxyMatch) {
          const pv = proxyMatch[1];
          if (pv === 'false' || pv === 'no' || pv === '0') ch.useProxy = false;
          else if (pv === 'true' || pv === 'yes' || pv === '1') ch.useProxy = true;
          else { ch.useProxy = true; ch.proxyUrl = pv; }
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
