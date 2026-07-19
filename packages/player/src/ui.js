let channels = [];
let currentIndex = -1;
let focusedIndex = 0;
let sidebarOpen = true;
let isFullscreen = false;
let onChannelSelect = null;

/* Right sidebar state */
let rightSidebarOpen = false;
let rightResolutions = [];
let rightFocus = 0;
let rightSelectedResolution = 'auto';
let rightResolutionCallback = null;
let rightItems = [];

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
        if (rightSidebarOpen) {
          rightSidebarOpen = false;
          applyRightSidebar();
        }
        sidebarOpen = true;
        applySidebar();
        resetInactivity();
      }
    });
  }
  if (sidebar) {
    sidebar.addEventListener('mouseleave', () => {
      if (isFullscreen && !rightSidebarOpen) {
        sidebarOpen = false;
        applySidebar();
      }
    });
  }

  // In fullscreen, reveal the right sidebar when the mouse enters the right edge
  const rightZone = document.getElementById('right-hover-zone');
  const rightSidebarEl = document.getElementById('right-sidebar');
  if (rightZone) {
    rightZone.addEventListener('mouseenter', () => {
      if (isFullscreen) {
        if (sidebarOpen) {
          sidebarOpen = false;
          applySidebar();
        }
        rightSidebarOpen = true;
        applyRightSidebar();
        resetInactivity();
      }
    });
  }
  if (rightSidebarEl) {
    rightSidebarEl.addEventListener('mouseleave', (e) => {
      if (!isFullscreen) return;
      const to = e.relatedTarget;
      if (to && rightZone && rightZone.contains(to)) return;
      rightSidebarOpen = false;
      applyRightSidebar();
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
      '<span class="channel-name">' + escapeHtml(channel.name) + '</span>' +
      (channel.useProxy ? '<span class="channel-proxy">Use Proxied</span>' : '');

    item.addEventListener('click', () => {
      selectChannel(index);
    });

    container.appendChild(item);
  });
}

export function selectChannel(index, skipFullscreen) {
  if (index < 0 || index >= channels.length) return;

  currentIndex = index;
  focusedIndex = index;
  updateActiveChannel();
  updateFocus();

  if (onChannelSelect) {
    onChannelSelect(channels[index]);
  }

  if (!skipFullscreen) {
    requestFullscreen();
  }

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
  if (channels.length === 0) return;
  focusedIndex = (focusedIndex - 1 + channels.length) % channels.length;
  updateFocus();
  scrollToFocused();
}

export function navigateDown() {
  if (channels.length === 0) return;
  focusedIndex = (focusedIndex + 1) % channels.length;
  updateFocus();
  scrollToFocused();
}

export function selectFocused() {
  selectChannel(focusedIndex);
}

export function jumpToNumber(num, skipFullscreen) {
  const index = channels.findIndex((ch) => ch.channelNumber === num);
  if (index !== -1) {
    selectChannel(index, skipFullscreen);
  }
}

export function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  if (sidebarOpen && rightSidebarOpen) {
    rightSidebarOpen = false;
    applyRightSidebar();
  }
  applySidebar();
}

export function closeAllOverlays() {
  if (sidebarOpen) {
    sidebarOpen = false;
    applySidebar();
  }
  if (rightSidebarOpen) {
    rightSidebarOpen = false;
    applyRightSidebar();
  }
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
  sidebarOpen = false;
  applySidebar();
  rightSidebarOpen = false;
  applyRightSidebar();

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
  rightSidebarOpen = false;
  const app = document.getElementById('app');
  if (app) {
    app.classList.remove('fullscreen');
    app.classList.remove('show-cursor');
  }
  stopCursorAutoHide();
  stopInactivityTimer();
  applySidebar();
  applyRightSidebar();
}

let cursorHideTimer = null;

function startCursorAutoHide() {
  document.addEventListener('mousemove', onFullscreenMouseMove);
  revealCursor();
}

export function stopCursorAutoHide() {
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

let inactivityTimer = null;
let autoCloseCallback = null;
const INACTIVITY_MS = 3000;

export function startInactivityTimer() {
  document.addEventListener('mousemove', resetInactivity);
  document.addEventListener('keydown', resetInactivity);
  document.addEventListener('click', resetInactivity);
  resetInactivity();
}

export function stopInactivityTimer() {
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
  if (autoCloseCallback) {
    autoCloseCallback();
  }
  if (sidebarOpen) {
    sidebarOpen = false;
    applySidebar();
  }
  if (rightSidebarOpen) {
    rightSidebarOpen = false;
    applyRightSidebar();
  }
}

export function resetInactivityTimer() {
  resetInactivity();
}

function applySidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('closed', !sidebarOpen);
  }
}

