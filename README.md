# TRACTION
Lightweight, dependency-free browser racing prototype. Close chase-camera 3D projection using Canvas 2D, pixel-textured car sprites, speed-responsive motion lines, a fixed 60 Hz simulation, four selectable circuits (Copper Canyon, Midnight Metro, Sunstone Pass, and Meadow Run), smaller sedan bodies, five CPU drivers, three laps, keyboard and touch controls.

## Run locally
Serve `dist` with any static HTTP server, for example `python3 -m http.server 8000 --directory dist`, then open http://localhost:8000. HTTP serving is required for JSON and ES module loading. No installation or build step.

## Controls
W/Up accelerate, S/Down brake/reverse, A/D or Left/Right steer. Space toggles traction control on press (not on release). Front tire grip stays active when traction is off, while rear tire grip is reduced. Steering has a fast front-end response and yaw inertia; counter-steering catches the rear swing. Steer into the corner with traction off, then counter-steer to stabilize the slide. Hold a controlled drift in a real corner to build charge. Restoring grip with Space banks charge into an automatic exit boost while accelerating. P/Escape pause, R resets to the nearest track point. Touch buttons support simultaneous steering and acceleration.

## Circuits and CPU difficulty
The main Play screen leads to a separate garage. Rotate the car by dragging the preview or using its rotation buttons and select a livery. Continue to the separate circuit selection screen, select CPU difficulty, and start the race. The selected map loads on demand before the countdown; repeat races use its cached geometry. Pause/results can return to the garage, and the garage links back to the main menu. Copper Canyon is the 3 km elevated daytime map. Midnight Metro is a 2.9 km nighttime street circuit with tighter turns, lit buildings, sidewalks and streetlights. Building footprints block cars. Sunstone Pass is a roughly 6 km desert/mountain circuit: long open straights first, a climb of over 200 m, and four late 180-degree switchbacks that climb and descend the mountain. Meadow Run is a rolling grasslands circuit with a 38 m road, exactly double the 19 m road in Sunstone Pass.

Golf Carts = Easy, Cars = Medium, Speed Demons = Hard. Difficulty changes CPU target speed, corner caution, steering response and braking. Player handling is identical on all difficulties. Medium and Hard CPUs also drift and bank boosts using the same rules as the player. No rubber-banding or teleporting.

## Modding cars and maps
Use the import buttons in the garage and circuit selection screen to try JSON content and optional images locally. For permanent installation, register standalone `.car.json` files in `dist/cars/manifest.json` and `.track.json` files in `dist/maps/manifest.json`. Editable templates are in `dist/templates`. See [MODDING.md](MODDING.md) for complete file formats, relative image paths, dimensions, elevation, panoramas and hosting instructions.

## Architecture and multiplayer path
- `engine.js`: pure simulation, track loader, CPU input, checkpoint progression, local race session.
- `renderer.js`: close chase-camera projection, clipped road textures, rounded pixel car sprites, skid marks, and speed-sensitive motion lines. Motion lines respect reduced-motion preferences. Near-plane clipping interpolates texture coordinates instead of dropping polygons.
- `game.js`: inputs, fixed-step accumulator, UI and race state.

`LocalSession.step(input, dt)` keeps control input separate from rendering and simulation. Future multiplayer should implement a session adapter, a server-authoritative fixed-step simulation, tick-numbered input packets, and interpolated snapshots. Add server-validated laps and client reconciliation before enabling competitive play. This version has no network transport or multiplayer server; the architecture is ready to extend, not a multiplayer implementation. Physics are original arcade physics inspired by toggleable grip, not a reproduction of Rocket Racing physics. There are no jumps, aerial drifting, or car damage. Racers do not collide with each other in this initial version.

## Validation
Run `npm test` (Node.js required; no npm install needed). Checks cover drift slip, counter-steer recovery, restoring traction, CPU race completion, finite car state, preventing an idle driver from completing laps, legacy flat maps, elevation, gravity and section culling. Circuit tests cover all twelve map/difficulty combinations, verify increasing CPU pace, unchanged player handling, building clearance and collisions. Browser/device feel still needs hands-on playtesting.

## Core drift loop
Traction-on turns scrub speed and have more understeer at high speeds. Traction-off keeps nose grip with a loose rear. Counter-steer to balance the slide and maintain momentum. Valid drift charge requires forward speed above 22 m/s, a slip angle between 0.10 and 0.80 radians, staying inside 90% of road width, and drifting with the direction of a real road bend. Straight-line weaving grants no charge.

