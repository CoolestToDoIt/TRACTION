export function buildTerrainChunks(track) {
  const terrain = track.terrain;
  if (!terrain) return [];
  const { columns, rows, cellSize, minX, minZ, heights } = terrain;
  const vertices = Array.from(heights, (height, index) => [
    minX + (index % columns) * cellSize,
    height,
    minZ + Math.floor(index / columns) * cellSize,
  ]);
  const chunks = [];
  const tileSize = 8;
  for (let row = 0; row < rows - 1; row += tileSize) {
    for (let column = 0; column < columns - 1; column += tileSize) {
      const endRow = Math.min(rows - 1, row + tileSize);
      const endColumn = Math.min(columns - 1, column + tileSize);
      const levels = [];
      for (const stride of [1, 2, 4]) {
        const faces = [];
        for (let r = row; r < endRow; r += stride) {
          for (let c = column; c < endColumn; c += stride) {
            const nextRow = Math.min(endRow, r + stride),
              nextColumn = Math.min(endColumn, c + stride);
            const a = vertices[r * columns + c],
              b = vertices[r * columns + nextColumn];
            const d = vertices[nextRow * columns + c],
              e = vertices[nextRow * columns + nextColumn];
            const color =
              track.environment?.terrainNear ||
              track.environment?.ground ||
              "#b39165";
            faces.push(
              { points: [a, b, d], color },
              { points: [b, e, d], color },
            );
          }
        }
        levels.push(faces);
      }
      const x = minX + ((column + endColumn) / 2) * cellSize;
      const z = minZ + ((row + endRow) / 2) * cellSize;
      const radius =
        (Math.hypot(endColumn - column, endRow - row) * cellSize) / 2;
      const allVertices = levels[0].flatMap((face) => face.points);
      chunks.push({
        x,
        z,
        radius,
        minY: Math.min(...allVertices.map((vertex) => vertex[1])),
        maxY: Math.max(...allVertices.map((vertex) => vertex[1])),
        levels,
      });
    }
  }
  return chunks;
}
