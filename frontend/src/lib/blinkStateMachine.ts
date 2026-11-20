export interface BlinkThresholds {
  closeAt: number; // score >= closeAt  -> eye counts as closed
  openAt: number; // score <= openAt   -> eye counts as open again
}

export interface BlinkEvent {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface BlinkMachineOptions {
  minBlinkMs: number;
  maxBlinkMs: number;
  faceLostGraceMs: number;
  thresholds: BlinkThresholds;
}

export const DEFAULT_OPTIONS: BlinkMachineOptions = {
  minBlinkMs: 200,
  maxBlinkMs: 3000,
  faceLostGraceMs: 300,
  thresholds: { closeAt: 0.55, openAt: 0.35 },
};

export class BlinkStateMachine {
  private closedSince: number | null = null;
  private faceLostSince: number | null = null;
  public opts: BlinkMachineOptions;

  constructor(opts: Partial<BlinkMachineOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  get isClosed(): boolean {
    return this.closedSince !== null;
  }

  setThresholds(t: BlinkThresholds): void {
    if (t.openAt >= t.closeAt) {
      throw new Error("openAt must be lower than closeAt");
    }
    this.opts.thresholds = t;
  }

  setTiming(minBlinkMs: number, maxBlinkMs: number): void {
    this.opts.minBlinkMs = minBlinkMs;
    this.opts.maxBlinkMs = maxBlinkMs;
  }

  reset(): void {
    this.closedSince = null;
    this.faceLostSince = null;
  }

  update(score: number | null, nowMs: number): BlinkEvent | null {
    if (score === null) {
      if (this.closedSince !== null) {
        if (this.faceLostSince === null) this.faceLostSince = nowMs;
        if (nowMs - this.faceLostSince > this.opts.faceLostGraceMs) {
          this.reset(); // lost too long: not a blink
        }
      }
      return null;
    }
    this.faceLostSince = null;

    const { closeAt, openAt } = this.opts.thresholds;

    if (this.closedSince === null) {
      if (score >= closeAt) this.closedSince = nowMs;
      return null;
    }

    if (score <= openAt) {
      const startMs = this.closedSince;
      this.closedSince = null;
      const durationMs = nowMs - startMs;
      if (durationMs >= this.opts.minBlinkMs && durationMs <= this.opts.maxBlinkMs) {
        return { startMs, endMs: nowMs, durationMs };
      }
    }
    return null;
  }
}

export function thresholdsFromCalibration(openMedian: number, closedMedian: number): BlinkThresholds {
  const span = closedMedian - openMedian;
  if (span < 0.25) {
    throw new Error(
      "Open and closed eyes look too similar to the camera. Improve the lighting, " +
        "move the camera to eye level, and try calibrating again.",
    );
  }
  return {
    closeAt: openMedian + 0.6 * span,
    openAt: openMedian + 0.35 * span,
  };
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("No samples collected (is a face visible?)");
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
