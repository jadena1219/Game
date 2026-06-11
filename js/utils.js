// Shared helpers used across modules.
export const TAU = Math.PI * 2;

// Tiny deterministic LCG — the same generator the biome painters seed their
// scatter with. (Several bake methods in js/game/ still carry inline copies;
// they are kept verbatim by the refactor and flagged for a later cleanup.)
export function rngFrom(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
export function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
