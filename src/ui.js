let channels = [];
let currentIndex = -1;
let focusedIndex = 0;
let sidebarOpen = true;
let isFullscreen = false;
let onChannelSelect = null;

let resolutionMenuOpen = false;
let resolutions = [];
let resolutionFocus = 0;
let selectedResolution = 'auto';
let resolutionCallback = null;

export function init(channelList, callback) {
  channels = channelList;
  onChannelSelect = callback;
  currentIndex = -1;
  focusedIndex = 0;

  renderChannelList();
  updateFocus();

  // In fullscreen, reveal the sidebar when the mouse enters the left edge
  const hoverZone = document.getElementById('sidebar-hover-zone');
  const sidebar = document.getElementById('sidebar');
  if (hoverZone) {
    hoverZone.addEventListener('mouseenter', () => {
      if (isFullscreen) {
        sidebarOpen = true;
        applySidebar();
      }
    });
  }
  if (sidebar) {
    sidebar.addEventListener('mouseleave', () => {
      if (isFullscreen && !resolutionMenuOpen) {
        sidebarOpen = false;
        applySidebar();
      }
    });
  }

  // In fullscreen, reveal the resolution menu when the mouse enters the right edge
  const resZone = document.getElementById('resolution-hover-zone');
  const resMenu = document.getElementById('resolution-menu');
  if (resZone) {
    resZone.addEventListener('mouseenter', () => {
      if (isFullscreen) {
        showResolutionMenu();
      }
    });
  }
  if (resMenu) {
    resMenu.addEventListener('mouseleave', (e) => {
      const to = e.relatedTarget;
      if (to && resZone && resZone.contains(to)) return;
      hideResolutionMenu();
    });
  }
}

export function renderChannelList() {
  const container = document.getElementById('channel-list');
  if (!container) return;

  container.innerHTML = '';

  channels.forEach((channel, index) => {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.dataset.index = index;

    item.innerHTML =
      '<span class="channel-number">' + (channel.channelNumber || index + 1) + '</span>' +
      '<span class="channel-name">' + escapeHtml(channel.name) + '</span>';

    item.addEventListener('click', () => {
      selectChannel(index);
    });

    container.appendChild(item);
  });
}

export function selectChannel(index) {
  if (index < 0 || index >= channels.length) return;

  currentIndex = index;
  focusedIndex = index;
  updateActiveChannel();
  updateFocus();

  if (onChannelSelect) {
    onChannelSelect(channels[index]);
  }

  // Stream is now playing: go fullscreen
  requestFullscreen();

  // Update now playing bar
  const nameEl = document.getElementById('channel-name');
  const infoEl = document.getElementById('channel-info');

  if (nameEl) {
    nameEl.textContent = channels[index].name;
  }

  if (infoEl) {
    const ext = channels[index].url.split('.').pop().split('?')[0];
    infoEl.textContent = ext.toUpperCase();
  }
}

export function navigateUp() {
  if (focusedIndex > 0) {
    focusedIndex--;
    updateFocus();
    scrollToFocused();
  }
}

export function navigateDown() {
  if (focusedIndex < channels.length - 1) {
    focusedIndex++;
    updateFocus();
    scrollToFocused();
  }
}

export function selectFocused() {
  selectChannel(focusedIndex);
}

export function jumpToNumber(num) {
  // Find channel by number
  const index = channels.findIndex((ch) => ch.channelNumber === num);
  if (index !== -1) {
    selectChannel(index);
  }
}

export function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  applySidebar();
}

export function isSidebarOpen() {
  return sidebarOpen;
}

export function isFullscreenMode() {
  return isFullscreen;
}

export function requestFullscreen() {
  const app = document.getElementById('app');
  if (app) {
    app.classList.add('fullscreen');
  }
  isFullscreen = true;
  // Hide the channel list while in fullscreen; it can be shown with the left arrow
  sidebarOpen = false;
  applySidebar();

  startCursorAutoHide();
  startInactivityTimer();

  const target = app || document.documentElement;
  if (target && !document.fullscreenElement && target.requestFullscreen) {
    const result = target.requestFullscreen();
    if (result && result.catch) {
      result.catch(() => {});
    }
  }
}

export function exitFullscreenMode() {
  isFullscreen = false;
  sidebarOpen = true;
  const app = document.getElementById('app');
  if (app) {
    app.classList.remove('fullscreen');
    app.classList.remove('show-cursor');
  }
  stopCursorAutoHide();
  stopInactivityTimer();
  applySidebar();
}

let cursorHideTimer = null;

function startCursorAutoHide() {
  document.addEventListener('mousemove', onFullscreenMouseMove);
  revealCursor();
}

function stopCursorAutoHide() {
  document.removeEventListener('mousemove', onFullscreenMouseMove);
  clearTimeout(cursorHideTimer);
}

function onFullscreenMouseMove() {
  revealCursor();
}

function revealCursor() {
  const app = document.getElementById('app');
  if (app) app.classList.add('show-cursor');
  clearTimeout(cursorHideTimer);
  cursorHideTimer = setTimeout(() => {
    const a = document.getElementById('app');
    if (a) a.classList.remove('show-cursor');
  }, 1700);
}

/* Fullscreen: auto-close overlays after a period of no activity */
let inactivityTimer = null;
const INACTIVITY_MS = 1700;

