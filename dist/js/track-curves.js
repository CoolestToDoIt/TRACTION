// Centripetal Catmull–Rom avoids the overshoot caused by very uneven control spacing.
export function sampleCentripetal(control, index, fraction) {
  const count = control.length;
  const points = [-1, 0, 1, 2].map(
    (offset) => control[(index + offset + count) % count],
  );
  const knots = [0];
  for (let i = 1; i < 4; i++) {
    const distance = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
    knots.push(knots[i - 1] + Math.sqrt(Math.max(distance, 0.001)));
  }
  const time = knots[1] + fraction * (knots[2] - knots[1]);
  const blend = (a, b, start, end) =>
    a.map(
      (value, axis) =>
        (value * (end - time)) / (end - start) +
        (b[axis] * (time - start)) / (end - start),
    );
  const first = blend(points[0], points[1], knots[0], knots[1]);
  const second = blend(points[1], points[2], knots[1], knots[2]);
  const third = blend(points[2], points[3], knots[2], knots[3]);
  return blend(
    blend(first, second, knots[0], knots[2]),
    blend(second, third, knots[1], knots[3]),
    knots[1],
    knots[2],
  );
}

// Shape-preserving elevation stays between control heights and has continuous grade.
export function sampleElevation(control, index, fraction, spanLengths = null) {
  const count = control.length;
  const at = (offset) => control[(index + offset + count) % count];
  const distance = (a, b) =>
    Math.max(0.001, Math.hypot(b[0] - a[0], b[1] - a[1]));
  const tangent = (
    a,
    b,
    c,
    before = distance(a, b),
    after = distance(b, c),
  ) => {
    const left = (b[2] - a[2]) / before,
      right = (c[2] - b[2]) / after;
    if (left * right <= 0) return 0;
    const w1 = 2 * after + before,
      w2 = after + 2 * before;
    return (w1 + w2) / (w1 / left + w2 / right);
  };
  const a = at(-1),
    b = at(0),
    c = at(1),
    d = at(2);
  const length = spanLengths?.[index] ?? distance(b, c),
    before = spanLengths?.[(index - 1 + count) % count] ?? distance(a, b),
    after = spanLengths?.[(index + 1) % count] ?? distance(c, d),
    t = fraction,
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * b[2] +
    (t3 - 2 * t2 + t) * length * tangent(a, b, c, before, length) +
    (-2 * t3 + 3 * t2) * c[2] +
    (t3 - t2) * length * tangent(b, c, d, length, after)
  );
}
