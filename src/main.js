import config from './config.js';
import * as player from './player.js';
import * as ui from './ui.js';
import * as remote from './remote.js';
import channelsData from '../channels.json';

async function fetchChannelsFromApi() {
  try {
    const base = config.apiUrl || '';
    const resp = await fetch(base + '/api/channels');
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0) return data;
    }
  } catch (e) {
    console.warn('Failed to fetch channels from API, using fallback:', e.message);
  }
  return null;
}

// Initialize the app
async function init() {
  // Check Shaka support
  const videoEl = document.getElementById('video');
  if (!player.initPlayer(videoEl)) {
    document.body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#fff;">' +
      '<h2>Browser Not Supported</h2>' +
      '<p>This browser does not support MSE/EME required for streaming.</p>' +
      '</div>';
    return;
  }

  // Load channel list from API, fall back to bundled channels.json
  const apiChannels = await fetchChannelsFromApi();
  channels = apiChannels || channelsData;
  if (!channels || channels.length === 0) {
    document.body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#fff;">' +
      '<h2>No Channels</h2>' +
      '<p>Add channels via the Channel Manager or edit channels.json.</p>' +
      '</div>';
    return;
  }

  // Sort by channel number
  channels.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));

  // Init UI with channels
  ui.init(channels, handleChannelSelect);

    // Wire resolution selection to the player (also update badge on manual select)
  ui.setResolutionCallback((height) => {
    player.selectResolution(height);
    updateResolutionBadge(height || player.getActiveHeight());
  });

  // Play/Pause controls
  const playPauseButton = document.getElementById('playpause-button');
  if (playPauseButton) {
    playPauseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      player.togglePlay();
    });
  }

  // Wire right sidebar buttons
  const refreshStreamBtn = document.getElementById('refresh-stream-btn');
  if (refreshStreamBtn) {
    refreshStreamBtn.addEventListener('click', () => {
      showProgress('Reloading');
      player.reloadChannel();
    });
  }
  const refreshChannelsBtn = document.getElementById('refresh-channels-btn');
  if (refreshChannelsBtn) {
    refreshChannelsBtn.addEventListener('click', async () => {
      showProgress('Refreshing');
      await refreshChannels();
      hideProgress();
    });
  }

  // Hide progress toast once playback starts
  videoEl.addEventListener('playing', () => hideProgress());

  // Click the video to toggle play/pause (handy in fullscreen)
  videoEl.addEventListener('click', () => player.togglePlay());

  // Keep the play/pause button icon in sync with the actual state
  videoEl.addEventListener('play', () => {
    if (playPauseButton) playPauseButton.innerHTML = '&#10073;&#10073;';
  });
  videoEl.addEventListener('pause', () => {
    if (playPauseButton) playPauseButton.innerHTML = '&#9654;';
  });

  // Keep UI state in sync when the browser leaves fullscreen (e.g. ESC)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && ui.isFullscreenMode()) {
      ui.exitFullscreenMode();
    }
  });

  // Buffering indicator (with live percentage updates)
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

  // Track resolution changes (ABR or manual) to update the badge
  player.onTrackChange((height) => updateResolutionBadge(height));

  // Auto-advance to next channel on persistent 403
  player.onChannelAdvance(() => {
    const next = (currentIndex + 1) % channels.length;
    ui.selectChannel(next);
  });

  // Init remote control
  remote.init(handleRemoteAction);

  // Auto-play first channel (skip fullscreen — user gesture will trigger it)
  ui.selectChannel(0, true);

  console.log('IPTV TV Mode initialized with', channels.length, 'channels');
}

let currentIndex = 0;
let channels;

// Handle channel selection from UI
async function handleChannelSelect(channel) {
  currentIndex = channels.indexOf(channel);
  const ok = await player.loadChannel(channel);
  if (!ok) hideProgress();
  ui.setSelectedResolution('auto');
  ui.setResolutions(player.getResolutions());
  const height = player.getActiveHeight();
  if (height) updateResolutionBadge(height);
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

function updateResolutionBadge(height) {
  const el = document.getElementById('resolution-badge');
  if (!el) return;
  const label = getResolutionLabel(height);
  const bw = formatBandwidth(player.getActiveBandwidth());
  el.textContent = label + bw;
  el.classList.remove('hidden');
}

/* Progress toast helpers */
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

// Handle remote control actions
function handleRemoteAction(action, value) {
  // While the right sidebar is open, navigation is scoped to it
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

  // While the left sidebar is open, navigate channel list
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

  // No overlays open — fullscreen remote control
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

// Refresh channels from API and update UI (e.g. after channel manager edit)
export async function refreshChannels() {
  const apiChannels = await fetchChannelsFromApi();
  if (apiChannels && apiChannels.length > 0) {
    apiChannels.sort((a, b) => (a.channelNumber || 0) - (b.channelNumber || 0));
    channels = apiChannels;
    ui.refreshChannelList(channels);
    console.log('Channels refreshed:', channels.length);
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
