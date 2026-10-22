// Semplificazione di una linea [lng, lat] con Douglas-Peucker. La tolleranza è in metri: i punti
// si proiettano su un piano locale (equirettangolare) attorno alla latitudine media della linea.
// Se il risultato supera maxPoints, la tolleranza raddoppia finché ci sta. Gli estremi restano sempre.

export type LngLat = [number, number];

const METERS_PER_DEGREE_LAT = 110_574;
const METERS_PER_DEGREE_LNG_AT_EQUATOR = 111_320;

function project(points: readonly LngLat[]): [number, number][] {
  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const kx = METERS_PER_DEGREE_LNG_AT_EQUATOR * Math.cos((meanLat * Math.PI) / 180);
  return points.map(([lng, lat]) => [lng * kx, lat * METERS_PER_DEGREE_LAT]);
}

// Distanza in metri del punto p dal segmento a-b (sul piano proiettato).
function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const cross = Math.abs(dx * (a[1] - p[1]) - (a[0] - p[0]) * dy);
  return cross / Math.sqrt(lengthSquared);
}

// Indici dei punti da tenere. Pila esplicita: niente ricorsione su linee lunghe.
function keptIndices(projected: readonly [number, number][], toleranceM: number): number[] {
  const last = projected.length - 1;
  const keep = new Uint8Array(projected.length);
  keep[0] = 1;
  keep[last] = 1;
  const stack: [number, number][] = [[0, last]];
  while (stack.length > 0) {
    const [first, end] = stack.pop()!;
    let furthest = -1;
    let furthestDistance = 0;
    for (let i = first + 1; i < end; i++) {
      const distance = distanceToSegment(projected[i]!, projected[first]!, projected[end]!);
      if (distance > furthestDistance) {
        furthest = i;
        furthestDistance = distance;
      }
    }
    if (furthest !== -1 && furthestDistance > toleranceM) {
      keep[furthest] = 1;
      stack.push([first, furthest], [furthest, end]);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i <= last; i++) if (keep[i] === 1) indices.push(i);
  return indices;
}

export function simplifyLine(points: readonly LngLat[], toleranceM = 30, maxPoints = 400): LngLat[] {
  if (points.length <= 2) return points.map(([lng, lat]) => [lng, lat]);
  const projected = project(points);
  let tolerance = toleranceM;
  let indices = keptIndices(projected, tolerance);
  while (indices.length > maxPoints) {
    tolerance *= 2;
    indices = keptIndices(projected, tolerance);
  }
  return indices.map((i) => [points[i]![0], points[i]![1]]);
}