function startInactivityTimer() {
  document.addEventListener('mousemove', resetInactivity);
  document.addEventListener('keydown', resetInactivity);
  document.addEventListener('click', resetInactivity);
  resetInactivity();
}

function stopInactivityTimer() {
  document.removeEventListener('mousemove', resetInactivity);
  document.removeEventListener('keydown', resetInactivity);
  document.removeEventListener('click', resetInactivity);
  clearTimeout(inactivityTimer);
}

function resetInactivity() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(autoCloseOverlays, INACTIVITY_MS);
}

function autoCloseOverlays() {
  if (!isFullscreen) return;
  if (sidebarOpen) {
    sidebarOpen = false;
    applySidebar();
  }
  if (resolutionMenuOpen) {
    hideResolutionMenu();
  }
}

function applySidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('closed', !sidebarOpen);
  }
}

export function getChannels() {
  return channels;
}

export function getCurrentChannel() {
  if (currentIndex >= 0 && currentIndex < channels.length) {
    return channels[currentIndex];
  }
  return null;
}

function updateActiveChannel() {
  const items = document.querySelectorAll('.channel-item');
  items.forEach((item, index) => {
    item.classList.toggle('active', index === currentIndex);
  });
}

function updateFocus() {
  const items = document.querySelectorAll('.channel-item');
  items.forEach((item, index) => {
    item.classList.toggle('focused', index === focusedIndex);
  });
}

function scrollToFocused() {
  const items = document.querySelectorAll('.channel-item');
  if (items[focusedIndex]) {
    items[focusedIndex].scrollIntoView({ block: 'nearest' });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* Buffering percentage indicator */
export function showBuffering(percent) {
  const el = document.getElementById('buffering-indicator');
  if (!el) return;
  el.classList.remove('hidden');
  setBufferingPercent(percent);
}

export function updateBuffering(percent) {
  const el = document.getElementById('buffering-indicator');
  if (el && !el.classList.contains('hidden')) {
    setBufferingPercent(percent);
  }
}

export function hideBuffering() {
  const el = document.getElementById('buffering-indicator');
  if (el) el.classList.add('hidden');
}

function setBufferingPercent(percent) {
  const p = document.getElementById('buffering-percent');
  if (p) p.textContent = (typeof percent === 'number' ? percent : 0) + '%';
}

/* Resolution selector */
export function setResolutionCallback(cb) {
  resolutionCallback = cb;
}

export function setResolutions(heights) {
  resolutions = ['auto'].concat(heights || []);
  renderResolutionMenu();
  if (resolutionMenuOpen) updateResolutionFocus();
}

export function showResolutionMenu() {
  if (resolutions.length === 0) return;
  resolutionMenuOpen = true;
  resolutionFocus = Math.max(0, resolutions.indexOf(selectedResolution));
  renderResolutionMenu();
  updateResolutionFocus();
  const menu = document.getElementById('resolution-menu');
  if (menu) menu.classList.remove('hidden');
}

export function hideResolutionMenu() {
  resolutionMenuOpen = false;
  const menu = document.getElementById('resolution-menu');
  if (menu) menu.classList.add('hidden');
}

export function toggleResolutionMenu() {
  if (resolutionMenuOpen) hideResolutionMenu();
  else showResolutionMenu();
}

export function isResolutionMenuOpen() {
  return resolutionMenuOpen;
}

export function resolutionNavigateUp() {
  if (!resolutionMenuOpen) return;
  if (resolutionFocus > 0) {
    resolutionFocus--;
    updateResolutionFocus();
  }
}

export function resolutionNavigateDown() {
  if (!resolutionMenuOpen) return;
  if (resolutionFocus < resolutions.length - 1) {
    resolutionFocus++;
    updateResolutionFocus();
  }
}

export function resolutionSelect() {
  if (!resolutionMenuOpen) return;
  const value = resolutions[resolutionFocus];
  selectedResolution = value;
  updateResolutionButton(value);
  renderResolutionMenu();
  if (resolutionCallback) {
    resolutionCallback(value === 'auto' ? null : value);
  }
  hideResolutionMenu();
}

export function setResolutionLabel(label) {
  updateResolutionButton(label);
}

function renderResolutionMenu() {
  const list = document.getElementById('resolution-list');
  if (!list) return;

  list.innerHTML = '';

  resolutions.forEach((res, index) => {
    const item = document.createElement('div');
    item.className = 'resolution-item';
    if (res === selectedResolution) {
      item.classList.add('active');
    }
    item.dataset.index = index;
    item.textContent = res === 'auto' ? 'Auto' : res + 'p';
    item.addEventListener('click', () => {
      resolutionFocus = index;
      resolutionSelect();
    });
    list.appendChild(item);
  });
}

function updateResolutionFocus() {
  const items = document.querySelectorAll('.resolution-item');
  items.forEach((item, index) => {
    item.classList.toggle('focused', index === resolutionFocus);
  });
  if (items[resolutionFocus]) {
    items[resolutionFocus].scrollIntoView({ block: 'nearest' });
  }
}

function updateResolutionButton(value) {
  const btn = document.getElementById('resolution-button');
  if (btn) {
    btn.textContent = value === 'auto' || value == null ? 'Auto' : value + 'p';
  }
}
