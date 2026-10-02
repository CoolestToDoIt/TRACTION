import { wrap, nearest } from "./engine.js";
import { assetUrl } from "./content.js";
import { createScenery, drawStructure } from "./scenery.js";

const panoramaCache = new Map();
export class Renderer {
  constructor(canvas, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.track = track;
    this.scenery = createScenery(track);
    this.viewDistance = track.drawDistance || 420;
    this.yaw = track.points[0].angle;
    this.marks = [];
    this.textures = new Map();
    this.patterns = new Map();
    this.clock = 0;
    this.spriteCanvas = document.createElement("canvas");
    this.asphalt = this.makeAsphalt();
    this.carSprites = new Map();
    this.night = track.environment?.type === "city";
    this.facades = this.night
      ? Array.from({ length: 4 }, (_, i) => this.makeFacade(i))
      : [];
    this.heading = this.yaw;
    this.background = null;
    const panorama = track.environment?.background;
    if (panorama) {
      const url = assetUrl(panorama);
      if (!panoramaCache.has(url)) {
        const image = new Image();
        image.src = url;
        panoramaCache.set(url, image);
      }
      this.background = panoramaCache.get(url);
    }
  }
  drawPanorama(horizon) {
    const image = this.background;
    if (!image?.complete || !image.naturalWidth) return;
    const ctx = this.ctx,
      height = this.h * 0.85,
      width = (height * image.naturalWidth) / image.naturalHeight,
      phase = (((this.yaw / (Math.PI * 2)) % 1) + 1) % 1,
      offset = -phase * width * 2,
      top = horizon - height * 0.76;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(0, 0, this.w, Math.max(0, horizon));
    ctx.clip();
    for (let i = Math.floor(phase * 2) - 1; i * width + offset < this.w; i++) {
      const x = i * width + offset;
      if (Math.abs(i % 2) === 1) {
        ctx.save();
        ctx.translate(x + width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, top, width, height);
        ctx.restore();
      } else ctx.drawImage(image, x, top, width, height);
    }
    ctx.restore();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(),
      d = Math.min(devicePixelRatio || 1, 1.6);
    if (
      this.canvas.width !== Math.round(r.width * d) ||
      this.canvas.height !== Math.round(r.height * d)
    ) {
      this.canvas.width = Math.round(r.width * d);
      this.canvas.height = Math.round(r.height * d);
    }
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.f = this.w * 0.77;
  }
  cameraPoint(x, y, z) {
    const dx = x - this.cam.x,
      dz = z - this.cam.z,
      cy = Math.cos(this.yaw),
      sy = Math.sin(this.yaw),
      cx = dx * cy - dz * sy,
      cz = dx * sy + dz * cy,
      dy = y - this.cam.y;
    const pitch = this.pitch ?? 0.19;
    return {
      x: cx,
      y: dy * Math.cos(pitch) + cz * Math.sin(pitch),
      depth: cz * Math.cos(pitch) - dy * Math.sin(pitch),
    };
  }
  project(x, y, z) {
    const p = this.cameraPoint(x, y, z);
    return this.screenPoint(p);
  }
  screenPoint(p) {
    return {
      x: this.w / 2 + (p.x * this.f) / p.depth,
      y: this.h * (this.screenCenter ?? 0.43) - (p.y * this.f) / p.depth,
      depth: p.depth,
    };
  }
  // Clip against the camera near plane instead of dropping an entire polygon.
  poly(points, color, texture = null, uv = null) {
    let vertices = points.map((p, i) => ({
      ...this.cameraPoint(...p),
      u: uv?.[i]?.x ?? 0,
      v: uv?.[i]?.y ?? 0,
    }));
    const clipped = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i],
        b = vertices[(i + 1) % vertices.length],
        insideA = a.depth >= 0.7,
        insideB = b.depth >= 0.7;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) {
        const t = (0.7 - a.depth) / (b.depth - a.depth);
        clipped.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          depth: 0.7,
          u: a.u + (b.u - a.u) * t,
          v: a.v + (b.v - a.v) * t,
        });
      }
    }
    if (clipped.length < 3) return;
    const ps = clipped.map((p) => this.screenPoint(p));
    const face = {
      ps,
      color,
      texture,
      uv: clipped.map((p) => ({ x: p.u, y: p.v })),
      depth: clipped.reduce((s, p) => s + p.depth, 0) / clipped.length,
    };
    this.faces.push(face);
    return face;
  }
  makeAsphalt() {
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 128;
    const ctx = tile.getContext("2d");
    ctx.fillStyle = this.track.environment?.road || "#39433f";
    ctx.fillRect(0, 0, 128, 128);
    let seed = 18;
    for (let i = 0; i < 6500; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 128;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 128;
      ctx.fillStyle = i % 2 ? "#ffffff08" : "#111d1908";
      ctx.fillRect(x, y, 1, 1);
    }
    return tile;
  }
  makeFacade(style) {
    const tile = document.createElement("canvas");
    tile.width = 64;
    tile.height = 128;
    const ctx = tile.getContext("2d"),
      walls = ["#24283b", "#252a42", "#34303e", "#1e2c36"],
      lights = ["#f2c792", "#93d5e4", "#e69bc9", "#a9c8ff"];
    ctx.fillStyle = walls[style];
    ctx.fillRect(0, 0, 64, 128);
    let seed = 91 + style * 137;
    for (let row = 0; row < 16; row++)
      for (let col = 0; col < 8; col++) {
        seed = (seed * 16807) % 2147483647;
        ctx.fillStyle = seed % 5 < 2 ? "#13192a" : lights[style];
        ctx.globalAlpha = seed % 5 < 2 ? 1 : 0.55 + (seed % 4) * 0.12;
        ctx.fillRect(col * 8 + 2, row * 8 + 2, 4, 3);
      }
    ctx.globalAlpha = 1;
    return tile;
  }
  building(b) {
    const x = b.x,
      z = b.z,
      w = b.width / 2,
      d = b.depth / 2,
      h = b.height,
      points = [
        [x - w, 0, z - d],
        [x + w, 0, z - d],
        [x + w, 0, z + d],
        [x - w, 0, z + d],
      ],
      top = points.map((p) => [p[0], h, p[2]]),
      uv = [
        { x: 0, y: 128 },
        { x: 64, y: 128 },
        { x: 64, y: 0 },
        { x: 0, y: 0 },
      ];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.poly(
        [points[i], points[j], top[j], top[i]],
        "#22283b",
        this.facades[b.style % 4],
        uv,
      );
    }
    this.poly(top, "#30364c");
    const neon = b.style % 2 ? "#ba80d7" : "#71ccd7";
    this.box(x, 0, z - d - 0.08, b.width * 0.38, 2.8, 0.12, 0, "#182035");
    this.poly(
      [
        [x - w * 0.8, 4, z - d - 0.1],
        [x + w * 0.8, 4, z - d - 0.1],
        [x + w * 0.8, 4.45, z - d - 0.1],
        [x - w * 0.8, 4.45, z - d - 0.1],
      ],
      neon,
    );
  }
  shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    return (
      "#" +
      [n >> 16, (n >> 8) & 255, n & 255]
        .map((v) =>
          Math.max(0, Math.min(255, Math.round(v * amount)))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }
  box(x, y, z, w, h, l, angle, color, top) {
    const cs = Math.cos(angle),
      sn = Math.sin(angle),
      v = (a, b, c) => [x + a * cs + c * sn, y + b, z - a * sn + c * cs];
    const a = v(-w / 2, 0, -l / 2),
      b = v(w / 2, 0, -l / 2),
      c = v(w / 2, 0, l / 2),
      d = v(-w / 2, 0, l / 2),
      e = v(-w / 2, h, -l / 2),
      f = v(w / 2, h, -l / 2),
      g = v(w / 2, h, l / 2),
      j = v(-w / 2, h, l / 2);
    this.poly([a, b, f, e], color);
    this.poly([b, c, g, f], color);
    this.poly([c, d, j, g], color);
    this.poly([d, a, e, j], color);
    this.poly([e, f, g, j], top || color);
  }
  render(session, dt, menu = false, lookBack = false) {
    this.screenCenter = 0.43;
    this.resize();
    const c = session.cars[0];
    const target = menu ? c.angle - 0.28 : c.angle - c.slip * 0.7;
    this.heading +=
      wrap(target - this.heading) * (1 - Math.exp(-dt * (menu ? 2 : 4)));
    this.yaw = this.heading + (lookBack ? Math.PI : 0);
    this.clock += dt;
    const speed = Math.hypot(c.vx, c.vz);
    const boost = menu ? 0 : Math.min(speed / 74, 1);
    this.f = this.w * (0.77 - 0.07 * boost);
    this.pitch =
      (menu ? 0.19 : 0.12) - (c.pitch || 0) * 0.7 * (lookBack ? -1 : 1);
    const back = menu ? 18 : 10.5;
    this.cam = {
      x: c.x - Math.sin(this.yaw) * back + (menu ? 9 : 0),
      z: c.z - Math.cos(this.yaw) * back,
      y:
        (menu
          ? c.y || 0
          : nearest(
              this.track,
              c.x - Math.sin(this.yaw) * back,
              c.z - Math.cos(this.yaw) * back,
            ).height) + (menu ? 9 : 3.8),
    };
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.h);
    gradient.addColorStop(0, this.track.environment?.sky || "#aac5bd");
    gradient.addColorStop(0.5, this.track.environment?.horizon || "#e8dfbd");
    gradient.addColorStop(1, this.night ? "#222841" : "#b99a70");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = this.track.environment?.ground || "#b39368";
    const horizon = this.h * 0.43 - Math.tan(this.pitch) * this.f;
    ctx.fillRect(0, horizon, this.w, this.h - horizon);
    this.drawPanorama(horizon);
    this.faces = [];
    if (this.night) {
      for (const building of this.track.buildings || [])
        if (
          Math.hypot(building.x - c.x, building.z - c.z) <
          360 + Math.hypot(building.width, building.depth) / 2
        )
          this.building(building);
    }
    // Nearby props share road and CPU-car depth sorting, including look-back.
    for (const structure of this.scenery) {
      if (
        Math.hypot(structure.x - c.x, structure.z - c.z) < this.viewDistance
      ) {
        drawStructure(this, structure);
      }
    }
    const pts = this.track.points,
      half = this.track.roadWidth / 2;
    const visibleChunks = this.track.chunks.filter(
      (chunk) =>
        Math.hypot(chunk.x - c.x, chunk.z - c.z) <
        this.viewDistance + chunk.radius,
    );
    for (const chunk of visibleChunks)
      for (let i = chunk.start; i < chunk.end; i++) {
        const a = pts[i],
          b = pts[(i + 1) % pts.length];
        if (Math.hypot(a.x - c.x, a.z - c.z) > this.viewDistance + 24) continue;
        const v = (p, offset, y = 0) => [
          p.x + p.nx * offset,
          p.y + y,
          p.z + p.nz * offset,
        ];
        if (this.night) {
          for (const side of [-1, 1])
            this.poly(
              [
                v(a, side * (half + 3), -0.09),
                v(b, side * (half + 3), -0.09),
                v(b, side * (half + 22), -0.15),
                v(a, side * (half + 22), -0.15),
              ],
              "#252b40",
            );
        } else {
          for (const side of [-1, 1]) {
            this.poly(
              [
                v(a, side * (half + 3), -0.09),
                v(b, side * (half + 3), -0.09),
                v(b, side * (half + (this.track.terrainWidth || 42)), -7),
                v(a, side * (half + (this.track.terrainWidth || 42)), -7),
              ],
              this.track.environment?.terrainNear ||
                (side === 1 ? "#b99a70" : "#b39165"),
            );
            this.poly(
              [
                v(a, side * (half + (this.track.terrainWidth || 42)), -7),
                v(b, side * (half + (this.track.terrainWidth || 42)), -7),
                v(b, side * (half + (this.track.terrainWidth ? 50 : 95)), -25),
                v(a, side * (half + (this.track.terrainWidth ? 50 : 95)), -25),
              ],
              this.track.environment?.terrainFar || "#ae8f63",
            );
          }
        }
        this.poly(
          [
            v(a, -half - 3, -0.08),
            v(a, half + 3, -0.08),
            v(b, half + 3, -0.08),
            v(b, -half - 3, -0.08),
          ],
          this.track.environment?.shoulder || "#c4aa7f",
        );
        const road = this.poly(
          [v(a, -half), v(a, half), v(b, half), v(b, -half)],
          this.track.environment?.road || "#3d4742",
          this.asphalt,
          [
            { x: 0, y: a.s * 8 },
            { x: this.track.roadWidth * 8, y: a.s * 8 },
            {
              x: this.track.roadWidth * 8,
              y: (i === pts.length - 1 ? this.track.length : b.s) * 8,
            },
            { x: 0, y: (i === pts.length - 1 ? this.track.length : b.s) * 8 },
          ],
        );
        if (road) road.repeat = true;
        for (const side of [-1, 1]) {
          this.poly(
            [
              v(a, side * (half - 0.15), 0.04),
              v(a, side * (half + 0.65), 0.04),
              v(b, side * (half + 0.65), 0.04),
              v(b, side * (half - 0.15), 0.04),
            ],
            Math.floor(i / 2) % 2
              ? this.night
                ? "#afbdd0"
                : "#eee7ca"
              : this.track.environment?.curb || "#d77852",
          );
          this.poly(
            [
              v(a, side * (half - 1.1), 0.05),
              v(a, side * (half - 0.94), 0.05),
              v(b, side * (half - 0.94), 0.05),
              v(b, side * (half - 1.1), 0.05),
            ],
            this.track.environment?.lane || "#e7dfc5",
          );
        }
        if (i % 8 < 3)
          this.poly(
            [
              v(a, -0.12, 0.03),
              v(a, 0.12, 0.03),
              v(b, 0.12, 0.03),
              v(b, -0.12, 0.03),
            ],
            this.track.environment?.lane || "#d7d6bf",
          );
        if (i === 0 || i === 1) {
          for (let j = 0; j < Math.ceil(this.track.roadWidth / 2); j++)
            this.poly(
              [
                v(a, Math.min(half, -half + j * 2), 0.07),
                v(a, Math.min(half, -half + (j + 1) * 2), 0.07),
                v(b, Math.min(half, -half + (j + 1) * 2), 0.07),
                v(b, Math.min(half, -half + j * 2), 0.07),
              ],
              (i + j) % 2 ? "#eef0de" : "#202c27",
            );
        }
        if (this.night && i % 24 === 0) {
          for (const side of [-1, 1]) {
            const x = a.x + a.nx * (half + 2.5) * side,
              z = a.z + a.nz * (half + 2.5) * side;
            this.box(x, a.y, z, 0.14, 7, 0.14, a.angle, "#3b425a");
            this.box(
              x,
              a.y + 6.8,
              z,
              1.3,
              0.16,
              0.6,
              a.angle,
              "#e9d7ac",
              "#f9e0b0",
            );
            this.poly(
              [
                v(a, side * (half - 5), 0.075),
                v(a, side * (half + 1), 0.075),
                v(b, side * (half + 1), 0.075),
                v(b, side * (half - 5), 0.075),
              ],
              "#f5d7a81c",
            );
          }
        }
        if (i % 16 === 0) {
          for (const side of [-1, 1])
            this.box(
              a.x + a.nx * (half + 1.5) * side,
              a.y,
              a.z + a.nz * (half + 1.5) * side,
              0.2,
              1.4,
              0.2,
              a.angle,
              "#d8d8b4",
              "#f8f2d4",
            );
        }
      }
    for (const m of this.marks) this.poly(m.points, "#242b25");
    if (Math.abs(c.slip) > 0.12 && Math.hypot(c.vx, c.vz) > 10 && !menu) {
      for (const side of [-1, 1]) {
        const sn = Math.sin(c.angle),
          cs = Math.cos(c.angle);
        const x = c.x + cs * side * 0.85 - sn * 1.6,
          z = c.z - sn * side * 0.85 - cs * 1.6;
        this.marks.push({
          points: [
            [x - 0.1, c.y + 0.085, z],
            [x + 0.1, c.y + 0.085, z],
            [
              x + 0.1 - c.vx * dt * 3,
              nearest(this.track, x - c.vx * dt * 3, z - c.vz * dt * 3).height +
                0.085,
              z - c.vz * dt * 3,
            ],
            [
              x - 0.1 - c.vx * dt * 3,
              nearest(this.track, x - c.vx * dt * 3, z - c.vz * dt * 3).height +
                0.085,
              z - c.vz * dt * 3,
            ],
          ],
        });
      }
    }
    if (this.marks.length > 650) this.marks.splice(0, 10);
    const start = pts[0];
    for (const side of [-1, 1])
      this.box(
        start.x + start.nx * (half + 1) * side,
        start.y,
        start.z + start.nz * (half + 1) * side,
        0.5,
        6,
        0.5,
        start.angle,
        "#24342c",
      );
    this.box(
      start.x,
      start.y + 5.5,
      start.z,
      this.track.roadWidth + 3,
      1,
      0.6,
      start.angle,
      "#dfff72",
      "#eff9c6",
    );
    const cars = [...session.cars].sort(
      (a, b) =>
        this.project(b.x, b.y + 1, b.z).depth -
        this.project(a.x, a.y + 1, a.z).depth,
    );
    for (const car of cars) if (car.id !== 0) this.drawCarSprite(car);
    this.drawFaces(ctx, this.faces);
    const worldFaces = this.faces;
    this.faces = [];
    this.drawCarSprite(c);
    this.drawFaces(ctx, this.faces);
    this.faces = worldFaces;
    this.motionLines(speed, menu);
    for (const car of cars) {
      if (car.id === 0) continue;
      const p = this.project(car.x, car.y + 2.6, car.z);
      if (p.depth > 8 && p.depth < 100) {
        ctx.font = `bold ${Math.max(11, this.w * 0.01)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(car.name, p.x, p.y);
      }
    }
  }
  renderGarage(car, dt, orbit = 0) {
    this.resize();
    this.screenCenter = 0.57;
    this.f = this.w * 0.72;
    this.yaw = orbit;
    this.pitch = 0.22;
    const back = 6.5;
    this.cam = {
      x: car.x - Math.sin(orbit) * back,
      z: car.z - Math.cos(orbit) * back,
      y: car.y + 2.35,
    };
    const ctx = this.ctx,
      gradient = ctx.createLinearGradient(0, 0, 0, this.h);
    gradient.addColorStop(0, "#101b18");
    gradient.addColorStop(1, "#34493e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.w, this.h);
    this.faces = [];
    for (let i = -12; i <= 12; i += 2) {
      this.poly(
        [
          [i, 0, -12],
          [i + 0.035, 0, -12],
          [i + 0.035, 0, 12],
          [i, 0, 12],
        ],
        "#50685b",
      );
      this.poly(
        [
          [-12, 0, i],
          [12, 0, i],
          [12, 0, i + 0.035],
          [-12, 0, i + 0.035],
        ],
        "#50685b",
      );
    }
    this.poly(
      [
        [-2, 0.01, -3],
        [2, 0.01, -3],
        [2, 0.01, 3],
        [-2, 0.01, 3],
      ],
      "#1b2822",
    );
    this.drawFaces(ctx, this.faces);
    this.faces = [];
    this.drawCarSprite(car);
    this.drawFaces(ctx, this.faces);
  }
  drawFaces(ctx, faces) {
    const previous = this.ctx;
    this.ctx = ctx;
    faces.sort((a, b) => b.depth - a.depth);
    for (const face of faces) {
      if (face.sprite) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(face.image, face.left, face.top, face.width, face.height);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = face.color;
      ctx.beginPath();
      face.ps.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = face.color;
      ctx.lineWidth = 0.65;
      ctx.stroke();
      if (face.texture)
        this.paintTexture(face.ps, face.texture, face.uv, face.repeat);
    }
    this.ctx = previous;
  }
  drawCarSprite(c) {
    if (this.project(c.x, c.y + 1, c.z).depth < 3) return;
    const worldFaces = this.faces;
    this.faces = [];
    this.drawCar(c);
    const faces = this.faces;
    this.faces = worldFaces;
    if (!faces.length) return;
    const ps = faces.flatMap((f) => f.ps),
      left = Math.floor(Math.min(...ps.map((p) => p.x))) - 2,
      top = Math.floor(Math.min(...ps.map((p) => p.y))) - 2,
      right = Math.ceil(Math.max(...ps.map((p) => p.x))) + 2,
      bottom = Math.ceil(Math.max(...ps.map((p) => p.y))) + 2,
      w = right - left,
      h = bottom - top;
    if (
      right < 0 ||
      left > this.w ||
      bottom < 0 ||
      top > this.h ||
      w > this.w * 2 ||
      h > this.h * 2
    )
      return;
    const canvas = this.spriteCanvas;
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    const ctx = canvas.getContext("2d");
    ctx.translate(-left, -top);
    this.drawFaces(ctx, faces);
    if (!this.carSprites.has(c.id))
      this.carSprites.set(c.id, document.createElement("canvas"));
    const pixel = this.carSprites.get(c.id);
    const ratio = Math.min(1, 116 / w);
    pixel.width = Math.max(1, Math.round(w * ratio));
    pixel.height = Math.max(1, Math.round(h * ratio));
    const pc = pixel.getContext("2d");
    pc.imageSmoothingEnabled = true;
    pc.drawImage(canvas, 0, 0, pixel.width, pixel.height);
    this.faces.push({
      sprite: true,
      image: pixel,
      left,
      top,
      width: w,
      height: h,
      depth: this.project(c.x, c.y + 0.6, c.z).depth,
    });
  }
  drawCar(c) {
    const { body, accent, texture } = c.skin;
    const sn = Math.sin(c.angle),
      cs = Math.cos(c.angle),
      pitch = c.pitch || 0,
      cp = Math.cos(pitch),
      sp = Math.sin(pitch),
      v = (x, y, z) => {
        x *= (0.76 * (c.skin.dimensions?.width || 1.78)) / 1.78;
        y *= (0.84 * (c.skin.dimensions?.height || 1.28)) / 1.28;
        z *= (0.93 * (c.skin.dimensions?.length || 4.23)) / 4.23;
        const elevation = y * cp + z * sp,
          longitudinal = z * cp - y * sp;
        return [
          c.x + x * cs + longitudinal * sn,
          c.y + elevation,
          c.z - x * sn + longitudinal * cs,
        ];
      };
    const carBox = (x, y, z, w, h, l, color, top = color, steer = 0) => {
      const rc = Math.cos(steer),
        rs = Math.sin(steer),
        q = (a, b, c) => v(x + a * rc + c * rs, y + b, z - a * rs + c * rc),
        a = q(-w / 2, 0, -l / 2),
        b = q(w / 2, 0, -l / 2),
        c = q(w / 2, 0, l / 2),
        d = q(-w / 2, 0, l / 2),
        e = q(-w / 2, h, -l / 2),
        f = q(w / 2, h, -l / 2),
        g = q(w / 2, h, l / 2),
        j = q(-w / 2, h, l / 2);
      for (const face of [
        [a, b, f, e],
        [b, c, g, f],
        [c, d, j, g],
        [d, a, e, j],
      ])
        this.poly(face, color);
      this.poly([e, f, g, j], top);
    };
    let img = null;
    if (texture) {
      if (!this.textures.has(texture)) {
        const image = new Image();
        image.src = texture;
        this.textures.set(texture, image);
      }
      const candidate = this.textures.get(texture);
      if (candidate.complete && candidate.naturalWidth) img = candidate;
    }
    // Rounded profiles become a single pixel sprite before entering the world.
    const profiles = [
      [-2.3, 0.87, 0.43, 0.72],
      [-2.15, 1.08, 0.34, 0.95],
      [-1.6, 1.17, 0.33, 1.03],
      [-0.8, 1.16, 0.33, 1.09],
      [0.2, 1.14, 0.33, 1.03],
      [1.05, 1.12, 0.35, 0.91],
      [1.8, 1.03, 0.39, 0.8],
      [2.25, 0.83, 0.44, 0.66],
    ];
    const ring = (p, j) => {
      const angle = (j / 12 - 0.5) * Math.PI;
      return v(
        p[1] * Math.sin(angle),
        p[2] +
          (p[3] - p[2]) *
            Math.sqrt(Math.max(0, 1 - Math.pow(Math.sin(angle), 6))),
        p[0],
      );
    };
    for (let i = 0; i < profiles.length - 1; i++)
      for (let j = 0; j < 12; j++) {
        const a = profiles[i],
          b = profiles[i + 1];
        const points = [ring(a, j), ring(a, j + 1), ring(b, j + 1), ring(b, j)];
        const light =
          0.72 +
          0.28 * Math.cos((j / 12 - 0.5) * Math.PI) +
          0.08 * Math.sin((j / 12 - 0.5) * Math.PI);
        const color = this.shade(body, light);
        const textured = img && a[0] >= 0.2 && j >= 3 && j <= 8;
        this.poly(
          points,
          color,
          textured ? img : null,
          textured
            ? [
                {
                  x: (j / 12) * img.width,
                  y: ((a[0] - 0.2) / 2.05) * img.height,
                },
                {
                  x: ((j + 1) / 12) * img.width,
                  y: ((a[0] - 0.2) / 2.05) * img.height,
                },
                {
                  x: ((j + 1) / 12) * img.width,
                  y: ((b[0] - 0.2) / 2.05) * img.height,
                },
                {
                  x: (j / 12) * img.width,
                  y: ((b[0] - 0.2) / 2.05) * img.height,
                },
              ]
            : null,
        );
      }
    for (const end of [0, profiles.length - 1]) {
      const p = profiles[end];
      this.poly(
        Array.from({ length: 13 }, (_, j) => ring(p, j)),
        this.shade(body, 0.75),
      );
    }
    const cabin = [
      [-1.22, 0.87, 1.0],
      [-0.72, 0.75, 1.48],
      [-0.42, 0.74, 1.52],
      [0.27, 0.74, 1.5],
      [0.93, 0.88, 1.0],
    ];
    for (let i = 0; i < cabin.length - 1; i++) {
      const a = cabin[i],
        b = cabin[i + 1];
      const glass = i === 0 || i === 3;
      for (let side = -1; side <= 1; side += 2) {
        this.poly(
          [
            v(side * a[1], 0.95, a[0]),
            v(side * a[1] * 0.82, a[2], a[0]),
            v(side * b[1] * 0.82, b[2], b[0]),
            v(side * b[1], 0.95, b[0]),
          ],
          glass ? "#375351" : "#2b4241",
        );
      }
      this.poly(
        [
          v(-a[1] * 0.82, a[2], a[0]),
          v(a[1] * 0.82, a[2], a[0]),
          v(b[1] * 0.82, b[2], b[0]),
          v(-b[1] * 0.82, b[2], b[0]),
        ],
        glass ? "#314d4b" : this.shade(body, 1.06),
      );
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const steer = end === 1 ? c.steerAngle || 0 : 0;
        carBox(
          side * 1.08,
          0.16,
          end * 1.44,
          0.34,
          0.52,
          0.77,
          "#161e1b",
          "#28302b",
          steer,
        );
        carBox(
          side * 1.26,
          0.28,
          end * 1.44,
          0.025,
          0.25,
          0.4,
          "#69726b",
          "#69726b",
          steer,
        );
      }
    for (const side of [-1, 1]) {
      carBox(side * 1.12, 0.47, -0.1, 0.018, 0.035, 2.4, this.shade(body, 0.7));
      carBox(side * 0.6, 0.65, -2.32, 0.52, 0.15, 0.035, "#ff8762", "#ffc093");
      carBox(side * 0.58, 0.59, 2.26, 0.46, 0.13, 0.04, "#f1f3d4");
      this.poly(
        [
          v(side * 0.75, 0.98, -0.16),
          v(side * 0.62, 1.5, -0.16),
          v(side * 0.62, 1.5, -0.09),
          v(side * 0.75, 0.98, -0.09),
        ],
        this.shade(body, 0.65),
      );
    }
    carBox(0, 0.45, -2.305, 1.82, 0.12, 0.06, "#24312a");
    carBox(0, 0.51, -2.34, 0.39, 0.16, 0.035, "#f0ecd4");
  }
  motionLines(speed, menu) {
    if (
      menu ||
      speed < 24 ||
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const intensity = Math.min(1, (speed - 24) / 45),
      ctx = this.ctx,
      cx = this.w * 0.5,
      cy = this.h * 0.38;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      const angle = i * 2.39996,
        phase = (this.clock * (0.65 + intensity) + i * 0.618) % 1;
      const radius = 0.53 + phase * 0.24,
        length = 0.035 + intensity * 0.1;
      const x = Math.cos(angle) * this.w * 0.83,
        y = Math.sin(angle) * this.h * 0.87;
      const alpha = intensity * 0.38 * Math.sin(phase * Math.PI);
      ctx.strokeStyle = `rgba(245,249,224,${alpha})`;
      ctx.lineWidth = 1 + intensity * 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + x * radius, cy + y * radius);
      ctx.lineTo(cx + x * (radius + length), cy + y * (radius + length));
      ctx.stroke();
    }
    ctx.restore();
  }
  paintTexture(ps, img, uv, repeat = false) {
    const ctx = this.ctx;
    if (repeat && !this.patterns.has(img))
      this.patterns.set(img, ctx.createPattern(img, "repeat"));
    const midpoint = (a, b) => ({
        x: (a.x * a.depth + b.x * b.depth) / (a.depth + b.depth),
        y: (a.y * a.depth + b.y * b.depth) / (a.depth + b.depth),
        depth: (a.depth + b.depth) / 2,
      }),
      uvMid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const tri = (a, b, c, u, v, w, level = 0) => {
      if (repeat && level < 3) {
        const depthRatio =
            Math.max(a.depth, b.depth, c.depth) /
            Math.min(a.depth, b.depth, c.depth),
          area = Math.abs(
            (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
          );
        if (depthRatio > 1.3 && area > 512) {
          const ab = midpoint(a, b),
            bc = midpoint(b, c),
            ca = midpoint(c, a),
            uab = uvMid(u, v),
            ubc = uvMid(v, w),
            uca = uvMid(w, u);
          tri(a, ab, ca, u, uab, uca, level + 1);
          tri(ab, b, bc, uab, v, ubc, level + 1);
          tri(ca, bc, c, uca, ubc, w, level + 1);
          tri(ab, bc, ca, uab, ubc, uca, level + 1);
          return;
        }
      }
      const det = u.x * (v.y - w.y) + v.x * (w.y - u.y) + w.x * (u.y - v.y);
      if (!det) return;
      const calc = (A, B, C) => [
        (A * (v.y - w.y) + B * (w.y - u.y) + C * (u.y - v.y)) / det,
        (A * (w.x - v.x) + B * (u.x - w.x) + C * (v.x - u.x)) / det,
        (A * (v.x * w.y - w.x * v.y) +
          B * (w.x * u.y - u.x * w.y) +
          C * (u.x * v.y - v.x * u.y)) /
          det,
      ];
      const x = calc(a.x, b.x, c.x),
        y = calc(a.y, b.y, c.y);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.clip();
      ctx.transform(x[0], y[0], x[1], y[1], x[2], y[2]);
      ctx.imageSmoothingEnabled = repeat;
      if (repeat) {
        const minX = Math.min(u.x, v.x, w.x),
          minY = Math.min(u.y, v.y, w.y),
          maxX = Math.max(u.x, v.x, w.x),
          maxY = Math.max(u.y, v.y, w.y);
        ctx.fillStyle = this.patterns.get(img);
        ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
      } else ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    for (let i = 1; i < ps.length - 1; i++)
      tri(ps[0], ps[i], ps[i + 1], uv[0], uv[i], uv[i + 1]);
  }
}
