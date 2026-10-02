# Add a car or circuit

No build tools or 3D modeling software are required. Copy a template in `dist/templates`, edit it in a text editor, and import it from the game. The same loaders handle built-in and custom content. Invalid files display a helpful message.

## Try a file immediately

- **Car:** Garage → **Import car file**. Choose one `.car.json`, together with its optional PNG/JPEG/WebP texture using multi-select. The garage selects and previews it immediately.
- **Map:** Circuit select → **Import map file**. Choose one `.track.json`, together with its optional panorama image. Select difficulty and race.

Imports remain available until the page reloads. They stay in your browser; they are not uploaded to a server. Give each file a unique id. JSON must be under 1 MB and each image under 8 MB.

## Car file

Copy `dist/templates/example.car.json`. Required fields: `format: "traction.car"`, `version: 1`, unique `id`, `name`, and `body`/`accent` colors in `#RRGGBB` format. Optional `texture: "my-livery.png"` names an image beside the JSON. A 64×128 PNG works well; the texture runs over the hood. Optional `dimensions` are meters: width 1–3, length 2–6, height 0.7–2.5. The model stays a rounded sedan, with the chosen dimensions and livery. All cars share handling; this format does not import arbitrary 3D meshes.

To install permanently: copy the JSON and image into `dist/cars/` and add `{"url":"my-sedan.car.json"}` to the `cars` array in `dist/cars/manifest.json`. Image paths resolve relative to the car JSON. Existing legacy `skins` registries remain supported.

## Map file

Copy `dist/templates/example.track.json`. Required: `format: "traction.track"`, `version: 1`, `id`, `name`, `laps` (1–20), `roadWidth` (greater than 6, at most 100), and 4–2000 `points`. Each point is `[x,z,height]` in meters; height is optional and defaults to zero. Coordinates must be within ±20,000 m. The loader creates a smooth closed loop through the points, interpolates elevation, and creates road chunks and checkpoint gates. The final point automatically connects to the first; do not repeat the first point.

Start with widely spaced points, smooth elevation changes, and enough clearance for the entire road. Hairpins need room for neighboring lanes and terrain. Check the minimap and drive a lap after each edit. Crossed or overlapping roads are not supported; there are no bridges/tunnels or independent overlapping collision surfaces.

`environment.type` may be `desert`, `grassland`, or `city`. Colors include `sky`, `horizon`, `ground`, `road`, `shoulder`, `curb`, `lane`, `terrainNear`, and `terrainFar`. Optional `environment.background: "my-panorama.png"` uses a wide pixel drawing that wraps around the camera. Use ~3:1 aspect ratio, a horizon around 76% of image height and matching left/right edges. Images are cached across races; adjacent copies are mirrored to hide edge seams. no distant 3D mountains are drawn. Nearby road terrain remains 3D. Optional `drawDistance` (100–1000 meters) defaults to 420; Sunstone Pass uses 650. `terrainWidth` (10–200 meters) changes the nearby terrain skirt. Roads are limited to 50,000 generated samples (roughly 200 km) to keep loading bounded.

City `buildings` are low-poly foreground collision objects with `x`, `z`, `width`, `depth`, `height`, and `style` (0–3). Keep the building footprint clear of the road and its shoulders. They sit at ground height zero, so use them on flat city sections.

To install permanently: copy the JSON into `dist/maps/`, place the optional panorama beside it, then add `{"id":"my-circuit","name":"My Circuit","url":"maps/my-circuit.track.json","description":"Your description"}` to the `tracks` array in `dist/maps/manifest.json`. Registry map paths are relative to the game root. Panorama paths are relative to the map JSON. Only the selected map loads. Built-in backgrounds live in `dist/backgrounds/`.

## Run and host

Run `python3 -m http.server 8000 --directory dist` from the project folder. Open http://localhost:8000. Replacing a JSON/PNG requires only a browser refresh, with no compile step. On a hosted copy, push changed files and let your hosting workflow redeploy.

For GitHub Pages: upload all extracted source files (including `.github/workflows/pages.yml`) to a repository on its `main` branch. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. Run the included workflow manually from Actions for the first deployment if needed. It publishes `dist` without a build. Use a public repository for GitHub Free. If your default branch has another name, update the workflow branch. Assets work both at a domain root and under `/repository-name/`.

GitHub Pages serves the single-player game and its static content. Future multiplayer would need a separate service for its game server.
