import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildTrack,
  createCar,
  stepCar,
  speedLimit,
  TRACTION_OFF_SPEED_FACTOR,
} from "../dist/js/engine.js";
const read = (name) =>
  JSON.parse(
    fs.readFileSync(new URL("../dist/maps/" + name + ".json", import.meta.url)),
  );
const meadow = buildTrack(read("meadow-run")),
  standard = buildTrack(read("sunstone-pass"));
assert.equal(meadow.roadWidth, standard.roadWidth * 2);
assert.equal(meadow.environment.type, "grassland");
assert(meadow.length > 2500);
assert.equal(TRACTION_OFF_SPEED_FACTOR, 0.85);
const flat = buildTrack({
  format: "traction.track",
  version: 1,
  laps: 3,
  roadWidth: 38,
  points: [
    [0, 0],
    [0, 3000],
    [0, 6000],
    [-1000, 6000],
    [-1000, -3000],
    [0, -3000],
  ],
});
const grip = createCar(flat, 0, {}),
  loose = createCar(flat, 0, {});
loose.traction = false;
for (let i = 0; i < 600; i++) {
  stepCar(grip, { throttle: 1 }, flat, 1 / 60);
  stepCar(loose, { throttle: 1 }, flat, 1 / 60);
}
assert(Math.abs(Math.hypot(grip.vx, grip.vz) - 78) < 0.001);
assert(Math.abs(Math.hypot(loose.vx, loose.vz) - 66.3) < 0.001);
loose.boostTime = 2;
assert(Math.abs(speedLimit(loose) - 86.7) < 0.001);
grip.boostTime = 2;
assert.equal(speedLimit(grip), 102);
loose.boostTime = 0;
loose.vx = 40;
loose.vz = 90;
const before = Math.hypot(loose.vx, loose.vz);
stepCar(loose, { throttle: 1 }, flat, 1 / 60);
const after = Math.hypot(loose.vx, loose.vz);
assert(
  after < before && after > speedLimit(loose) + 10,
  "Overspeed should decay gradually rather than snap to the cap",
);
loose.x = 0;
loose.z = 300;
loose.angle = 0;
loose.vx = 0;
loose.vz = 78;
for (let i = 0; i < 120; i++) stepCar(loose, { throttle: 1 }, flat, 1 / 60);
assert(
  Math.hypot(loose.vx, loose.vz) <= speedLimit(loose) + 0.001,
  "Held throttle must converge to the reduced cap",
);
const transition = createCar(flat, 0, {});
transition.x = 0;
transition.z = 300;
transition.angle = 0;
transition.vz = 78;
transition.traction = false;
stepCar(transition, { throttle: 1 }, flat, 1 / 60);
assert(
  Math.hypot(transition.vx, transition.vz) > 77.5,
  "Traction toggle must preserve nearly all speed on its first frame",
);
for (let i = 0; i < 120; i++)
  stepCar(transition, { throttle: 1 }, flat, 1 / 60);
assert(Math.abs(Math.hypot(transition.vx, transition.vz) - 66.3) < 0.001);
transition.traction = true;
transition.vz = 102;
transition.boostTime = 1 / 120;
stepCar(transition, { throttle: 1 }, flat, 1 / 60);
assert(
  Math.hypot(transition.vx, transition.vz) > 101,
  "Boost expiry should also decelerate gradually",
);
console.log(
  "Grasslands double width and 15% traction-off gradual speed caps (including boost expiry and lateral velocity): pass",
);
