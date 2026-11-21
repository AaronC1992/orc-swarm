'use strict';
/* Visual effects: blood/scorch decals, particle pool, explosions, lightning, floating text. */

G.fx = (function () {
  const PN = 7000;
  const px = new Float32Array(PN), py = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN);
  const pl = new Float32Array(PN), pm = new Float32Array(PN), ps = new Float32Array(PN);
  const pk = new Uint8Array(PN), pc = new Uint8Array(PN);
  let head = 0, hi = 0;
  const K_FLAME = 0, K_SMOKE = 1, K_SPARK = 2, K_GAS = 3, K_ICE = 4, K_GOLD = 5;

  const explosions = [], bolts = [], texts = [], beams = [];
  const dq = [];   // decal queue: x, y, type
  let decalCtx = null, decalCanvas = null;

  const FLAME_PAL = ['#dff4ff', '#fffbd0', '#fff2a0', '#ffe070', '#ffc040', '#ff9a24', '#f06a14', '#a8400c', '#5a2410'];
  const SMOKE_PAL = ['#c9ced6', '#a9b0bc', '#8d95a3', '#6f7886', '#566070'];
  const BLOOD = ['rgba(150,30,24,0.55)', 'rgba(124,22,20,0.6)', 'rgba(96,20,20,0.55)', 'rgba(60,62,74,0.5)', 'rgba(78,72,84,0.45)', 'rgba(176,44,30,0.45)'];
  const SCORCH = ['rgba(40,34,34,0.22)', 'rgba(60,58,66,0.2)', 'rgba(96,24,20,0.2)'];

  const fx = {
    shake: 0, leak: 0, flash: 0,
    K_FLAME, K_SMOKE, K_SPARK, K_GAS, K_ICE, K_GOLD,

    initDecal(cv) {
      decalCanvas = cv;
      cv.width = G.W / 2; cv.height = G.H / 2;
      decalCtx = cv.getContext('2d');
    },
    clear() {
      pl.fill(0); hi = 0; head = 0;
      explosions.length = 0; bolts.length = 0; texts.length = 0; beams.length = 0; dq.length = 0;
      fx.shake = 0; fx.leak = 0; fx.flash = 0;
      if (decalCtx) decalCtx.clearRect(0, 0, decalCanvas.width, decalCanvas.height);
    },

    emit(kind, x, y, vx, vy, life, size, c) {
      const i = head;
      head = (head + 1) % PN;
      px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pm[i] = life; ps[i] = size; pk[i] = kind; pc[i] = c || 0;
      if (i >= hi) hi = i + 1;
    },

    corpse(x, y, t) {
      if (dq.length < 3600) dq.push(x, y, t);
      if (t === 2) {
        for (let k = 0; k < 4; k++) fx.emit(K_GOLD, x, y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120 - 40, 0.5 + Math.random() * 0.3, 3, 0);
      }
    },

    scorch(x, y, r) {
      if (!decalCtx) return;
      // sparse chunky char pixels; the original leaves no big black burn marks
      const ctx = decalCtx, n = Math.min(90, 10 + r * 0.5) | 0, rr = r * 0.42;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * G.TAU, d = Math.sqrt(Math.random()) * rr, s = 1 + (Math.random() * 2 | 0);
        ctx.fillStyle = SCORCH[(Math.random() * SCORCH.length) | 0];
        ctx.fillRect((x / 2 + Math.cos(a) * d) | 0, (y / 2 + Math.sin(a) * d) | 0, s, s);
      }
    },

    flushDecals() {
      if (!decalCtx || !dq.length) return;
      const ctx = decalCtx;
      let stride = 1;
      if (dq.length > 2700) stride = 2;   // large mass kills: thin the splats
      // each death leaves a chunky splat of dark red and slate-grey pixels (decal canvas is half
      // resolution, so one decal pixel is 2x2 on screen); thousands of them pool like in the original
      for (let i = 0; i < dq.length; i += 3 * stride) {
        const x = dq[i] / 2, y = dq[i + 1] / 2, t = dq[i + 2];
        if (t === 2) { ctx.fillStyle = 'rgba(190,150,30,0.6)'; ctx.fillRect(x - 2, y - 2, 4, 4); }
        else if (t === 3) { ctx.fillStyle = 'rgba(30,24,20,0.6)'; ctx.fillRect(x - 3, y - 3, 6, 5); }
        const np = 5 + (Math.random() * 5 | 0);
        for (let k = 0; k < np; k++) {
          const a = Math.random() * G.TAU, d = Math.random() * 5.5, s = 1 + (Math.random() * 2.2 | 0);
          ctx.fillStyle = BLOOD[(Math.random() * BLOOD.length) | 0];
          ctx.fillRect((x + Math.cos(a) * d) | 0, (y + Math.sin(a) * d) | 0, s, s);
        }
      }
      dq.length = 0;
    },

    explosion(x, y, r, intensity, small) {
      const T = small ? 0.32 : 0.55 + Math.min(0.5, r / 400);
      explosions.push({ x, y, r, t: 0, T, big: !small });
      const n = small ? 6 : Math.min(60, 14 + r / 6);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * G.TAU, s = (small ? 70 : 140) + Math.random() * r * 2;
        fx.emit(K_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.4, 2 + Math.random() * 2, 0);
      }
      const ns = small ? 3 : Math.min(40, 8 + r / 8);
      for (let i = 0; i < ns; i++) {
        const a = Math.random() * G.TAU, s = 20 + Math.random() * r * 1.1;
        fx.emit(K_SMOKE, x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, Math.cos(a) * s, Math.sin(a) * s, 0.7 + Math.random() * 0.9, 6 + Math.random() * (small ? 6 : 14), (Math.random() * 3) | 0);
      }
      if (!small) {
        fx.scorch(x, y, r * 1.5);
        fx.shake = Math.min(14, fx.shake + 1.2 + r / 90 * (intensity || 1));
        if (r > 300) fx.flash = Math.min(1, 0.4 + r / 900);
      }
    },

    gas(x, y, r) {
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * G.TAU, s = Math.random() * r * 1.3;
        fx.emit(K_GAS, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.7 + Math.random() * 0.6, 6 + Math.random() * 10, 0);
      }
    },

    ice(x, y) {
      fx.emit(K_ICE, x, y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.5 + Math.random() * 0.4, 2 + Math.random() * 2, 0);
    },

    flame(mx, my, ang, half, range) {
      for (let i = 0; i < 3; i++) {
        const a = ang + (Math.random() - 0.5) * 2 * half * 0.85, s = range * (0.9 + Math.random() * 0.9);
        fx.emit(K_FLAME, mx + Math.cos(ang) * 4, my + Math.sin(ang) * 4, Math.cos(a) * s, Math.sin(a) * s, 0.28 + Math.random() * 0.22, 3 + Math.random() * 4, 0);
      }
    },

    sparks(x, y, n, col) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * G.TAU, s = 40 + Math.random() * 120;
        fx.emit(K_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.12 + Math.random() * 0.18, 1.5 + Math.random() * 1.5, col || 0);
      }
    },

    bolt(pts, life, color) { bolts.push({ pts, t: 0, T: life || 0.16, color: color || '#bfe6ff' }); },
    beam(x0, y0, x1, y1, life, color, w) { beams.push({ x0, y0, x1, y1, t: 0, T: life, color, w }); },
    text(x, y, s, color) { texts.push({ x, y, s, color: color || '#fff', t: 0 }); },

    update(dt) {
      for (let i = 0; i < hi; i++) {
        if (pl[i] <= 0) continue;
        pl[i] -= dt;
        const k = pk[i];
        px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
        if (k === K_FLAME) { pvx[i] *= 1 - dt * 2.4; pvy[i] *= 1 - dt * 2.4; ps[i] += dt * 6; }
        else if (k === K_SMOKE) { const d = 1 - dt * 2.2; pvx[i] *= d; pvy[i] *= d; ps[i] += dt * 10; }
        else if (k === K_GAS) { const d = 1 - dt * 3; pvx[i] *= d; pvy[i] *= d; ps[i] += dt * 8; }
        else if (k === K_SPARK) { pvx[i] *= 1 - dt * 3; pvy[i] *= 1 - dt * 3; }
        else { pvy[i] -= dt * 20; }
      }
      for (let i = explosions.length - 1; i >= 0; i--) { explosions[i].t += dt; if (explosions[i].t >= explosions[i].T) explosions.splice(i, 1); }
      for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t >= bolts[i].T) bolts.splice(i, 1); }
      for (let i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t >= beams[i].T) beams.splice(i, 1); }
      for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; texts[i].y -= dt * 30; if (texts[i].t > 0.9) texts.splice(i, 1); }
      fx.shake *= Math.max(0, 1 - dt * 5);
      if (fx.shake < 0.05) fx.shake = 0;
      if (fx.leak > 0) fx.leak -= dt;
      if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt * 1.6);
    },

    draw(ctx) {
      // smoke and gas (normal blending)
      for (let i = 0; i < hi; i++) {
        if (pl[i] <= 0) continue;
        const k = pk[i], u = pl[i] / pm[i];
        if (k === K_SMOKE) {
          ctx.globalAlpha = Math.min(0.55, u * 0.7);
          ctx.fillStyle = SMOKE_PAL[pc[i] + (u < 0.4 ? 1 : 0)];
          const s = ps[i];
          ctx.fillRect((px[i] - s / 2) | 0, (py[i] - s / 2) | 0, s | 0, s | 0);
        } else if (k === K_GAS) {
          ctx.globalAlpha = Math.min(0.4, u * 0.6);
          ctx.fillStyle = '#8bd04a';
          const s = ps[i];
          ctx.fillRect((px[i] - s / 2) | 0, (py[i] - s / 2) | 0, s | 0, s | 0);
        }
      }
      ctx.globalAlpha = 1;
      // additive: explosions, flames, sparks
      ctx.globalCompositeOperation = 'lighter';
      for (const e of explosions) {
        const u = e.t / e.T, a = 1 - u;
        const rr = e.r * (0.35 + 0.8 * Math.sqrt(u));
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr);
        g.addColorStop(0, `rgba(255,255,235,${0.95 * a})`);
        g.addColorStop(0.35, `rgba(255,224,120,${0.8 * a})`);
        g.addColorStop(0.7, `rgba(255,140,40,${0.45 * a})`);
        g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect(e.x - rr, e.y - rr, rr * 2, rr * 2);
        if (e.big) {
          ctx.strokeStyle = `rgba(255,240,200,${0.6 * a})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.2 + u * 1.0), 0, G.TAU); ctx.stroke();
        }
      }
      for (let i = 0; i < hi; i++) {
        if (pl[i] <= 0) continue;
        const k = pk[i], u = pl[i] / pm[i];
        if (k === K_FLAME) {
          ctx.globalAlpha = Math.min(1, u * 1.6);
          ctx.fillStyle = FLAME_PAL[Math.min(8, ((1 - u) * 9) | 0)];
          const s = ps[i];
          ctx.fillRect((px[i] - s / 2) | 0, (py[i] - s / 2) | 0, s | 0, s | 0);
        } else if (k === K_SPARK) {
          ctx.globalAlpha = Math.min(1, u * 2);
          ctx.fillStyle = pc[i] === 1 ? '#aee6ff' : pc[i] === 2 ? '#ffe9a8' : '#ffd060';
          const s = ps[i];
          ctx.fillRect(px[i] | 0, py[i] | 0, s | 0 || 1, s | 0 || 1);
        } else if (k === K_GOLD) {
          ctx.globalAlpha = Math.min(1, u * 2);
          ctx.fillStyle = '#ffe060';
          ctx.fillRect(px[i] | 0, py[i] | 0, 3, 3);
        } else if (k === K_ICE) {
          ctx.globalAlpha = Math.min(1, u * 2);
          ctx.fillStyle = '#bfeaff';
          ctx.fillRect(px[i] | 0, py[i] | 0, ps[i] | 0, ps[i] | 0);
        }
      }
      ctx.globalAlpha = 1;
      for (const b of beams) {
        const a = 1 - b.t / b.T;
        ctx.strokeStyle = b.color; ctx.globalAlpha = a * 0.5; ctx.lineWidth = b.w * 2.4;
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
        ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = b.w * 0.8;
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      }
      for (const b of bolts) {
        const a = 1 - b.t / b.T;
        ctx.globalAlpha = a;
        ctx.strokeStyle = b.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      for (const t of texts) {
        ctx.globalAlpha = 1 - t.t / 0.9;
        ctx.fillStyle = '#000'; ctx.fillText(t.s, t.x + 2, t.y + 2);
        ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
  };
  return fx;
})();
