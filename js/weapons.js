'use strict';
/* Turrets, projectiles, lobbed shells, targeting and turret drawing. */

G.turrets = [];

(function () {
  const sim = G.sim, fx = G.fx, SRC = G.SRCI;
  const bullets = [], lobs = [];
  let bid = 1;

  const W = G.weapons = {};

  /* --------------------------------------------------------------- stats */
  G.tstat = function (t) {
    const d = t.def, S = G.S;
    switch (d.id) {
      case 'gunner': return { dmg: 1.2 * S['g.dmg'], rate: d.rate * S['g.rate'], range: d.range * S['g.range'], pierce: 1 + S['g.pierce'], knock: d.knock * S['g.knock'] };
      case 'cannon': return { dmg: d.dmg * S['c.dmg'], rate: d.rate * S['c.rate'], range: d.range, pierce: d.pierce + S['c.pierce'], knock: d.knock };
      case 'flame': return { dmg: 0.35 * S['f.burn'], range: d.range * S['f.range'], half: 0.24 * S['f.arc'] };
      case 'mortar': return { dmg: d.dmg * S['mo.dmg'], rate: d.rate * S['mo.rate'], range: d.range, blast: d.blast * S['mo.radius'], knock: d.knock };
      case 'laser': return { dmg: d.dmg * S['l.dmg'], range: d.range * S['l.range'], width: d.width };
      case 'tesla': return { dmg: d.dmg * S['t.dmg'], rate: d.rate, range: d.range, chain: d.chain + S['t.chain'], jump: d.jump };
      case 'grenade': return { dmg: d.dmg, rate: d.rate, range: d.range, blast: d.blast, slow: S['gr.slow'] };
    }
    return {};
  };

  W.refresh = function () {
    for (const t of G.turrets) t.st = G.tstat(t);
    sim.burnDps = 1.2 * G.S['f.burn'];
  };

  W.placed = id => {
    let n = 0;
    for (const t of G.turrets) if (t.def.id === id) n++;
    return n;
  };
  W.left = d => Math.max(0, G.turretCount(d) - W.placed(d.id));

  W.reset = function () {
    G.turrets.length = 0; bullets.length = 0; lobs.length = 0;
    fx.clear();
  };

  /* ----------------------------------------------------------- placement */
  // default aim: the direction whose wedge covers the most walkable lane (near cells weigh a bit more)
  function bestAim(d, x, y) {
    const R = d.range || 300, step = Math.max(20, R / 16), half = Math.min(0.2, d.arc || 0.2) * 0.6;
    let best = 0, bs = -1;
    for (let k = 0; k < 48; k++) {
      const a = k * Math.PI / 24;
      let s = 0;
      for (let r = 40; r <= R; r += step) {
        const w = 1 + (R - r) / R * 0.6;
        for (const o of [-half, 0, half]) {
          if (G.isLowAt(G.map, x + Math.cos(a + o) * r, y + Math.sin(a + o) * r)) s += w;
        }
      }
      if (s > bs) { bs = s; best = a; }
    }
    return best;
  }

  function bestLob(d, x, y) {
    const lo = d.minRange + d.aimR * 0.4, hi = d.range * 0.9 - d.aimR * 0.2, mid = (lo + hi) / 2;
    let bx = x + Math.min(d.range * 0.55, 260), by = y, bs = -1e9;
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI / 12;
      for (let r = lo; r <= hi; r += 30) {
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        let s = 0;
        for (let q = 0; q < 5; q++) {
          const ox = q ? Math.cos(q * 1.571) * d.aimR * 0.6 : 0, oy = q ? Math.sin(q * 1.571) * d.aimR * 0.6 : 0;
          if (G.isLowAt(G.map, px + ox, py + oy)) s++;
        }
        s -= Math.abs(r - mid) / (hi - lo + 1) * 0.5;
        if (s > bs) { bs = s; bx = px; by = py; }
      }
    }
    return { x: bx, y: by };
  }

  W.canPlaceAt = function (d, x, y, ignore) {
    if (!G.canPlace(G.map, x, y)) return null;
    const r = d && d.id === 'mortar' ? 54 : 44;
    for (const t of G.turrets) {
      const rr = t.def.id === 'mortar' ? Math.max(r, 54) : r;
      if (t !== ignore && (t.x - x) ** 2 + (t.y - y) ** 2 < rr * rr) return null;
    }
    return { x, y };
  };

  W.place = function (d, x, y, opt) {
    if (W.left(d) <= 0) return null;
    const p = W.canPlaceAt(d, x, y);
    if (!p) return null;
    const aim = opt && opt.aim !== undefined ? opt.aim : bestAim(d, p.x, p.y);
    const t = {
      def: d, x: p.x, y: p.y, aim, rot: aim, arc: opt && opt.arc ? opt.arc : d.arc || 0.3,
      ax: 0, ay: 0, cd: 0.2 + Math.random() * 0.3, tT: 0, ft: 0, bt: 0, has: false, ta: aim, firing: false, flash: 0, recoil: 0, st: null, pulse: Math.random() * 6,
    };
    if (d.kind === 'lob') {
      if (opt && opt.ax !== undefined) { t.ax = opt.ax; t.ay = opt.ay; }
      else { const lp = bestLob(d, t.x, t.y); t.ax = lp.x; t.ay = lp.y; }
    }
    t.st = G.tstat(t);
    G.turrets.push(t);
    W.clampAim(t);
    return t;
  };

  W.remove = function (t) {
    const i = G.turrets.indexOf(t);
    if (i >= 0) G.turrets.splice(i, 1);
  };

  W.clampAim = function (t) {
    const d = t.def;
    if (d.kind === 'lob') {
      let dx = t.ax - t.x, dy = t.ay - t.y, dist = Math.hypot(dx, dy) || 1;
      const lo = d.minRange + d.aimR * 0.4, hi = t.st.range - d.aimR * 0.2;
      if (dist < lo) { dx = dx / dist * lo; dy = dy / dist * lo; dist = lo; }
      if (dist > hi) { dx = dx / dist * hi; dy = dy / dist * hi; }
      t.ax = G.clamp(t.x + dx, 20, G.W - 20); t.ay = G.clamp(t.y + dy, 20, G.H - 20);
      t.aim = Math.atan2(t.ay - t.y, t.ax - t.x);
    }
    t.arc = G.clamp(t.arc, d.minArc || 0, d.maxArc || 3.2);
  };

  W.aimAt = function (t, x, y) {
    if (t.def.kind === 'lob') { t.ax = x; t.ay = y; }
    else t.aim = Math.atan2(y - t.y, x - t.x);
    W.clampAim(t);
    t.rot = t.aim;
  };

  W.adjustArc = function (t, delta) {
    t.arc += delta;
    W.clampAim(t);
  };

  W.handlePos = function (t) {
    if (t.def.kind === 'lob') return { x: t.ax, y: t.ay };
    const r = Math.min(t.st.range * 0.7, 300) + 20;
    return { x: t.x + Math.cos(t.aim) * r, y: t.y + Math.sin(t.aim) * r };
  };

  W.pick = function (x, y) {
    for (let i = G.turrets.length - 1; i >= 0; i--) {
      const t = G.turrets[i];
      if ((t.x - x) ** 2 + (t.y - y) ** 2 < 30 * 30) return t;
    }
    return null;
  };

  W.layout = () => G.turrets.map(t => ({ id: t.def.id, x: t.x, y: t.y, aim: t.aim, arc: t.arc, ax: t.ax, ay: t.ay }));

  W.restore = function (list) {
    for (const o of list || []) {
      const d = G.TMAP[o.id];
      if (!d || W.left(d) <= 0) continue;
      W.place(d, o.x, o.y, o);
    }
  };

  W.recallAll = function () {
    G.turrets.length = 0;
  };

  /* --------------------------------------------------------------- update */
  function fireBullet(t, st, big) {
    const a = t.rot + (Math.random() - 0.5) * 2 * (big ? 0.01 : 0.035);
    const mx = t.x + Math.cos(t.rot) * 28, my = t.y + Math.sin(t.rot) * 28;
    const sp = big ? 780 : 1150;
    bullets.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: st.range / sp, dmg: st.dmg, pierce: st.pierce, id: bid++, r: big ? 9 : 5, knock: st.knock, src: big ? SRC.cannon : SRC.gunner, big });
    t.flash = 0.05; t.recoil = 1;
    if (big) { fx.sparks(mx, my, 4, 2); fx.emit(fx.K_SMOKE, mx, my, Math.cos(a) * 40, Math.sin(a) * 40, 0.5, 5, 1); G.audio.play('cannon'); }
    else G.audio.play('gun');
  }

  function updateTurret(t, dt) {
    const d = t.def, st = t.st, k = d.kind;
    t.cd -= dt; if (t.cd < -0.1) t.cd = -0.1;
    t.tT -= dt;
    if (t.flash > 0) t.flash -= dt;
    if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 7);

    if (k === 'tesla') return updateTesla(t, dt, st);
    if (k === 'lob') return updateLob(t, dt, st);

    if (t.tT <= 0) {
      t.tT = 0.06 + Math.random() * 0.05;
      const j = sim.nearestInWedge(t.x, t.y, t.aim, t.arc, st.range, 0);
      if (j >= 0) { t.has = true; t.ta = Math.atan2(sim.y[j] - t.y, sim.x[j] - t.x); } else t.has = false;
    }
    const goal = t.has ? t.ta : t.aim;
    const diff = G.angDiff(goal, t.rot), step = d.rot * dt;
    t.rot += Math.abs(diff) <= step ? diff : (diff > 0 ? step : -step);
    t.firing = false;
    if (!t.has || Math.abs(G.angDiff(goal, t.rot)) > 0.12) return;

    if (k === 'bullet' || k === 'shell') {
      let n = 0;
      while (t.cd <= 0 && n++ < 3) { fireBullet(t, st, k === 'shell'); t.cd += 1 / st.rate; }
    } else if (k === 'flame') {
      t.firing = true;
      const mx = t.x + Math.cos(t.rot) * 24, my = t.y + Math.sin(t.rot) * 24;
      fx.flame(mx, my, t.rot, st.half, st.range * 1.1);
      t.ft -= dt;
      let n = 0;
      while (t.ft <= 0 && n++ < 2) {
        t.ft += 0.1;
        const m = sim.qCone(mx, my, t.rot, st.half, st.range), q = sim.q;
        for (let i = 0; i < m; i++) {
          const j = q[i];
          if (sim.burn[j] < 3) sim.burn[j] = 3.2;
          sim.damage(j, st.dmg, SRC.flame);
        }
      }
      if (Math.random() < dt * 8) G.audio.play('flame');
    } else if (k === 'beam') {
      t.firing = true;
      t.bt -= dt;
      const mx = t.x + Math.cos(t.rot) * 26, my = t.y + Math.sin(t.rot) * 26;
      let n = 0;
      while (t.bt <= 0 && n++ < 2) {
        t.bt += 0.05;
        const m = sim.qSegment(mx, my, mx + Math.cos(t.rot) * st.range, my + Math.sin(t.rot) * st.range, st.width * 0.5 + 4), q = sim.q;
        for (let i = 0; i < m; i++) sim.damage(q[i], st.dmg, SRC.laser);
      }
    }
  }

  function updateTesla(t, dt, st) {
    t.firing = false;
    if (t.cd > 0) return;
    if (t.tT > 0) return;
    t.tT = 0.08;
    const j = sim.nearestInWedge(t.x, t.y, 0, Math.PI * 2, st.range, 0);
    if (j < 0) return;
    t.cd = 1 / st.rate; t.flash = 0.12;
    const chain = [j], pts = [t.x, t.y, sim.x[j], sim.y[j]];
    let cur = j;
    for (let c = 0; c < st.chain; c++) {
      const m = sim.qCircle(sim.x[cur], sim.y[cur], st.jump), q = sim.q;
      let best = -1, bd = 1e12;
      for (let i = 0; i < m; i++) {
        const o = q[i];
        if (chain.indexOf(o) >= 0) continue;
        const dx = sim.x[o] - sim.x[cur], dy = sim.y[o] - sim.y[cur], dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = o; }
      }
      if (best < 0) break;
      chain.push(best); cur = best;
      pts.push(sim.x[best], sim.y[best]);
    }
    // jagged lightning path
    const out = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) {
      const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1 - 0];
      for (let s = 1; s < 4; s++) {
        const u = s / 4;
        out.push(ax + (bx - ax) * u + (Math.random() - 0.5) * 16, ay + (by - ay) * u + (Math.random() - 0.5) * 16);
      }
      out.push(bx, by);
    }
    fx.bolt(out, 0.16, '#c9a8ff');
    for (let i = 0; i < chain.length; i++) {
      const o = chain[i];
      sim.damage(o, st.dmg * (1 - i * 0.04), SRC.tesla);
      sim.impulse(o, (Math.random() - 0.5), (Math.random() - 0.5), 60);
      if (i < 3) fx.sparks(sim.x[o], sim.y[o], 2, 1);
    }
    G.audio.play('zap');
  }

  function updateLob(t, dt, st) {
    const d = t.def;
    // barrel tracks the aim point
    const diff = G.angDiff(t.aim, t.rot), step = d.rot * dt;
    t.rot += Math.abs(diff) <= step ? diff : (diff > 0 ? step : -step);
    if (t.cd > 0 || t.tT > 0) return;
    t.tT = 0.1;
    const m = sim.qCircle(t.ax, t.ay, d.aimR);
    if (!m) return;
    const j = sim.q[(Math.random() * m) | 0];
    const flight = 0.55 + Math.hypot(sim.x[j] - t.x, sim.y[j] - t.y) / 900;
    const tx = sim.x[j] + sim.vx[j] * flight * 0.8, ty = sim.y[j] + sim.vy[j] * flight * 0.8;
    t.cd = 1 / st.rate; t.recoil = 1; t.flash = 0.08;
    const a = Math.atan2(ty - t.y, tx - t.x);
    lobs.push({ x0: t.x + Math.cos(a) * 20, y0: t.y + Math.sin(a) * 20, x1: tx, y1: ty, t: 0, T: flight, kind: d.id, st, gren: d.id === 'grenade' });
    fx.emit(fx.K_SMOKE, t.x + Math.cos(a) * 24, t.y + Math.sin(a) * 24, Math.cos(a) * 30, Math.sin(a) * 30, 0.7, 6, 0);
    G.audio.play('mortar');
  }

  function land(l) {
    const st = l.st;
    if (l.gren) {
      const m = sim.qCircle(l.x1, l.y1, st.blast), q = sim.q;
      for (let i = 0; i < m; i++) {
        const j = q[i];
        sim.slow[j] = 4 + st.slow * 3;
        sim.damage(j, st.dmg, SRC.grenade);
        const dx = sim.x[j] - l.x1, dy = sim.y[j] - l.y1, dd = Math.hypot(dx, dy) || 1;
        sim.impulse(j, dx / dd, dy / dd, 60);
      }
      fx.gas(l.x1, l.y1, st.blast);
      fx.explosion(l.x1, l.y1, st.blast * 0.5, 0.4, true);
    } else {
      sim.blast(l.x1, l.y1, st.blast, st.dmg, st.knock, SRC.mortar, 0.45);
      fx.explosion(l.x1, l.y1, st.blast * 1.25, 1);
    }
    G.audio.play('boom');
  }

  W.update = function (dt) {
    for (const t of G.turrets) updateTurret(t, dt);

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      const m = sim.qSegment(b.x, b.y, nx, ny, b.r), q = sim.q;
      const sp = Math.hypot(b.vx, b.vy), ux = b.vx / sp, uy = b.vy / sp;
      let dead = false;
      for (let k = 0; k < m; k++) {
        const j = q[k];
        if (sim.hit[j] === b.id) continue;
        sim.hit[j] = b.id;
        sim.damage(j, b.dmg, b.src);
        sim.impulse(j, ux, uy, b.knock);
        if (Math.random() < (b.big ? 0.6 : 0.3)) fx.sparks(sim.x[j], sim.y[j], 1);
        if (--b.pierce <= 0) { dead = true; break; }
      }
      b.x = nx; b.y = ny;
      if (dead) bullets.splice(i, 1);
    }

    for (let i = lobs.length - 1; i >= 0; i--) {
      const l = lobs[i];
      l.t += dt;
      if (l.t >= l.T) { land(l); lobs.splice(i, 1); }
    }
  };

  /* --------------------------------------------------------------- drawing */
  /* Build-phase overlays, styled like the original: thin light outlines, teal when selected,
     mortars get a dashed line to their target circle. */
  function wedge(ctx, t, sel) {
    const d = t.def, st = t.st;
    ctx.save();
    ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeStyle = sel ? 'rgba(110,235,240,0.95)' : 'rgba(205,205,205,0.72)';
    ctx.fillStyle = sel ? 'rgba(110,235,240,0.07)' : 'rgba(0,0,0,0)';
    if (d.kind === 'lob') {
      if (sel) {
        ctx.save(); ctx.setLineDash([4, 10]); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(t.x, t.y, st.range, 0, G.TAU); ctx.stroke(); ctx.restore();
      }
      const a = Math.atan2(t.ay - t.y, t.ax - t.x), r0 = 30, len = Math.hypot(t.ax - t.x, t.ay - t.y) - d.aimR;
      if (len > r0) {
        ctx.save(); ctx.setLineDash([7, 7]);
        ctx.beginPath(); ctx.moveTo(t.x + Math.cos(a) * r0, t.y + Math.sin(a) * r0);
        ctx.lineTo(t.x + Math.cos(a) * len, t.y + Math.sin(a) * len); ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(t.ax, t.ay, d.aimR, 0, G.TAU); ctx.fill(); ctx.stroke();
    } else if (d.kind === 'tesla') {
      ctx.beginPath(); ctx.arc(t.x, t.y, st.range, 0, G.TAU); ctx.fill(); ctx.stroke();
    } else {
      const R = st.range;
      ctx.beginPath(); ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(t.aim - t.arc) * R, t.y + Math.sin(t.aim - t.arc) * R);
      // the selected wedge shows its true reach as an arc; the others are plain triangles
      if (sel) ctx.arc(t.x, t.y, R, t.aim - t.arc, t.aim + t.arc);
      else ctx.lineTo(t.x + Math.cos(t.aim + t.arc) * R, t.y + Math.sin(t.aim + t.arc) * R);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (sel) {
      const h = W.handlePos(t);
      ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, h.y, 12, 0, G.TAU); ctx.stroke();
      ctx.fillStyle = '#7ff0ff';
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, cx = h.x + Math.cos(a) * 21, cy = h.y + Math.sin(a) * 21;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
        ctx.lineTo(cx + Math.cos(a + 2.2) * 6, cy + Math.sin(a + 2.2) * 6);
        ctx.lineTo(cx + Math.cos(a - 2.2) * 6, cy + Math.sin(a - 2.2) * 6);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function rectr(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function blob(ctx, x, y, r, c, hi) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, G.TAU); ctx.fill();
    if (hi) rectr(ctx, x - r * 0.55, y - r * 0.6, r * 0.8, r * 0.5, hi);
  }
  // little soldier seen from above (helmet + shoulders), facing +x
  function soldier(ctx, x, y, sel) {
    rectr(ctx, x - 6, y - 8, 10, 16, sel ? '#1f7f74' : '#3c5420');
    blob(ctx, x - 1, y, 6, sel ? '#33b5a6' : '#617a2a', sel ? '#7fe6da' : '#82993e');
  }
  // grey tripod: square feet on the diagonals (not rotated with the gun)
  function tripod(ctx) {
    ctx.strokeStyle = '#6f7078'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(15, 15); ctx.moveTo(15, -15); ctx.lineTo(-15, 15); ctx.stroke();
    for (const [fx2, fy2] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
      rectr(ctx, fx2 - 5, fy2 - 5, 10, 10, '#3c3d42'); rectr(ctx, fx2 - 3, fy2 - 3, 6, 6, '#5d5e66');
    }
  }

  function drawTurret(ctx, t, sel, now) {
    const d = t.def, rc = t.recoil * 4;
    ctx.save();
    ctx.translate(Math.round(t.x), Math.round(t.y));
    if (d.id === 'mortar') {
      // wooden wheel platform
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(3, 4, 28, 0, G.TAU); ctx.fill();
      ctx.fillStyle = sel ? '#2a8a80' : '#5c2c22'; ctx.beginPath(); ctx.arc(0, 0, 28, 0, G.TAU); ctx.fill();
      ctx.fillStyle = '#8c4e3e'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, G.TAU); ctx.fill();
      ctx.strokeStyle = '#7a4033'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, G.TAU); ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + 0.2;
        rectr(ctx, Math.cos(a) * 20 - 1, Math.sin(a) * 20 - 1, 3, 3, '#a2604c');
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(3, 5, 17, 15, 0, 0, G.TAU); ctx.fill();
      if (d.id === 'cannon' || d.id === 'laser' || d.id === 'tesla') tripod(ctx);
    }
    ctx.rotate(t.rot);
    switch (d.id) {
      case 'gunner':
        soldier(ctx, -6, 0, sel);
        rectr(ctx, -2, -10, 7, 4, '#2f6aa6'); rectr(ctx, -2, 6, 7, 4, '#2f6aa6');
        rectr(ctx, 4, -9, 3, 3, '#e6dccb'); rectr(ctx, 4, 6, 3, 3, '#e6dccb');
        rectr(ctx, -2 - rc, -3, 38, 6, sel ? '#3fbfae' : '#6c8c38'); rectr(ctx, -2 - rc, -3, 38, 2, sel ? '#8ff0e2' : '#8fb052');
        rectr(ctx, 34 - rc, -3, 4, 6, '#33401c');
        if (t.flash > 0) { rectr(ctx, 38 - rc, -5, 10, 10, '#fff2b0'); rectr(ctx, 42 - rc, -3, 8, 6, '#ffb030'); }
        break;
      case 'cannon':
        rectr(ctx, -8 - rc, -5, 44, 10, '#a7a4c2'); rectr(ctx, -8 - rc, -5, 44, 3, '#c9c7de'); rectr(ctx, 32 - rc, -6, 6, 12, '#5d5b72');
        blob(ctx, -14, 0, 6, sel ? '#33b5a6' : '#6d7a2c', sel ? '#7fe6da' : '#8e9a44');
        if (t.flash > 0) { rectr(ctx, 38 - rc, -7, 12, 14, '#fff2b0'); rectr(ctx, 44 - rc, -4, 8, 8, '#ff9a20'); }
        break;
      case 'flame':
        ctx.strokeStyle = '#6b2a22'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(2, -12, 4, -3); ctx.moveTo(-10, 12); ctx.quadraticCurveTo(2, 12, 4, 3); ctx.stroke();
        for (const s of [-1, 1]) {
          const y0 = s < 0 ? -20 : 10;
          rectr(ctx, -24, y0, 22, 10, '#d98038'); rectr(ctx, -24, y0, 22, 3, '#f2a862');
          rectr(ctx, -19, y0, 2, 10, '#b43c34'); rectr(ctx, -9, y0, 2, 10, '#b43c34');
        }
        rectr(ctx, -2, -4, 24, 8, sel ? '#4fc8bc' : '#8b9099'); rectr(ctx, -2, -4, 24, 2, '#b2b7c0');
        rectr(ctx, 2, -3, 4, 6, '#2f7fa0'); rectr(ctx, 20, -3, 5, 6, '#4d5058');
        rectr(ctx, 25, -2, 3, 4, t.firing ? '#bfe8ff' : '#6ab0ff');
        break;
      case 'mortar':
        ctx.strokeStyle = '#8b8c94'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(11, 11); ctx.moveTo(11, -11); ctx.lineTo(-11, 11); ctx.stroke();
        rectr(ctx, -5 - rc * 0.5, -5, 16, 10, '#4c4f57'); rectr(ctx, -5 - rc * 0.5, -5, 16, 3, '#6c7079');
        rectr(ctx, -3, -3, 6, 6, '#141416');
        blob(ctx, -11, -12, 6, sel ? '#33b5a6' : '#5d6b2a', sel ? '#7fe6da' : '#7c8c3c');
        blob(ctx, -11, 12, 6, sel ? '#33b5a6' : '#5d6b2a', sel ? '#7fe6da' : '#7c8c3c');
        if (t.flash > 0) rectr(ctx, 10, -6, 12, 12, '#ffd060');
        break;
      case 'laser':
        rectr(ctx, -8, -5, 38, 10, '#46586a'); rectr(ctx, -8, -5, 38, 3, '#6b8298');
        rectr(ctx, 28, -6, 6, 12, t.firing ? '#d8ffff' : '#52e0e8');
        blob(ctx, -14, 0, 6, sel ? '#33b5a6' : '#6d7a2c', sel ? '#7fe6da' : '#8e9a44');
        break;
      case 'tesla':
        blob(ctx, 0, 0, 11, '#4a4e58');
        blob(ctx, 0, 0, 8, sel ? '#33b5a6' : '#7d4fe0');
        blob(ctx, 0, 0, 4, t.flash > 0 ? '#ffffff' : '#d4c2ff');
        break;
      case 'grenade':
        soldier(ctx, -6, 0, sel);
        rectr(ctx, -2, -10, 7, 4, '#2f6aa6'); rectr(ctx, -2, 6, 7, 4, '#2f6aa6');
        rectr(ctx, -2 - rc, -5, 26, 10, '#7b8a40'); rectr(ctx, -2 - rc, -5, 26, 3, '#a2b45a'); rectr(ctx, 20 - rc, -6, 6, 12, '#475224');
        if (t.flash > 0) rectr(ctx, 26 - rc, -6, 10, 12, '#d6ff80');
        break;
    }
    ctx.restore();
  }

  W.drawIcon = function (ctx, d, x, y, s) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    drawTurret(ctx, { def: d, x: 0, y: 0, rot: -0.7, recoil: 0, flash: 0, firing: false, pulse: 0 }, false, 0);
    ctx.restore();
  };

  W.draw = function (ctx, now, build, sel, ghost) {
    // wedges in the build phase
    if (build) for (const t of G.turrets) if (t !== sel) wedge(ctx, t, false);
    if (build && sel) wedge(ctx, sel, true);
    for (const t of G.turrets) drawTurret(ctx, t, t === sel && build, now);

    // flame cones and laser beams
    ctx.globalCompositeOperation = 'lighter';
    for (const t of G.turrets) {
      if (!t.firing) continue;
      const st = t.st, mx = t.x + Math.cos(t.rot) * 26, my = t.y + Math.sin(t.rot) * 26;
      if (t.def.kind === 'flame') {
        const len = st.range * (0.9 + Math.sin(now * 0.04 + t.pulse) * 0.06);
        const g = ctx.createRadialGradient(mx, my, 2, mx, my, len);
        g.addColorStop(0, 'rgba(190,230,255,0.95)');
        g.addColorStop(0.1, 'rgba(255,250,210,0.9)');
        g.addColorStop(0.42, 'rgba(255,214,80,0.5)');
        g.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(mx, my);
        ctx.arc(mx, my, len, t.rot - st.half * 0.9, t.rot + st.half * 0.9);
        ctx.closePath(); ctx.fill();
      } else if (t.def.kind === 'beam') {
        const ex = mx + Math.cos(t.rot) * st.range, ey = my + Math.sin(t.rot) * st.range;
        ctx.strokeStyle = 'rgba(80,230,255,0.38)'; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(190,255,255,0.8)'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // bullets
    for (const b of bullets) {
      if (b.big) {
        ctx.fillStyle = 'rgba(255,150,40,0.8)';
        ctx.fillRect((b.x - b.vx * 0.02) | 0, (b.y - b.vy * 0.02) | 0, 7, 7);
        ctx.fillStyle = '#23262c'; ctx.fillRect((b.x - 5) | 0, (b.y - 5) | 0, 10, 10);
        ctx.fillStyle = '#5c636f'; ctx.fillRect((b.x - 4) | 0, (b.y - 4) | 0, 4, 4);
      } else {
        ctx.strokeStyle = 'rgba(255,230,140,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    // lobbed shells
    for (const l of lobs) {
      const u = l.t / l.T, x = l.x0 + (l.x1 - l.x0) * u, y = l.y0 + (l.y1 - l.y0) * u;
      const h = Math.sin(u * Math.PI) * (50 + Math.hypot(l.x1 - l.x0, l.y1 - l.y0) * 0.22);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect((x - 4) | 0, (y - 2) | 0, 8, 4);
      ctx.fillStyle = l.gren ? '#7da040' : '#2d3138'; ctx.fillRect((x - 4) | 0, (y - h - 4) | 0, 8, 8);
      ctx.fillStyle = l.gren ? '#c2e080' : '#767e8a'; ctx.fillRect((x - 3) | 0, (y - h - 3) | 0, 3, 3);
    }
  };

  W.drawGhost = function (ctx, d, x, y) {
    const p = W.canPlaceAt(d, x, y), ok = !!p;
    const st = G.tstat({ def: d });
    ctx.save();
    ctx.strokeStyle = ok ? 'rgba(110,235,240,0.9)' : 'rgba(255,90,80,0.9)';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(x, y, st.range || 150, 0, G.TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.7;
    drawTurret(ctx, { def: d, x, y, rot: -Math.PI / 2, recoil: 0, flash: 0, firing: false, pulse: 0 }, ok, 0);
    if (!ok) {
      ctx.globalAlpha = 0.9; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 14, y - 14); ctx.lineTo(x + 14, y + 14); ctx.moveTo(x + 14, y - 14); ctx.lineTo(x - 14, y + 14); ctx.stroke();
    }
    ctx.restore();
  };

  W.bulletCount = () => bullets.length + lobs.length;
})();
