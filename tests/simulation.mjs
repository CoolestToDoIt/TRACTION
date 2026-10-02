import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildTrack,
  createCar,
  stepCar,
  LocalSession,
  nearest,
} from "../dist/js/engine.js";
const track = buildTrack(
  JSON.parse(
    fs.readFileSync(
      new URL("../dist/maps/copper-canyon.json", import.meta.url),
    ),
  ),
);
const skins = JSON.parse(
  fs.readFileSync(new URL("../dist/cars/manifest.json", import.meta.url)),
).cars.map((e) =>
  JSON.parse(
    fs.readFileSync(new URL("../dist/cars/" + e.url, import.meta.url)),
  ),
);
const a = createCar(track, 0, skins[0]),
  b = createCar(track, 0, skins[0]);
a.vz = b.vz = 45;
b.traction = false;
for (let i = 0; i < 30; i++) {
  stepCar(a, { steer: 0.6 }, track, 1 / 60);
  stepCar(b, { steer: 0.6 }, track, 1 / 60);
}
assert(
  Math.abs(b.slip) > Math.abs(a.slip) * 2,
  "Traction off must create greater slip",
);
const before = Math.abs(b.slip);
for (let i = 0; i < 18; i++) stepCar(b, { steer: -0.6 }, track, 1 / 60);
assert(Math.abs(b.slip) < before, "Countersteering should reduce slip");
b.traction = true;
for (let i = 0; i < 30; i++) stepCar(b, { steer: 0 }, track, 1 / 60);
assert(Math.abs(b.slip) < 0.03, "Re-engaging traction should settle the car");
const session = new LocalSession(track, skins);
for (let i = 0; i < 240 * 60; i++) session.step({}, 1 / 60);
assert(
  session.cars.slice(1).every((c) => c.finished),
  "All CPU racers must finish a complete three-lap race",
);
assert(
  session.cars.every((c) =>
    [c.x, c.y, c.z, c.angle, c.pitch, c.vx, c.vz].every(Number.isFinite),
  ),
  "All car states must remain finite through a race",
);
assert(!session.cars[0].finished, "A stationary player must not complete laps");
console.log(
  JSON.stringify({
    handling: "pass",
    countersteer: "pass",
    tractionRecovery: "pass",
    lapValidation: "pass",
    cpuFinishSeconds: session.cars
      .slice(1)
      .map((c) => Math.round(c.finishTime)),
  }),
);

const legacy = buildTrack({
  format: "traction.track",
  version: 1,
  roadWidth: 18,
  laps: 3,
  points: [
    [0, 0],
    [0, 100],
    [-100, 100],
    [-100, 0],
  ],
});
assert(
  legacy.points.every((p) => p.y === 0),
  "Legacy 2D tracks remain flat",
);
assert(
  track.length > 2900 && track.length < 3200,
  "Expanded circuit should be about 3 km",
);
assert(
  Math.max(...track.points.map((p) => p.y)) -
    Math.min(...track.points.map((p) => p.y)) >
    90,
  "Circuit should have meaningful elevation",
);
const slopeCar = (grade) => {
  const p = track.points.find((p) =>
      grade > 0 ? p.grade > grade : p.grade < grade,
    ),
    c = createCar(track, 0, skins[0]);
  Object.assign(c, {
    x: p.x,
    z: p.z,
    y: p.y,
    pitch: Math.atan(p.grade),
    angle: p.angle,
    vx: Math.sin(p.angle) * 25,
    vz: Math.cos(p.angle) * 25,
  });
  stepCar(c, { steer: 0 }, track, 1 / 60);
  assert(
    Math.abs(c.y - nearest(track, c.x, c.z).height) < 0.001,
    "Car must stay on the road surface",
  );
  return Math.hypot(c.vx, c.vz);
};
assert(
  slopeCar(-0.1) > slopeCar(0.1),
  "Downhill gravity should preserve more speed than uphill",
);
const visible = track.chunks.filter(
  (c) =>
    Math.hypot(c.x - track.points[0].x, c.z - track.points[0].z) <
    340 + c.radius,
);
assert(
  visible.length < track.chunks.length,
  "Only nearby chunks should be rendered",
);
console.log(
  "Elevation, downhill gravity, legacy maps, finite simulation and section culling: pass",
);
