// Seeded random helpers: every random choice in the city, traffic and peds
// comes from one of these so a ?seed= URL replays the same Velamar.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}

// The two park blocks, picked deterministically from the seed so the ground
// texture and the building layout always agree on which blocks are green.
export function parkIndices(seed) {
  const a = ((seed * 2654435761) >>> 0) % 49;
  let b = ((seed * 40503 + 17) >>> 0) % 49;
  if (b === a) b = (b + 13) % 49;
  return [a, b];
}
