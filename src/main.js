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

  // Open the resolution menu when the now-playing button is clicked
  const resButton = document.getElementById('resolution-button');
  if (resButton) {
    resButton.addEventListener('click', () => ui.toggleResolutionMenu());
  }

  // Play/Pause controls
  const playPauseButton = document.getElementById('playpause-button');
  if (playPauseButton) {
    playPauseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      player.togglePlay();
    });
  }

  // Click the video to toggle play/pause (handy in fullscreen)
  videoEl.addEventListener('click', () => player.togglePlay());

  // Keep the play/pause button icon in sync with the actual state
  videoEl.addEventListener('play', () => {
    if (playPauseButton) playPauseButton.innerHTML = '&#10073;&#10073;';
  });
  videoEl.addEventListener('pause', () => {
    if (playPauseButton) playPauseButton.innerHTML = '&#9654;';
  });

  // Auto-close the resolution menu once the stream starts playing
  videoEl.addEventListener('playing', () => {
    ui.hideResolutionMenu();
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
      ui.showBuffering(percent != null ? percent : player.getBufferingPercent());
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
  await player.loadChannel(channel);
  ui.setResolutions(player.getResolutions());
  // Set initial resolution badge (fires variantchanged after load)
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

function updateResolutionBadge(height) {
  const el = document.getElementById('resolution-badge');
  if (!el) return;
  el.textContent = getResolutionLabel(height);
  el.classList.remove('hidden');
}

// Handle remote control actions
function handleRemoteAction(action, value) {
  // While the resolution menu is open, navigation is scoped to it
  if (ui.isResolutionMenuOpen()) {
    switch (action) {
      case 'up':
        ui.resolutionNavigateUp();
        break;
      case 'down':
        ui.resolutionNavigateDown();
        break;
      case 'select':
        ui.resolutionSelect();
        break;
      case 'back':
      case 'right':
        ui.hideResolutionMenu();
        break;
      default:
        break;
    }
    return;
  }

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
    case 'back':
      ui.toggleSidebar();
      break;
    case 'playpause':
      player.togglePlay();
      break;
    case 'number':
      ui.jumpToNumber(value);
      break;
    case 'left':
      // Could be used for sidebar toggle on some remotes
      ui.toggleSidebar();
      break;
    case 'right':
      ui.toggleResolutionMenu();
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
