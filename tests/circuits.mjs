import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildTrack,
  LocalSession,
  DIFFICULTIES,
  createCar,
  stepCar,
  nearest,
} from "../dist/js/engine.js";
const read = (path) =>
  JSON.parse(fs.readFileSync(new URL("../dist/" + path, import.meta.url)));
const skins = read("cars/manifest.json").cars.map((e) => read("cars/" + e.url)),
  registry = read("maps/manifest.json");
assert.equal(registry.tracks.length, 4);
const results = {};
for (const info of registry.tracks) {
  const track = buildTrack(read(info.url.slice(1)));
  results[info.id] = {};
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const session = new LocalSession(track, skins, difficulty);
    for (
      let i = 0;
      i < 800 * 60 && !session.cars.slice(1).every((c) => c.finished);
      i++
    )
      session.step({}, 1 / 60);
    assert(
      session.cars.slice(1).every((c) => c.finished),
      info.id + " " + difficulty + " CPUs must finish",
    );
    assert(
      session.cars.every((c) =>
        [c.x, c.y, c.z, c.vx, c.vz].every(Number.isFinite),
      ),
    );
    results[info.id][difficulty] =
      session.cars.slice(1).reduce((sum, c) => sum + c.finishTime, 0) / 5;
  }
  assert(
    results[info.id]["golf-carts"] > results[info.id].cars &&
      results[info.id].cars > results[info.id]["speed-demons"],
    "Difficulty must increase CPU pace",
  );
  const easy = new LocalSession(track, skins, "golf-carts"),
    hard = new LocalSession(track, skins, "speed-demons");
  for (let i = 0; i < 120; i++) {
    const input = { throttle: 1, steer: i > 60 ? 0.3 : 0 };
    easy.step(input, 1 / 60);
    hard.step(input, 1 / 60);
  }
  assert.equal(easy.cars[0].x, hard.cars[0].x);
  assert.equal(easy.cars[0].z, hard.cars[0].z);
}
const city = buildTrack(read("maps/midnight-metro.json"));
assert(city.buildings.length > 30);
for (const b of city.buildings)
  assert(
    nearest(city, b.x, b.z).distance >
      Math.hypot(b.width, b.depth) / 2 + city.roadWidth / 2,
    "Buildings must leave the racing surface clear",
  );
const b = city.buildings[0],
  car = createCar(city, 0, skins[0]);
car.x = b.x;
car.z = b.z;
stepCar(car, {}, city, 1 / 60);
assert(
  Math.abs(car.x - b.x) >= b.width / 2 + 0.84 ||
    Math.abs(car.z - b.z) >= b.depth / 2 + 0.84,
  "Building collision should eject car from footprint",
);
console.log(
  "Four maps × three difficulties: CPU completion, ordered difficulty, unchanged player handling and building collisions pass.",
);
console.log(JSON.stringify(results));
