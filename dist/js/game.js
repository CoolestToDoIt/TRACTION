import {
  buildTrack,
  LocalSession,
  resetCar,
  clamp,
  DIFFICULTIES,
  setTraction,
} from "./engine.js";
import { Renderer } from "./renderer.js";
import {
  assetUrl,
  readJson,
  loadCars,
  loadMap,
  importContent,
} from "./content.js";
const $ = (id) => document.getElementById(id),
  keys = new Set();
let state = "home",
  skin = 0,
  session,
  renderer,
  remaining = 3,
  accumulator = 0,
  last = 0,
  helpWasPaused = false;
let skins = [],
  trackCache = new Map(),
  difficulty = "cars",
  selectedId = "copper-canyon",
  registry,
  garageRenderer,
  previewCar,
  orbit = -0.7,
  drag = null,
  loadRequest = 0;
const formatTime = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
function hidePanels() {
  for (const id of [
    "menu",
    "garage-screen",
    "maps-screen",
    "loading-panel",
    "pause-panel",
    "results",
    "help-panel",
  ])
    $(id).classList.add("hidden");
}
function toggleTraction() {
  if (state === "racing")
    setTraction(session.cars[0], !session.cars[0].traction);
}
async function start() {
  const request = ++loadRequest;
  hidePanels();
  state = "loading";
  keys.clear();
  const info = registry.tracks.find((t) => t.id === selectedId);
  $("loading-panel").classList.remove("hidden");
  $("loading-name").textContent = info.name;
  $("loading-status").textContent = "Loading road and scenery.";
  $("loading-back").classList.add("hidden");
  try {
    let track = trackCache.get(selectedId);
    if (!track) {
      track = await loadMap(info.url);
      trackCache.set(selectedId, track);
    }
    if (request !== loadRequest || state !== "loading") return;
    session = new LocalSession(track, skins, difficulty);
    session.reset(skin);
    renderer = new Renderer($("view"), track);
    $("game").classList.toggle("night", track.environment?.type === "city");
    $("track-label").textContent = track.name.toUpperCase() + " · CIRCUIT";
    $("map-label").textContent = track.name.toUpperCase();
    hidePanels();
    state = "countdown";
    remaining = 3;
    accumulator = 0;
    $("countdown").textContent = "3";
  } catch (e) {
    if (request !== loadRequest) return;
    $("loading-status").textContent =
      "This circuit could not load. Choose it again to retry.";
    $("loading-back").classList.remove("hidden");
    console.error(e);
  }
}
function pause() {
  if (state === "racing" || state === "countdown") {
    state = state === "racing" ? "paused" : "paused-countdown";
    $("pause-panel").classList.remove("hidden");
    keys.clear();
  } else if (state.startsWith("paused")) resume();
}
function resume() {
  hidePanels();
  state = state === "paused-countdown" ? "countdown" : "racing";
}
function showScreen(next) {
  loadRequest++;
  hidePanels();
  state = next;
  keys.clear();
  $("countdown").textContent = "";
  $("game").classList.remove("night");
  $("track-label").textContent =
    next === "home"
      ? "ARCADE RACING"
      : next === "garage"
        ? "GARAGE"
        : "CIRCUIT SELECT";
  $(
    { home: "menu", garage: "garage-screen", maps: "maps-screen" }[next],
  ).classList.remove("hidden");
  previewCar.skin = skins[skin];
  previewCar.angle = 0;
  previewCar.y = previewCar.x = previewCar.z = 0;
}
function garage() {
  showScreen("garage");
}
function finish() {
  state = "finished";
  $("results").classList.remove("hidden");
  const ranking = session.ranking(),
    place = ranking.findIndex((c) => c.id === 0) + 1;
  $("result-title").textContent =
    place === 1
      ? "You took the win."
      : `${["", "1st", "2nd", "3rd", "4th", "5th", "6th"][place]} at the line.`;
  $("result-time").textContent =
    `${session.track.name} · ${DIFFICULTIES[difficulty].label} · ${formatTime(session.time)}`;
  $("standings").replaceChildren(
    ...ranking.map((c, i) => {
      const row = document.createElement("div");
      row.className = "finish-row" + (c.id === 0 ? " you" : "");
      const a = document.createElement("span"),
        b = document.createElement("span");
      a.textContent = `${i + 1}  ${c.name}`;
      b.textContent = c.finished ? formatTime(c.finishTime) : "Still racing";
      row.append(a, b);
      return row;
    }),
  );
  keys.clear();
}
function minimap() {
  const canvas = $("minimap"),
    ctx = canvas.getContext("2d"),
    pts = session.track.points,
    xs = pts.map((p) => p.x),
    zs = pts.map((p) => p.z),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs),
    scale = Math.min(145 / (maxX - minX), 120 / (maxZ - minZ)),
    convert = (p) => ({
      x: 90 + (p.x - (minX + maxX) / 2) * scale,
      y: 75 - (p.z - (minZ + maxZ) / 2) * scale,
    });
  ctx.clearRect(0, 0, 180, 150);
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#586655";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = convert(p);
    i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.stroke();
  for (const c of [...session.cars].reverse()) {
    const p = convert(c);
    ctx.beginPath();
    ctx.arc(p.x, p.y, c.id === 0 ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = c.id === 0 ? "#dfff72" : c.skin.body;
    ctx.fill();
    if (c.id === 0) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
function hud() {
  const c = session.cars[0],
    speed = Math.round(Math.hypot(c.vx, c.vz) * 3.6),
    position = session.ranking().findIndex((c) => c.id === 0) + 1;
  $("position").innerHTML = `${position}<span> / 6</span>`;
  $("lap").innerHTML =
    `${Math.min(c.lap + 1, session.track.laps)}<span> / ${session.track.laps}</span>`;
  $("time").textContent = formatTime(session.time);
  $("speed").textContent = speed;
  $("speedbar").style.width = clamp((speed / 367) * 100, 0, 100) + "%";
  $("grip").textContent =
    c.boostTime > 0
      ? "DRIFT BOOST"
      : c.traction
        ? "TRACTION ON"
        : "TRACTION OFF";
  $("grip").classList.toggle("boosting", c.boostTime > 0);
  $("chargebar").style.width = c.driftCharge + "%";
  $("charge-label").textContent =
    c.boostTime > 0
      ? "BOOST " + c.boostTime.toFixed(1) + "s"
      : c.driftCharge >= 20 && c.driftDuration >= 0.45
        ? "BOOST READY · TAP SPACE"
        : Math.round(c.driftCharge) + "% DRIFT CHARGE";
  $("grip").classList.toggle("off", !c.traction);
  $("slip").style.left = clamp(50 + c.slip * 60, 2, 98) + "%";
  $("tip").textContent = c.traction
    ? "SPACE TO RELEASE TRACTION"
    : Math.abs(c.slip) > 0.1
      ? "BALANCE THE DRIFT · BANK BOOST"
      : "SPACE TO REGAIN GRIP";
  minimap();
}
function frame(ms) {
  const dt = Math.min((ms - last) / 1000, 0.05) || 0.016;
  last = ms;
  if (state === "countdown") {
    remaining -= dt;
    $("countdown").textContent = remaining > 0 ? Math.ceil(remaining) : "GO";
    if (remaining < -0.65) {
      state = "racing";
      $("countdown").textContent = "";
    }
  }
  if (state === "racing") {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      session.step(
        {
          throttle:
            keys.has("KeyW") || keys.has("ArrowUp") || keys.has("throttle")
              ? 1
              : 0,
          brake:
            keys.has("KeyS") || keys.has("ArrowDown") || keys.has("brake")
              ? 1
              : 0,
          steer:
            (keys.has("KeyD") || keys.has("ArrowRight") || keys.has("right")
              ? 1
              : 0) -
            (keys.has("KeyA") || keys.has("ArrowLeft") || keys.has("left")
              ? 1
              : 0),
        },
        1 / 60,
      );
      accumulator -= 1 / 60;
      if (session.cars[0].finished) {
        finish();
        break;
      }
    }
  }
  $("game").dataset.state = state;
  if (["home", "garage", "maps", "loading"].includes(state)) {
    if (state === "garage") garageRenderer.renderGarage(previewCar, dt, orbit);
    else {
      renderer.renderGarage(previewCar, dt, -0.5);
    }
  } else {
    renderer.render(
      session,
      dt,
      false,
      state === "racing" && (keys.has("KeyC") || keys.has("lookback")),
    );
    hud();
  }
  requestAnimationFrame(frame);
}
window.addEventListener("keydown", (e) => {
  if (
    ["racing", "countdown"].includes(state) &&
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Space") toggleTraction();
  else if (e.code === "Escape" || e.code === "KeyP") {
    if (!$("help-panel").classList.contains("hidden")) closeHelp();
    else if (["home", "garage", "maps"].includes(state)) {
      if (state === "maps") garage();
      else if (state === "garage") showScreen("home");
    } else pause();
  } else if (e.code === "KeyR" && state === "racing")
    resetCar(session.cars[0], session.track);
  else keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  if (state === "racing" || state === "countdown") pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state === "racing" || state === "countdown")) pause();
});
function closeHelp() {
  $("help-panel").classList.add("hidden");
  if (helpWasPaused) {
    resume();
    helpWasPaused = false;
  }
}
$("help").onclick = () => {
  helpWasPaused = state === "racing" || state === "countdown";
  if (helpWasPaused) pause();
  $("help-panel").classList.remove("hidden");
};
$("close-help").onclick = closeHelp;
$("start").onclick = start;
$("again").onclick = start;
$("pause").onclick = pause;
$("resume").onclick = resume;
$("restart").onclick = start;
$("garage").onclick = garage;
$("result-garage").onclick = garage;
$("touch-drift").onclick = toggleTraction;
for (const button of document.querySelectorAll("[data-control]")) {
  button.onpointerdown = (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(button.dataset.control);
  };
  button.onpointerup =
    button.onpointercancel =
    button.onlostpointercapture =
      () => keys.delete(button.dataset.control);
}
function selectTrack(id) {
  selectedId = id;
  for (const button of $("tracks").children) {
    button.classList.toggle("selected", button.dataset.track === id);
    button.setAttribute("aria-pressed", String(button.dataset.track === id));
  }
  const info = registry.tracks.find((t) => t.id === id);
  $("start").textContent = "RACE " + info.name.toUpperCase();
  const icon = document.createElement("span");
  icon.textContent = "▶";
  $("start").append(icon);
}
$("play").onclick = garage;
$("home-garage").onclick = garage;
$("garage-home").onclick = () => showScreen("home");
$("choose-map").onclick = () => showScreen("maps");
$("maps-garage").onclick = garage;
$("loading-back").onclick = () => showScreen("maps");
$("rotate-left").onclick = () => (orbit -= 0.5);
$("rotate-right").onclick = () => (orbit += 0.5);
const preview = $("garage-view");
preview.onpointerdown = (e) => {
  preview.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX };
};
preview.onpointermove = (e) => {
  if (drag && drag.id === e.pointerId) {
    orbit += (e.clientX - drag.x) * 0.012;
    drag.x = e.clientX;
  }
};
preview.onpointerup = preview.onpointercancel = () => (drag = null);
function addTrackButton(info, index) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.track = info.id;
  b.setAttribute("aria-label", info.name + " circuit");
  const number = document.createElement("span");
  number.className = "track-number";
  number.textContent = "0" + (index + 1);
  const name = document.createElement("strong");
  name.textContent = info.name;
  const description = document.createElement("small");
  description.textContent = info.description;
  b.append(number, name, description);
  b.onclick = () => selectTrack(info.id);
  $("tracks").append(b);
}
function addCarButton(s, i) {
  const b = document.createElement("button");
  b.style.background = s.body;
  b.title = s.name;
  b.setAttribute("aria-label", s.name + " livery");
  b.classList.toggle("selected", i === skin);
  b.onclick = () => {
    skin = i;
    previewCar.skin = s;
    $("skin-name").textContent = s.name + " / Sedan";
    for (const [index, button] of [...$("skins").children].entries()) {
      button.classList.toggle("selected", index === i);
      button.setAttribute("aria-pressed", String(index === i));
    }
  };
  b.setAttribute("aria-pressed", String(i === skin));
  $("skins").append(b);
}
for (const kind of ["car", "map"]) {
  $("import-" + kind).onclick = () => $(kind + "-file").click();
  $(kind + "-file").onchange = async (e) => {
    const status = $(kind + "-status");
    try {
      const item = await importContent(e.target.files, kind);
      if (kind === "car") {
        if (skins.some((c) => c.id === item.id))
          throw Error("Choose a unique car id before importing.");
        skins.push(item);
        addCarButton(item, skins.length - 1);
        $("skins").lastElementChild.click();
      } else {
        if (registry.tracks.some((t) => t.id === item.id))
          throw Error("Choose a unique map id before importing.");
        const info = {
          id: item.id,
          name: item.name,
          description: item.description || "Custom circuit",
        };
        registry.tracks.push(info);
        trackCache.set(item.id, item);
        addTrackButton(info, registry.tracks.length - 1);
        selectTrack(item.id);
      }
      status.textContent = item.name + " imported. Available until you reload.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      e.target.value = "";
    }
  };
}
try {
  const [mapRegistry, loadedCars] = await Promise.all([
    readJson(assetUrl("maps/manifest.json")),
    loadCars(assetUrl("cars/manifest.json")),
  ]);
  registry = mapRegistry;
  skins = loadedCars;
  const floor = buildTrack({
    format: "traction.track",
    version: 1,
    laps: 3,
    roadWidth: 20,
    points: [
      [0, 0],
      [0, 100],
      [-100, 100],
      [-100, 0],
    ],
  });
  previewCar = {
    id: 0,
    skin: skins[skin],
    x: 0,
    y: 0,
    z: 0,
    angle: 0,
    pitch: 0,
    steerAngle: 0,
  };
  renderer = new Renderer($("view"), floor);
  garageRenderer = new Renderer($("garage-view"), floor);
  for (const [index, info] of registry.tracks.entries())
    addTrackButton(info, index);
  for (const [id, profile] of Object.entries(DIFFICULTIES)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = profile.label;
    const label = document.createElement("small");
    label.textContent = profile.level;
    b.append(label);
    b.dataset.difficulty = id;
    b.onclick = () => {
      difficulty = id;
      for (const button of $("difficulties").children) {
        button.classList.toggle("selected", button.dataset.difficulty === id);
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.difficulty === id),
        );
      }
    };
    b.classList.toggle("selected", id === difficulty);
    b.setAttribute("aria-pressed", String(id === difficulty));
    $("difficulties").append(b);
  }
  selectTrack(registry.tracks[0].id);
  for (const [i, s] of skins.entries()) addCarButton(s, i);
  showScreen("home");
  $("start").disabled = $("play").disabled = $("home-garage").disabled = false;
  requestAnimationFrame(frame);
} catch (e) {
  $("error").classList.remove("hidden");
  $("error").textContent =
    "The garage could not load. Refresh to try again. " + e.message;
  console.error(e);
}
