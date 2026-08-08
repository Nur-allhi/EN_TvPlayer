import { getSettings, saveSettings, getProxyOverrides, getActivePlaylist } from './config.ts';
import * as player from './player.ts';
import * as ui from './ui.ts';
import * as remote from './remote.ts';
import * as settings from './settings.ts';
import { processStreamUrl, parseM3u, fetchPlaylist as fetchFromPlaylistUrl } from './utils.ts';
import type { Channel } from './utils.ts';

let currentIndex: number = 0;
let channels: Channel[] = [];
let selectedGroup: string | null = null;

function getDisplayChannels(): Channel[] {
  if (selectedGroup === 'all' || !selectedGroup) return channels;
  return channels.filter(ch => (ch.group || 'Ungrouped') === selectedGroup);
}

async function init() {
  const videoEl = document.getElementById('video');
  if (!player.initPlayer(videoEl)) {
    document.body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#fff;">' +
      '<h2>Browser Not Supported</h2>' +
      '<p>This browser does not support MSE/EME required for streaming.</p>' +
      '</div>';
    return;
  }

  remote.init(handleRemoteAction);

  document.addEventListener('tizenhwkey', (e: Event) => {
    const evt = e as unknown as { keyName: string };
    if (evt.keyName === 'back') {
      if (settings.isVisible()) {
        settings.hide();
        showPlayer();
        ui.stopInactivityTimer();
      }
    }
  });

  const s = getSettings();
  const activePlaylist = getActivePlaylist();

  if (activePlaylist && activePlaylist.url) {
    try {
      const newChannels = await fetchFromPlaylistUrl(activePlaylist.url);
      applyProxyOverrides(newChannels);
      saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
      channels = newChannels;
      startPlayer();
    } catch (e) {
      console.warn('Failed to fetch playlist, falling back to cache:', e.message);
      if (s.channels && s.channels.length > 0) {
        channels = s.channels;
        startPlayer();
      } else {
        showFirstLaunch();
      }
    }
  } else if (s.channels && s.channels.length > 0) {
    channels = s.channels;
    startPlayer();
  } else {
    showFirstLaunch();
  }

  console.log('IPTV TV Mode initialized with', channels ? channels.length : 0, 'channels');
}

function startPlayer() {
  console.log('[DEBUG] startPlayer called, channels:', channels ? channels.length : 0);
  if (!channels || channels.length === 0) {
    console.log('[DEBUG] No channels — opening settings');
    showFirstLaunch();
    return;
  }

  sortChannels(channels);

  settings.init(document.getElementById('settings-page'), {
    onPlaylistFetched: (newChannels) => {
      sortChannels(newChannels);
      applyProxyOverrides(newChannels);
      channels = newChannels;
      ui.refreshChannelList(channels);
      settings.hide();
      ui.stopInactivityTimer();
      showPlayer();
    },
    onClose: () => {
      settings.hide();
      ui.stopInactivityTimer();
      showPlayer();
    },
  });

  ui.init(channels, handleChannelSelect);

  ui.setAutoCloseCallback(() => {
    if (settings.isVisible()) {
      settings.hide();
      showPlayer();
      ui.stopInactivityTimer();
    }
  });

  ui.setResolutionCallback((height) => {
    player.selectResolution(height);
    updateResolutionBadge(height || player.getActiveHeight());
  });

  let playPauseButton = document.getElementById('playpause-button');
  if (playPauseButton) {
    playPauseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      player.togglePlay();
    });
  }

  let refreshStreamBtn = document.getElementById('refresh-stream-btn');
  if (refreshStreamBtn) {
    refreshStreamBtn.addEventListener('click', () => {
      showProgress('Reloading');
      player.reloadChannel();
    });
  }
  let refreshChannelsBtn = document.getElementById('refresh-channels-btn');
  if (refreshChannelsBtn) {
    refreshChannelsBtn.addEventListener('click', async () => {
      showProgress('Refreshing');
      await refreshChannels();
      hideProgress();
    });
  }

  let toggleProxyBtn = document.getElementById('toggle-proxy-btn');
  if (toggleProxyBtn) {
    toggleProxyBtn.addEventListener('click', () => {
      ui.toggleCurrentChannelProxy();
    });
  }

  let settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      showSettingsPage();
    });
  }

  let videoEl = document.getElementById('video');
  videoEl.addEventListener('playing', () => hideProgress());
  videoEl.addEventListener('click', () => player.togglePlay());

  videoEl.addEventListener('play', () => {
    let btn = document.getElementById('playpause-button');
    if (btn) btn.innerHTML = '&#10073;&#10073;';
  });
  videoEl.addEventListener('pause', () => {
    let btn = document.getElementById('playpause-button');
    if (btn) btn.innerHTML = '&#9654;';
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && ui.isFullscreenMode()) {
      ui.exitFullscreenMode();
    }
  });

  let bufferingActive = false;
  player.onBuffering((buffering, percent) => {
    bufferingActive = buffering;
    if (buffering) {
      const p = percent != null ? percent : player.getBufferingPercent();
      ui.showBuffering(p);
      updateProgressPercent(p);
    } else {
      ui.hideBuffering();
    }
  });
  setInterval(() => {
    if (bufferingActive) {
      ui.updateBuffering(player.getBufferingPercent());
    }
  }, 500);

  player.onTrackChange(({ height, bandwidth }) => updateResolutionBadge(height, bandwidth));

  player.onChannelAdvance(() => {
    const next = (currentIndex + 1) % channels.length;
    ui.selectChannel(next);
  });

  player.onProxySuggestion(() => {
    ui.showProxyToast();
  });

  ui.setProxyToggleCallback(() => {
    player.reloadChannel();
  });

  ui.selectChannel(0, true);
}

