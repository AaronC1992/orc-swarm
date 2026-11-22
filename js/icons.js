'use strict';
/* Small vector icons used by the upgrade cards and the toolbars. Unit space is [-1, 1]. */

G.icon = (function () {
  const T = Math.PI * 2;

  function circ(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, T); fill ? c.fill() : c.stroke(); }
  function line(c, x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  function poly(c, p, fill) {
    c.beginPath(); c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    c.closePath(); fill ? c.fill() : c.stroke();
  }

  const I = {
    gun(c) { c.fillRect(-0.9, -0.25, 1.5, 0.45); c.fillRect(-0.9, -0.25, 0.55, 0.95); c.fillRect(0.6, -0.4, 0.3, 0.75); },
    cannon(c) { circ(c, -0.35, 0.25, 0.5, true); c.fillRect(-0.2, -0.45, 1.15, 0.55); c.fillRect(0.7, -0.6, 0.3, 0.85); },
    flame(c) {
      c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(0.9, -0.2, 0.9, 0.9, 0, 0.95); c.bezierCurveTo(-0.9, 0.9, -0.8, -0.1, -0.2, -0.45);
      c.bezierCurveTo(-0.15, -0.1, 0.1, 0.1, 0.15, -0.3); c.bezierCurveTo(0.2, -0.6, 0, -0.7, 0, -1); c.fill();
    },
    mortar(c) { c.save(); c.rotate(-0.6); c.fillRect(-0.28, -1, 0.56, 1.35); c.fillRect(-0.45, -1, 0.9, 0.2); c.restore(); c.fillRect(-0.8, 0.55, 1.6, 0.35); },
    laser(c) { circ(c, -0.5, 0.5, 0.4, true); line(c, -0.3, 0.3, 0.9, -0.9); line(c, -0.1, 0.5, 0.9, -0.1); line(c, -0.5, 0.1, 0.1, -0.9); },
    tesla(c) { poly(c, [0.2, -1, -0.6, 0.15, -0.05, 0.15, -0.3, 1, 0.65, -0.25, 0.05, -0.25], true); },
    grenade(c) { circ(c, 0, 0.2, 0.62, true); c.fillRect(-0.22, -0.8, 0.44, 0.35); line(c, 0.2, -0.75, 0.7, -0.95); },
    dmg(c) {
      const p = [];
      for (let i = 0; i < 16; i++) { const a = i * T / 16, r = i % 2 ? 0.5 : 1; p.push(Math.cos(a) * r, Math.sin(a) * r); }
      poly(c, p, true);
    },
    rate(c) { for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(-0.8 + k * 0.7, -0.8); c.lineTo(-0.1 + k * 0.7, 0); c.lineTo(-0.8 + k * 0.7, 0.8); c.stroke(); } },
    pierce(c) { line(c, -1, 0, 0.7, 0); poly(c, [1, 0, 0.45, -0.4, 0.45, 0.4], true); circ(c, -0.1, 0, 0.55, false); },
    range(c) { circ(c, 0, 0, 0.6, false); line(c, -1, 0, -0.35, 0); line(c, 1, 0, 0.35, 0); line(c, 0, -1, 0, -0.35); line(c, 0, 1, 0, 0.35); },
    count(c) { line(c, -0.9, 0, 0.9, 0); line(c, 0, -0.9, 0, 0.9); },
    knock(c) { line(c, -0.9, -0.5, -0.4, -0.5); line(c, -0.9, 0.5, -0.4, 0.5); line(c, -0.9, 0, 0.5, 0); poly(c, [1, 0, 0.35, -0.55, 0.35, 0.55], true); },
    arc(c) { c.beginPath(); c.moveTo(-0.9, 0.8); c.arc(-0.9, 0.8, 2, -0.9, -0.25); c.closePath(); c.stroke(); },
    radius(c) { circ(c, 0, 0, 0.35, true); circ(c, 0, 0, 0.9, false); },
    heart(c) { c.beginPath(); c.moveTo(0, 0.9); c.bezierCurveTo(-1.4, -0.1, -0.7, -1, 0, -0.35); c.bezierCurveTo(0.7, -1, 1.4, -0.1, 0, 0.9); c.fill(); },
    coin(c) { circ(c, 0, 0, 0.85, false); line(c, 0, -0.45, 0, 0.45); line(c, -0.3, -0.2, 0.3, -0.2); line(c, -0.3, 0.2, 0.3, 0.2); },
    gold(c) { circ(c, 0, 0, 0.9, true); c.save(); c.strokeStyle = 'rgba(0,0,0,0.55)'; circ(c, 0, 0, 0.55, false); c.restore(); },
    silver(c) { circ(c, 0, 0, 0.9, false); circ(c, 0, 0, 0.5, true); },
    expl(c) { circ(c, -0.1, 0.25, 0.65, true); line(c, 0.3, -0.25, 0.7, -0.7); line(c, 0.7, -1, 0.7, -0.4); line(c, 0.4, -0.7, 1, -0.7); },
    skull(c) {
      circ(c, 0, -0.15, 0.75, true); c.fillRect(-0.4, 0.3, 0.8, 0.6);
      c.save(); c.fillStyle = 'rgba(0,0,0,0.85)'; circ(c, -0.28, -0.15, 0.2, true); circ(c, 0.28, -0.15, 0.2, true); c.restore();
    },
    speed(c) { line(c, -0.9, -0.5, 0.2, -0.5); line(c, -0.9, 0, 0.5, 0); line(c, -0.9, 0.5, 0.2, 0.5); poly(c, [1, 0, 0.4, -0.5, 0.4, 0.5], true); },
    stats(c) { c.fillRect(-0.85, 0.1, 0.45, 0.85); c.fillRect(-0.22, -0.4, 0.45, 1.35); c.fillRect(0.4, -0.95, 0.45, 1.9); },
    missile(c) { c.save(); c.rotate(-0.78); c.fillRect(-0.85, -0.22, 1.4, 0.44); poly(c, [1, 0, 0.5, -0.3, 0.5, 0.3], true); poly(c, [-0.85, -0.22, -1, -0.65, -0.5, -0.22], true); poly(c, [-0.85, 0.22, -1, 0.65, -0.5, 0.22], true); c.restore(); },
    cd(c) { circ(c, 0, 0, 0.9, false); line(c, 0, 0, 0, -0.6); line(c, 0, 0, 0.45, 0.2); },
    auto(c) { c.beginPath(); c.arc(0, 0, 0.75, 0.4, 5.4); c.stroke(); poly(c, [0.8, -0.75, 0.2, -0.7, 0.7, -0.15], true); },
    snow(c) { for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; line(c, Math.cos(a) * 0.95, Math.sin(a) * 0.95, -Math.cos(a) * 0.95, -Math.sin(a) * 0.95); } circ(c, 0, 0, 0.25, true); },
    dur(c) { poly(c, [-0.6, -0.9, 0.6, -0.9, 0, 0], false); poly(c, [-0.6, 0.9, 0.6, 0.9, 0, 0], true); },
    plane(c) { poly(c, [1, 0, 0.2, -0.15, -0.2, -0.95, -0.5, -0.95, -0.4, -0.1, -0.85, -0.1, -0.95, -0.4, -1, -0.4, -1, 0.4, -0.95, 0.4, -0.85, 0.1, -0.4, 0.1, -0.5, 0.95, -0.2, 0.95, 0.2, 0.15], true); },
    bomb(c) { circ(c, 0, 0.25, 0.65, true); poly(c, [-0.3, -0.35, 0.3, -0.35, 0.2, -0.85, -0.2, -0.85], true); line(c, -0.5, -0.95, -0.05, -0.55); },
    orbital(c) { circ(c, 0, 0.55, 0.4, true); line(c, 0, -1, 0, 0.1); line(c, -0.3, -1, -0.12, 0.1); line(c, 0.3, -1, 0.12, 0.1); },
    nuke(c) {
      circ(c, 0, 0, 0.18, true);
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 0.95, k * T / 3 - 0.5, k * T / 3 + 0.5); c.closePath(); c.fill(); }
    },
    chain(c) { circ(c, -0.55, 0.5, 0.35, false); circ(c, 0.55, -0.5, 0.35, false); poly(c, [0.1, -0.9, -0.3, 0, 0.05, 0, -0.1, 0.9, 0.35, -0.1, 0.0, -0.1], true); },
    slow(c) { line(c, -0.6, -0.8, 0, -0.1); line(c, 0, -0.1, 0.6, -0.8); line(c, -0.6, 0.1, 0, 0.8); line(c, 0, 0.8, 0.6, 0.1); },
    lock(c) { c.fillRect(-0.6, -0.1, 1.2, 0.95); c.beginPath(); c.arc(0, -0.15, 0.4, Math.PI, 0); c.stroke(); },
    crown(c) { poly(c, [-0.9, 0.6, -0.9, -0.6, -0.4, 0, 0, -0.8, 0.4, 0, 0.9, -0.6, 0.9, 0.6], true); },
    crystal(c) { poly(c, [0, -1, 0.7, -0.2, 0, 1, -0.7, -0.2], true); },
    orb(c) { circ(c, 0, 0, 0.85, true); },
    cube(c) { poly(c, [-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, 0.8], true); },
    crowd(c) { circ(c, -0.55, 0.35, 0.38, true); circ(c, 0.55, 0.35, 0.38, true); circ(c, 0, -0.35, 0.42, true); circ(c, 0, 0.55, 0.38, true); },
    orcface(c) { circ(c, 0, 0.05, 0.75, true); poly(c, [-0.7, -0.1, -1, -0.5, -0.55, -0.4], true); poly(c, [0.7, -0.1, 1, -0.5, 0.55, -0.4], true); },
    play(c) { poly(c, [-0.6, -0.8, 0.9, 0, -0.6, 0.8], true); },
    pause(c) { c.fillRect(-0.7, -0.8, 0.45, 1.6); c.fillRect(0.25, -0.8, 0.45, 1.6); },
  };

  return function (ctx, name, x, y, s, col) {
    const f = I[name] || I.dmg, u = s / 2;
    ctx.save();
    ctx.translate(x, y); ctx.scale(u, u);
    ctx.fillStyle = ctx.strokeStyle = col || '#fff';
    ctx.lineWidth = 0.16; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    f(ctx);
    ctx.restore();
  };
})();
