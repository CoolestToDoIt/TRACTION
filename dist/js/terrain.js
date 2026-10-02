// One continuous, triangulated height field supplies both scenery and off-road physics.
export function buildTerrain(track, queryRoad) {
  if (!track.terrainConfig || track.environment?.type === "city") return null;
  const config = track.terrainConfig;
  if (
    typeof config !== "object" ||
    [config.cellSize, config.padding].some(
      (value) => value !== undefined && !Number.isFinite(value),
    )
  ) {
    throw Error("Terrain cellSize and padding must be finite numbers.");
  }
  const cellSize = Math.max(16, Math.min(48, config.cellSize ?? 24));
  const padding = Math.max(120, Math.min(400, config.padding ?? 240));
  const xs = track.points.map((point) => point.x),
    zs = track.points.map((point) => point.z);
  const minX = Math.floor((Math.min(...xs) - padding) / cellSize) * cellSize;
  const minZ = Math.floor((Math.min(...zs) - padding) / cellSize) * cellSize;
  const columns = Math.ceil((Math.max(...xs) + padding - minX) / cellSize) + 1;
  const rows = Math.ceil((Math.max(...zs) + padding - minZ) / cellSize) + 1;
  if (columns * rows > 180000)
    throw Error("Terrain area is too large; reduce track bounds.");
  const heights = new Float32Array(columns * rows);
  // Arc-length sampling prevents short hairpins from dominating the hill shape.
  const anchors = [];
  let nextAnchor = 0;
  for (const point of track.points) {
    if (point.s >= nextAnchor) {
      anchors.push(point);
      nextAnchor = point.s + 28;
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = minX + column * cellSize,
        z = minZ + row * cellSize;
      const road = queryRoad(track, x, z);
      let total = 0,
        weightedHeight = 0;
      for (const anchor of anchors) {
        const squared = (anchor.x - x) ** 2 + (anchor.z - z) ** 2;
        const weight = 1 / (squared + 900) ** 2;
        total += weight;
        weightedHeight += anchor.y * weight;
      }
      const blended = weightedHeight / total;
      const shoulder = track.roadWidth / 2 + 3;
      const blend = Math.max(0, Math.min(1, (road.distance - shoulder) / 32));
      const smooth = blend * blend * (3 - 2 * blend);
      const height = road.height * (1 - smooth) + blended * smooth;
      // Leave clearance beneath the road; the shoulder apron joins it to the hill.
      heights[row * columns + column] =
        height - (road.distance < shoulder + cellSize ? 4 : 2);
    }
  }
  return {
    minX,
    minZ,
    cellSize,
    columns,
    rows,
    heights,
    maxX: minX + (columns - 1) * cellSize,
    maxZ: minZ + (rows - 1) * cellSize,
  };
}

export function terrainHeight(terrain, x, z) {
  const gx = Math.max(
    0,
    Math.min(terrain.columns - 1.000001, (x - terrain.minX) / terrain.cellSize),
  );
  const gz = Math.max(
    0,
    Math.min(terrain.rows - 1.000001, (z - terrain.minZ) / terrain.cellSize),
  );
  const column = Math.floor(gx),
    row = Math.floor(gz),
    u = gx - column,
    v = gz - row;
  const index = row * terrain.columns + column;
  const a = terrain.heights[index],
    b = terrain.heights[index + 1];
  const c = terrain.heights[index + terrain.columns],
    d = terrain.heights[index + terrain.columns + 1];
  // Match the mesh's diagonal, rather than using a different bilinear surface.
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function surfaceHeight(track, x, z, road) {
  if (!track.terrain) return road.height;
  const shoulder = track.roadWidth / 2 + 3;
  if (road.distance <= shoulder) return road.height;
  const apronWidth = 12;
  if (road.distance >= shoulder + apronWidth)
    return terrainHeight(track.terrain, x, z);
  const dx = x - road.x,
    dz = z - road.z;
  const outerX =
    road.x + (dx / Math.max(road.distance, 0.001)) * (shoulder + apronWidth);
  const outerZ =
    road.z + (dz / Math.max(road.distance, 0.001)) * (shoulder + apronWidth);
  const fraction = (road.distance - shoulder) / apronWidth;
  return (
    road.height * (1 - fraction) +
    terrainHeight(track.terrain, outerX, outerZ) * fraction
  );
}

export function insideTerrain(terrain, x, z, margin = 0) {
  return (
    x >= terrain.minX + margin &&
    x <= terrain.maxX - margin &&
    z >= terrain.minZ + margin &&
    z <= terrain.maxZ - margin
  );
}
