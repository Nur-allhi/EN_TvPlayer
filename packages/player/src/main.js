import config, { getSettings, saveSettings } from './config.js';
import * as player from './player.js';
import * as ui from './ui.js';
import * as remote from './remote.js';
import * as settings from './settings.js';
import channelsData from '@root/channels.json';

let currentIndex = 0;
let channels;

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

  const s = getSettings();

  if (s.channels && s.channels.length > 0 && !s.playlistUrl) {
    channels = s.channels;
    startPlayer();
  } else if (s.channels && s.channels.length > 0 && s.playlistUrl) {
    channels = s.channels;
    startPlayer();
    settings.refreshLastFetched();
  } else if (s.playlistUrl) {
    try {
      channels = await fetchFromPlaylistUrl(s.playlistUrl);
      saveSettings({ channels, channelsFetched: new Date().toISOString() });
      startPlayer();
    } catch (e) {
      showFirstLaunch();
    }
  } else {
    showFirstLaunch();
  }

  console.log('IPTV TV Mode initialized with', channels ? channels.length : 0, 'channels');
}

function startPlayer() {
  if (!channels || channels.length === 0) {
    document.body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#fff;">' +
      '<h2>No Channels</h2>' +
      '<p>Add channels via Settings or edit channels.json.</p>' +
      '</div>';
    return;
  }

  channels.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));

  settings.init(document.getElementById('settings-page'), {
    onPlaylistFetched: (newChannels) => {
      newChannels.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));
      channels = newChannels;
      ui.refreshChannelList(channels);
      settings.hide();
      showPlayer();
    },
    onPlaySingle: (channel) => {
      settings.hide();
      showPlayer();
      handleChannelSelect(channel);
    },
    onClose: () => {
      settings.hide();
      showPlayer();
    },
  });

  ui.init(channels, handleChannelSelect);

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

  remote.init(handleRemoteAction);

  ui.selectChannel(0, true);
}

function showFirstLaunch() {
  hidePlayer();

  settings.init(document.getElementById('settings-page'), {
    onPlaylistFetched: (newChannels) => {
      newChannels.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));
      channels = newChannels;
      settings.hide();
      showPlayer();
      startPlayer();
    },
    onPlaySingle: (channel) => {
      channels = [channel];
      settings.hide();
      showPlayer();
      startPlayer();
    },
    onClose: () => {
      if (channels && channels.length > 0) {
        settings.hide();
        showPlayer();
      }
    },
  });

  settings.show();
}

function showPlayer() {
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  const sidebar = document.getElementById('sidebar');
  if (playerContainer) playerContainer.classList.remove('hidden');
  if (nowPlaying) nowPlaying.classList.remove('hidden');
  if (sidebar) sidebar.classList.remove('closed');
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
  settings.show();
}

async function fetchFromPlaylistUrl(url) {
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
  const result = [];
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : 'Channel ' + (index + 1);
      let drm = null;
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
        } else {
          break;
        }
      }
      const url = lines[urlIdx] ? lines[urlIdx].trim() : '';
      if (url && !url.startsWith('#')) {
        result.push({ name, url, channelNumber: index + 1, useProxy: true, drm });
        index++;
        i = urlIdx;
      }
    }
  }
  return result;
}

async function handleChannelSelect(channel) {
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
      case 'right':
        ui.toggleRightSidebar();
        break;
      default:
        break;
    }
    return;
  }

  if (ui.isSidebarOpen()) {
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
        ui.toggleSidebar();
        break;
      case 'right':
        ui.toggleRightSidebar();
        break;
      case 'back':
        ui.toggleSidebar();
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
    return;
  }

  switch (action) {
    case 'up': {
      const prev = (currentIndex - 1 + channels.length) % channels.length;
      ui.selectChannel(prev);
      ui.showChannelOsd(channels[prev]);
      break;
    }
    case 'down': {
      const next = (currentIndex + 1) % channels.length;
      ui.selectChannel(next);
      ui.showChannelOsd(channels[next]);
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

export async function refreshChannels() {
  const s = getSettings();
  if (s.playlistUrl) {
    try {
      const newChannels = await fetchFromPlaylistUrl(s.playlistUrl);
      saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
      newChannels.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));
      channels = newChannels;
      ui.refreshChannelList(channels);
      console.log('Channels refreshed from playlist:', channels.length);
    } catch (e) {
      console.warn('Failed to refresh from playlist, falling back to API:', e.message);
      await refreshFromApi();
    }
  } else {
    await refreshFromApi();
  }
}

async function refreshFromApi() {
  const base = config.apiUrl || '';
  try {
    const resp = await fetch(base + '/api/channels');
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0) {
        data.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));
        channels = data;
        ui.refreshChannelList(channels);
        console.log('Channels refreshed from API:', channels.length);
      }
    }
  } catch (e) {
    console.warn('Failed to refresh from API:', e.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
