import { setProxyOverride } from './config.ts';
import { escapeHtml, type Channel } from './utils.ts';

let channels: Channel[] = [];
let currentIndex: number = -1;
let focusedIndex: number = 0;
let sidebarOpen: boolean = false;
let isFullscreen: boolean = false;
let onChannelSelect: ((channel: Channel) => void) | null = null;
let onProxyToggle: ((channel: Channel) => void) | null = null;

/* Right sidebar state */
let rightSidebarOpen: boolean = false;
let rightResolutions: string[] = [];
let rightFocus: number = 0;
let rightSelectedResolution: string = 'auto';
let rightResolutionCallback: ((height: number) => void) | null = null;
let rightItems: Array<{ type: string; element: HTMLElement; id?: string }> = [];

/* Group sidebar state */
let sidebarMode: 'channels' | 'groups' = 'channels';
let groups: Array<{ name: string; count: number; channels: Channel[] }> = [];
let selectedGroup: string | null = null;
let groupFocusedIndex: number = 0;

export function init(channelList: Channel[], callback: (channel: Channel) => void): void {
  channels = channelList;
  onChannelSelect = callback;
  currentIndex = -1;
  focusedIndex = 0;

  extractGroups(channels);
  if (groups.length > 0) {
    sidebarMode = 'groups';
    selectedGroup = null;
    renderGroupList();
  } else {
    sidebarMode = 'channels';
    selectedGroup = null;
    renderChannelList();
  }
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
      const to = e.relatedTarget as Node | null;
      if (to && rightZone && rightZone.contains(to)) return;
      rightSidebarOpen = false;
      applyRightSidebar();
    });
  }
}

export function extractGroups(channelList: Channel[]): void {
  const groupMap = {};
  for (const ch of channelList) {
    const g = ch.group || 'Ungrouped';
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(ch);
  }
  const realGroups = Object.keys(groupMap).sort().map(name => ({
    name,
    count: groupMap[name].length,
    channels: groupMap[name],
  }));
  groups = [
    { name: 'All Channels', count: channelList.length, channels: channelList },
    ...realGroups,
  ];
}

export function getSidebarMode(): 'channels' | 'groups' {
  return sidebarMode;
}

export function getGroups(): typeof groups {
  return groups;
}

export function getSelectedGroup(): string | null {
  return selectedGroup;
}

export function getCurrentIndex(): number {
  return currentIndex;
}

export function renderGroupList(): void {
  const container = document.getElementById('group-list');
  if (!container) return;
  container.innerHTML = '';
  groups.forEach((group, index) => {
    const item = document.createElement('div');
    item.className = 'group-item';
    item.dataset.index = String(index);
    item.innerHTML =
      '<span class="group-name">' + escapeHtml(group.name) + '</span>' +
      '<span class="group-count">(' + group.count + ')</span>';
    item.addEventListener('click', () => {
      showGroupChannels(group.name);
    });
    container.appendChild(item);
  });
  updateGroupFocus();
}

export function updateGroupFocus(): void {
  const items = document.querySelectorAll('#group-list .group-item');
  items.forEach((item, idx) => {
    item.classList.toggle('focused', idx === groupFocusedIndex);
  });
  if (items[groupFocusedIndex]) {
    items[groupFocusedIndex].scrollIntoView({ block: 'nearest' });
  }
}

export function navigateGroupUp(): void {
  if (groups.length === 0) return;
  groupFocusedIndex = (groupFocusedIndex - 1 + groups.length) % groups.length;
  updateGroupFocus();
}

export function navigateGroupDown(): void {
  if (groups.length === 0) return;
  groupFocusedIndex = (groupFocusedIndex + 1) % groups.length;
  updateGroupFocus();
}

export function selectFocusedGroup(): void {
  if (groups.length === 0) return;
  showGroupChannels(groups[groupFocusedIndex].name);
}

export function showGroupChannels(groupName: string): void {
  selectedGroup = groupName === 'All Channels' ? 'all' : groupName;
  sidebarMode = 'channels';
  focusedIndex = 0;
  const groupList = document.getElementById('group-list');
  const channelList = document.getElementById('channel-list');
  if (groupList) groupList.classList.add('hidden');
  if (channelList) channelList.classList.remove('hidden');
  renderChannelList();
  updateFocus();
}

export function showGroupList(): void {
  sidebarMode = 'groups';
  const groupList = document.getElementById('group-list');
  const channelList = document.getElementById('channel-list');
  if (channelList) channelList.classList.add('hidden');
  if (groupList) groupList.classList.remove('hidden');
  renderGroupList();
}

