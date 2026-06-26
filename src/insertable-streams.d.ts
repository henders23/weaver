// Ambient declarations for the WebCodecs "Insertable Streams for MediaStreamTrack"
// APIs. These are shipping in Chromium (Chrome/Edge) but not yet in TypeScript's
// standard lib.dom typings, so we declare the minimal surface we use.

interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
  maxBufferSize?: number;
}

declare class MediaStreamTrackProcessor<T = VideoFrame> {
  constructor(init: MediaStreamTrackProcessorInit);
  readonly readable: ReadableStream<T>;
}

interface MediaStreamTrackGeneratorInit {
  kind: "video" | "audio";
}

declare class MediaStreamTrackGenerator<T = VideoFrame>
  extends MediaStreamTrack
{
  constructor(init: MediaStreamTrackGeneratorInit);
  readonly writable: WritableStream<T>;
}
