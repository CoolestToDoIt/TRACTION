import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assetUrl,
  loadCars,
  loadMap,
  importContent,
  validateCar,
} from "../dist/js/content.js";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => ({
  ok: fs.existsSync(new URL(url)),
  json: async () => JSON.parse(fs.readFileSync(new URL(url))),
});
const cars = await loadCars(assetUrl("cars/manifest.json"));
assert.equal(cars.length, 4);
assert(cars.every((c) => fs.existsSync(new URL(c.texture))));
assert.equal(
  assetUrl("/maps/test.json", "https://example.com/repo/maps/manifest.json"),
  assetUrl("maps/test.json"),
);
assert.equal(
  assetUrl(
    "../backgrounds/desert.png",
    "https://example.com/repo/maps/track.json",
  ),
  "https://example.com/repo/backgrounds/desert.png",
);
assert.equal(
  assetUrl("livery.png", "https://example.com/repo/cars/my.car.json"),
  "https://example.com/repo/cars/livery.png",
);
const track = await loadMap("maps/sunstone-pass.json");
assert(fs.existsSync(new URL(track.environment.background)));
assert(track.points.length > 1000);
for (const kind of ["car", "track"]) {
  const template = fs.readFileSync(
    new URL("../dist/templates/example." + kind + ".json", import.meta.url),
    "utf8",
  );
  const result = await importContent(
    [
      {
        name: "custom.json",
        size: template.length,
        text: async () => template,
      },
    ],
    kind === "car" ? "car" : "map",
  );
  assert(result.name.startsWith("My"));
}
assert.throws(
  () => validateCar({ ...cars[0], dimensions: { width: -1 } }),
  /width/,
);
assert.throws(() => validateCar({ ...cars[0], body: "red" }), /#RRGGBB/);
await assert.rejects(
  importContent(
    [
      {
        name: "custom.json",
        size: 100,
        text: async () =>
          JSON.stringify({ ...cars[0], texture: "missing.png" }),
      },
    ],
    "car",
  ),
  /Select missing.png/,
);
await assert.rejects(
  importContent(
    [{ name: "custom.json", size: 100, text: async () => "{" }],
    "map",
  ),
);
globalThis.fetch = originalFetch;
console.log(
  "Standalone car files, templates/imports, validation, panorama loading and repository-relative paths: pass",
);
