import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrack, createCar, nearest, stepCar } from "../dist/js/engine.js";
import { terrainHeight, surfaceHeight } from "../dist/js/terrain.js";
import { ChaseCamera } from "../dist/js/camera.js";
import { RenderQuality, MAX_RENDER_PIXELS } from "../dist/js/render-quality.js";

for (const id of ["sunstone-pass", "meadow-run", "copper-canyon"]) {
  const data = JSON.parse(
    await readFile(new URL(`../dist/maps/${id}.json`, import.meta.url)),
  );
  const track = buildTrack(data),
    field = track.terrain;
  assert.ok(field && field.heights.every(Number.isFinite));
  const car = createCar(track, 0, {});
  const camera = new ChaseCamera();
  for (let index = 0; index < track.points.length; index += 11) {
    const road = track.points[index];
    // Road center stays pinned to its authored elevation.
    const center = nearest(track, road.x, road.z);
    assert.ok(
      Math.abs(surfaceHeight(track, road.x, road.z, center) - road.y) < 0.0001,
    );
    // Farther out, cars stand on the same triangles used by the detailed ground mesh.
    const offset = track.roadWidth / 2 + 45;
    const x = road.x + road.nx * offset,
      z = road.z + road.nz * offset;
    const near = nearest(track, x, z);
    if (near.distance > track.roadWidth / 2 + 15) {
      Object.assign(car, {
        x,
        z,
        vx: 0,
        vz: 0,
        yawRate: 0,
        angle: road.angle,
        y: road.y,
      });
      stepCar(car, {}, track, 1 / 60);
      assert.ok(
        Math.abs(car.y - terrainHeight(field, car.x, car.z)) < 0.0001,
        "Off-road cars must not float at road height",
      );
    }
    Object.assign(car, {
      x: road.x,
      z: road.z,
      y: road.y,
      pitch: Math.atan(road.grade),
    });
    const view = camera.update(track, car, road.angle, 1 / 60, false, false);
    const ground = surfaceHeight(
      track,
      view.position.x,
      view.position.z,
      nearest(track, view.position.x, view.position.z),
    );
    assert.ok(
      view.position.y >= ground + 1.19,
      "Camera must stay above the ground on climbs and descents",
    );
    assert.ok(
      Object.values(view.position).every(Number.isFinite) &&
        Number.isFinite(view.pitch),
    );
  }
  Object.assign(car, {
    x: field.maxX + 100,
    z: field.maxZ + 100,
    lap: 1,
    nextGate: 7,
    driftCharge: 50,
    boostTime: 2,
  });
  stepCar(car, {}, track, 1 / 60);
  assert.ok(
    nearest(track, car.x, car.z).distance < 0.001,
    "Leaving terrain bounds must recover the car",
  );
  assert.equal(car.lap, 1);
  assert.equal(car.nextGate, 7);
  assert.equal(car.boostTime, 0);
  assert.equal(car.driftCharge, 0);
  console.log(
    `${id}: connected ground, off-road height, camera clearance and out-of-bounds recovery pass`,
  );
}

const flat = buildTrack({
  format: "traction.track",
  version: 1,
  laps: 3,
  roadWidth: 20,
  points: [
    [0, 0],
    [0, 200],
    [-200, 200],
    [-200, 0],
  ],
});
const camera = new ChaseCamera(),
  car = createCar(flat, 0, {});
camera.update(flat, car, 0, 1 / 60, false, false);
const oldPitch = camera.pitch,
  oldHeight = camera.position.y;
car.pitch = 0.4;
car.y = 20;
const smoothed = camera.update(flat, car, 0, 1 / 60, false, false);
assert.ok(
  Math.abs(smoothed.pitch - oldPitch) < 0.1,
  "Pitch must not snap to a changing road grade",
);
assert.ok(
  smoothed.position.y > oldHeight && smoothed.position.y < car.y + 3.8,
  "Smooth camera height independently of car grounding",
);
car.x += 100;
const teleported = camera.update(flat, car, 0, 1 / 60, false, false);
assert.ok(
  teleported.position.y > 15,
  "Snap camera state after recovery/teleport",
);

const quality = new RenderQuality();
for (let i = 0; i < 240; i++) quality.update(1 / 30);
assert.ok(quality.scale < 1 && quality.scale >= 0.65);
const reduced = quality.scale;
for (let i = 0; i < 720; i++) quality.update(1 / 60);
assert.ok(quality.scale > reduced && quality.scale <= 1);
for (const [width, height, dpr] of [
  [1280, 720, 2],
  [3840, 2160, 2],
  [640, 360, 1],
]) {
  const ratio = quality.ratio(width, height, dpr);
  assert.ok(width * height * ratio * ratio <= MAX_RENDER_PIXELS + 1);
}
console.log("Camera smoothing and sustained-pressure resolution scaling: pass");
