import { buildTrack } from "./engine.js";
export const SITE_ROOT = new URL("../", import.meta.url);
// Leading slashes in older manifests mean the game root, including on Pages.
export function assetUrl(path, base = SITE_ROOT) {
  if (!path) return null;
  if (path.startsWith("blob:")) return path;
  return new URL(
    path.startsWith("/") ? path.slice(1) : path,
    path.startsWith("/") ? SITE_ROOT : base,
  ).href;
}
export async function readJson(url) {
  const r = await fetch(url);
  if (!r.ok)
    throw Error("Could not load " + new URL(url).pathname.split("/").pop());
  return r.json();
}
export function validateCar(data) {
  if (
    data.format !== "traction.car" ||
    data.version !== 1 ||
    !/^[-a-z0-9_]{1,64}$/i.test(data.id || "") ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 80 ||
    !/^#[0-9a-f]{6}$/i.test(data.body || "") ||
    !/^#[0-9a-f]{6}$/i.test(data.accent || "")
  )
    throw Error(
      "Use a version 1 traction.car file with id, name and #RRGGBB body/accent colors.",
    );
  if (data.texture != null && typeof data.texture !== "string")
    throw Error("Texture must be a filename.");
  const dimensions = {
    width: 1.78,
    length: 4.23,
    height: 1.28,
    ...data.dimensions,
  };
  for (const [key, min, max] of [
    ["width", 1, 3],
    ["length", 2, 6],
    ["height", 0.7, 2.5],
  ])
    if (
      !Number.isFinite(dimensions[key]) ||
      dimensions[key] < min ||
      dimensions[key] > max
    )
      throw Error(key + " is outside the supported car size.");
  return { ...data, dimensions };
}
export async function loadCars(url) {
  const manifest = await readJson(url);
  if (manifest.format !== "traction.cars" || manifest.version !== 1)
    throw Error("Unsupported car registry");
  if (manifest.cars?.length)
    return Promise.all(
      manifest.cars.map(async (entry) => {
        const file = assetUrl(entry.url, url);
        const car = validateCar(await readJson(file));
        return { ...car, texture: assetUrl(car.texture, file) };
      }),
    );
  if (manifest.skins?.length)
    return manifest.skins.map((s) => ({
      ...validateCar({ ...s, format: "traction.car", version: 1 }),
      texture: assetUrl(s.texture, url),
    }));
  throw Error("Car registry is empty");
}
export function validateMap(data) {
  if (
    !data ||
    !/^[-a-z0-9_]{1,64}$/i.test(data.id || "") ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 80
  )
    throw Error("A map needs a unique id and a name.");
  if (
    data.drawDistance != null &&
    (!Number.isFinite(data.drawDistance) ||
      data.drawDistance < 100 ||
      data.drawDistance > 1000)
  )
    throw Error("Draw distance must be 100–1000 meters.");
  if (
    data.terrainWidth != null &&
    (!Number.isFinite(data.terrainWidth) ||
      data.terrainWidth < 10 ||
      data.terrainWidth > 200)
  )
    throw Error("Terrain width must be 10–200 meters.");
  if (
    data.buildings != null &&
    (!Array.isArray(data.buildings) ||
      data.buildings.length > 500 ||
      !data.buildings.every(
        (b) =>
          b &&
          ["x", "z", "width", "depth", "height"].every((k) =>
            Number.isFinite(b[k]),
          ) &&
          b.width > 0 &&
          b.depth > 0 &&
          b.height > 0 &&
          b.width <= 200 &&
          b.depth <= 200 &&
          b.height <= 300 &&
          Number.isInteger(b.style) &&
          b.style >= 0 &&
          b.style <= 3,
      ))
  )
    throw Error("Use at most 500 buildings with valid sizes and style 0–3.");
  if (
    data.environment?.background != null &&
    typeof data.environment.background !== "string"
  )
    throw Error("Background must be an image filename.");
  return data;
}
export async function loadMap(url) {
  const file = assetUrl(url),
    data = validateMap(await readJson(file));
  if (data.environment?.background)
    data.environment.background = assetUrl(data.environment.background, file);
  return buildTrack(data);
}
function attachedAsset(path, files) {
  if (!path) return null;
  const filename = path.split("/").pop();
  const file = files.find((f) => f.name === filename);
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type))
    throw Error("Select " + filename + " together with the JSON file.");
  return URL.createObjectURL(file);
}
export async function importContent(files, kind) {
  files = Array.from(files);
  const json = files.filter((f) => f.name.endsWith(".json"));
  if (json.length !== 1)
    throw Error("Choose one JSON file and its optional image together.");
  if (json[0].size > 1024 * 1024 || files.some((f) => f.size > 8 * 1024 * 1024))
    throw Error("Use JSON under 1 MB and images under 8 MB.");
  const data = JSON.parse(await json[0].text());
  if (kind === "car") {
    const car = validateCar(data);
    return { ...car, texture: attachedAsset(car.texture, files) };
  }
  const track = buildTrack(validateMap(data));
  track.environment = {
    ...data.environment,
    background: attachedAsset(data.environment?.background, files),
  };
  return track;
}
