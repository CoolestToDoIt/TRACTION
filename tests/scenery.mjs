import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTrack, nearest } from "../dist/js/engine.js";
import { createScenery, drawStructure } from "../dist/js/scenery.js";

const circuits = [
  "copper-canyon",
  "midnight-metro",
  "sunstone-pass",
  "meadow-run",
];
for (const id of circuits) {
  const data = JSON.parse(
    await readFile(new URL(`../dist/maps/${id}.json`, import.meta.url)),
  );
  const track = buildTrack(data);
  const structures = createScenery(track);
  assert.ok(structures.length >= 5, `${id} needs visible roadside scenery`);
  assert.ok(
    structures.length < track.length / 180,
    "Scenery should remain sparse",
  );
  assert.ok(
    new Set(structures.map((item) => item.height)).size >= 3,
    "Vary structure dimensions",
  );
  assert.ok(
    new Set(structures.map((item) => item.color)).size >= 2,
    "Vary structure colors",
  );
  assert.deepEqual(
    structures,
    createScenery(track),
    "Placement must remain stable between races",
  );
  const faces = [];
  let boxCount = 0;
  const renderer = {
    poly(vertices) {
      faces.push(vertices);
    },
    box(...dimensions) {
      boxCount++;
      assert.ok(dimensions.slice(0, 7).every(Number.isFinite));
    },
    shade(color) {
      return color;
    },
  };
  for (const structure of structures) {
    const radius = Math.hypot(structure.width, structure.depth) / 2;
    assert.ok(
      nearest(track, structure.x, structure.z).distance >=
        track.roadWidth / 2 + radius + 5,
    );
    drawStructure(renderer, structure);
  }
  assert.ok(faces.length + boxCount > structures.length);
  assert.ok(faces.flat(2).every(Number.isFinite));
  assert.deepEqual(createScenery({ ...track, id: "custom-track" }), []);
  console.log(
    `${id}: ${structures.length} structures, road clearance and finite geometry verified`,
  );
}
