// Measures renderer CPU work and draw calls, not browser/GPU frame rates.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { buildTrack, createCar } from "../dist/js/engine.js";

import { installCanvasStub } from "./helpers/canvas.mjs";
const stub = installCanvasStub();
const moduleUrl = process.argv[2]
  ? pathToFileURL(process.argv[2])
  : new URL("../dist/js/renderer.js", import.meta.url);
const { Renderer } = await import(moduleUrl);
for (const id of [
  "copper-canyon",
  "midnight-metro",
  "sunstone-pass",
  "meadow-run",
]) {
  const track = buildTrack(
    JSON.parse(
      await readFile(new URL(`../dist/maps/${id}.json`, import.meta.url)),
    ),
  );
  const car = createCar(track, 0, { body: "#b87549", accent: "#dfab73" });
  const renderer = new Renderer(stub.canvas(), track);
  const session = { cars: [car] };
  const times = [];
  stub.reset();
  // Sample the entire track with a full-speed drift and accumulated tire marks.
  for (let i = 0; i < 180; i++) {
    const point = track.points[Math.floor((i / 180) * track.points.length)];
    Object.assign(car, {
      x: point.x,
      y: point.y,
      z: point.z,
      angle: point.angle,
      vx: Math.sin(point.angle) * 90,
      vz: Math.cos(point.angle) * 90,
      slip: 0.2,
    });
    renderer.heading = point.angle;
    const start = performance.now();
    renderer.render(session, 1 / 60, false, i % 20 === 0);
    if (i >= 30) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      track: id,
      medianMs: +times[Math.floor(times.length / 2)].toFixed(2),
      p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
      drawCallsPerFrame: Math.round(stub.calls / 180),
    }),
  );
}
