declare module 'shaka-player' {
  namespace shaka {
    namespace polyfill {
      function installAll(): void;
    }

    class Player {
      static isBrowserSupported(): boolean;
      getNetworkingEngine(): NetworkingEngine | null;
      configure(config: Record<string, unknown>): void;
      load(url: string, starttime?: number): Promise<void>;
      unload(): Promise<void>;
      destroy(): Promise<void>;
      attach(element: HTMLVideoElement): Promise<void>;
      addEventListener(type: string, callback: (event: Event) => void): void;
      getVariantTracks(): Track[];
      selectVariantTrack(track: Track, clearBuffer?: boolean): void;
      isAudioOnly(): boolean;
      getStats(): Stats;
      getTextTracks(): TextTrack[];
      selectTextTrack(track: TextTrack): void;
      setTextTrackVisibility(visible: boolean);
      constructor();
    }

    interface NetworkingEngine {
      registerRequestFilter(filter: (type: number, request: Request) => void): void;
    }

    interface Request {
      uris: string[];
      headers: Record<string, string>;
      body: Uint8Array | null;
      method: string;
      allowCrossSiteCredentials: boolean;
    }

    interface Track {
      id: number;
      active: boolean;
      type: string;
      bandwidth: number;
      language: string;
      label: string | null;
      kind: string | null;
      width: number | null;
      height: number | null;
      frameRate: number | null;
      pixelAspectRatio: string | null;
      hdr: string | null;
      mimeType: string | null;
      codecs: string | null;
      audioCodec: string | null;
      videoCodec: string | null;
      primary: boolean;
      roles: string[];
      audioRoles: string[] | null;
      forced: boolean;
      videoId: number | null;
      audioId: number | null;
      channelsCount: number | null;
      audioSamplingRate: number | null;
      tilesLayout: string | null;
    }

    interface TextTrack extends Track {}

    interface Stats {
      width: number;
      height: number;
      streamBandwidth: number;
      decodedFrames: number;
      droppedFrames: number;
      corruptedFrames: number;
      estimatedBandwidth: number;
      loadLatency: number;
      playTime: number;
      pauseTime: number;
      bufferingTime: number;
      licenseTime: number;
      liveLatency: number;
      maxSegmentDuration: number;
      switchHistory: unknown[];
      stateHistory: unknown[];
    }
  }

  export default shaka.Player;
  export const polyfill: { installAll: () => void };
}
