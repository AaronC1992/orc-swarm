'use strict';
/* Player abilities: missile, strafing run, bombing run, orbital laser, cryo beam, nuke. */

(function () {
  const sim = G.sim, fx = G.fx, SRC = G.SRCI;
  const A = G.abilities = { cd: {}, armed: 'missile', list: [] };
  let reactIn = 0;
  const DEF = {};
  G.ABILITIES.forEach(a => { DEF[a.id] = a; });
  const CDK = { missile: 'miss.cd', strafe: 'strafe.cd', bomb: 'bomb.cd', orbital: 'orb.cd', cryo: 'cryo.cd', nuke: 'nuke.cd' };
  const ORIGIN = { x: G.W / 2, y: G.H + 60 };

  A.def = DEF;
  A.maxCd = id => id === 'missile' && A.missilesLeft === 0 ? DEF.missile.rackReload : DEF[id].cd * G.S[CDK[id]];
  A.unlocked = () => G.ABILITIES.filter(a => G.owned(a.unlock));
  A.ready = id => (A.cd[id] || 0) <= 0;
  A.reset = function () {
    reactIn = 0;
    A.missilesLeft = DEF.missile.rackSize;
    A.cd = {}; A.list.length = 0; A.armed = 'missile';
    for (const a of G.ABILITIES) A.cd[a.id] = 0;
  };
  A.arm = function (id) { if (G.owned(DEF[id].unlock)) A.armed = id; };

  A.radius = function (id) {
    const S = G.S;
    if (id === 'missile') return 74 * S['miss.radius'];
    if (id === 'nuke') return 330 * S['nuke.radius'];
    if (id === 'bomb') return 64 * S['bomb.radius'];
    return 40;
  };
  A.maxLen = function (id) {
    const S = G.S;
    return id === 'strafe' ? 820 * S['strafe.len'] : id === 'cryo' ? 760 * S['cryo.len'] : 900;
  };

  A.clampLine = function (id, p0, p1) {
    let dx = p1.x - p0.x, dy = p1.y - p0.y;
    const d = Math.hypot(dx, dy), m = A.maxLen(id);
    if (d > m) { dx = dx / d * m; dy = dy / d * m; }
    return { x: p0.x + dx, y: p0.y + dy };
  };

  /* ------------------------------------------------------------------ use */
  A.use = function (id, p0, p1) {
    if (!A.ready(id) || !G.owned(DEF[id].unlock)) return false;
    const S = G.S;
    if (DEF[id].mode === 'line') {
      p1 = A.clampLine(id, p0, p1);
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 60) return false;
    }
    if (id === 'missile') A.missilesLeft--;
    A.cd[id] = A.maxCd(id);
    switch (id) {
      case 'missile': {
        const d = Math.hypot(p0.x - ORIGIN.x, p0.y - ORIGIN.y);
        A.list.push({ k: 'missile', x: ORIGIN.x, y: ORIGIN.y, tx: p0.x, ty: p0.y, t: 0, T: 0.25 + d / 2600 });
        G.audio.play('missile');
        break;
      }
      case 'strafe': case 'bomb': case 'orbital': case 'cryo': {
        const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy);
        const e = { k: id, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, ux: dx / len, uy: dy / len, len, t: 0, acc: 0, drop: 0 };
        if (id === 'strafe') { e.T = (len + 700) / 640; G.audio.play('jet'); }
        else if (id === 'bomb') { e.T = (len + 700) / 470; G.audio.play('jet'); }
        else if (id === 'orbital') { e.T = 0.7 + len / 380; G.audio.play('orbital'); }
        else { e.T = 0.9; G.audio.play('cryo'); e.done = false; }
        A.list.push(e);
        break;
      }
      case 'nuke':
        A.list.push({ k: 'nuke', x: p0.x, y: p0.y, t: 0, T: 2.2 });
        G.audio.play('siren');
        break;
    }
    if (id !== 'missile') A.armed = 'missile';
    return true;
  };

  /* --------------------------------------------------------------- update */
  function missileHit(e) {
    const S = G.S, r = A.radius('missile');
    sim.blast(e.tx, e.ty, r, 14 * S['miss.dmg'], 240, SRC.missile, 0.5);
    fx.explosion(e.tx, e.ty, r * 1.25, 1);
    G.audio.play('boom');
  }

  function planePos(e, s) { return { x: e.x0 + e.ux * s, y: e.y0 + e.uy * s }; }

  A.update = function (dt) {
    const S = G.S;
    for (const a of G.ABILITIES) if (A.cd[a.id] > 0) A.cd[a.id] -= dt;
    if (A.missilesLeft === 0 && A.ready('missile')) A.missilesLeft = DEF.missile.rackSize;
    const inp = G.input;
    if (S.autoMissile && inp && inp.down && A.armed === 'missile' && G.state === 'battle' && !inp.drag) A.use('missile', { x: inp.x, y: inp.y });

    reactIn -= dt;
    const warn = A.list.length > 0 && reactIn <= 0;
    if (warn) reactIn = 0.12;
    for (let i = A.list.length - 1; i >= 0; i--) {
      const e = A.list[i];
      e.t += dt;
      let done = false;
      switch (e.k) {
        case 'missile': {
          if (warn) sim.avoidStrike(e.tx, e.ty, e.tx, e.ty, A.radius('missile'));
          const u = Math.min(1, e.t / e.T);
          const px = e.x, py = e.y;
          e.x = ORIGIN.x + (e.tx - ORIGIN.x) * u * u * 0.4 + (e.tx - ORIGIN.x) * u * 0.6;
          e.y = ORIGIN.y + (e.ty - ORIGIN.y) * u * u * 0.4 + (e.ty - ORIGIN.y) * u * 0.6;
          e.ang = Math.atan2(e.y - py, e.x - px);
          fx.emit(fx.K_SMOKE, e.x, e.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.5, 4, 1);
          fx.emit(fx.K_FLAME, e.x, e.y, 0, 0, 0.2, 3, 0);
          if (u >= 1) { missileHit(e); done = true; }
          break;
        }
        case 'strafe': {
          const s = -350 + (e.len + 700) * e.t / e.T;
          if (warn && s < e.len) warnLine(e, s, 38);
          e.s = s;
          if (s >= 0 && s <= e.len) {
            e.acc += dt;
            while (e.acc >= 0.035) {
              e.acc -= 0.035;
              const p = planePos(e, s + 40), perp = (Math.random() - 0.5) * 30;
              const gx = p.x - e.uy * perp, gy = p.y + e.ux * perp;
              const m = sim.qCircle(gx, gy, 38), q = sim.q;
              for (let k = 0; k < m; k++) {
                sim.damage(q[k], 3.4 * S['strafe.dmg'], SRC.strafe);
                sim.impulse(q[k], e.ux + (Math.random() - 0.5), e.uy + (Math.random() - 0.5), 60);
              }
              const jp = planePos(e, s);
              fx.beam(jp.x - e.uy * perp * 0.3, jp.y + e.ux * perp * 0.3, gx, gy, 0.07, '#ffe9a0', 2);
              fx.sparks(gx, gy, 2);
              if (Math.random() < 0.25) fx.emit(fx.K_SMOKE, gx, gy, 0, 0, 0.5, 5, 1);
            }
          }
          if (e.t >= e.T) done = true;
          break;
        }
        case 'bomb': {
          const s = -350 + (e.len + 700) * e.t / e.T;
          if (warn && s < e.len) warnLine(e, s, A.radius('bomb'));
          e.s = s;
          if (s >= 0 && s <= e.len) {
            e.drop += dt;
            while (e.drop >= 0.075) {
              e.drop -= 0.075;
              const p = planePos(e, s), perp = (Math.random() - 0.5) * 36;
              A.list.push({ k: 'drop', x: p.x - e.uy * perp, y: p.y + e.ux * perp, t: 0, T: 0.5 });
            }
          }
          if (e.t >= e.T) done = true;
          break;
        }
        case 'drop': {
          if (warn) sim.avoidStrike(e.x, e.y, e.x, e.y, A.radius('bomb'));
          if (e.t >= e.T) {
            const r = A.radius('bomb');
            sim.blast(e.x, e.y, r, 7 * S['bomb.dmg'], 150, SRC.bomb, 0.5);
            fx.explosion(e.x, e.y, r * 1.1, 0.8, true);
            if (Math.random() < 0.3) G.audio.play('boom');
            done = true;
          }
          break;
        }
        case 'orbital': {
          const warm = 0.7, u = Math.max(0, Math.min(1, (e.t - warm) / (e.T - warm)));
          if (warn) warnLine(e, u * e.len, 50);
          e.px = e.x0 + (e.x1 - e.x0) * u; e.py = e.y0 + (e.y1 - e.y0) * u;
          if (e.t > warm) {
            e.acc += dt;
            while (e.acc >= 0.04) {
              e.acc -= 0.04;
              const m = sim.qCircle(e.px, e.py, 50), q = sim.q;
              for (let k = 0; k < m; k++) {
                const j = q[k];
                if (sim.burn[j] < 2) sim.burn[j] = 2.5;
                sim.damage(j, 3.2 * S['orb.dmg'], SRC.orbital);
              }
              fx.sparks(e.px + (Math.random() - 0.5) * 60, e.py + (Math.random() - 0.5) * 60, 3);
              if (Math.random() < 0.25) fx.explosion(e.px + (Math.random() - 0.5) * 50, e.py + (Math.random() - 0.5) * 50, 34, 0.35, true);
              fx.shake = Math.max(fx.shake, 3);
            }
            if (Math.random() < dt * 14) fx.scorch(e.px, e.py, 22);
          }
          if (e.t >= e.T + 0.25) done = true;
          break;
        }
        case 'cryo': {
          if (warn && !e.done) warnLine(e, 0, 26);
          if (!e.done && e.t >= 0.35) {
            e.done = true;
            const dur = 4 * S['cryo.dur'];
            const m = sim.qSegment(e.x0, e.y0, e.x1, e.y1, 26), q = sim.q;
            for (let k = 0; k < m; k++) { const j = q[k]; sim.frz[j] = dur; sim.burn[j] = 0; }
            for (let s = 0; s < e.len; s += 12) fx.ice(e.x0 + e.ux * s + (Math.random() - 0.5) * 40, e.y0 + e.uy * s + (Math.random() - 0.5) * 40);
            fx.beam(e.x0, e.y0, e.x1, e.y1, 0.45, '#9fe8ff', 40);
            fx.flash = Math.max(fx.flash, 0.15);
          }
          if (e.t >= e.T) done = true;
          break;
        }
        case 'nuke': {
          if (warn) sim.avoidStrike(e.x, e.y, e.x, e.y, A.radius('nuke'));
          if (e.t >= e.T) {
            const R = A.radius('nuke'), before = G.run.kills;
            sim.blast(e.x, e.y, R, 600 * S['nuke.dmg'], 520, SRC.nuke, 0.3);
            const kills = G.run.kills - before;
            if (kills > (G.run.bestNuke || 0)) G.run.bestNuke = kills;
            fx.explosion(e.x, e.y, R * 0.55, 3);
            fx.explosion(e.x, e.y, R * 0.9, 2);
            fx.scorch(e.x, e.y, R * 0.7);
            fx.flash = 1; fx.shake = 24;
            G.audio.play('nuke');
            done = true;
          }
          break;
        }
      }
      if (done) A.list.splice(i, 1);
    }
  };

  function warnLine(e, s, radius) {
    const start = Math.max(0, s);
    sim.avoidStrike(e.x0 + e.ux * start, e.y0 + e.uy * start, e.x1, e.y1, radius);
  }

  /* -------------------------------------------------------------- drawing */
  function plane(ctx, x, y, ang, k, big) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(k, k);
    const body = big ? '#4a4f3a' : '#59616e', wing = big ? '#3c402e' : '#454c58', hi = big ? '#6a704f' : '#8691a1';
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(6, -3); ctx.lineTo(-8, -big ? 36 : 28); ctx.lineTo(-18, -big ? 36 : 28); ctx.lineTo(-8, -3);
    ctx.moveTo(6, 3); ctx.lineTo(-8, big ? 36 : 28); ctx.lineTo(-18, big ? 36 : 28); ctx.lineTo(-8, 3);
    ctx.fill();
    ctx.fillRect(-30, -12, 8, 9); ctx.fillRect(-30, 3, 8, 9);
    ctx.fillStyle = body; ctx.fillRect(-28, -4, big ? 62 : 56, 8);
    ctx.fillStyle = hi; ctx.fillRect(-28, -4, big ? 62 : 56, 2);
    ctx.fillStyle = '#273039'; ctx.fillRect(10, -3, 9, 6);
    ctx.restore();
  }

  function drawPlane(ctx, e, big) {
    if (e.s === undefined) return;
    const p = planePos(e, e.s), ang = Math.atan2(e.uy, e.ux), k = big ? 1.25 : 1;
    ctx.save();
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    ctx.translate(p.x + 46, p.y + 62); ctx.rotate(ang); ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(6, -3); ctx.lineTo(-8, -28); ctx.lineTo(-18, -28); ctx.lineTo(-8, -3);
    ctx.lineTo(-8, 3); ctx.lineTo(-18, 28); ctx.lineTo(-8, 28); ctx.lineTo(6, 3);
    ctx.fill(); ctx.fillRect(-28, -4, 56, 8);
    ctx.restore();
    plane(ctx, p.x, p.y - 26, ang, k, big);
    if (e.s > -300 && e.s < e.len + 300) {
      fx.emit(fx.K_SMOKE, p.x - e.ux * 30, p.y - 26 - e.uy * 30, 0, 0, 0.4, 3, 2);
    }
  }

  A.draw = function (ctx, now) {
    for (const e of A.list) {
      switch (e.k) {
        case 'missile': {
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang || -Math.PI / 2);
          ctx.fillStyle = '#d9dde4'; ctx.fillRect(-12, -3, 22, 6);
          ctx.fillStyle = '#c0392b'; ctx.fillRect(10, -3, 6, 6);
          ctx.fillStyle = '#7f8896'; ctx.fillRect(-12, -6, 5, 12);
          ctx.fillStyle = '#ffd36b'; ctx.fillRect(-18, -2, 6, 4);
          ctx.restore();
          break;
        }
        case 'strafe': drawPlane(ctx, e, false); break;
        case 'bomb': drawPlane(ctx, e, true); break;
        case 'drop': {
          const u = e.t / e.T, h = (1 - u) * (1 - u) * 140;
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect((e.x - 5) | 0, (e.y - 2) | 0, 10, 5);
          ctx.fillStyle = '#23262c'; ctx.fillRect((e.x - 4) | 0, (e.y - h - 6) | 0, 8, 12);
          ctx.fillStyle = '#6c7482'; ctx.fillRect((e.x - 3) | 0, (e.y - h - 5) | 0, 3, 6);
          break;
        }
        case 'orbital': {
          const warm = e.t < 0.7;
          if (warm) {
            const u = e.t / 0.7;
            ctx.strokeStyle = 'rgba(120,255,255,' + (0.3 + 0.5 * u) + ')'; ctx.lineWidth = 2;
            ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke(); ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(e.x0, e.y0, 60 - 30 * u, 0, G.TAU); ctx.stroke();
          } else if (e.t < e.T + 0.25) {
            const fade = e.t > e.T ? 1 - (e.t - e.T) / 0.25 : 1, w = 30 + Math.sin(now * 0.05) * 5;
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
            ctx.strokeStyle = 'rgba(80,220,255,0.35)'; ctx.lineWidth = w * 1.8;
            ctx.beginPath(); ctx.moveTo(e.px, e.py - 1400); ctx.lineTo(e.px, e.py); ctx.stroke();
            ctx.strokeStyle = 'rgba(180,255,255,0.75)'; ctx.lineWidth = w * 0.8; ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.3; ctx.stroke();
            const g = ctx.createRadialGradient(e.px, e.py, 2, e.px, e.py, 70);
            g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(110,230,255,0.5)'); g.addColorStop(1, 'rgba(60,160,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.px, e.py, 70, 0, G.TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          }
          break;
        }
        case 'cryo': {
          if (e.t < 0.35) {
            const u = e.t / 0.35;
            ctx.strokeStyle = 'rgba(150,230,255,' + (0.25 + 0.5 * u) + ')'; ctx.lineWidth = 44 * u;
            ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
          }
          break;
        }
        case 'nuke': {
          const R = A.radius('nuke'), u = e.t / e.T, blink = Math.sin(e.t * (8 + u * 18)) > 0;
          ctx.save();
          ctx.strokeStyle = blink ? 'rgba(255,60,50,0.95)' : 'rgba(255,170,60,0.9)'; ctx.lineWidth = 4;
          ctx.fillStyle = 'rgba(255,50,40,' + (0.08 + 0.12 * u) + ')';
          ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, G.TAU); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(e.x, e.y, R * (1 - u), 0, G.TAU); ctx.globalAlpha = 0.6; ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff'; ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center';
          ctx.fillText((e.T - e.t).toFixed(1), e.x, e.y + 12);
          ctx.restore();
          break;
        }
      }
    }
  };

  /* Preview shown while the player aims (cursor ring, or the line being dragged). */
  A.drawAim = function (ctx, now, mouse, drag) {
    const id = A.armed, d = DEF[id];
    if (!d || !mouse) return;
    const ok = A.ready(id);
    const col = ok ? 'rgba(255,255,255,0.85)' : 'rgba(150,150,150,0.5)';
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    if (d.mode === 'click') {
      const r = A.radius(id);
      if (id === 'nuke') ctx.strokeStyle = ok ? 'rgba(255,90,70,0.9)' : col;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r, 0, G.TAU); ctx.stroke();
      ctx.globalAlpha = 0.07; ctx.fillStyle = id === 'nuke' ? '#f33' : '#fff'; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke();
    } else if (drag) {
      const e = A.clampLine(id, drag, mouse);
      ctx.setLineDash([12, 8]); ctx.lineWidth = id === 'cryo' ? 3 : 2;
      ctx.strokeStyle = ok ? (id === 'cryo' ? 'rgba(140,230,255,0.95)' : 'rgba(255,230,120,0.95)') : col;
      ctx.beginPath(); ctx.moveTo(drag.x, drag.y); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(drag.x, drag.y, 8, 0, G.TAU); ctx.stroke();
      const a = Math.atan2(e.y - drag.y, e.x - drag.x);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - Math.cos(a - 0.4) * 22, e.y - Math.sin(a - 0.4) * 22);
      ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - Math.cos(a + 0.4) * 22, e.y - Math.sin(a + 0.4) * 22); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 10, 0, G.TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mouse.x - 18, mouse.y); ctx.lineTo(mouse.x + 18, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - 18); ctx.lineTo(mouse.x, mouse.y + 18); ctx.stroke();
    }
    ctx.restore();
  };
})();