function showFirstLaunch() {
  hidePlayer();

  settings.init(document.getElementById('settings-page'), {
    onPlaylistFetched: (newChannels) => {
      console.log('[DEBUG] showFirstLaunch onPlaylistFetched:', newChannels ? newChannels.length : 0);
      try {
        sortChannels(newChannels);
        applyProxyOverrides(newChannels);
        channels = newChannels;
        settings.hide();
        ui.stopInactivityTimer();
        showPlayer();
        startPlayer();
      } catch (e) {
        console.error('[DEBUG] showFirstLaunch callback error:', e);
      }
    },
    onClose: () => {
      if (channels && channels.length > 0) {
        settings.hide();
        ui.stopInactivityTimer();
        showPlayer();
      }
    },
  });

  document.body.style.overflow = 'hidden';
  settings.show();
}

function showPlayer() {
  document.body.style.overflow = '';
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  if (playerContainer) playerContainer.classList.remove('hidden');
  if (nowPlaying) nowPlaying.classList.remove('hidden');
  ui.showSidebarWithContent();
}

function hidePlayer() {
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  const sidebar = document.getElementById('sidebar');
  if (playerContainer) playerContainer.classList.add('hidden');
  if (nowPlaying) nowPlaying.classList.add('hidden');
  if (sidebar) sidebar.classList.add('closed');
}

function showSettingsPage() {
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  if (playerContainer) playerContainer.classList.add('hidden');
  if (nowPlaying) nowPlaying.classList.add('hidden');
  if (ui.isFullscreenMode()) {
    ui.exitFullscreenMode();
  }
  ui.closeAllOverlays();
  ui.stopCursorAutoHide();
  ui.stopInactivityTimer();
  document.body.style.overflow = 'hidden';
  settings.show();
}

async function handleChannelSelect(channel) {
  ui.hideProxyToast();
  currentIndex = channels.indexOf(channel);
  const ok = await player.loadChannel(channel);
  if (!ok) hideProgress();
  ui.setSelectedResolution('auto');
  const p = player.getPlayer();
  if (p) {
    ui.setResolutions(player.getResolutions());
    const height = player.getActiveHeight();
    if (height) updateResolutionBadge(height);
  }
}

const labelMap = [
  [480, 'SD'],
  [720, 'HD'],
  [1080, 'FHD'],
  [1440, '2K'],
  [2160, '4K'],
];

function getResolutionLabel(height) {
  if (!height) return 'Auto';
  for (const [max, label] of labelMap) {
    if (height <= max) return label;
  }
  return '8K';
}

function formatBandwidth(bps) {
  if (!bps || bps <= 0) return '';
  const mbps = (bps / 1000000).toFixed(1);
  return ' \u2022 ' + mbps + ' Mbps';
}

function updateResolutionBadge(height, bandwidth) {
  const el = document.getElementById('resolution-badge');
  if (!el) return;
  const label = getResolutionLabel(height);
  const bw = bandwidth || player.getActiveBandwidth();
  el.textContent = label + formatBandwidth(bw);
  el.classList.remove('hidden');
}

let progressActive = false;

function showProgress(text) {
  const el = document.getElementById('progress-toast');
  if (!el) return;
  progressActive = true;
  el.classList.remove('hidden');
  document.getElementById('progress-text').textContent = text;
}

function updateProgressPercent(percent) {
  if (!progressActive) return;
  const el = document.getElementById('progress-text');
  if (el && typeof percent === 'number') {
    el.textContent = 'Reloading ' + percent + '%';
  }
}

function hideProgress() {
  progressActive = false;
  const el = document.getElementById('progress-toast');
  if (el) el.classList.add('hidden');
}

