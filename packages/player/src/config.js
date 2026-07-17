const SETTINGS_KEY = 'en_settings';

const settingsDefaults = {
  playlistUrl: '',
  channels: [],
  channelsFetched: null,
  singleChannelUrl: '',
  singleUseProxy: false,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...settingsDefaults, ...JSON.parse(raw) } : { ...settingsDefaults };
  } catch {
    return { ...settingsDefaults };
  }
}

export function saveSettings(partial) {
  const current = getSettings();
  const merged = { ...current, ...partial };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
  return merged;
}

function computeApiUrl(proxyUrl) {
  if (proxyUrl.startsWith('http')) {
    return new URL(proxyUrl).origin;
  }
  return '';
}

export default {
  proxyUrl: import.meta.env.VITE_PROXY_URL || '/proxy/',
  apiUrl: computeApiUrl(import.meta.env.VITE_PROXY_URL || '/proxy/'),
  useProxy: true,
  player: {
    streaming: {
      bufferingGoal: 10,
      rebufferingGoal: 4,
      bufferBehind: 5,
      segmentPrefetchLimit: 5,
      startAtSegmentBoundary: true,
      retryParameters: {
        maxAttempts: 8,
        baseDelay: 500,
        backoffFactor: 2,
        fuzzFactor: 0.5,
        timeout: 10000,
      },
    },
    abr: {
      enabled: true,
      switchInterval: 3,
      bandwidthUpgradeTarget: 0.6,
      bandwidthDowngradeTarget: 0.85,
      defaultBandwidthEstimate: 1500000,
    },
    manifest: {
      retryParameters: {
        maxAttempts: 8,
        baseDelay: 500,
        backoffFactor: 2,
        fuzzFactor: 0.5,
        timeout: 10000,
      },
      hls: {
        ignoreManifestProgramDateTime: true,
      },
    },
  },
};
