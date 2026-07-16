export default {
  // CORS Proxy URL. Defaults to the Vite dev proxy (same origin as the app).
  // For a build installed natively on the TV (where the app and proxy are on
  // different machines), override with the PC's LAN address, e.g.:
  //   VITE_PROXY_URL=http://192.168.1.50:8080/proxy/
  proxyUrl: import.meta.env.VITE_PROXY_URL || '/proxy/',

  // Default to using proxy (Samsung TV needs it for CORS)
  useProxy: true,

  // Shaka Player config optimized for live streaming on low-power TV
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
