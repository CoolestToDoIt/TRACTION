import { sampleCentripetal, sampleElevation } from "./track-curves.js";
import { buildTerrain, surfaceHeight, insideTerrain } from "./terrain.js";

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TRACTION_OFF_SPEED_FACTOR = 0.85;
export const speedLimit = (car) =>
  (car.boostTime > 0 ? 102 : 78) *
  (car.traction ? 1 : TRACTION_OFF_SPEED_FACTOR);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export async function loadTrack(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error("Could not load track");
  return buildTrack(await r.json());
}
export function buildTrack(data) {
  if (
    data.format !== "traction.track" ||
    data.version !== 1 ||
    !Array.isArray(data.points) ||
    data.points.length < 4 ||
    data.points.length > 2000 ||
    !data.points.every(
      (p) =>
        Array.isArray(p) &&
        (p.length === 2 || p.length === 3) &&
        p.every((v) => Number.isFinite(v) && Math.abs(v) <= 20000),
    ) ||
    !(data.roadWidth > 6 && data.roadWidth <= 100) ||
    !Number.isInteger(data.laps) ||
    data.laps < 1 ||
    data.laps > 20
  )
    throw Error("Unsupported track file");
  const points = [],
    n = data.points.length;
  const curveSpans = [];
  const control = data.points.map((p) => [p[0], p[1], p[2] ?? 0]);
  for (let i = 0; i < n; i++) {
    const spanStart = points.length;
    const samples = Math.max(
      12,
      Math.ceil(
        Math.hypot(
          control[(i + 1) % n][0] - control[i][0],
          control[(i + 1) % n][1] - control[i][1],
        ) / 4,
      ),
    );
    if (points.length + samples > 50000)
      throw Error("Map is too large; keep the road under about 200 km.");
    for (let j = 0; j < samples; j++) {
      const t = j / samples,
        a = control[(i - 1 + n) % n],
        b = control[i],
        c = control[(i + 1) % n],
        d = control[(i + 2) % n];
      const s = (k) =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t);
      if (data.interpolation === "centripetal") {
        const curve = sampleCentripetal(control, i, t);
        points.push({
          x: curve[0],
          z: curve[1],
          y: control[i][2],
        });
      } else points.push({ x: s(0), z: s(1), y: s(2) });
    }
    if (data.interpolation === "centripetal") {
      let horizontalLength = 0;
      for (let index = spanStart; index < points.length; index++) {
        const point = points[index];
        point.curveDistance = horizontalLength;
        const next = points[index + 1] || {
          x: control[(i + 1) % n][0],
          z: control[(i + 1) % n][1],
        };
        horizontalLength += Math.hypot(next.x - point.x, next.z - point.z);
      }
      curveSpans.push({
        start: spanStart,
        end: points.length,
        length: Math.max(horizontalLength, 0.001),
      });
    }
  }
  if (curveSpans.length) {
    const spanLengths = curveSpans.map((span) => span.length);
    curveSpans.forEach((span, index) => {
      for (let i = span.start; i < span.end; i++) {
        points[i].y = sampleElevation(
          control,
          index,
          points[i].curveDistance / span.length,
          spanLengths,
        );
        delete points[i].curveDistance;
      }
    });
  }
  let length = 0;
  const grid = new Map();
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length],
      horizontal = Math.hypot(next.x - p.x, next.z - p.z);
    p.angle = Math.atan2(next.x - p.x, next.z - p.z);
    p.grade = (next.y - p.y) / Math.max(horizontal, 0.001);
    p.nx = Math.cos(p.angle);
    p.nz = -Math.sin(p.angle);
    p.s = length;
    length += Math.hypot(horizontal, next.y - p.y);
    const key = Math.floor(p.x / 64) + "," + Math.floor(p.z / 64);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  const chunks = [];
  for (let start = 0; start < points.length; start += 24) {
    const end = Math.min(start + 24, points.length),
      list = points.slice(start, end),
      x = list.reduce((s, p) => s + p.x, 0) / list.length,
      z = list.reduce((s, p) => s + p.z, 0) / list.length,
      radius = Math.max(...list.map((p) => Math.hypot(p.x - x, p.z - z))) + 5;
    chunks.push({ start, end, x, z, radius });
  }
  const track = { ...data, points, length, grid, chunks };
  track.terrain = buildTerrain(track, nearest);
  return track;
}
export function nearest(track, x, z) {
  let candidates = [];
  const gx = Math.floor(x / 64),
    gz = Math.floor(z / 64);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      candidates.push(...(track.grid.get(gx + dx + "," + (gz + dz)) || []));
  if (!candidates.length) candidates = track.points.map((_, i) => i);
  let best = Infinity,
    index = 0;
  for (const i of candidates) {
    const p = track.points[i],
      d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  let result = {
    index,
    distance: Math.sqrt(best),
    point: track.points[index],
    height: track.points[index].y,
    grade: track.points[index].grade,
    x: track.points[index].x,
    z: track.points[index].z,
  };
  for (const i of [
    (index - 1 + track.points.length) % track.points.length,
    index,
  ]) {
    const a = track.points[i],
      b = track.points[(i + 1) % track.points.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1),
      distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (distance <= result.distance) {
      result = {
        index,
        distance,
        point: track.points[index],
        height: a.y + (b.y - a.y) * t,
        grade: a.grade,
        x: a.x + dx * t,
        z: a.z + dz * t,
      };
    }
  }
  return result;
}
export function createCar(track, id, skin) {
  const p = track.points[0],
    row = Math.floor(id / 2);
  return {
    id,
    skin,
    name: id === 0 ? "YOU" : ["Rook", "Vega", "Blitz", "Juno", "Echo"][id - 1],
    x: p.x + p.nx * (id % 2 ? 4 : -4) - Math.sin(p.angle) * (row * 7 + 6),
    z: p.z + p.nz * (id % 2 ? 4 : -4) - Math.cos(p.angle) * (row * 7 + 6),
    y: p.y,
    pitch: Math.atan(p.grade),
    angle: p.angle,
    vx: 0,
    vz: 0,
    yawRate: 0,
    steerAngle: 0,
    traction: true,
    driftCharge: 0,
    driftDuration: 0,
    boostTime: 0,
    boostsEarned: 0,
    toggleCooldown: 0,
    slip: 0,
    progress: 0,
    index: 0,
    lap: 0,
    nextGate: 1,
    finished: false,
    finishTime: 0,
  };
}
export function setTraction(car, enabled) {
  if (car.traction === enabled) return;
  car.traction = enabled;
  car.toggleCooldown = 0.8;
  if (enabled) {
    if (car.driftCharge >= 20 && car.driftDuration >= 0.45) {
      car.boostTime = Math.min(
        3,
        car.boostTime + 1.2 + car.driftCharge * 0.022,
      );
      car.boostsEarned++;
    }
    car.driftCharge = 0;
    car.driftDuration = 0;
  }
}
export function trackBend(track, index) {
  const a = track.points[index],
    b = track.points[(index + 5) % track.points.length];
  return (
    wrap(b.angle - a.angle) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z))
  );
}
// Same fixed-step simulation for player, AI, and future network input streams.
export function stepCar(car, input, track, dt) {
  const previousSpeed = Math.hypot(car.vx, car.vz),
    near = nearest(track, car.x, car.z),
    fx = Math.sin(car.angle),
    fz = Math.cos(car.angle),
    rx = Math.cos(car.angle),
    rz = -Math.sin(car.angle);
  let forward = car.vx * fx + car.vz * fz,
    lateral = car.vx * rx + car.vz * rz;
  const offroad = near.distance > track.roadWidth * 0.52,
    speed = Math.abs(forward);
  const steering =
    clamp(input.steer || 0, -1, 1) * (0.41 - 0.14 * clamp(speed / 74, 0, 1));
  car.steerAngle += (steering - car.steerAngle) * (1 - Math.exp(-12 * dt));
  // Front/rear tire forces are independent: grip remains at the nose when the rear is released.
  const denom = Math.max(speed, 7),
    direction = forward < -0.5 ? -1 : 1;
  const frontSlip =
    Math.atan2(lateral + car.yawRate * 1.18, denom) -
    car.steerAngle * direction;
  const rearSlip = Math.atan2(lateral - car.yawRate * 1.25, denom);
  const frontForce = clamp(-frontSlip * 105, -27, 27) * (offroad ? 0.65 : 1);
  const rearForce =
    clamp(
      -rearSlip * (car.traction ? 112 : 23),
      car.traction ? -27 : -7,
      car.traction ? 27 : 7,
    ) * (offroad ? 0.65 : 1);
  const tireLoad = clamp(speed / 8, 0, 1);
  lateral += (frontForce + rearForce) * tireLoad * dt;
  car.boostTime = Math.max(0, car.boostTime - dt);
  car.toggleCooldown = Math.max(0, car.toggleCooldown - dt);
  const turnGrip =
    (offroad ? 0.65 : 1) *
    (car.traction ? clamp(1 - (speed - 30) / 90, 0.55, 1) : 1);
  const targetYaw =
    clamp(input.steer || 0, -1, 1) *
      clamp(speed / 16, 0, 1) *
      (car.traction ? 1.7 : 2.55) *
      direction *
      turnGrip +
    (car.traction ? 0 : clamp(-lateral * 0.022, -0.4, 0.4));
  car.yawRate += (targetYaw - car.yawRate) * (1 - Math.exp(-11 * dt));
  car.yawRate *= Math.exp(-(speed < 3 ? 8 : 0.1) * dt);
  forward +=
    ((input.throttle || 0) * (car.traction ? 29 : 25) -
      (input.brake || 0) * (forward > 1 ? 38 : 12) -
      forward * (offroad ? 1.05 : 0.27) -
      9.81 * near.grade -
      (car.traction ? Math.abs(input.steer || 0) * speed * 0.75 : 0) +
      (car.boostTime > 0 && !offroad && input.throttle ? 44 : 0)) *
    dt;
  forward = clamp(
    forward,
    -12,
    Math.max(
      offroad ? 35 : speedLimit(car),
      previousSpeed - (offroad ? 24 : 12) * dt,
    ),
  );
  lateral *= Math.exp(-(offroad ? 1.8 : car.traction ? 0.9 : 0.25) * dt);
  const delta = car.yawRate * dt,
    oldForward = forward;
  car.angle = wrap(car.angle + delta);
  forward = oldForward * Math.cos(delta) + lateral * Math.sin(delta);
  lateral = lateral * Math.cos(delta) - oldForward * Math.sin(delta);
  const nfx = Math.sin(car.angle),
    nfz = Math.cos(car.angle);
  car.vx = nfx * forward + Math.cos(car.angle) * lateral;
  car.vz = nfz * forward - Math.sin(car.angle) * lateral;
  const velocity = Math.hypot(car.vx, car.vz),
    cap = Math.max(
      offroad ? 35 : speedLimit(car),
      previousSpeed - (offroad ? 24 : 12) * dt,
    );
  if (velocity > cap) {
    car.vx *= cap / velocity;
    car.vz *= cap / velocity;
  }
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  for (const b of track.buildings || []) {
    const dx = car.x - b.x,
      dz = car.z - b.z,
      hx = b.width / 2 + 0.85,
      hz = b.depth / 2 + 0.85;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      if (hx - Math.abs(dx) < hz - Math.abs(dz))
        car.x = b.x + (dx >= 0 ? hx : -hx);
      else car.z = b.z + (dz >= 0 ? hz : -hz);
      car.vx *= 0.35;
      car.vz *= 0.35;
      car.yawRate *= 0.4;
      car.driftCharge = car.driftDuration = car.boostTime = 0;
    }
  }
  car.slip = Math.atan2(lateral, Math.max(Math.abs(forward), 1));
  const surface = nearest(track, car.x, car.z);
  if (track.terrain && !insideTerrain(track.terrain, car.x, car.z, 8)) {
    // Recovery preserves lap/checkpoint state; driving beyond the ground earns no progress.
    resetCar(car, track);
    return nearest(track, car.x, car.z);
  }
  car.y = surfaceHeight(track, car.x, car.z, surface);
  let groundGrade = surface.grade;
  if (track.terrain && surface.distance > track.roadWidth / 2 + 3) {
    const aheadX = car.x + Math.sin(car.angle) * 2,
      aheadZ = car.z + Math.cos(car.angle) * 2;
    const behindX = car.x - Math.sin(car.angle) * 2,
      behindZ = car.z - Math.cos(car.angle) * 2;
    groundGrade =
      (surfaceHeight(track, aheadX, aheadZ, nearest(track, aheadX, aheadZ)) -
        surfaceHeight(
          track,
          behindX,
          behindZ,
          nearest(track, behindX, behindZ),
        )) /
      4;
  }
  car.pitch += (Math.atan(groundGrade) - car.pitch) * (1 - Math.exp(-10 * dt));
  car.index = surface.index;
  const bend = trackBend(track, surface.index),
    driftAngle = Math.abs(car.slip);
  const validDrift =
    !car.traction &&
    forward > 22 &&
    surface.distance < track.roadWidth * 0.45 &&
    driftAngle > 0.1 &&
    driftAngle < 0.8 &&
    Math.abs(bend) > 0.0015 &&
    Math.sign(-car.slip) === Math.sign(bend);
  if (validDrift) {
    car.driftDuration += dt;
    car.driftCharge = clamp(car.driftCharge + 65 * dt, 0, 100);
  } else if (surface.distance > track.roadWidth * 0.52 || driftAngle > 1.05) {
    car.driftCharge = 0;
    car.driftDuration = 0;
    car.boostTime = 0;
  } else if (!car.traction) {
    car.driftCharge = Math.max(0, car.driftCharge - 12 * dt);
  }
  const count = track.points.length,
    gate = Math.floor((surface.index / count) * 20);
  if (gate === car.nextGate) {
    car.nextGate = (car.nextGate + 1) % 20;
    if (gate === 0) car.lap++;
  }
  car.progress = car.lap * count + surface.index;
  if (surface.distance > track.roadWidth * 2.5) {
    car.vx *= 0.95;
    car.vz *= 0.95;
  }
  return surface;
}
export const DIFFICULTIES = {
  "golf-carts": {
    label: "Golf Carts",
    level: "Easy",
    speed: 38,
    max: 43,
    min: 18,
    corner: 42,
    gain: 3.8,
    brake: 0.6,
  },
  cars: {
    label: "Cars",
    level: "Medium",
    speed: 64,
    max: 68,
    min: 27,
    corner: 60,
    gain: 3.8,
    brake: 0.6,
  },
  "speed-demons": {
    label: "Speed Demons",
    level: "Hard",
    speed: 76,
    max: 78,
    min: 30,
    corner: 66,
    gain: 4.2,
    brake: 0.85,
  },
};
export function cpuInput(car, track, difficulty = "cars", allowDrift = true) {
  const profile = DIFFICULTIES[difficulty] || DIFFICULTIES.cars,
    n = track.points.length,
    near = nearest(track, car.x, car.z),
    speed = Math.hypot(car.vx, car.vz),
    lookahead = Math.floor(5 + speed * 0.13),
    p = track.points[(near.index + lookahead) % n];
  const desired = Math.atan2(p.x - car.x, p.z - car.z),
    error = wrap(desired - car.angle);
  let corner = 0;
  for (let offset = 3; offset <= lookahead + 8; offset += 3)
    corner = Math.max(
      corner,
      Math.abs(
        wrap(track.points[(near.index + offset) % n].angle - near.point.angle),
      ),
    );
  if (allowDrift && difficulty !== "golf-carts" && car.toggleCooldown <= 0) {
    const bend = Math.abs(trackBend(track, near.index));
    if (car.traction && speed > 26 && corner > 0.24 && bend > 0.0015)
      setTraction(car, false);
    else if (
      !car.traction &&
      (corner < 0.16 ||
        Math.abs(car.slip) > 0.95 ||
        near.distance > track.roadWidth * 0.42)
    )
      setTraction(car, true);
  }
  const target =
    clamp(
      profile.speed -
        corner * profile.corner +
        car.id * 0.6 -
        Math.max(0, near.point.grade) * 12,
      profile.min,
      profile.max,
    ) + (car.boostTime > 0 && corner < 0.35 ? 20 : 0);
  return {
    steer: clamp(error * profile.gain * (car.traction ? 1 : 0.65), -1, 1),
    throttle: speed < target ? 1 : 0.1,
    brake: speed > target + 3 ? profile.brake : 0,
  };
}
export function resetCar(car, track) {
  const p = nearest(track, car.x, car.z).point;
  car.x = p.x;
  car.z = p.z;
  car.angle = p.angle;
  car.y = p.y;
  car.pitch = Math.atan(p.grade);
  car.vx = car.vz = car.yawRate = car.steerAngle = 0;
  car.traction = true;
  car.driftCharge = car.driftDuration = car.boostTime = car.toggleCooldown = 0;
}
export class LocalSession {
  constructor(track, skins, difficulty = "cars") {
    this.track = track;
    this.skins = skins;
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : "cars";
    this.reset(0);
  }
  reset(skin) {
    this.cars = Array.from({ length: 6 }, (_, i) =>
      createCar(
        this.track,
        i,
        this.skins[i === 0 ? skin : i % this.skins.length],
      ),
    );
    this.time = 0;
    this.finished = [];
  }
  step(input, dt) {
    this.time += dt;
    for (const c of this.cars) {
      if (c.finished) continue;
      stepCar(
        c,
        c.id === 0 ? input : cpuInput(c, this.track, this.difficulty),
        this.track,
        dt,
      );
      if (c.lap >= this.track.laps) {
        c.finished = true;
        c.finishTime = this.time;
        this.finished.push(c);
      }
    }
  }
  ranking() {
    return [...this.cars].sort((a, b) =>
      a.finished && b.finished
        ? a.finishTime - b.finishTime
        : a.finished
          ? -1
          : b.finished
            ? 1
            : b.progress - a.progress,
    );
  }
}