/* Right sidebar */
export function applyRightSidebar() {
  const el = document.getElementById('right-sidebar');
  if (el) {
    el.classList.toggle('closed', !rightSidebarOpen);
  }
}

export function setAutoCloseCallback(callback) {
  autoCloseCallback = callback;
}

export function toggleRightSidebar() {
  rightSidebarOpen = !rightSidebarOpen;
  if (rightSidebarOpen && sidebarOpen) {
    sidebarOpen = false;
    applySidebar();
  }
  applyRightSidebar();
  if (rightSidebarOpen) {
    buildRightItems();
    rightFocus = 0;
    updateRightFocus();
    resetInactivity();
  }
}

export function isRightSidebarOpen() {
  return rightSidebarOpen;
}

export function setResolutionCallback(cb) {
  rightResolutionCallback = cb;
}

export function setResolutions(heights) {
  rightResolutions = ['auto'].concat(heights || []);
  renderRightResolutionList();
  if (rightSidebarOpen) {
    buildRightItems();
    updateRightFocus();
  }
}

export function setSelectedResolution(value) {
  rightSelectedResolution = value;
  renderRightResolutionList();
}

function renderRightResolutionList() {
  const list = document.getElementById('resolution-list-right');
  if (!list) return;
  list.innerHTML = '';
  rightResolutions.forEach((res, index) => {
    const item = document.createElement('div');
    item.className = 'resolution-item-right';
    if (res === rightSelectedResolution) {
      item.classList.add('active');
    }
    item.dataset.index = index;
    item.textContent = res === 'auto' ? 'Auto' : res + 'p';
    item.addEventListener('click', () => {
      rightFocus = index;
      doRightSelect();
    });
    list.appendChild(item);
  });
}

function buildRightItems() {
  rightItems = [];
  // Resolution items (indices 0 .. N-1)
  const list = document.getElementById('resolution-list-right');
  if (list) {
    const resItems = list.querySelectorAll('.resolution-item-right');
    resItems.forEach((item) => {
      rightItems.push({ type: 'resolution', element: item });
    });
  }
  // Button IDs
  const btnIds = ['refresh-stream-btn', 'refresh-channels-btn', 'settings-btn'];
  btnIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      rightItems.push({ type: 'button', element: el, id: id });
    }
  });
}

export function rightSidebarNavigateUp() {
  if (!rightSidebarOpen || rightItems.length === 0) return;
  rightFocus = (rightFocus - 1 + rightItems.length) % rightItems.length;
  updateRightFocus();
}

export function rightSidebarNavigateDown() {
  if (!rightSidebarOpen || rightItems.length === 0) return;
  rightFocus = (rightFocus + 1) % rightItems.length;
  updateRightFocus();
}

export function rightSidebarSelect() {
  if (!rightSidebarOpen || rightItems.length === 0) return;
  const item = rightItems[rightFocus];
  if (!item) return;
  if (item.type === 'resolution') {
    doRightSelect();
  } else if (item.type === 'button') {
    const el = document.getElementById(item.id);
    if (el) el.click();
  }
}

function doRightSelect() {
  const items = document.querySelectorAll('.resolution-item-right');
  const idx = rightFocus;
  if (idx < 0 || idx >= items.length) {
    // Focus is on a button, not a resolution item - do nothing
    return;
  }
  const value = rightResolutions[idx];
  rightSelectedResolution = value;
  renderRightResolutionList();
  if (rightResolutionCallback) {
    rightResolutionCallback(value === 'auto' ? null : value);
  }
  rightSidebarOpen = false;
  applyRightSidebar();
}

function updateRightFocus() {
  rightItems.forEach((item, index) => {
    const focused = index === rightFocus;
    if (item.element) {
      item.element.classList.toggle('focused', focused);
    }
  });
  if (rightItems[rightFocus] && rightItems[rightFocus].element) {
    rightItems[rightFocus].element.scrollIntoView({ block: 'nearest' });
  }
}

/* Channel OSD */
let osdTimer = null;

export function showChannelOsd(channel) {
  if (!channel) return;
  const el = document.getElementById('channel-osd');
  if (!el) return;
  clearTimeout(osdTimer);
  el.classList.remove('fade');
  el.classList.remove('hidden');
  el.innerHTML = '<span class="osd-number">' + (channel.channelNumber || '') + '</span>' + escapeHtml(channel.name);
  osdTimer = setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => {
      el.classList.add('hidden');
    }, 300);
  }, 2000);
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

export function refreshChannelList(newChannels) {
  channels = newChannels;
  currentIndex = -1;
  focusedIndex = 0;
  renderChannelList();
  updateFocus();
  updateActiveChannel();
  // Close right sidebar since channel list may have changed
  if (rightSidebarOpen) {
    rightSidebarOpen = false;
    applyRightSidebar();
  }
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