export function renderChannelList() {
  const container = document.getElementById('channel-list');
  if (!container) return;

  let displayChannels;
  if (selectedGroup === 'all' || !selectedGroup) {
    displayChannels = channels;
  } else {
    displayChannels = channels.filter(ch => (ch.group || 'Ungrouped') === selectedGroup);
  }

  container.innerHTML = '';

  displayChannels.forEach((channel, displayIndex) => {
    const originalIndex = channels.indexOf(channel);
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.dataset.index = String(displayIndex);

    item.innerHTML =
      '<span class="channel-number">' + (displayIndex + 1) + '</span>' +
      '<span class="channel-name">' + escapeHtml(channel.name) + '</span>' +
      (channel.useProxy ? '<span class="channel-proxy">Use Proxied</span>' : '');

    item.addEventListener('click', () => {
      selectChannel(originalIndex);
    });

    container.appendChild(item);
  });
}

export function selectChannel(index: number, skipFullscreen?: boolean): void {
  if (index < 0 || index >= channels.length) return;

  currentIndex = index;
  const displayChannels = getDisplayChannels();
  focusedIndex = displayChannels.indexOf(channels[index]);
  if (focusedIndex < 0) focusedIndex = 0;
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
  updateProxyButtonText();
}

export function navigateUp(): void {
  const displayChannels = getDisplayChannels();
  if (displayChannels.length === 0) return;
  focusedIndex = (focusedIndex - 1 + displayChannels.length) % displayChannels.length;
  updateFocus();
  scrollToFocused();
}

export function navigateDown(): void {
  const displayChannels = getDisplayChannels();
  if (displayChannels.length === 0) return;
  focusedIndex = (focusedIndex + 1) % displayChannels.length;
  updateFocus();
  scrollToFocused();
}

export function selectFocused() {
  const displayChannels = getDisplayChannels();
  const channel = displayChannels[focusedIndex];
  if (channel) {
    selectChannel(channels.indexOf(channel));
  }
}

export function getDisplayChannels() {
  if (selectedGroup === 'all' || !selectedGroup) {
    return channels;
  }
  return channels.filter(ch => (ch.group || 'Ungrouped') === selectedGroup);
}

export function jumpToNumber(num: number, skipFullscreen?: boolean): void {
  const displayChannels = getDisplayChannels();
  const channel = displayChannels[num - 1];
  if (channel) {
    selectChannel(channels.indexOf(channel), skipFullscreen);
  }
}