After at least 0.45 seconds of valid drifting and 20 charge, restoring traction grants an automatic boost capped at 3 seconds. Traction-on base acceleration is 29 m/s²; traction-off acceleration is 25 m/s². Grip accelerates faster on straights, while high-speed grip turns scrub speed and controlled drifts earn an exit advantage. Boost adds acceleration while on the gas and raises the traction-on speed cap from 78 to 102 m/s. Traction-off uses a 15% lower cap: 66.3 m/s normally and 86.7 m/s during an existing boost. Total world velocity is limited, so lateral motion cannot bypass the cap. Change `TRACTION_OFF_SPEED_FACTOR` in `engine.js` to tune this percentage. Off-road excursions, spinouts, resets, and building impacts clear charge; off-road and building impacts also cancel boost. Empty toggles grant nothing. The HUD shows charge, boost readiness and remaining boost time.

`tests/drifting.mjs` compares the same CPU driving strategy with drifting enabled versus grip-only. The current balance is roughly 6–8% faster over three laps on the canyon and city circuits, with repeated earned boosts. It also checks anti-farming and reset behavior. This is simulation evidence; player feel and competitive balance still need playtesting.

## Where to edit
- Handling, drift rewards, CPU levels: `dist/js/engine.js`
- Pixel car sprites, scenery, camera and effects: `dist/js/renderer.js`
- Input, menu and HUD: `dist/js/game.js`
- Menu structure and styling: `dist/index.html`, `dist/style.css`
- Map registry and files: `dist/maps/`
- Car skin registry and PNG liveries: `dist/cars/`

The downloadable source ZIP contains these files, tests, and this guide. It excludes hosting-specific metadata and source-control internals, so it can be run independently with any static HTTP server.

`tests/mountain.mjs` validates the open start, mountain elevation, four late heading reversals and the traction-on launch advantage. The menu transitions and lazy loading were smoke-tested against the actual game module; hands-on browser playtesting remains useful.

## Road texture continuity
Road UV coordinates now use physical arc length at 8 texels per meter, instead of restarting the entire texture on each segment. A repeated 128×128 asphalt tile maintains consistent scale across curves and climbs. Adaptive perspective subdivision reduces affine stretching close to the camera; smooth sampling and lower-contrast grain reduce shimmer. The mountain's draw distance is 650 m to reduce distant section popping. Pixel car textures retain their existing crisp sampling.

`tests/grasslands.mjs` checks the double road width and the 15% traction-off speed cap, including boosted and lateral-motion cases.

## Pixel horizon, look-back and file imports
Distant mountains and the city skyline are cached pixel-art panoramas that scroll with camera yaw and shift with camera pitch. Nearby buildings, roadside posts and road terrain remain low-poly geometry. This removes the former 450 distant mountain faces per frame; actual performance depends on the device and nearby road geometry.

Hold **C** or the **LOOK BACK** button to look behind. Release it to return to the close chase camera. Steering and simulation continue normally. Traction-off still has a 15% lower maximum speed, but excess speed now falls by at least 12 m/s² instead of being cut instantly (roughly one second from 78 to 66.3 m/s). Braking, steering and terrain can slow the car faster. Boost expiry also uses this gradual cap transition. World velocity converges to the cap even with throttle held.

Cars now use individual `.car.json` files registered in `dist/cars/manifest.json`; optional dimensions change the rounded sedan size. Garage and circuit select include local file import buttons. See **[MODDING.md](MODDING.md)** for templates, image selection, validation, permanent installation and GitHub Pages instructions. The included `.github/workflows/pages.yml` publishes `dist` on pushes to `main`, after selecting GitHub Actions as the Pages source. No dependency installation or build is needed.

## Readable source and foreground scenery

JavaScript, HTML, CSS, and tests use expanded formatting for easier editing. `dist/js/scenery.js` defines deterministic roadside scenery for the four default tracks: faceted sandstone formations in Copper Canyon, neon-roof kiosks in Midnight Metro, mountain huts in Sunstone Pass, and pitched-roof barns in Meadow Run. Props follow road elevation, stay clear of nearby road sections and city buildings, and use the existing near-plane clipping and depth sorting. They are decorative and do not add physics obstacles. Custom tracks keep their existing scenery behavior. Tune dimensions, colors, and spacing in `scenery.js`; `tests/scenery.mjs` checks placement and geometry.
