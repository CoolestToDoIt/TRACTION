// Enable with ?perf=1. Frame intervals include browser scheduling; CPU sections do not measure GPU time.
export class FrameProfiler {
  enabled = false;
  intervals = [];
  lastTime = null;
  lastUpdate = 0;
  constructor() {
    this.enabled =
      new URLSearchParams(globalThis.location?.search || "").get("perf") ===
      "1";
  }
  record(time, simulationMs, drawingMs) {
    if (!this.enabled) return;
    if (this.lastTime !== null) this.intervals.push(time - this.lastTime);
    this.lastTime = time;
    if (this.intervals.length > 120) this.intervals.shift();
    if (time - this.lastUpdate < 500 || !this.intervals.length) return;
    this.lastUpdate = time;
    if (!this.element) {
      this.element = document.createElement("pre");
      this.element.className = "frame-profiler";
      document.body.append(this.element);
    }
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    this.element.textContent =
      `${(1000 / mean).toFixed(0)} FPS · frame p95 ${p95.toFixed(1)} ms\n` +
      `simulation ${simulationMs.toFixed(1)} ms · render/UI ${drawingMs.toFixed(1)} ms CPU`;
  }
}
