import assert from "node:assert/strict";
import fs from "node:fs";
import { buildTrack, createCar, stepCar, wrap } from "../dist/js/engine.js";
const data = JSON.parse(
    fs.readFileSync(
      new URL("../dist/maps/sunstone-pass.json", import.meta.url),
    ),
  ),
  track = buildTrack(data);
assert(track.length > 5500 && track.length < 6500);
assert(
  Math.max(...track.points.map((p) => p.y)) -
    Math.min(...track.points.map((p) => p.y)) >
    200,
);
const initial = track.points.filter((p) => p.s < 400);
assert(
  Math.max(
    ...initial.map((p) => Math.abs(wrap(p.angle - track.points[0].angle))),
  ) < 0.25,
  "Opening straight should have limited turns",
);
let reversals = 0;
for (let i = 0; i < track.points.length; i++) {
  const a = track.points[i];
  if (a.s < track.length * 0.55) continue;
  let j = i;
  while (j < track.points.length - 1 && track.points[j].s - a.s < 190) j++;
  if (Math.abs(wrap(track.points[j].angle - a.angle)) > 2.8) {
    reversals++;
    i = j;
  }
}
assert(reversals >= 4, "Late circuit must contain four 180-degree hairpins");
const flat = buildTrack({
    format: "traction.track",
    version: 1,
    laps: 3,
    roadWidth: 20,
    points: [
      [0, 0],
      [0, 400],
      [-400, 400],
      [-400, 0],
    ],
  }),
  grip = createCar(flat, 0, {}),
  drift = createCar(flat, 0, {});
drift.traction = false;
for (let i = 0; i < 90; i++) {
  stepCar(grip, { throttle: 1 }, flat, 1 / 60);
  stepCar(drift, { throttle: 1 }, flat, 1 / 60);
}
assert(
  Math.hypot(grip.vx, grip.vz) > Math.hypot(drift.vx, drift.vz) * 1.12,
  "Traction on must accelerate visibly faster on a straight",
);
console.log(
  "Mountain track: open start, elevation, four late 180-degree hairpins, faster traction-on launch: pass",
);
