'use strict';
/* Terrain: octilinear CSG shapes -> 2px render mask (pixel-art terrain) -> 4px collision grid,
   wall distance, flow field (Dijkstra with a light wall cost) and placement helpers. */

G.GW = 480; G.GH = 270; G.CS = 4;
G.RW = 960; G.RH = 540; G.RS = 2;

(function () {
  const GW = G.GW, GH = G.GH, CS = G.CS, N = GW * GH;
  const RW = G.RW, RH = G.RH, RS = G.RS, RN = RW * RH;

  /* ------------------------------------------------------------- shapes */
  const shape = (x0, y0, x1, y1, fn) => ({ bb: [x0, y0, x1, y1], in: fn });
  // axis-aligned rectangle with 45-degree chamfered corners
  function oct(x0, y0, x1, y1, c) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, k = hx + hy - (c || 0);
    return shape(x0, y0, x1, y1, (px, py) => {
      const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
      return dx <= hx && dy <= hy && dx + dy <= k;
    });
  }
  // regular octagon with inradius r
  function octagon(cx, cy, r) {
    const k = r * Math.SQRT2;
    return shape(cx - r, cy - r, cx + r, cy + r, (px, py) => {
      const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
      return dx <= r && dy <= r && dx + dy <= k;
    });
  }
  function disc(cx, cy, r) {
    return shape(cx - r, cy - r, cx + r, cy + r, (px, py) => (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r);
  }
  // straight band of half-width h along a segment (flat, square ends)
  function band(ax, ay, bx, by, h) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    return shape(Math.min(ax, bx) - h, Math.min(ay, by) - h, Math.max(ax, bx) + h, Math.max(ay, by) + h, (px, py) => {
      const rx = px - ax, ry = py - ay, t = rx * ux + ry * uy;
      return t >= 0 && t <= l && Math.abs(rx * uy - ry * ux) <= h;
    });
  }
  function poly(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const n = pts.length;
    return shape(x0, y0, x1, y1, (px, py) => {
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
        if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
      }
      return inside;
    });
  }
  // octilinear lane: bands joined by octagons, which chamfers every outer bend at 45 degrees
  const lane = (pts, w) => {
    const h = w / 2, out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(['+', band(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], h)]);
    for (let i = 1; i < pts.length - 1; i++) out.push(['+', octagon(pts[i][0], pts[i][1], h)]);
    return out;
  };
  const add = s => ['+', s];
  const sub = s => ['-', s];

  /* -------------------------------------------------------------- themes
     Colours sampled from the original's screenshots (grass, desert, teal); the rest are in the same style.
     style: 'grass' = olive turf with tuft marks + grass fringe over the cliff,
            'dash'  = wavy horizontal strata on the high ground (desert/canyon/purple),
            'flat'  = plain slab (teal), 'tile' = concrete slabs. */
  const THEMES = {
    grass: { style: 'grass', low: [125, 71, 0], high: [111, 119, 0], mark: [98, 105, 0], fringe: [128, 137, 12], cliff: [58, 28, 0], lip: [52, 26, 0], outline: [96, 103, 0], cliffH: 4 },
    desert: { style: 'dash', low: [142, 98, 51], high: [152, 119, 86], mark: [136, 98, 56], cliff: [72, 38, 28], lip: [64, 34, 20], outline: [72, 39, 22], cliffH: 6 },
    lake: { style: 'flat', low: [92, 98, 84], high: [112, 146, 147], mark: [104, 136, 138], cliff: [44, 62, 66], lip: [36, 52, 56], outline: [52, 76, 80], cliffH: 5 },
    canyon: { style: 'dash', low: [150, 84, 56], high: [184, 116, 80], mark: [164, 96, 62], cliff: [86, 38, 28], lip: [70, 30, 22], outline: [74, 32, 24], cliffH: 6 },
    purple: { style: 'dash', low: [110, 88, 156], high: [198, 168, 122], mark: [178, 146, 102], cliff: [70, 50, 92], lip: [58, 40, 76], outline: [64, 44, 80], cliffH: 5 },
    concrete: { style: 'tile', low: [170, 172, 176], high: [124, 128, 138], mark: [112, 116, 126], cliff: [58, 60, 70], lip: [44, 46, 54], outline: [52, 54, 62], cliffH: 5 },
  };
  G.THEMES = THEMES;

  /* -------------------------------------------------------------- levels
     World is 1920x1080. Lanes are octilinear (0/45/90 degrees) like the original's maps. */
  G.LEVELS = [
    { id: '1.1', name: 'The Dirt Road', theme: 'grass', orcs: 400, dur: 34, spd: 1.0, hp: 1, seed: 11,
      spawns: [{ x: 345, y: 1046, r: 60 }], exits: [{ x: 1886, y: 570, r: 90 }],
      ops: () => lane([[345, 1200], [345, 760], [475, 630], [1000, 630], [1060, 570], [2040, 570]], 240) },
    { id: '1.2', name: 'Fork in the Road', theme: 'grass', orcs: 900, dur: 42, spd: 1.05, hp: 1.8, seed: 12,
      spawns: [{ x: 345, y: 1046, r: 60 }, { x: 1300, y: 36, r: 60 }], exits: [{ x: 1886, y: 570, r: 90 }],
      ops: () => [].concat(
        lane([[345, 1200], [345, 760], [475, 630], [1000, 630], [1060, 570], [2040, 570]], 240),
        lane([[1300, -120], [1300, 300], [1000, 600]], 250)) },
    { id: '2.1', name: 'Desert Switchback', theme: 'desert', orcs: 2000, dur: 52, spd: 1.1, hp: 3.2, seed: 21,
      spawns: [{ x: 36, y: 150, r: 50 }], exits: [{ x: 1886, y: 890, r: 80 }],
      ops: () => lane([[-100, 150], [1640, 150], [1640, 520], [290, 520], [290, 890], [2040, 890]], 190) },
    { id: '2.2', name: 'Plateau Maze', theme: 'desert', orcs: 4000, dur: 62, spd: 1.15, hp: 5.7, seed: 22,
      spawns: [{ x: 70, y: 540, r: 60 }], exits: [{ x: 1856, y: 540, r: 90 }],
      ops: () => {
        const o = [add(oct(-40, -40, 1960, 1120))];
        for (let c = 0; c < 5; c++) {
          for (let r = -1; r < 4; r++) {
            const x0 = 240 + c * 290, y0 = 40 + r * 275 + (c & 1 ? 137 : 0);
            if (y0 > 1040 || y0 + 180 < 0) continue;
            if ((c === 2 && r === 1) || (c === 4 && r === 2)) continue; // a couple of open plazas
            o.push(sub(oct(x0, y0, x0 + 200, y0 + 180, 44)));
          }
        }
        return o;
      } },
    { id: '3.1', name: 'Flooded Basin', theme: 'lake', orcs: 7000, dur: 74, spd: 1.2, hp: 10, seed: 31,
      spawns: [{ x: 36, y: 540, r: 55 }], exits: [{ x: 1886, y: 540, r: 80 }],
      ops: () => [].concat(
        [add(oct(70, 60, 1850, 1020, 230))],
        lane([[-100, 540], [200, 540]], 220), lane([[1700, 540], [2040, 540]], 220),
        [sub(oct(470, 290, 1350, 600, 80)), add(oct(770, 470, 1050, 640, 50)),
         sub(octagon(330, 300, 70)), sub(octagon(330, 790, 70)), sub(octagon(1560, 280, 80)),
         sub(octagon(1560, 800, 80)), sub(octagon(910, 860, 70))]) },
    { id: '3.2', name: 'Three Roads', theme: 'lake', orcs: 12000, dur: 86, spd: 1.28, hp: 16, seed: 32,
      spawns: [{ x: 36, y: 200, r: 45 }, { x: 36, y: 600, r: 45 }, { x: 36, y: 950, r: 45 }],
      exits: [{ x: 1886, y: 200, r: 65 }, { x: 1886, y: 600, r: 65 }, { x: 1886, y: 950, r: 65 }],
      ops: () => [].concat(
        lane([[-100, 200], [560, 200], [700, 340], [1220, 340], [1360, 200], [2040, 200]], 140),
        lane([[-100, 600], [2040, 600]], 160),
        lane([[-100, 950], [560, 950], [700, 810], [1220, 810], [1360, 950], [2040, 950]], 140),
        [sub(octagon(960, 600, 38))]) },
    { id: '4.1', name: 'Red Canyon', theme: 'canyon', orcs: 20000, dur: 98, spd: 1.36, hp: 24, seed: 41,
      spawns: [{ x: 40, y: 250, r: 80 }], exits: [{ x: 1880, y: 690, r: 110 }],
      ops: () => [].concat(
        lane([[-100, 250], [560, 250], [1000, 690], [2040, 690]], 360),
        [sub(oct(470, 190, 620, 300, 34)), sub(octagon(880, 560, 70)), sub(oct(1290, 610, 1440, 770, 36)), sub(octagon(1660, 700, 55))]) },
    { id: '4.2', name: 'Canyon Run', theme: 'canyon', orcs: 32000, dur: 110, spd: 1.44, hp: 35, seed: 42,
      spawns: [{ x: 40, y: 880, r: 80 }], exits: [{ x: 1880, y: 200, r: 100 }],
      ops: () => [].concat(
        lane([[-100, 880], [300, 880], [640, 540], [1000, 540], [1340, 200], [2040, 200]], 300),
        [sub(octagon(650, 600, 60)), sub(octagon(1340, 262, 60)), sub(oct(140, 830, 280, 930, 30)), sub(oct(1600, 120, 1740, 230, 30))]) },
    { id: '5.1', name: 'Purple Plains', theme: 'purple', orcs: 50000, dur: 124, spd: 1.52, hp: 55, seed: 51,
      spawns: [{ x: 36, y: 330, r: 50 }, { x: 36, y: 540, r: 50 }, { x: 36, y: 760, r: 50 }], exits: [{ x: 1880, y: 540, r: 150 }],
      ops: () => [
        add(oct(-40, 110, 1960, 970)),
        sub(poly([[-60, 50], [210, 50], [-60, 320]])), sub(poly([[-60, 1030], [210, 1030], [-60, 760]])),
        sub(poly([[1980, 50], [1710, 50], [1980, 320]])), sub(poly([[1980, 1030], [1710, 1030], [1980, 760]])),
        sub(disc(560, 340, 54)), sub(disc(560, 760, 54)), sub(disc(1000, 540, 74)),
        sub(disc(1400, 320, 54)), sub(disc(1400, 770, 54)), sub(disc(960, 250, 44)), sub(disc(960, 840, 44))] },
    { id: '5.2', name: 'Purple Crossing', theme: 'purple', orcs: 75000, dur: 136, spd: 1.6, hp: 90, seed: 52,
      spawns: [{ x: 320, y: 36, r: 60 }, { x: 640, y: 1044, r: 50 }, { x: 36, y: 700, r: 60 }],
      exits: [{ x: 1880, y: 860, r: 100 }, { x: 1880, y: 300, r: 100 }],
      ops: () => [
        add(oct(-40, -40, 1960, 1120)),
        sub(oct(500, 250, 860, 420, 60)), sub(oct(1100, 270, 1420, 460, 60)),
        sub(oct(500, 610, 840, 820, 60)), sub(oct(1080, 650, 1480, 880, 60)),
        sub(poly([[-60, 110], [150, 110], [-60, 320]])), sub(poly([[1980, 1130], [1780, 1130], [1980, 930]])),
        sub(oct(-40, 1000, 520, 1120)), sub(oct(760, 960, 1300, 1120)), sub(oct(660, -40, 1240, 90))] },
    { id: '6.1', name: 'Concrete Maze', theme: 'concrete', orcs: 110000, dur: 148, spd: 1.7, hp: 220, seed: 61,
      spawns: [{ x: 36, y: 540, r: 70 }], exits: [{ x: 1886, y: 540, r: 80 }],
      ops: () => [].concat(
        lane([[-100, 540], [380, 540], [640, 280], [1060, 280], [1260, 480], [1260, 780], [1560, 780], [1800, 540], [2040, 540]], 150),
        lane([[640, 280], [640, 800], [1260, 800]], 100)) },
    { id: '6.2', name: 'The Arena', theme: 'concrete', orcs: 160000, dur: 160, spd: 1.8, hp: 170, seed: 62,
      spawns: [{ x: 36, y: 200, r: 60 }, { x: 36, y: 900, r: 60 }], exits: [{ x: 1886, y: 200, r: 65 }, { x: 1886, y: 900, r: 65 }],
      ops: () => [].concat(
        [add(octagon(960, 550, 300))],
        lane([[-100, 200], [400, 200], [720, 520]], 130), lane([[-100, 900], [400, 900], [720, 580]], 130),
        lane([[1200, 520], [1520, 200], [2040, 200]], 130), lane([[1200, 580], [1520, 900], [2040, 900]], 130),
        [sub(octagon(960, 550, 95)), sub(octagon(960, 330, 40)), sub(octagon(960, 770, 40))]) },
  ];

  /* ------------------------------------------------------------- helpers */
  function distField(mask, target) {
    const d = new Float32Array(N), BIG = 1e5, D = 1.4142;
    for (let i = 0; i < N; i++) d[i] = mask[i] === target ? 0 : BIG;
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        let v = d[i];
        if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
        if (y > 0) {
          if (d[i - GW] + 1 < v) v = d[i - GW] + 1;
          if (x > 0 && d[i - GW - 1] + D < v) v = d[i - GW - 1] + D;
          if (x < GW - 1 && d[i - GW + 1] + D < v) v = d[i - GW + 1] + D;
        }
        d[i] = v;
      }
    }
    for (let y = GH - 1; y >= 0; y--) {
      for (let x = GW - 1; x >= 0; x--) {
        const i = y * GW + x;
        let v = d[i];
        if (x < GW - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
        if (y < GH - 1) {
          if (d[i + GW] + 1 < v) v = d[i + GW] + 1;
          if (x < GW - 1 && d[i + GW + 1] + D < v) v = d[i + GW + 1] + D;
          if (x > 0 && d[i + GW - 1] + D < v) v = d[i + GW - 1] + D;
        }
        d[i] = v;
      }
    }
    for (let i = 0; i < N; i++) d[i] = d[i] > 0 ? d[i] * CS - CS / 2 : 0;
    return d;
  }

  class Heap {
    constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
    push(k, v) {
      let i = this.n++;
      const K = this.k, V = this.v;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (K[p] <= k) break;
        K[i] = K[p]; V[i] = V[p]; i = p;
      }
      K[i] = k; V[i] = v;
    }
    pop() {
      const K = this.k, V = this.v, top = V[0], n = --this.n;
      this.topK = K[0];
      if (n > 0) {
        const k = K[n], v = V[n];
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && K[c + 1] < K[c]) c++;
          if (K[c] >= k) break;
          K[i] = K[c]; V[i] = V[c]; i = c;
        }
        K[i] = k; V[i] = v;
      }
      return top;
    }
  }

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  const exitCells = (def, low, fn) => {
    for (const e of def.exits) {
      const cx = (e.x / CS) | 0, cy = (e.y / CS) | 0, rr = Math.ceil(e.r / CS);
      for (let y = Math.max(0, cy - rr); y <= Math.min(GH - 1, cy + rr); y++) {
        for (let x = Math.max(0, cx - rr); x <= Math.min(GW - 1, cx + rr); x++) {
          const dx = (x + 0.5) * CS - e.x, dy = (y + 0.5) * CS - e.y, i = y * GW + x;
          if (dx * dx + dy * dy <= e.r * e.r && low[i]) fn(i);
        }
      }
    }
  };

  /* ---------------------------------------------------- base masks (cheap) */
  G.buildBase = function (def) {
    if (def._base) return def._base;
    // render mask at 2px: 1 = low ground (walkable), 0 = high ground
    const hr = new Uint8Array(RN);
    for (const [op, sh] of def.ops()) {
      const v = op === '+' ? 1 : 0, bb = sh.bb, test = sh.in;
      const x0 = Math.max(0, Math.floor(bb[0] / RS) - 1), x1 = Math.min(RW - 1, Math.ceil(bb[2] / RS) + 1);
      const y0 = Math.max(0, Math.floor(bb[1] / RS) - 1), y1 = Math.min(RH - 1, Math.ceil(bb[3] / RS) + 1);
      for (let y = y0; y <= y1; y++) {
        const wy = (y + 0.5) * RS;
        for (let x = x0; x <= x1; x++) if (test((x + 0.5) * RS, wy)) hr[y * RW + x] = v;
      }
    }
    // collision grid: a 4px cell is ground when at least half of its render texels are
    const low = new Uint8Array(N);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const j = y * 2 * RW + x * 2;
        low[y * GW + x] = hr[j] + hr[j + 1] + hr[j + RW] + hr[j + RW + 1] >= 2 ? 1 : 0;
      }
    }
    // keep only ground connected to an exit
    const reach = new Uint8Array(N), stack = [];
    exitCells(def, low, i => { if (!reach[i]) { reach[i] = 1; stack.push(i); } });
    if (!stack.length) console.warn('level', def.id, 'has no exit cells');
    while (stack.length) {
      const i = stack.pop(), x = i % GW, y = (i / GW) | 0;
      if (x > 0 && low[i - 1] && !reach[i - 1]) { reach[i - 1] = 1; stack.push(i - 1); }
      if (x < GW - 1 && low[i + 1] && !reach[i + 1]) { reach[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && low[i - GW] && !reach[i - GW]) { reach[i - GW] = 1; stack.push(i - GW); }
      if (y < GH - 1 && low[i + GW] && !reach[i + GW]) { reach[i + GW] = 1; stack.push(i + GW); }
    }
    // drop render texels belonging to unreachable pockets
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const i = y * RW + x;
        if (!hr[i]) continue;
        const cx = x >> 1, cy = y >> 1;
        let ok = 0;
        for (let oy = -1; oy <= 1 && !ok; oy++) {
          const ny = cy + oy;
          if (ny < 0 || ny >= GH) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = cx + ox;
            if (nx >= 0 && nx < GW && reach[ny * GW + nx]) { ok = 1; break; }
          }
        }
        if (!ok) hr[i] = 0;
      }
    }
    def._base = { low: reach, hr };
    return def._base;
  };

  /* --------------------------------------------------- full map + flow field */
  function buildFlow(def, low, wd, exposure) {
    const dist = new Float64Array(N).fill(Infinity);
    const heap = new Heap(N * 6);
    exitCells(def, low, i => { if (dist[i] !== 0) { dist[i] = 0; heap.push(0, i); } });
    while (heap.n) {
      const i = heap.pop(), k = heap.topK;
      if (k > dist[i]) continue;
      const x = i % GW, y = (i / GW) | 0;
      for (let n = 0; n < 8; n++) {
        const nx = x + NB[n][0], ny = y + NB[n][1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const j = ny * GW + nx;
        if (!low[j]) continue;
        const diag = n >= 4;
        if (diag && (!low[y * GW + nx] || !low[ny * GW + x])) continue;
        const near = wd[j] < 26 ? 1 - wd[j] / 26 : 0;
        const risk = exposure ? exposure[j] : 0;
        const nd = k + (diag ? 1.4142 : 1) * CS * (1 + 1.8 * near * near + risk);
        if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
      }
    }
    let fx = new Float32Array(N), fy = new Float32Array(N);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        if (!low[i] || dist[i] === Infinity) continue;
        let sx = 0, sy = 0;
        for (let n = 0; n < 8; n++) {
          const nx = x + NB[n][0], ny = y + NB[n][1];
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const j = ny * GW + nx;
          if (!low[j] || dist[j] === Infinity) continue;
          const l = n >= 4 ? 1.4142 : 1;
          const w = (dist[i] - dist[j]) / l;
          sx += NB[n][0] / l * w; sy += NB[n][1] / l * w;
        }
        if (dist[i] === 0) {
          let best = null, bd = 1e12;
          for (const e of def.exits) { const d = (e.x - (x + 0.5) * CS) ** 2 + (e.y - (y + 0.5) * CS) ** 2; if (d < bd) { bd = d; best = e; } }
          sx = best.x - (x + 0.5) * CS; sy = best.y - (y + 0.5) * CS;
        }
        const l = Math.hypot(sx, sy) || 1;
        fx[i] = sx / l; fy[i] = sy / l;
      }
    }
    const blur = (ax, ay, passes) => {
      for (let p = 0; p < passes; p++) {
        const bx = new Float32Array(N), by = new Float32Array(N);
        for (let y = 0; y < GH; y++) {
          for (let x = 0; x < GW; x++) {
            const i = y * GW + x;
            if (!low[i]) continue;
            let sx = ax[i] * 2, sy = ay[i] * 2;
            for (let n = 0; n < 8; n++) {
              const nx = x + NB[n][0], ny = y + NB[n][1];
              if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
              const j = ny * GW + nx;
              if (low[j]) { sx += ax[j]; sy += ay[j]; }
            }
            const l = Math.hypot(sx, sy) || 1;
            bx[i] = sx / l; by[i] = sy / l;
          }
        }
        ax = bx; ay = by;
      }
      return [ax, ay];
    };
    [fx, fy] = blur(fx, fy, 2);
    return { flowX: fx, flowY: fy, dist };
  }

  // Turrets are fixed during battle. Price their firing footprints once, never block a lane.
  G.planTurretRoutes = function (map, turrets) {
    map.safeFlow = null;
    if (!turrets.length) return;
    const exposure = new Float32Array(N);
    for (const t of turrets) {
      const kind = t.def.kind, lob = kind === 'lob', radial = lob || kind === 'tesla';
      const cx = lob ? t.ax : t.x, cy = lob ? t.ay : t.y;
      const r = lob ? t.def.aimR + t.st.blast * 0.5 : t.st.range;
      const ux = Math.cos(t.aim), uy = Math.sin(t.aim);
      const cone = Math.cos(t.arc + (kind === 'flame' ? t.st.half : 0));
      const x0 = Math.max(0, Math.floor((cx - r) / CS)), x1 = Math.min(GW - 1, Math.floor((cx + r) / CS));
      const y0 = Math.max(0, Math.floor((cy - r) / CS)), y1 = Math.min(GH - 1, Math.floor((cy + r) / CS));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * GW + x;
          if (!map.low[i]) continue;
          const dx = (x + 0.5) * CS - cx, dy = (y + 0.5) * CS - cy, d2 = dx * dx + dy * dy;
          if (d2 > r * r || (!radial && dx * ux + dy * uy < Math.sqrt(d2) * cone)) continue;
          exposure[i] = Math.min(3, exposure[i] + 1.5);
        }
      }
    }
    map.safeFlow = buildFlow(map.def, map.low, map.wd, exposure);
  };

  G.buildMap = function (def) {
    const { low, hr } = G.buildBase(def);
    const wd = distField(low, 0), hd = distField(low, 1);

    // wall repulsion direction (points away from walls)
    const gx = new Float32Array(N), gy = new Float32Array(N);
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x;
        if (!low[i] || wd[i] > 20) continue;
        const dx = wd[i + 1] - wd[i - 1], dy = wd[i + GW] - wd[i - GW];
        const l = Math.hypot(dx, dy);
        if (l > 0.01) { gx[i] = dx / l; gy[i] = dy / l; }
      }
    }

    const map = Object.assign({ def, low, hr, wd, hd, wgx: gx, wgy: gy, safeFlow: null }, buildFlow(def, low, wd));
    map.spots = autoSpots(map, 12, def.seed);
    return map;
  };

  // good turret spots on high ground overlooking the lanes (used by the title-screen demo / bots)
  function autoSpots(map, count, seed) {
    const { low, hd } = map, cand = [];
    for (let y = 16; y < GH - 16; y += 2) {
      for (let x = 16; x < GW - 16; x += 2) {
        const i = y * GW + x, wy = (y + 0.5) * CS;
        if (!low[i] && hd[i] >= 24 && hd[i] <= 70 && wy > 110 && wy < 950) cand.push(i);
      }
    }
    cand.sort((a, b) => G.hash(a, 3, seed) - G.hash(b, 3, seed));
    const spots = [];
    for (const i of cand) {
      if (spots.length >= count) break;
      const x = ((i % GW) + 0.5) * CS, y = (((i / GW) | 0) + 0.5) * CS;
      let ok = true;
      for (const p of spots) if ((p.x - x) ** 2 + (p.y - y) ** 2 < 230 * 230) { ok = false; break; }
      if (ok) spots.push({ x, y });
    }
    return spots;
  }

  /* ----------------------------------------------------------- queries */
  G.cellAt = (x, y) => ((y / CS) | 0) * GW + ((x / CS) | 0);
  G.isLowAt = function (m, x, y) {
    if (x < 0 || y < 0 || x >= G.W || y >= G.H) return false;
    return m.low[((y / CS) | 0) * GW + ((x / CS) | 0)] === 1;
  };
  G.canPlace = function (m, x, y) {
    if (x < 24 || y < 24 || x > G.W - 24 || y > G.H - 24) return false;
    const i = G.cellAt(x, y);
    return !m.low[i] && m.hd[i] >= 10;
  };

  /* ------------------------------------------------------ terrain render
     One texel = 2 world px. Low ground is flat; south-facing edges of high ground get a dark
     cliff face (with a grass fringe / notched lip), other edges a 1-texel outline. */
  const FRINGE = [0, 1, 2, 1, 0, 1, 2, 2, 1, 0, 1, 2];

  G.renderTerrain = function (map, canvas) {
    canvas.width = RW; canvas.height = RH;
    const ctx = canvas.getContext('2d'), th = THEMES[map.def.theme];
    const img = ctx.createImageData(RW, RH), d = img.data;
    const hr = map.hr, seed = map.def.seed, CH = th.cliffH, st = th.style;
    const L = (x, y) => hr[(y < 0 ? 0 : y >= RH ? RH - 1 : y) * RW + (x < 0 ? 0 : x >= RW ? RW - 1 : x)];
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const i = y * RW + x, p = i * 4, h1 = G.hash(x, y, seed + 2);
        let c, k = 1;
        if (hr[i]) {
          let t = 0;
          for (let s = 1; s <= CH; s++) if (!L(x, y - s)) { t = s; break; }
          if (t) {
            c = th.cliff;
            k = 0.86 + 0.16 * (t / CH) + (G.hash(x >> 1, 7, seed) - 0.5) * 0.08;
          } else {
            c = th.low;
            k = 0.975 + h1 * 0.05;
            if (st === 'grass') { if (((x + y * 2) % 9 === 0) && G.hash(x >> 2, y >> 2, seed + 4) > 0.55) k *= 0.94; }
            else if (st === 'tile') { if (x % 24 === 0 || y % 24 === 0) k *= 0.93; }
            else if (h1 > 0.992) k *= 0.9;
            if (!L(x, y - CH - 1)) k *= 0.84;
            else if (!L(x, y - CH - 2)) k *= 0.92;
          }
        } else {
          let db = 0;
          for (let s = 1; s <= 4; s++) if (L(x, y + s)) { db = s; break; }
          const side = L(x - 1, y) || L(x + 1, y) || L(x, y - 1);
          if (db && st === 'grass') {
            const f = FRINGE[(x + ((G.hash(x / 12 | 0, 3, seed) * 12) | 0)) % FRINGE.length];
            if (db <= 1 + f) { c = th.lip; k = 1; }
            else if (db === 2 + f) { c = th.fringe; k = 1 + (h1 - 0.5) * 0.1; }
            else { c = th.high; k = 1; }
          } else if (db === 1 || (db === 2 && G.hash(x >> 1, 9, seed) > 0.62)) {
            c = th.lip; k = 1;
          } else if (side) {
            c = th.outline; k = 1;
          } else {
            c = th.high; k = 0.985 + h1 * 0.03;
            if (st === 'grass') {
              const cy = y >> 3, lx = (x + (cy & 1) * 4) & 7, ly = y & 7;
              const v = G.hash((x + (cy & 1) * 4) >> 3, cy, seed + 5);
              if (v < 0.5 ? ((ly === 3 && (lx === 2 || lx === 4)) || (ly === 4 && lx === 3))
                : ((lx === 2 || lx === 4) && (ly === 2 || ly === 3)) || (ly === 4 && lx === 3)) c = th.mark;
            } else if (st === 'dash') {
              const row = Math.floor(y / 11);
              const yy = y + ((G.vnoise(x / 7, row * 3.1, seed + 5) * 3) | 0);
              const shift = (G.hash(row, 1, seed + 6) * 8) | 0;
              if (yy % 11 === 0 && G.hash((x + shift) >> 3, row, seed + 6) > 0.32) c = th.mark;
            } else if (st === 'tile') {
              if (x % 32 === 0 || y % 32 === 0) c = th.mark;
            } else if (h1 > 0.994) {
              c = th.mark;
            }
          }
        }
        d[p] = c[0] * k; d[p + 1] = c[1] * k; d[p + 2] = c[2] * k; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  G.drawPreview = function (canvas, def) {
    const base = G.buildBase(def), th = THEMES[def.theme], w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      const ry = (y * RH / h) | 0;
      for (let x = 0; x < w; x++) {
        const rx = (x * RW / w) | 0, p = (y * w + x) * 4;
        let c = base.hr[ry * RW + rx] ? th.low : th.high;
        if (base.hr[ry * RW + rx] && ry > 2 && !base.hr[(ry - 3) * RW + rx]) c = th.cliff;
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#ff5a4a';
    for (const e of def.exits) ctx.fillRect(Math.min(w - 8, e.x / G.W * w - 3), e.y / G.H * h - 3, 6, 6);
    ctx.fillStyle = '#7dff63';
    for (const s of def.spawns) ctx.fillRect(Math.max(2, s.x / G.W * w - 3), Math.min(h - 8, Math.max(2, s.y / G.H * h - 3)), 6, 6);
  };
})();
