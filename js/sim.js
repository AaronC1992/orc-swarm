'use strict';
/* Orc crowd simulation: soft-particle fluid.
   - uniform grid (counting sort) for neighbour queries
   - pressure from overlapping neighbours spreads the crowd across the lane
   - crowd density slows movement, so lanes jam, pile up and surge like a liquid
   - flow field (from maps.js) steers orcs towards the exits. */

(function () {
  const CAP = 70000, CELL = 16, HC = CELL * 0.72;
  const GX = Math.ceil(G.W / CELL), GY = Math.ceil(G.H / CELL);
  const R = 15, R2 = R * R;
  const MAP_W = G.GW, CSZ = G.CS;

  G.SRC = ['gunner', 'cannon', 'flame', 'mortar', 'laser', 'tesla', 'grenade', 'missile', 'strafe', 'bomb', 'orbital', 'cryo', 'nuke', 'blast'];
  const SRCI = {};
  G.SRC.forEach((s, i) => { SRCI[s] = i; });
  G.SRCI = SRCI;

  const sim = G.sim = {
    cap: CAP, n: 0, frame: 0, nDead: 0,
    x: new Float32Array(CAP), y: new Float32Array(CAP),
    vx: new Float32Array(CAP), vy: new Float32Array(CAP),
    px: new Float32Array(CAP), py: new Float32Array(CAP),
    hp: new Float32Array(CAP), mhp: new Float32Array(CAP),
    burn: new Float32Array(CAP), frz: new Float32Array(CAP), slow: new Float32Array(CAP),
    dodge: new Float32Array(CAP),
    dens: new Float32Array(CAP), spd: new Float32Array(CAP), fl: new Float32Array(CAP),
    hit: new Int32Array(CAP),
    type: new Uint8Array(CAP), dead: new Uint8Array(CAP), anim: new Uint8Array(CAP), dir: new Uint8Array(CAP),
    cellOf: new Int32Array(CAP),
    cs: new Int32Array(GX * GY + 2), items: new Int32Array(CAP),
    q: new Int32Array(CAP), qn: 0,
    spawnAcc: 0, spawned: 0, time: 0, blasts: [], burnDps: 1.2,
  };
  const A = ['x', 'y', 'vx', 'vy', 'px', 'py', 'hp', 'mhp', 'burn', 'frz', 'slow', 'dodge', 'dens', 'spd', 'fl', 'hit', 'type', 'anim', 'dir'];
  // explosive sources make orcs flash orange-red when hit (cannon, mortar, grenade, missile, bomb, orc blast)
  const FLASH_SRC = new Uint8Array(G.SRC.length);
  [1, 3, 6, 7, 9, 13].forEach(k => { FLASH_SRC[k] = 1; });

  sim.reset = function () {
    this.n = 0; this.nDead = 0; this.frame = 0; this.spawnAcc = 0; this.spawned = 0; this.time = 0;
    this.blasts.length = 0; this.dead.fill(0);
  };

  /* ---------------------------------------------------------- orc spawn */
  sim.spawnOne = function () {
    if (this.n >= this.cap) return false;
    const run = G.run, def = run.def, map = G.map;
    const sp = def.spawns[(Math.random() * def.spawns.length) | 0];
    let x = sp.x, y = sp.y;
    for (let t = 0; t < 14; t++) {
      const a = Math.random() * G.TAU, r = Math.sqrt(Math.random()) * sp.r;
      const cx = sp.x + Math.cos(a) * r, cy = sp.y + Math.sin(a) * r;
      if (G.isLowAt(map, cx, cy)) { x = cx; y = cy; break; }
    }
    const i = this.n++, S = G.S, roll = Math.random();
    let type = 0, hpMul = 1;
    if (roll < S.gold) { type = 2; hpMul = 3; }
    else if (roll < S.gold + S.silver) { type = 1; hpMul = 2; }
    else if (roll < S.gold + S.silver + S.expl) { type = 3; hpMul = 1.5; }
    this.x[i] = x; this.y[i] = y;
    const ci = G.cellAt(x, y);
    this.px[i] = 0; this.py[i] = 0;
    const hp = run.hpMul * hpMul * (0.9 + Math.random() * 0.2);
    this.hp[i] = hp; this.mhp[i] = hp;
    this.burn[i] = 0; this.frz[i] = 0; this.slow[i] = 0; this.dens[i] = 0; this.fl[i] = 0;
    this.spd[i] = 0.85 + Math.random() * 0.3;
    this.hit[i] = -1; this.type[i] = type; this.dead[i] = 0; this.anim[i] = (Math.random() * 256) | 0;
    this.dodge[i] = 0;
    const route = routeFor(map, this.anim[i]);
    this.vx[i] = route.flowX[ci] * 30; this.vy[i] = route.flowY[ci] * 30;
    this.dir[i] = (Math.atan2(this.vy[i], this.vx[i]) / G.TAU * 256) & 255;
    this.spawned++; run.alive++;
    return true;
  };

  sim.spawner = function (dt) {
    const run = G.run;
    if (!run.spawning) return;
    this.time += dt;
    const u = Math.min(1, this.time / run.def.dur);
    const target = Math.floor(run.total * Math.pow(u, 1.35));
    let want = target - this.spawned;
    // stay within the alive cap; the remaining orcs wait outside
    while (want-- > 0 && run.alive < run.aliveCap) {
      if (!this.spawnOne()) break;
    }
    if (this.time >= run.def.dur + 4 && this.spawned < run.total) {
      let extra = Math.min(run.total - this.spawned, 400);
      while (extra-- > 0 && run.alive < run.aliveCap) { if (!this.spawnOne()) break; }
    }
    run.remaining = run.total - this.spawned;
  };

  /* ------------------------------------------------------- reap / kill */
  sim.reap = function () {
    if (!this.nDead) return;
    let n = this.n;
    const dead = this.dead;
    for (let i = 0; i < n;) {
      if (dead[i]) {
        n--;
        if (n !== i) {
          for (let k = 0; k < A.length; k++) { const arr = this[A[k]]; arr[i] = arr[n]; }
          dead[i] = dead[n];
        }
        dead[n] = 0;
      } else i++;
    }
    this.n = n; this.nDead = 0;
  };

  sim.kill = function (i, src) {
    if (this.dead[i]) return;
    this.dead[i] = 1; this.nDead++;
    const run = G.run, t = this.type[i];
    run.kills++; run.alive--;
    run.crystals += run.pay * (t === 2 ? G.ECON.goldPay : t === 1 ? G.ECON.silverPay : 1);
    if (t === 2) run.golds++;
    G.fx.corpse(this.x[i], this.y[i], t);
    if (t === 3) this.blasts.push(this.x[i], this.y[i]);
  };

  sim.leak = function (i) {
    if (this.dead[i]) return;
    this.dead[i] = 2; this.nDead++;
    const run = G.run;
    run.alive--; run.leaked++;
    run.hp -= 1;
    G.fx.leak = 0.35;
    if (run.hp <= 0) run.hp = 0;
  };

  sim.damage = function (i, a, src) {
    if (this.dead[i]) return;
    const run = G.run, S = G.S;
    if (this.slow[i] > 0) a *= 1.1 + S['gr.slow'] * 0.8;
    if (S.head && this.hp[i] >= this.mhp[i] - 0.001) a *= 1 + S.head;
    const real = a > this.hp[i] ? this.hp[i] : a;
    run.dmg[src] += real;
    this.hp[i] -= a;
    if (FLASH_SRC[src]) this.fl[i] = 0.3;
    if (this.hp[i] <= 0) this.kill(i, src);
  };

  sim.impulse = function (i, dx, dy, s) {
    if (this.frz[i] > 0) return;
    this.vx[i] += dx * s; this.vy[i] += dy * s;
  };

  /* -------------------------------------------------------- grid + queries */
  sim.buildGrid = function () {
    const cs = this.cs, n = this.n, x = this.x, y = this.y, cellOf = this.cellOf, items = this.items;
    cs.fill(0);
    for (let i = 0; i < n; i++) {
      let cx = (x[i] / CELL) | 0, cy = (y[i] / CELL) | 0;
      if (cx < 0) cx = 0; else if (cx >= GX) cx = GX - 1;
      if (cy < 0) cy = 0; else if (cy >= GY) cy = GY - 1;
      const c = cy * GX + cx;
      cellOf[i] = c;
      cs[c + 1]++;
    }
    for (let c = 0; c < GX * GY; c++) cs[c + 1] += cs[c];
    const fill = this.fillPos || (this.fillPos = new Int32Array(GX * GY + 1));
    fill.set(cs.subarray(0, GX * GY + 1));
    for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;
  };

  sim.qCircle = function (cx, cy, r) {
    const q = this.q, items = this.items, cs = this.cs, x = this.x, y = this.y, dead = this.dead;
    const r2 = r * r;
    let m = 0;
    const x0 = Math.max(0, ((cx - r) / CELL) | 0), x1 = Math.min(GX - 1, ((cx + r) / CELL) | 0);
    const y0 = Math.max(0, ((cy - r) / CELL) | 0), y1 = Math.min(GY - 1, ((cy + r) / CELL) | 0);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * GX + gx;
        for (let k = cs[c], e = cs[c + 1]; k < e; k++) {
          const j = items[k];
          if (dead[j]) continue;
          const dx = x[j] - cx, dy = y[j] - cy;
          if (dx * dx + dy * dy <= r2) q[m++] = j;
        }
      }
    }
    this.qn = m;
    return m;
  };

  sim.qSegment = function (ax, ay, bx, by, hw) {
    const q = this.q, items = this.items, cs = this.cs, x = this.x, y = this.y, dead = this.dead;
    const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby || 1;
    const hw2 = hw * hw, cr = hw + CELL * 0.75;
    let m = 0;
    const x0 = Math.max(0, ((Math.min(ax, bx) - hw) / CELL) | 0), x1 = Math.min(GX - 1, ((Math.max(ax, bx) + hw) / CELL) | 0);
    const y0 = Math.max(0, ((Math.min(ay, by) - hw) / CELL) | 0), y1 = Math.min(GY - 1, ((Math.max(ay, by) + hw) / CELL) | 0);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const mx = (gx + 0.5) * CELL, my = (gy + 0.5) * CELL;
        let t = ((mx - ax) * abx + (my - ay) * aby) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ddx = mx - ax - abx * t, ddy = my - ay - aby * t;
        if (ddx * ddx + ddy * ddy > cr * cr) continue;
        const c = gy * GX + gx;
        for (let k = cs[c], e = cs[c + 1]; k < e; k++) {
          const j = items[k];
          if (dead[j]) continue;
          let u = ((x[j] - ax) * abx + (y[j] - ay) * aby) / l2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const dx = x[j] - ax - abx * u, dy = y[j] - ay - aby * u;
          if (dx * dx + dy * dy <= hw2) q[m++] = j;
        }
      }
    }
    this.qn = m;
    return m;
  };

  sim.qCone = function (cx, cy, ang, half, range) {
    const q = this.q, items = this.items, cs = this.cs, x = this.x, y = this.y, dead = this.dead;
    const r2 = range * range;
    let m = 0;
    const x0 = Math.max(0, ((cx - range) / CELL) | 0), x1 = Math.min(GX - 1, ((cx + range) / CELL) | 0);
    const y0 = Math.max(0, ((cy - range) / CELL) | 0), y1 = Math.min(GY - 1, ((cy + range) / CELL) | 0);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const mx = (gx + 0.5) * CELL - cx, my = (gy + 0.5) * CELL - cy;
        const d = Math.sqrt(mx * mx + my * my);
        if (d > range + HC) continue;
        if (d > HC + 1) {
          const margin = Math.asin(Math.min(1, HC / d));
          if (Math.abs(G.angDiff(Math.atan2(my, mx), ang)) > half + margin) continue;
        }
        const c = gy * GX + gx;
        for (let k = cs[c], e = cs[c + 1]; k < e; k++) {
          const j = items[k];
          if (dead[j]) continue;
          const dx = x[j] - cx, dy = y[j] - cy, d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          if (d2 > 36 && Math.abs(G.angDiff(Math.atan2(dy, dx), ang)) > half) continue;
          q[m++] = j;
        }
      }
    }
    this.qn = m;
    return m;
  };

  sim.countCircle = function (cx, cy, r) { return this.qCircle(cx, cy, r); };

  // The stable per-orc seed leaves a reckless quarter of the crowd on the short route.
  function routeFor(map, seed) { return (seed & 3) && map.safeFlow ? map.safeFlow : map; }

  sim.avoidStrike = function (ax, ay, bx, by, radius) {
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const reach = radius + 34, map = G.map;
    const count = len2 ? this.qSegment(ax, ay, bx, by, reach) : this.qCircle(ax, ay, reach);
    for (let k = 0; k < count; k++) {
      const j = this.q[k], seed = this.anim[j];
      if (!(seed & 3) || this.frz[j] > 0) continue;
      const x = this.x[j], y = this.y[j], ci = G.cellAt(x, y), route = routeFor(map, seed);
      const fx = route.flowX[ci], fy = route.flowY[ci];
      const u = len2 ? G.clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1) : 0;
      const rx = x - (ax + u * dx), ry = y - (ay + u * dy), dist = Math.hypot(rx, ry);
      if (rx * fx + ry * fy > 0.8 * dist) continue; // already heading away
      const cross = ry * fx - rx * fy;
      const side = Math.abs(cross) < 1 ? (seed & 4 ? 1 : -1) : Math.sign(cross);
      if (!G.isLowAt(map, x + 16 * (fx - side * fy), y + 16 * (fy + side * fx))) continue;
      const bias = G.clamp((reach - dist) / 34, 0, 1);
      if (bias >= Math.abs(this.dodge[j])) this.dodge[j] = side * bias;
    }
  };

  // nearest living orc inside a wedge (or full circle when half >= PI)
  sim.nearestInWedge = function (cx, cy, ang, half, range, minRange) {
    const items = this.items, cs = this.cs, x = this.x, y = this.y, dead = this.dead;
    let best = -1, bd = 1e12;
    const x0 = Math.max(0, ((cx - range) / CELL) | 0), x1 = Math.min(GX - 1, ((cx + range) / CELL) | 0);
    const y0 = Math.max(0, ((cy - range) / CELL) | 0), y1 = Math.min(GY - 1, ((cy + range) / CELL) | 0);
    const full = half >= Math.PI;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * GX + gx;
        if (cs[c] === cs[c + 1]) continue;
        const mx = (gx + 0.5) * CELL - cx, my = (gy + 0.5) * CELL - cy;
        const d = Math.sqrt(mx * mx + my * my);
        if (d > range + HC) continue;
        if (!full && d > HC + 1) {
          const margin = Math.asin(Math.min(1, HC / d));
          if (Math.abs(G.angDiff(Math.atan2(my, mx), ang)) > half + margin) continue;
        }
        if (d - HC > Math.sqrt(bd)) continue;
        for (let k = cs[c], e = cs[c + 1]; k < e; k++) {
          const j = items[k];
          if (dead[j]) continue;
          const dx = x[j] - cx, dy = y[j] - cy, d2 = dx * dx + dy * dy;
          if (d2 > range * range || d2 >= bd || (minRange && d2 < minRange * minRange)) continue;
          if (!full && d2 > 36 && Math.abs(G.angDiff(Math.atan2(dy, dx), ang)) > half) continue;
          bd = d2; best = j;
        }
      }
    }
    return best;
  };

  // area blast: damage with falloff + radial knockback
  sim.blast = function (cx, cy, r, dmg, knock, src, falloff, woundedOnly) {
    const m = this.qCircle(cx, cy, r + 4), q = this.q, x = this.x, y = this.y, hp = this.hp, mhp = this.mhp;
    let total = 0;
    const fo = falloff === undefined ? 0.5 : falloff;
    for (let k = 0; k < m; k++) {
      const j = q[k], dx = x[j] - cx, dy = y[j] - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = 1 - (d / (r + 4)) * fo;
      if (knock) this.impulse(j, dx / d, dy / d, knock * f * (0.8 + Math.random() * 0.4));
      if (dmg && !(woundedOnly && hp[j] >= mhp[j] * 0.999)) { this.damage(j, dmg * f, src); total += dmg * f; }
    }
    return m;
  };

  /* ------------------------------------------------------------- update */
  sim.update = function (dt) {
    const run = G.run, map = G.map, S = G.S;
    this.frame++;
    this.reap();
    this.spawner(dt);

    // chain reactions from explosive orcs
    if (this.blasts.length) {
      const list = this.blasts.slice(0, 24);
      this.blasts.length = 0;
      for (let k = 0; k < list.length; k += 2) {
        this.buildGridIfNeeded();
        this.blast(list[k], list[k + 1], 42, 0.03 * run.hpMul + 1.2, 120, SRCI.blast, 0.5, true);
        G.fx.explosion(list[k], list[k + 1], 44, 0.6, true);
      }
    }
    this.buildGrid();

    const n = this.n, x = this.x, y = this.y, vx = this.vx, vy = this.vy, px = this.px, py = this.py;
    const dens = this.dens, cs = this.cs, items = this.items, cellOf = this.cellOf;
    const frame = this.frame;

    // pressure / density from neighbours (half of the orcs per frame)
    for (let i = frame & 1; i < n; i += 2) {
      const xi = x[i], yi = y[i], c0 = cellOf[i];
      const cx = c0 % GX, cy = (c0 / GX) | 0;
      const gy0 = cy > 0 ? cy - 1 : 0, gy1 = cy < GY - 1 ? cy + 1 : GY - 1;
      const gx0 = cx > 0 ? cx - 1 : 0, gx1 = cx < GX - 1 ? cx + 1 : GX - 1;
      let fxs = 0, fys = 0, dn = 0;
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const c = gy * GX + gx, s = cs[c], cnt = cs[c + 1] - s;
          if (!cnt) continue;
          const m = cnt > 7 ? 7 : cnt, sc = cnt / m;
          let off = (i * 7 + frame) % cnt;
          for (let q = 0; q < m; q++) {
            const j = items[s + off];
            if (++off >= cnt) off = 0;
            if (j === i) continue;
            let dx = xi - x[j], dy = yi - y[j];
            let d2 = dx * dx + dy * dy;
            if (d2 >= R2) continue;
            if (d2 < 0.0004) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy + 0.01; }
            const d = Math.sqrt(d2), w = (1 - d / R) * sc;
            fxs += dx / d * w; fys += dy / d * w; dn += w;
          }
        }
      }
      px[i] = fxs * 105; py[i] = fys * 105;   // px/s push velocity
      dens[i] = dens[i] * 0.4 + dn * 0.6;
    }

    // integrate
    const low = map.low, wd = map.wd, wgx = map.wgx, wgy = map.wgy;
    const baseSpd = 52 * run.def.spd * (1 - S.slow);
    const relax = Math.min(1, dt * 7);
    const exits = run.def.exits, ne = exits.length;
    const burnDps = this.burnDps, hasBurn = this.burnActive;
    let anyBurn = false;
    const W = G.W, H = G.H, anim = this.anim, tnow = this.time;
    for (let i = 0; i < n; i++) {
      if (this.dead[i]) continue;
      let xi = x[i], yi = y[i];
      let ci = (yi / CSZ | 0) * MAP_W + (xi / CSZ | 0);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H || !low[ci]) {
        // pushed into a wall: rescue to the nearest walkable cell
        let ok = false;
        for (let r = 6; r <= 120 && !ok; r += 6) {
          for (let a = 0; a < 12; a++) {
            const tx = xi + Math.cos(a * 0.5236) * r, ty = yi + Math.sin(a * 0.5236) * r;
            if (G.isLowAt(map, tx, ty)) { xi = tx; yi = ty; ok = true; break; }
          }
        }
        if (!ok) {
          const sp = run.def.spawns[0];
          xi = sp.x; yi = sp.y;
        }
        x[i] = xi; y[i] = yi; vx[i] *= 0.3; vy[i] *= 0.3;
        ci = (yi / CSZ | 0) * MAP_W + (xi / CSZ | 0);
      }
      let f = 1;
      if (this.fl[i] > 0) this.fl[i] -= dt;
      const fz = this.frz[i];
      if (fz > 0) { this.frz[i] = fz - dt; f = 0; }
      if (this.slow[i] > 0) { this.slow[i] -= dt; f *= Math.max(0.15, 0.5 - S['gr.slow'] * 0.5); }
      if (this.burn[i] > 0) {
        this.burn[i] -= dt; f *= 1.2; anyBurn = true;
        const bd = burnDps * dt;
        run.dmg[2] += bd < this.hp[i] ? bd : this.hp[i];
        this.hp[i] -= bd;
        if (this.hp[i] <= 0) { this.kill(i, 2); continue; }
      }
      const dn = dens[i];
      if (dn > 2.1) f /= 1 + (dn - 2.1) * 0.13;
      let sp = baseSpd * this.spd[i] * f;
      const route = routeFor(map, anim[i]), fxv = route.flowX[ci], fyv = route.flowY[ci];
      // slow sideways wander so streams spread across the lane like a river instead of single file
      let wv = Math.sin(tnow * (0.5 + (anim[i] & 7) * 0.08) + anim[i] * 0.37) * 0.3;
      const dodge = this.dodge[i];
      if (dodge) {
        wv += dodge;
        sp /= Math.sqrt(1 + wv * wv);
        this.dodge[i] = Math.sign(dodge) * Math.max(0, Math.abs(dodge) - dt * 3);
      }
      let tx = (fxv - fyv * wv) * sp, ty = (fyv + fxv * wv) * sp;
      if (fz > 0) { vx[i] *= 0.7; vy[i] *= 0.7; }
      else { tx += px[i]; ty += py[i]; }
      const w = wd[ci];
      if (w < 14) { const wp = (14 - w) * 5; tx += wgx[ci] * wp; ty += wgy[ci] * wp; }
      let nvx = vx[i] + (tx - vx[i]) * relax, nvy = vy[i] + (ty - vy[i]) * relax;
      const sp2 = nvx * nvx + nvy * nvy;
      if (sp2 > 70000) { const k = 264 / Math.sqrt(sp2); nvx *= k; nvy *= k; }
      let nx = xi + nvx * dt, ny = yi + nvy * dt;
      if ((nx < 1 && nvx < 0) || (nx >= W - 1 && nvx > 0) || !low[(yi / CSZ | 0) * MAP_W + (nx / CSZ | 0)]) { nx = xi; nvx *= -0.25; }
      if ((ny < 1 && nvy < 0) || (ny >= H - 1 && nvy > 0) || !low[(ny / CSZ | 0) * MAP_W + (nx / CSZ | 0)]) { ny = yi; nvy *= -0.25; }
      x[i] = nx; y[i] = ny; vx[i] = nvx; vy[i] = nvy;
      for (let e = 0; e < ne; e++) {
        const ex = exits[e], dx = nx - ex.x, dy = ny - ex.y, rr = ex.r * 0.85;
        if (dx * dx + dy * dy < rr * rr) { this.leak(i); break; }
      }
    }
    this.burnActive = anyBurn;
  };

  sim.buildGridIfNeeded = function () {
    if (this.gridFrame !== this.frame) { this.gridFrame = this.frame; this.buildGrid(); }
  };
})();
