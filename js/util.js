'use strict';
/* Shared helpers, number formatting, noise and save data. */
window.G = { W: 1920, H: 1080 };

G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
G.lerp = (a, b, t) => a + (b - a) * t;
G.rnd = Math.random;
G.rr = (a, b) => a + Math.random() * (b - a);
G.TAU = Math.PI * 2;

G.angDiff = function (a, b) {
  let d = a - b;
  while (d > Math.PI) d -= G.TAU;
  while (d < -Math.PI) d += G.TAU;
  return d;
};

G.fmt = function (n) {
  n = Math.floor(n);
  if (n >= 1e9) return parseFloat((n / 1e9).toFixed(2)) + 'B';
  if (n >= 1e6) return parseFloat((n / 1e6).toFixed(2)) + 'M';
  if (n >= 1e4) return Math.floor(n / 1e3) + 'K';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

G.hash = function (x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

G.vnoise = function (x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = G.hash(xi, yi, s), b = G.hash(xi + 1, yi, s);
  const c = G.hash(xi, yi + 1, s), d = G.hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/* The stage is a fixed 1920x1080 surface scaled to the window. */
G.view = { s: 1, ox: 0, oy: 0 };
G.toStage = function (e) {
  return { x: (e.clientX - G.view.ox) / G.view.s, y: (e.clientY - G.view.oy) / G.view.s };
};

/* ------------------------------------------------------------------ save */
G.SAVE_KEY = 'orcProblemSave_v2';
G.save = {
  data: null,
  fresh() {
    return {
      crystals: 0, orbs: 0, cubes: 0,
      up: { gunner: 1, missile: 1 },
      levels: {},
      layouts: {},
      vol: 0.5,
      stats: { kills: 0, runs: 0, best: 0 },
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(G.SAVE_KEY);
      this.data = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
    } catch (e) {
      this.data = this.fresh();
    }
    this.data.up.gunner = Math.max(1, this.data.up.gunner || 0);
    this.data.up.missile = Math.max(1, this.data.up.missile || 0);
    return this.data;
  },
  commit() {
    try { localStorage.setItem(G.SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
  },
  reset() {
    this.data = this.fresh();
    this.commit();
  },
};
