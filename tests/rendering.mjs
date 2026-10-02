import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrack, createCar } from "../dist/js/engine.js";
import { Renderer } from "../dist/js/renderer.js";
import { installCanvasStub } from "./helpers/canvas.mjs";

const stub = installCanvasStub();
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
  const renderer = new Renderer(stub.canvas(), track);
  const car = createCar(track, 0, { body: "#b87549", accent: "#dfab73" });
  const session = { cars: [car] };
  const cachedChunks = renderer.roadChunks;
  const roads = cachedChunks
    .flatMap((chunk) => chunk.faces)
    .filter((face) => face.repeat);
  assert.equal(
    roads.length,
    track.points.length,
    "Cache every road segment, without simplifying elevation",
  );
  for (let i = 0; i < roads.length; i++) {
    assert.equal(roads[i].points[0][1], track.points[i].y);
    assert.equal(
      roads[i].points[2][1],
      track.points[(i + 1) % track.points.length].y,
    );
  }
  assert.equal(
    roads.at(-1).uv[2].y,
    track.length * 8,
    "Preserve texture continuity at the lap seam",
  );
  const fingerprint = JSON.stringify(cachedChunks);
  stub.reset();
  for (let i = 0; i < 48; i++) {
    const point = track.points[Math.floor((i / 48) * track.points.length)];
    Object.assign(car, {
      x: point.x,
      y: point.y,
      z: point.z,
      angle: point.angle,
      pitch: Math.atan(point.grade),
      vx: Math.sin(point.angle) * 90,
      vz: Math.cos(point.angle) * 90,
      slip: 0.2,
    });
    renderer.heading = point.angle;
    renderer.render(session, 1 / 60, false, i % 2 === 0);
    assert.ok(
      renderer.faces.length > 0,
      "Forward and look-back views must have geometry",
    );
    assert.ok(renderer.faces.every((face) => Number.isFinite(face.depth)));
    for (const face of renderer.faces) {
      if (face.ps)
        assert.ok(
          face.ps.every(
            (point) =>
              Number.isFinite(point.x) &&
              Number.isFinite(point.y) &&
              point.depth >= 0.7,
          ),
        );
    }
  }
  assert.equal(
    renderer.roadChunks,
    cachedChunks,
    "Do not rebuild geometry each frame",
  );
  assert.equal(
    JSON.stringify(cachedChunks),
    fingerprint,
    "Clipping must not mutate the cached world mesh",
  );
  // Conservative budget below the old renderer's measured 18k–46k calls/frame.
  assert.ok(stub.calls / 48 < 26000, `${id}: drawing budget exceeded`);
  renderer.renderGarage(car, 1 / 60, -0.7);
  assert.ok(
    renderer.faces.length > 0,
    "Garage projection must also initialize the camera cache",
  );
  console.log(
    `${id}: cached elevation, lap seam, look-back, finite projection and draw budget pass`,
  );
}

const renderer = Object.create(Renderer.prototype);
Object.assign(renderer, {
  w: 1280,
  h: 720,
  f: 900,
  yaw: 0,
  pitch: 0,
  cam: { x: 0, y: 0, z: 0 },
  faces: [],
});
renderer.prepareCamera();
const crossing = renderer.poly(
  [
    [-1, -1, 0.2],
    [1, -1, 2],
    [1, 1, 2],
    [-1, 1, 0.2],
  ],
  "#fff",
  {},
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
);
assert.ok(crossing && crossing.ps.every((point) => point.depth >= 0.7));
assert.ok(
  crossing.uv.some((uv) => uv.x > 0 && uv.x < 1),
  "Interpolate UVs at the near plane",
);
assert.equal(
  renderer.poly(
    [
      [0, 0, -2],
      [1, 0, -2],
      [0, 1, -2],
    ],
    "#fff",
  ),
  undefined,
);
assert.equal(
  renderer.poly(
    [
      [100, 0, 2],
      [101, 0, 2],
      [100, 1, 2],
    ],
    "#fff",
  ),
  undefined,
);
console.log("Near-plane UV clipping and offscreen rejection: pass");