export function toggleSidebar() {
  if (rightSidebarOpen) {
    rightSidebarOpen = false;
    applyRightSidebar();
  }
  sidebarOpen = !sidebarOpen;
  if (sidebarOpen) {
    if (groups.length > 0 && selectedGroup !== null) {
      sidebarMode = 'channels';
      const displayChannels = getDisplayChannels();
      const playingChannel = channels[currentIndex];
      const idx = playingChannel ? displayChannels.indexOf(playingChannel) : -1;
      focusedIndex = idx >= 0 ? idx : 0;
      const groupList = document.getElementById('group-list');
      const channelList = document.getElementById('channel-list');
      if (groupList) groupList.classList.add('hidden');
      if (channelList) channelList.classList.remove('hidden');
      renderChannelList();
      updateFocus();
    } else if (groups.length > 0) {
      showGroupList();
    } else {
      selectedGroup = null;
      sidebarMode = 'channels';
      focusedIndex = currentIndex >= 0 ? currentIndex : 0;
      renderChannelList();
    }
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

export function showSidebarWithContent() {
  sidebarOpen = true;
  applySidebar();
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
  if (sidebarOpen) {
    sidebarOpen = false;
    applySidebar();
  }
  rightSidebarOpen = !rightSidebarOpen;
  applyRightSidebar();
  if (rightSidebarOpen) {
    updateProxyButtonText();
    buildRightItems();
    rightFocus = 0;
    updateRightFocus();
    resetInactivity();
  }
}

export function isRightSidebarOpen() {
  return rightSidebarOpen;
}

export function setProxyToggleCallback(cb) {
  onProxyToggle = cb;
}

export function toggleCurrentChannelProxy() {
  const ch = getCurrentChannel();
  if (!ch) return;
  ch.useProxy = !ch.useProxy;
  if (ch.useProxy && !ch.proxyUrl) {
    ch.proxyUrl = window.location.origin + '/proxy/';
  }
  setProxyOverride(ch.url, ch.useProxy);
  renderChannelList();
  updateProxyButtonText();
  if (onProxyToggle) onProxyToggle(ch);
}

export function updateProxyButtonText() {
  const btn = document.getElementById('toggle-proxy-btn');
  if (!btn) return;
  const ch = getCurrentChannel();
  btn.textContent = ch && ch.useProxy ? 'Proxy: ON' : 'Proxy: OFF';
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

function renderRightResolutionList(): void {
  const list = document.getElementById('resolution-list-right');
  if (!list) return;
  list.innerHTML = '';
  rightResolutions.forEach((res, index) => {
    const item = document.createElement('div');
    item.className = 'resolution-item-right';
    if (res === rightSelectedResolution) {
      item.classList.add('active');
    }
    item.dataset.index = String(index);
    item.textContent = res === 'auto' ? 'Auto' : res + 'p';
    item.addEventListener('click', () => {
      rightFocus = index;
      doRightSelect();
    });
    list.appendChild(item);
  });
}

function buildRightItems(): void {
  rightItems = [];
  // Resolution items (indices 0 .. N-1)
  const list = document.getElementById('resolution-list-right');
  if (list) {
    const resItems = list.querySelectorAll('.resolution-item-right');
    resItems.forEach((item) => {
      rightItems.push({ type: 'resolution', element: item as HTMLElement });
    });
  }
  // Button IDs
  const btnIds = ['refresh-stream-btn', 'refresh-channels-btn', 'toggle-proxy-btn', 'settings-btn'];
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

function doRightSelect(): void {
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
    rightResolutionCallback(value === 'auto' ? null : Number(value));
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
  extractGroups(channels);
  if (selectedGroup === 'all') {
    sidebarMode = 'channels';
  } else if (selectedGroup && !groups.find(g => g.name === selectedGroup)) {
    selectedGroup = null;
    sidebarMode = 'groups';
  } else if (groups.length <= 1) {
    sidebarMode = 'channels';
    selectedGroup = null;
  }
  if (sidebarMode === 'groups') {
    showGroupList();
  } else {
    const groupList = document.getElementById('group-list');
    if (groupList) groupList.classList.add('hidden');
    const channelList = document.getElementById('channel-list');
    if (channelList) channelList.classList.remove('hidden');
    renderChannelList();
  }
  updateFocus();
  updateActiveChannel();
  // Close right sidebar since channel list may have changed
  if (rightSidebarOpen) {
    rightSidebarOpen = false;
    applyRightSidebar();
  }
}

function updateActiveChannel(): void {
  const items = document.querySelectorAll('.channel-item');
  const displayChannels = getDisplayChannels();
  const playingDisplayIdx = displayChannels.indexOf(channels[currentIndex]);
  items.forEach((item, index) => {
    item.classList.toggle('active', index === playingDisplayIdx);
  });
}

function updateFocus(): void {
  const items = document.querySelectorAll('.channel-item');
  items.forEach((item, index) => {
    item.classList.toggle('focused', index === focusedIndex);
  });
}

function scrollToFocused(): void {
  const items = document.querySelectorAll('.channel-item');
  if (items[focusedIndex]) {
    items[focusedIndex].scrollIntoView({ block: 'nearest' });
  }
}

/* Buffering percentage indicator */
export function showBuffering(percent: number): void {
  const el = document.getElementById('buffering-indicator');
  if (!el) return;
  el.classList.remove('hidden');
  setBufferingPercent(percent);
}

export function updateBuffering(percent: number): void {
  const el = document.getElementById('buffering-indicator');
  if (el && !el.classList.contains('hidden')) {
    setBufferingPercent(percent);
  }
}

export function hideBuffering(): void {
  const el = document.getElementById('buffering-indicator');
  if (el) el.classList.add('hidden');
}

function setBufferingPercent(percent) {
  const p = document.getElementById('buffering-percent');
  if (p) p.textContent = (typeof percent === 'number' ? percent : 0) + '%';
}

/* Unified Toast System */
type ToastType = 'error' | 'warning' | 'info';

export function showToast(message: string, type: ToastType = 'info', duration: number = 5000): void {
  const show = () => {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.warn('[Toast] Container not found, retrying in 100ms');
      setTimeout(show, 100);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap: Record<ToastType, string> = {
      error: '\u2718',
      warning: '\u26A0',
      info: '\u2139',
    };

    toast.innerHTML =
      '<span class="toast-icon">' + iconMap[type] + '</span>' +
      '<span class="toast-message">' + escapeHtml(message) + '</span>';

    container.appendChild(toast);
    console.log('[Toast] Shown:', message, 'Type:', type);

    if (duration > 0) {
      setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
}

export function hideAllToasts(): void {
  const container = document.getElementById('toast-container');
  if (container) container.innerHTML = '';
}

/* Legacy compatibility */
export function showProxyToast(): void {
  showToast('Stream not loading — try enabling Proxy in the right menu', 'warning', 8000);
}

export function hideProxyToast(): void {
  hideAllToasts();
}
