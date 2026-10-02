import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildTrack,
  createCar,
  cpuInput,
  stepCar,
  setTraction,
  resetCar,
  trackBend,
} from "../dist/js/engine.js";
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL("../dist/" + path, import.meta.url)));
const results = {};
for (const map of ["copper-canyon", "midnight-metro"]) {
  const track = buildTrack(read("maps/" + map + ".json"));
  const run = (drift) => {
    const car = createCar(track, 1, {});
    let seconds = 0;
    for (let i = 0; i < 450 * 60 && car.lap < 3; i++) {
      stepCar(car, cpuInput(car, track, "speed-demons", drift), track, 1 / 60);
      seconds += 1 / 60;
    }
    assert.equal(car.lap, 3);
    return { seconds, boosts: car.boostsEarned };
  };
  const grip = run(false),
    drift = run(true);
  assert.equal(grip.boosts, 0);
  assert(drift.boosts >= 3, "Drifts must earn repeatable boosts");
  assert(
    drift.seconds < grip.seconds * 0.94,
    "Drifting must beat grip-only driving by at least 6%",
  );
  results[map] = {
    gripSeconds: Math.round(grip.seconds),
    driftSeconds: Math.round(drift.seconds),
    driftBoosts: drift.boosts,
  };
  const car = createCar(track, 0, {});
  setTraction(car, false);
  setTraction(car, true);
  assert.equal(car.boostTime, 0, "Empty toggles must not grant boost");
  car.driftCharge = 10;
  car.driftDuration = 0.2;
  setTraction(car, false);
  setTraction(car, true);
  assert.equal(car.boostTime, 0, "Short slides must not grant boost");
  const p = track.points.find(
    (p) => Math.abs(trackBend(track, track.points.indexOf(p))) < 0.0005,
  );
  assert(p);
  Object.assign(car, {
    x: p.x,
    z: p.z,
    y: p.y,
    angle: p.angle + 0.3,
    vx: Math.sin(p.angle) * 40,
    vz: Math.cos(p.angle) * 40,
    traction: false,
    driftCharge: 0,
    driftDuration: 0,
  });
  stepCar(car, { steer: 0 }, track, 1 / 60);
  assert.equal(
    car.driftCharge,
    0,
    "Straight-line sliding must not farm drift charge",
  );
  car.x = p.x + p.nx * 50;
  car.z = p.z + p.nz * 50;
  car.driftCharge = 80;
  car.driftDuration = 1;
  stepCar(car, {}, track, 1 / 60);
  assert.equal(car.driftCharge, 0, "Going off-road must lose charge");
  car.boostTime = 2;
  car.driftCharge = 70;
  resetCar(car, track);
  assert.equal(car.boostTime, 0);
  assert.equal(car.driftCharge, 0);
}
console.log(
  "Core drifting: faster corner strategy, earned exit boosts, no empty-toggle/straight/off-road farming, and reset checks pass.",
);
console.log(JSON.stringify(results));
