'use strict';
/* The upgrade tree: a glowing neon node graph with pan, zoom, tooltips and purchasing. */

G.meta = (function () {
  const cv = document.getElementById('tree'), ctx = cv.getContext('2d');
  const tip = document.getElementById('tip');
  const FAM = {
    gun: '#ffd15c', cannon: '#ff9a4d', laser: '#5ce1ff', flame: '#ff6a3d', tesla: '#b58bff', mortar: '#8fe36a', grenade: '#c9e04d',
    heart: '#ff5c7a', coin: '#ffd84a', missile: '#ff8a5c', plane: '#6fb7ff', bomb: '#ff7a3a', orbital: '#52f0ff', nuke: '#ff4c4c', snow: '#9fe8ff',
  };
  const CUR = {
    crystal: { c: '#59b8ff', icon: 'crystal', key: 'crystals', name: 'Crystals' },
    orb: { c: '#ffa03a', icon: 'orb', key: 'orbs', name: 'Orbs' },
    cube: { c: '#ff6fd8', icon: 'cube', key: 'cubes', name: 'Cubes' },
  };
  const HALF = 27;
  const pos = {};
  const pulses = {};
  const cam = { x: 0, y: 0, z: 0.8 };
  let hover = null, drag = null, isOpen = false, laid = false, lastMouse = { x: 0, y: 0 };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function layout() {
    for (const n of G.TREE) {
      if (!n.parent) { pos[n.id] = { x: 0, y: 0 }; continue; }
      const p = pos[n.parent], a = n.ang * Math.PI / 180;
      pos[n.id] = { x: p.x + Math.cos(a) * n.dist, y: p.y + Math.sin(a) * n.dist };
    }
    // relax: keep each node near its intended offset from its parent while pushing overlapping nodes apart
    const MIN = 78;
    for (let it = 0; it < 90; it++) {
      for (const n of G.TREE) {
        if (!n.parent) continue;
        const p = pos[n.parent], q = pos[n.id], a = n.ang * Math.PI / 180;
        q.x += (p.x + Math.cos(a) * n.dist - q.x) * 0.12;
        q.y += (p.y + Math.sin(a) * n.dist - q.y) * 0.12;
      }
      for (let i = 0; i < G.TREE.length; i++) {
        for (let j = i + 1; j < G.TREE.length; j++) {
          const a = pos[G.TREE[i].id], b = pos[G.TREE[j].id];
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d >= MIN) continue;
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          const push = (MIN - d) * 0.5 / d;
          const fa = i === 0 ? 0 : 1;
          a.x -= dx * push * fa; a.y -= dy * push * fa;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const id in pos) { const p = pos[id]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2;
    cam.z = G.clamp(Math.min(1700 / (x1 - x0 + 160), 900 / (y1 - y0 + 200)), 0.4, 1.3);
    laid = true;
  }

  function nodeAt(sx, sy) {
    const wx = (sx - 960) / cam.z + cam.x, wy = (sy - 540) / cam.z + cam.y;
    let best = null, bd = 1e9;
    for (const n of G.TREE) {
      const p = pos[n.id], dx = Math.abs(p.x - wx), dy = Math.abs(p.y - wy);
      if (dx <= HALF + 4 && dy <= HALF + 4 && dx + dy < bd) { bd = dx + dy; best = n; }
    }
    return best;
  }

  function showTip(n, sx, sy) {
    if (!n) { tip.classList.add('hidden'); return; }
    const l = G.level(n.id), cur = CUR[n.cur], cost = G.nodeCost(n), avail = G.nodeAvailable(n);
    const have = G.save.data[cur.key], maxed = l >= n.max;
    let h = '<span class="lv">' + l + '/' + n.max + '</span><div class="t" style="color:' + FAM[n.fam] + '">' + n.name + '</div>';
    h += '<div class="d">' + n.desc + '</div>';
    if (maxed) h += '<div class="cost" style="color:#ffd84a">MAXED</div>';
    else h += '<div class="cost" style="color:' + (have >= cost ? cur.c : '#ff7a6a') + '">' + cur.name + ': ' + G.fmt(cost) + (have < cost ? ' <span style="font-size:16px;opacity:.8">(have ' + G.fmt(have) + ')</span>' : '') + '</div>';
    if (!avail) h += '<div class="lockmsg">Unlock "' + G.TREE_MAP[n.parent].name + '" first.</div>';
    tip.innerHTML = h;
    tip.classList.remove('hidden');
    const w = 380, hh = tip.offsetHeight || 140;
    tip.style.left = G.clamp(sx + 26, 8, 1920 - w - 8) + 'px';
    tip.style.top = G.clamp(sy + 22, 8, 1080 - hh - 8) + 'px';
  }

  /* ---------------------------------------------------------------- input */
  cv.addEventListener('mousedown', e => {
    if (!isOpen || e.button !== 0) return;
    G.audio.init();
    const m = G.toStage(e);
    drag = { sx: m.x, sy: m.y, cx: cam.x, cy: cam.y, moved: false };
  });
  window.addEventListener('mousemove', e => {
    if (!isOpen) return;
    const m = G.toStage(e);
    lastMouse = m;
    if (drag) {
      if (!drag.moved && Math.hypot(m.x - drag.sx, m.y - drag.sy) > 6) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - (m.x - drag.sx) / cam.z; cam.y = drag.cy - (m.y - drag.sy) / cam.z; }
    }
    hover = drag && drag.moved ? null : nodeAt(m.x, m.y);
    cv.style.cursor = drag && drag.moved ? 'grabbing' : hover ? 'pointer' : 'grab';
    showTip(hover, m.x, m.y);
  });
  window.addEventListener('mouseup', e => {
    if (!isOpen || !drag) return;
    const wasClick = !drag.moved;
    drag = null;
    if (!wasClick || e.button !== 0) return;
    const m = G.toStage(e), n = nodeAt(m.x, m.y);
    if (!n) return;
    if (G.buyNode(n)) {
      pulses[n.id] = 1;
      G.audio.play('buy');
      showTip(n, m.x, m.y);
    } else {
      G.audio.play('error');
    }
  });
  cv.addEventListener('wheel', e => {
    if (!isOpen) return;
    e.preventDefault();
    const m = G.toStage(e);
    const wx = (m.x - 960) / cam.z + cam.x, wy = (m.y - 540) / cam.z + cam.y;
    cam.z = G.clamp(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.35, 2.2);
    cam.x = wx - (m.x - 960) / cam.z; cam.y = wy - (m.y - 540) / cam.z;
  }, { passive: false });

  /* ----------------------------------------------------------------- draw */
  function drawNode(n, now) {
    const p = pos[n.id], l = G.level(n.id), col = FAM[n.fam] || '#fff';
    const avail = G.nodeAvailable(n), maxed = l >= n.max, owned = l > 0;
    const cur = CUR[n.cur], afford = G.save.data[cur.key] >= G.nodeCost(n);
    const pl = pulses[n.id] || 0;
    const half = HALF * (1 + pl * 0.25);
    ctx.save();
    ctx.translate(p.x, p.y);
    const buyable = avail && afford && !maxed;
    if (owned || buyable) { ctx.shadowColor = col; ctx.shadowBlur = owned ? 16 : 8 + 8 * (0.5 + 0.5 * Math.sin(now / 260)); }
    ctx.fillStyle = owned ? rgba(col, 0.22) : '#06080b';
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.lineWidth = hover === n ? 5 : 3;
    ctx.strokeStyle = avail ? (owned ? col : rgba(col, buyable ? 0.95 : 0.55)) : '#353b44';
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    ctx.shadowBlur = 0;
    G.icon(ctx, n.icon, 0, -3, 30, !avail ? '#454c57' : owned ? '#ffffff' : col);
    if (!avail) G.icon(ctx, 'lock', half - 9, half - 9, 16, '#9aa3b0');
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = maxed ? '#ffd84a' : avail ? '#e8edf5' : '#59606b';
    ctx.fillText(l + '/' + n.max, 0, half + 18);
    if ((n.crown && owned) || (maxed && n.max > 1)) G.icon(ctx, 'crown', 0, -half - 12, 20, '#ffd84a');
    if (pl > 0) {
      ctx.strokeStyle = rgba(col, pl); ctx.lineWidth = 3;
      const r = half + (1 - pl) * 46;
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      pulses[n.id] = Math.max(0, pl - 0.03);
    }
    ctx.restore();
  }

  function draw(now) {
    if (!isOpen) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1920, 1080);
    const bg = ctx.createRadialGradient(960, 540, 60, 960, 540, 900);
    bg.addColorStop(0, 'rgba(30,40,70,0.28)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1920, 1080);

    ctx.save();
    ctx.translate(960 - cam.x * cam.z, 540 - cam.y * cam.z);
    ctx.scale(cam.z, cam.z);

    ctx.lineCap = 'round';
    for (const n of G.TREE) {
      if (!n.parent) continue;
      const a = pos[n.parent], b = pos[n.id], col = FAM[n.fam] || '#fff';
      const owned = G.owned(n.id), open = G.owned(n.parent);
      ctx.strokeStyle = rgba(col, owned ? 0.9 : open ? 0.45 : 0.16);
      ctx.lineWidth = owned ? 4 : 3;
      if (owned) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowBlur = 0;
      if (owned) {
        const u = ((now * 0.00035 + G.hash(a.x | 0, b.y | 0, 7)) % 1);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 3, 0, G.TAU); ctx.fill();
      }
    }
    for (const n of G.TREE) drawNode(n, now);
    ctx.restore();

    // currencies
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let y = 52;
    for (const k of ['crystal', 'orb', 'cube']) {
      const c = CUR[k];
      ctx.shadowColor = c.c; ctx.shadowBlur = 14;
      G.icon(ctx, c.icon, 46, y, 32, c.c);
      ctx.shadowBlur = 0;
      ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
      ctx.fillStyle = c.c;
      ctx.fillText(G.fmt(G.save.data[c.key]), 76, y + 1);
      y += 50;
    }
    ctx.fillStyle = 'rgba(180,190,205,0.55)'; ctx.font = '17px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Crystals come from kills  -  Orbs from winning a level for the first time  -  Cubes from a flawless first win', 960, 1040);
    ctx.fillText('Drag to pan, scroll to zoom, click a node to buy', 960, 1062);
  }

  return {
    open() {
      if (!laid) layout();
      isOpen = true; drag = null; hover = null;
      cv.classList.remove('hidden');
      document.getElementById('treeui').classList.remove('hidden');
    },
    close() {
      isOpen = false;
      tip.classList.add('hidden');
      cv.classList.add('hidden');
      document.getElementById('treeui').classList.add('hidden');
    },
    draw,
    pos,
    get isOpen() { return isOpen; },
  };
})();
