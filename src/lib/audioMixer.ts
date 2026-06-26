/**
 * Mixes audio from multiple MediaStreams (microphone + system/tab audio) into a
 * single audio track using the Web Audio API. Returns null when there's nothing
 * to mix, so callers can record video-only.
 */
export class AudioMixer {
  private ctx: AudioContext | null = null;

  /**
   * @returns a single mixed audio MediaStreamTrack, or null if neither input
   *          provided any audio tracks.
   */
  mix(
    ...streams: (MediaStream | null | undefined)[]
  ): MediaStreamTrack | null {
    const sources = streams
      .filter((s): s is MediaStream => !!s)
      .filter((s) => s.getAudioTracks().length > 0);

    if (sources.length === 0) return null;

    const ctx = new AudioContext();
    const destination = ctx.createMediaStreamDestination();
    for (const stream of sources) {
      // Each source may carry several tracks; build a node from the whole stream.
      const node = ctx.createMediaStreamSource(stream);
      node.connect(destination);
    }

    this.ctx = ctx;
    return destination.stream.getAudioTracks()[0] ?? null;
  }

  /** Release the AudioContext. Safe to call multiple times. */
  async close(): Promise<void> {
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      try {
        await ctx.close();
      } catch {
        /* already closed */
      }
    }
  }
}
