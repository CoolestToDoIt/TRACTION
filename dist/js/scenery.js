import { nearest } from "./engine.js";

// Dimensions are meters. Only the built-in circuits receive themed scenery.
const THEMES = {
  "copper-canyon": {
    kind: "rock",
    variants: ["rock", "rock", "hut"],
    width: 9,
    depth: 8,
    height: 13,
    color: "#b87549",
    roof: "#dfab73",
  },
  "midnight-metro": {
    kind: "kiosk",
    variants: ["kiosk", "billboard"],
    width: 5,
    depth: 4,
    height: 3,
    color: "#33455a",
    roof: "#72d5dc",
  },
  "sunstone-pass": {
    kind: "hut",
    variants: ["hut", "rock"],
    width: 7,
    depth: 6,
    height: 4,
    color: "#bb9167",
    roof: "#714d3e",
  },
  "meadow-run": {
    kind: "barn",
    variants: ["barn", "tree"],
    width: 9,
    depth: 7,
    height: 5,
    color: "#a95843",
    roof: "#394e47",
  },
};

export function createScenery(track) {
  const theme = THEMES[track.id];
  if (!theme) return [];
  const structures = [];
  // Seeded variation keeps a circuit recognizable across races without mirrored pairs.
  let seed = 173;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  let nextDistance = 75;
  for (const point of track.points) {
    if (point.s < nextDistance) continue;
    nextDistance = point.s + 220 + random() * 160;
    const side = random() < 0.5 ? -1 : 1;
    const scale = 0.7 + random() * 0.65;
    const variant = {
      ...theme,
      kind: theme.variants[Math.floor(random() * theme.variants.length)],
      width: theme.width * scale,
      depth: theme.depth * (0.75 + random() * 0.5),
      height: theme.height * (0.65 + random() * 0.7),
      color: theme.color,
      roof: theme.roof,
      roofRise: 1.3 + random() * 2.2,
      crownScale: 0.4 + random() * 0.4,
      peakOffset: (random() - 0.5) * 0.45,
    };
    const palettes = {
      rock: [
        ["#b87549", "#dfab73"],
        ["#a76c51", "#c89972"],
        ["#ca986b", "#e3bd8b"],
      ],
      kiosk: [
        ["#33455a", "#72d5dc"],
        ["#40374e", "#d69acb"],
        ["#3c4650", "#e4bd7e"],
      ],
      hut: [
        ["#bb9167", "#714d3e"],
        ["#b6a083", "#54493e"],
        ["#aa7956", "#83644c"],
      ],
      barn: [
        ["#a95843", "#394e47"],
        ["#b18659", "#54534b"],
        ["#756c58", "#46585f"],
      ],
    };
    [variant.color, variant.roof] =
      palettes[theme.kind][Math.floor(random() * 3)];
    if (variant.kind === "tree") {
      variant.color = "#65503b";
      variant.roof = ["#46714a", "#568053", "#395e45"][
        Math.floor(random() * 3)
      ];
      variant.height *= 1.6;
    }
    const radius = Math.hypot(variant.width, variant.depth) / 2;
    const offset = side * (track.roadWidth / 2 + radius + 9 + random() * 10);
    const x = point.x + point.nx * offset;
    const z = point.z + point.nz * offset;
    const road = nearest(track, x, z);
    // Keep footprints away from every road section, including hairpins.
    if (road.distance < track.roadWidth / 2 + radius + 5) continue;
    if (
      (track.buildings || []).some(
        (building) =>
          Math.abs(x - building.x) < building.width / 2 + radius + 2 &&
          Math.abs(z - building.z) < building.depth / 2 + radius + 2,
      )
    )
      continue;
    structures.push({
      ...variant,
      x,
      y: road.height - 0.3,
      z,
      angle: point.angle + (random() - 0.5) * 0.6,
    });
  }
  return structures;
}

// Emit world-space faces through the renderer's clipping and depth-sort pipeline.
export function drawStructure(renderer, structure) {
  const { x, y, z, width, depth, height, angle, color, roof, kind } = structure;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const vertex = (across, up, forward) => [
    x + across * cosine + forward * sine,
    y + up,
    z - across * sine + forward * cosine,
  ];
  const corners = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  if (kind === "tree") {
    renderer.box(x, y - 3, z, 0.7, height * 0.5 + 3, 0.7, angle, color);
    const canopy = corners.map(([a, b]) =>
      vertex(a * 0.65, height * 0.35, b * 0.65),
    );
    const tip = vertex(0, height, 0);
    for (let i = 0; i < 4; i++) {
      renderer.poly(
        [canopy[i], canopy[(i + 1) % 4], tip],
        renderer.shade(roof, 0.8 + i * 0.08),
      );
    }
    return;
  }
  if (kind === "billboard") {
    for (const side of [-1, 1]) {
      const foot = vertex(side * width * 0.35, -3, 0);
      renderer.box(...foot, 0.25, height + 3, 0.25, angle, color);
    }
    renderer.box(
      x,
      y + height * 0.5,
      z,
      width,
      height * 0.6,
      0.3,
      angle,
      roof,
      color,
    );
    return;
  }
  if (kind === "rock") {
    const base = corners.map(([a, b]) => vertex(a, -3, b));
    const crown = corners.map(([a, b]) =>
      vertex(a * structure.crownScale, height * 0.65, b * structure.crownScale),
    );
    const peak = vertex(width * structure.peakOffset, height, depth * 0.08);
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      renderer.poly(
        [base[i], base[next], crown[next], crown[i]],
        renderer.shade(color, 0.75 + i * 0.09),
      );
      renderer.poly(
        [crown[i], crown[next], peak],
        renderer.shade(roof, 0.8 + i * 0.06),
      );
    }
    return;
  }
  // Extend foundations below the roadside terrain so elevated props stay grounded.
  renderer.box(x, y - 3, z, width, height + 3, depth, angle, color, roof);
  if (kind === "kiosk") {
    renderer.box(x, y + height, z, width + 1, 0.35, depth + 1, angle, roof);
  } else {
    const eaves = corners.map(([a, b]) => vertex(a * 1.1, height, b * 1.1));
    const frontRidge = vertex(0, height + structure.roofRise, -depth * 0.55);
    const backRidge = vertex(0, height + structure.roofRise, depth * 0.55);
    renderer.poly([eaves[0], eaves[1], frontRidge], color);
    renderer.poly([eaves[2], eaves[3], backRidge], color);
    renderer.poly([eaves[0], frontRidge, backRidge, eaves[3]], roof);
    renderer.poly(
      [frontRidge, eaves[1], eaves[2], backRidge],
      renderer.shade(roof, 1.2),
    );
  }
  const front = -depth / 2 - 0.05;
  renderer.poly(
    [
      vertex(-0.9, 0, front),
      vertex(0.9, 0, front),
      vertex(0.9, 2.3, front),
      vertex(-0.9, 2.3, front),
    ],
    "#26342f",
  );
}