function handleRemoteAction(action, value) {
  if (settings.isVisible()) {
    switch (action) {
      case 'up':
        settings.navigate(-1);
        break;
      case 'down':
        settings.navigate(1);
        break;
      case 'left':
        settings.navigateNav(-1);
        break;
      case 'right':
        settings.navigateNav(1);
        break;
      case 'select':
        settings.selectFocused();
        break;
      case 'back':
        settings.hide();
        showPlayer();
        ui.stopInactivityTimer();
        break;
    }
    return;
  }

  if (ui.isRightSidebarOpen()) {
    switch (action) {
      case 'up':
        ui.rightSidebarNavigateUp();
        break;
      case 'down':
        ui.rightSidebarNavigateDown();
        break;
      case 'select':
        ui.rightSidebarSelect();
        break;
      case 'back':
      case 'left':
      case 'right':
        ui.toggleRightSidebar();
        break;
      default:
        break;
    }
    return;
  }

  if (ui.isSidebarOpen()) {
    const mode = ui.getSidebarMode();
    if (mode === 'groups') {
      switch (action) {
        case 'up':
          ui.navigateGroupUp();
          break;
        case 'down':
          ui.navigateGroupDown();
          break;
        case 'select':
          ui.selectFocusedGroup();
          break;
        case 'left':
          ui.toggleSidebar();
          break;
        case 'right':
          ui.toggleSidebar();
          ui.toggleRightSidebar();
          break;
        case 'back':
          ui.toggleSidebar();
          break;
        case 'number':
          ui.jumpToNumber(value);
          break;
        default:
          break;
      }
    } else {
      switch (action) {
        case 'up':
          ui.navigateUp();
          break;
        case 'down':
          ui.navigateDown();
          break;
        case 'select':
          ui.selectFocused();
          break;
        case 'left':
          if (ui.getGroups().length > 0) {
            ui.showGroupList();
          } else {
            ui.toggleSidebar();
          }
          break;
        case 'right':
          ui.toggleSidebar();
          ui.toggleRightSidebar();
          break;
        case 'back':
          if (ui.getGroups().length > 0) {
            ui.showGroupList();
          } else {
            ui.toggleSidebar();
          }
          break;
        case 'playpause':
          player.togglePlay();
          break;
        case 'number':
          ui.jumpToNumber(value);
          break;
        case 'reload':
          player.reloadChannel();
          break;
        default:
          break;
      }
    }
    selectedGroup = ui.getSelectedGroup();
    currentIndex = ui.getCurrentIndex();
    return;
  }

  switch (action) {
    case 'up': {
      const displayChannels = getDisplayChannels();
      const currentDisplayIdx = displayChannels.indexOf(channels[currentIndex]);
      const idx = currentDisplayIdx >= 0 ? currentDisplayIdx : 0;
      const prev = (idx - 1 + displayChannels.length) % displayChannels.length;
      currentIndex = channels.indexOf(displayChannels[prev]);
      ui.selectChannel(currentIndex, true);
      ui.showChannelOsd(displayChannels[prev]);
      break;
    }
    case 'down': {
      const displayChannels = getDisplayChannels();
      const currentDisplayIdx = displayChannels.indexOf(channels[currentIndex]);
      const idx = currentDisplayIdx >= 0 ? currentDisplayIdx : 0;
      const next = (idx + 1) % displayChannels.length;
      currentIndex = channels.indexOf(displayChannels[next]);
      ui.selectChannel(currentIndex, true);
      ui.showChannelOsd(displayChannels[next]);
      break;
    }
    case 'left':
      ui.toggleSidebar();
      break;
    case 'right':
      ui.toggleRightSidebar();
      break;
    case 'select':
      ui.toggleSidebar();
      break;
    case 'back':
      ui.toggleSidebar();
      break;
    case 'playpause':
      player.togglePlay();
      break;
    case 'number':
      ui.jumpToNumber(value, true);
      break;
    case 'reload':
      player.reloadChannel();
      break;
    default:
      break;
  }
}

function sortChannels(ch) {
  if (!ch || !ch.length) return;
  ch.sort((a, b) => {
    if (!a || !b) return 0;
    return (a.name || '').localeCompare(b.name || '');
  });
  ch.forEach((c, i) => { if (c) c.channelNumber = i + 1; });
}

function applyProxyOverrides(channels) {
  const overrides = getProxyOverrides();
  for (const ch of channels) {
    if (ch.url in overrides) {
      ch.useProxy = overrides[ch.url];
      if (ch.useProxy && !ch.proxyUrl) {
        ch.proxyUrl = window.location.origin + '/proxy/';
      }
    }
  }
}

export async function refreshChannels() {
  const active = getActivePlaylist();
  if (active && active.url) {
    try {
      const newChannels = await fetchFromPlaylistUrl(active.url);
      applyProxyOverrides(newChannels);
      saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
      sortChannels(newChannels);
      channels = newChannels;
      ui.refreshChannelList(channels);
      console.log('Channels refreshed from playlist:', channels.length);
    } catch (e) {
      console.warn('Failed to refresh from playlist:', e.message);
    }
  }
}



if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
