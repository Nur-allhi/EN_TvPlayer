import type { Channel } from './utils.ts';

const SETTINGS_KEY = 'en_settings';
const PROXY_OVERRIDES_KEY = 'en_proxy_overrides';

export const APP_VERSION: string = __APP_VERSION__;

export interface Playlist {
  name: string;
  url: string;
}

export interface Settings {
  playlists: Playlist[];
  activePlaylistIndex: number;
  proxyUrl: string;
  channels: Channel[];
  channelsFetched: string | null;
  autoQuality: boolean;
  playlistUrl?: string;
}

interface PlayerConfig {
  useProxy: boolean;
  player: {
    streaming: {
      bufferingGoal: number;
      rebufferingGoal: number;
      bufferBehind: number;
      segmentPrefetchLimit: number;
      startAtSegmentBoundary: boolean;
      retryParameters: {
        maxAttempts: number;
        baseDelay: number;
        backoffFactor: number;
        fuzzFactor: number;
        timeout: number;
      };
    };
    abr: {
      enabled: boolean;
      switchInterval: number;
      bandwidthUpgradeTarget: number;
      bandwidthDowngradeTarget: number;
      defaultBandwidthEstimate: number;
    };
    manifest: {
      retryParameters: {
        maxAttempts: number;
        baseDelay: number;
        backoffFactor: number;
        fuzzFactor: number;
        timeout: number;
      };
      hls: {
        ignoreManifestProgramDateTime: boolean;
      };
    };
  };
}

const settingsDefaults: Settings = {
  playlists: [],
  activePlaylistIndex: -1,
  proxyUrl: 'http://localhost:5000/proxy/',
  channels: [],
  channelsFetched: null,
  autoQuality: true,
};

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const defaults: Settings = { ...settingsDefaults, playlists: [] };
    const s: Settings = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    // Migration from legacy single playlistUrl
    if ((!s.playlists || s.playlists.length === 0) && s.playlistUrl) {
      s.playlists = [{ name: 'Playlist 1', url: s.playlistUrl }];
      s.activePlaylistIndex = 0;
      delete s.playlistUrl;
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
    }
    return s;
  } catch {
    return { ...settingsDefaults, playlists: [] };
  }
}

export function getActivePlaylist(): Playlist | null {
  const s = getSettings();
  if (s.activePlaylistIndex >= 0 && s.activePlaylistIndex < s.playlists.length) {
    return s.playlists[s.activePlaylistIndex];
  }
  return null;
}

export function saveSettings(partial: Partial<Settings>): Settings {
  const current = getSettings();
  const merged = { ...current, ...partial };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
  return merged;
}

export function getProxyOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PROXY_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setProxyOverride(url: string, enabled: boolean): Record<string, boolean> {
  const overrides = getProxyOverrides();
  overrides[url] = enabled;
  try {
    localStorage.setItem(PROXY_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.warn('Failed to save proxy override:', e);
  }
  return overrides;
}

const config: PlayerConfig = {
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
        maxAttempts: 3,
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

export default config;
