'use strict';
/* Static game data: turrets, abilities, upgrade tree, derived stats. */

G.TURRETS = [
  { id: 'gunner', unlock: 'gunner', name: 'Gunner', cnt: 'g.count', kind: 'bullet', range: 680, arc: 0.14, minArc: 0.05, maxArc: 0.5, rot: 4.5, rate: 5.5, dmg: 1, pierce: 1, speed: 1250, spread: 0.03, knock: 26,
    desc: 'Rapid-fire machine gun. Rounds punch through a couple of orcs.' },
  { id: 'cannon', unlock: 'cannon', name: 'Cannon', cnt: 'c.count', kind: 'shell', range: 720, arc: 0.1, minArc: 0.04, maxArc: 0.4, rot: 2.6, rate: 0.7, dmg: 9, pierce: 6, speed: 820, spread: 0.01, knock: 160,
    desc: 'Low fire rate but high damage. Projectiles penetrate through multiple orcs.' },
  { id: 'flame', unlock: 'flame', name: 'Flamethrower', cnt: 'f.count', kind: 'flame', range: 235, arc: 0.36, minArc: 0.14, maxArc: 0.7, rot: 3.5, rate: 10, dmg: 0.45, burn: 3.2, knock: 0,
    desc: 'Sets every orc in its cone on fire. Burning orcs take damage over time.' },
  { id: 'mortar', unlock: 'mortar', name: 'Mortar', cnt: 'mo.count', kind: 'lob', range: 780, minRange: 130, aimR: 105, rot: 2.2, rate: 0.55, dmg: 7, blast: 62, knock: 260,
    desc: 'Lobs shells onto the marked zone. Great against stalled crowds.' },
  { id: 'laser', unlock: 'laser', name: 'Laser', cnt: 'l.count', kind: 'beam', range: 480, arc: 0.3, minArc: 0.08, maxArc: 0.55, rot: 3.2, rate: 20, dmg: 0.6, width: 8, knock: 0,
    desc: 'Sustained beam that cuts through everything in a line.' },
  { id: 'tesla', unlock: 'tesla', name: 'Tesla Coil', cnt: 't.count', kind: 'tesla', range: 185, rate: 1.1, dmg: 3, chain: 4, jump: 75, knock: 30,
    desc: '360° lightning that chains between nearby orcs. Great for leaks.' },
  { id: 'grenade', unlock: 'grenade', name: 'Grenade Launcher', cnt: 'gr.count', kind: 'lob', range: 600, minRange: 110, aimR: 80, rot: 2.6, rate: 0.35, dmg: 2, blast: 88, knock: 90, support: true,
    desc: 'Lobs sticky grenades that slow orcs and make them take more damage.' },
];
G.TMAP = {};
G.TURRETS.forEach((t, i) => { t.idx = i; G.TMAP[t.id] = t; });

G.ABILITIES = [
  { id: 'missile', unlock: 'missile', name: 'Missile', key: 1, cd: 1.2, rackSize: 6, rackReload: 3.5, mode: 'click', desc: 'Fire at the cursor. After six missiles, the launcher takes 3.5 seconds to reload.' },
  { id: 'strafe', unlock: 'strafe', name: 'Strafing Run', key: 2, cd: 22, mode: 'line', desc: 'A jet strafes the line you draw.' },
  { id: 'bomb', unlock: 'bomb', name: 'Bombing Run', key: 3, cd: 32, mode: 'line', desc: 'A bomber carpet-bombs the line you draw.' },
  { id: 'orbital', unlock: 'orbital', name: 'Orbital Laser', key: 4, cd: 40, mode: 'line', desc: 'An orbital beam sweeps along the line.' },
  { id: 'cryo', unlock: 'cryo', name: 'Cryo Beam', key: 5, cd: 30, mode: 'line', desc: 'Freezes everything along the line.' },
  { id: 'nuke', unlock: 'nuke', name: 'Nuke', key: 6, cd: 90, mode: 'click', desc: 'Tactical nuke. Wipes out a huge area.' },
];

/* ------------------------------------------------------------ upgrade tree
   node(id, parent, angleDeg, dist, name, desc, icon, family, currency, base, step, max, fx)
   crystal cost: base * step^level; orb/cube cost: base + step*level
   fx entries: [stat, 'add'|'cd', value-per-level]                                    */
G.TREE = [];
G.TREE_MAP = {};
(function () {
  const N = G.TREE;
  function node(id, parent, ang, dist, name, desc, icon, fam, cur, base, step, max, fx, extra) {
    const n = Object.assign({ id, parent, ang, dist, name, desc, icon, fam, cur, base, step, max, fx: fx || [], stat: !!(fx && fx.length && cur === 'crystal') }, extra || {});
    N.push(n);
    G.TREE_MAP[id] = n;
    return n;
  }
  const C = 'crystal', O = 'orb', B = 'cube';

  node('gunner', null, 0, 0, 'Gunner', 'Rapid-fire machine gun on a swiveling mount.', 'gun', 'gun', O, 0, 0, 1, [], { crown: true });
  // gunner stats
  node('g_dmg', 'gunner', -118, 140, 'Gunner Damage', '+25% Gunner damage.', 'dmg', 'gun', C, 12, 1.65, 10, [['g.dmg', 'add', 0.25]]);
  node('g_rate', 'g_dmg', -92, 125, 'Gunner Fire Rate', '+14% Gunner fire rate.', 'rate', 'gun', C, 20, 1.7, 10, [['g.rate', 'add', 0.14]]);
  node('g_pierce', 'g_rate', -62, 125, 'Gunner Penetration', 'Gunner rounds penetrate 1 more orc.', 'pierce', 'gun', C, 150, 2.4, 5, [['g.pierce', 'add', 1]]);
  node('g_range', 'g_dmg', -148, 125, 'Gunner Range', '+6% Gunner range.', 'range', 'gun', C, 40, 1.8, 5, [['g.range', 'add', 0.06]]);
  node('g_count', 'gunner', -62, 140, 'Gunner Count', 'Deploy +1 Gunner.', 'count', 'gun', C, 30, 1.75, 10, [['g.count', 'add', 1]]);
  node('g_knock', 'g_count', -38, 125, 'Gunner Knockback', '+30% Gunner knockback.', 'knock', 'gun', C, 60, 1.9, 5, [['g.knock', 'add', 0.3]]);
  // cannon
  node('cannon', 'gunner', -18, 160, 'Cannon', 'Low fire rate but high damage. Projectiles penetrate through multiple orcs.', 'cannon', 'cannon', O, 1, 0, 1);
  node('c_dmg', 'cannon', -48, 125, 'Cannon Damage', '+15% Cannon damage.', 'dmg', 'cannon', C, 60, 1.75, 10, [['c.dmg', 'add', 0.15]]);
  node('c_rate', 'c_dmg', -28, 125, 'Cannon Fire Rate', '+6% Cannon fire rate.', 'rate', 'cannon', C, 90, 1.8, 10, [['c.rate', 'add', 0.06]]);
  node('c_pierce', 'c_dmg', -70, 125, 'Cannon Penetration', 'Shells penetrate 1 more orc.', 'pierce', 'cannon', C, 300, 2.3, 5, [['c.pierce', 'add', 1]]);
  node('c_count', 'cannon', 4, 130, 'Cannon Count', 'Deploy +1 Cannon.', 'count', 'cannon', C, 120, 2.0, 8, [['c.count', 'add', 1]]);
  // laser
  node('laser', 'c_rate', -5, 130, 'Laser', 'Sustained beam that cuts through everything in a line.', 'laser', 'laser', B, 1, 0, 1);
  node('l_dmg', 'laser', -30, 125, 'Laser Damage', '+25% Laser damage.', 'dmg', 'laser', C, 400, 1.8, 10, [['l.dmg', 'add', 0.25]]);
  node('l_range', 'l_dmg', -10, 125, 'Laser Range', '+8% Laser range.', 'range', 'laser', C, 700, 2.0, 5, [['l.range', 'add', 0.08]]);
  node('l_count', 'laser', 25, 125, 'Laser Count', 'Deploy +1 Laser.', 'count', 'laser', C, 900, 2.2, 6, [['l.count', 'add', 1]]);
  // flamethrower
  node('flame', 'gunner', 28, 160, 'Flamethrower', 'Sets every orc in its cone on fire. Burning orcs take damage over time.', 'flame', 'flame', O, 1, 0, 1);
  node('f_burn', 'flame', 5, 125, 'Burn Damage', '+30% burn damage.', 'dmg', 'flame', C, 70, 1.8, 10, [['f.burn', 'add', 0.3]]);
  node('f_range', 'f_burn', -10, 125, 'Flame Range', '+8% flame range.', 'range', 'flame', C, 110, 1.8, 5, [['f.range', 'add', 0.08]]);
  node('f_count', 'flame', 48, 125, 'Flamethrower Count', 'Deploy +1 Flamethrower.', 'count', 'flame', C, 100, 2.0, 8, [['f.count', 'add', 1]]);
  node('f_arc', 'f_count', 68, 120, 'Flame Cone', '+10% wider flame cone.', 'arc', 'flame', C, 130, 1.8, 5, [['f.arc', 'add', 0.1]]);
  // tesla
  node('tesla', 'f_burn', 30, 140, 'Tesla Coil', '360° lightning that chains between nearby orcs.', 'tesla', 'tesla', B, 1, 0, 1);
  node('t_dmg', 'tesla', 10, 125, 'Tesla Damage', '+25% Tesla damage.', 'dmg', 'tesla', C, 500, 1.8, 10, [['t.dmg', 'add', 0.25]]);
  node('t_chain', 'tesla', 50, 125, 'Chain Lightning', 'Lightning chains to 1 more orc.', 'chain', 'tesla', C, 600, 1.9, 8, [['t.chain', 'add', 1]]);
  node('t_count', 't_chain', 70, 120, 'Tesla Count', 'Deploy +1 Tesla Coil.', 'count', 'tesla', C, 800, 2.1, 6, [['t.count', 'add', 1]]);
  // mortar
  node('mortar', 'gunner', 72, 160, 'Mortar', 'Lobs shells onto the marked zone. Great against stalled crowds.', 'mortar', 'mortar', O, 2, 0, 1);
  node('mo_dmg', 'mortar', 50, 125, 'Mortar Damage', '+25% Mortar damage.', 'dmg', 'mortar', C, 150, 1.75, 10, [['mo.dmg', 'add', 0.25]]);
  node('mo_rate', 'mo_dmg', 28, 125, 'Mortar Fire Rate', '+12% Mortar fire rate.', 'rate', 'mortar', C, 200, 1.8, 10, [['mo.rate', 'add', 0.12]]);
  node('mo_radius', 'mortar', 92, 125, 'Blast Radius', '+8% Mortar blast radius.', 'radius', 'mortar', C, 180, 1.8, 8, [['mo.radius', 'add', 0.08]]);
  node('mo_count', 'mortar', 72, 125, 'Mortar Count', 'Deploy +1 Mortar.', 'count', 'mortar', C, 250, 2.0, 8, [['mo.count', 'add', 1]]);
  node('grenade', 'mo_radius', 110, 130, 'Grenade Launcher', 'Slows orcs and makes them take more damage.', 'grenade', 'grenade', O, 2, 0, 1);
  node('gr_slow', 'grenade', 88, 125, 'Sticky Grenades', '+10% slow and +8% damage taken.', 'slow', 'grenade', C, 300, 1.8, 5, [['gr.slow', 'add', 0.1]]);
  node('gr_count', 'grenade', 130, 125, 'Grenade Launcher Count', 'Deploy +1 Grenade Launcher.', 'count', 'grenade', C, 400, 2.1, 5, [['gr.count', 'add', 1]]);
  // base + economy
  node('hp', 'gunner', 112, 140, 'Base Health', '+10 base health.', 'heart', 'heart', C, 15, 1.6, 20, [['hp', 'add', 10]]);
  node('pay', 'gunner', 152, 150, 'Resource Payout', '+12% crystals from kills.', 'coin', 'coin', C, 20, 1.75, 12, [['pay', 'add', 0.12]]);
  node('gold', 'pay', 130, 125, 'Golden Orcs', '+1.5% chance an orc is golden and pays 25x crystals.', 'gold', 'coin', C, 60, 1.9, 10, [['gold', 'add', 0.015]]);
  node('silver', 'gold', 105, 125, 'Silver Orcs', 'Silver orcs appear. They pay 8x crystals (+1% chance).', 'silver', 'coin', O, 1, 0, 1);
  node('expl', 'pay', 172, 125, 'Explosive Orcs', '+1% chance an orc explodes on death, damaging wounded orcs nearby.', 'expl', 'coin', C, 120, 1.8, 10, [['expl', 'add', 0.01]]);
  node('head', 'expl', 190, 120, 'Headhunter', '+15% damage against healthy orcs.', 'skull', 'coin', C, 200, 1.9, 8, [['head', 'add', 0.15]]);
  node('slow', 'pay', 150, 130, 'Orc Fatigue', 'Orcs move 3% slower.', 'speed', 'coin', C, 250, 1.9, 8, [['slow', 'add', 0.03]]);
  node('dstats', 'slow', 135, 120, 'Damage Statistics', 'Shows which weapons dealt damage after each run.', 'stats', 'coin', O, 1, 0, 1);
  // missile family
  node('missile', 'gunner', 182, 165, 'Missile', 'Fire a missile at the cursor with left click.', 'missile', 'missile', O, 0, 0, 1, [], { crown: true });
  node('m_radius', 'missile', 205, 125, 'Missile Radius', '+10% missile blast radius.', 'radius', 'missile', C, 25, 1.7, 10, [['miss.radius', 'add', 0.1]]);
  node('m_dmg', 'm_radius', 225, 125, 'Missile Damage', '+30% missile damage.', 'dmg', 'missile', C, 35, 1.75, 10, [['miss.dmg', 'add', 0.3]]);
  node('m_cd', 'm_dmg', 245, 125, 'Missile Reload', '-8% time between shots within a rack.', 'cd', 'missile', C, 80, 1.8, 8, [['miss.cd', 'cd', 0.08]]);
  node('m_auto', 'missile', 160, 130, 'Automatic Missile', 'Hold the mouse button to keep firing missiles.', 'auto', 'missile', O, 1, 0, 1);
  // strafing
  node('strafe', 'g_range', -160, 150, 'Strafing Run', 'A jet strafes the line you draw.', 'plane', 'plane', O, 1, 0, 1);
  node('s_dmg', 'strafe', -185, 120, 'Strafe Damage', '+25% strafing damage.', 'dmg', 'plane', C, 200, 1.8, 10, [['strafe.dmg', 'add', 0.25]]);
  node('s_cd', 's_dmg', -205, 120, 'Strafe Reload', '-8% strafing cooldown.', 'cd', 'plane', C, 300, 1.8, 8, [['strafe.cd', 'cd', 0.08]]);
  node('s_len', 'strafe', -140, 125, 'Strafe Length', '+10% strafing run length.', 'range', 'plane', C, 250, 1.8, 5, [['strafe.len', 'add', 0.1]]);
  node('bomb', 'strafe', -165, 135, 'Bombing Run', 'A bomber carpet-bombs the line you draw.', 'bomb', 'bomb', O, 2, 0, 1);
  node('b_dmg', 'bomb', -190, 120, 'Bomb Damage', '+25% bomb damage.', 'dmg', 'bomb', C, 400, 1.8, 10, [['bomb.dmg', 'add', 0.25]]);
  node('b_cd', 'b_dmg', -210, 120, 'Bomber Reload', '-8% bombing run cooldown.', 'cd', 'bomb', C, 550, 1.8, 8, [['bomb.cd', 'cd', 0.08]]);
  node('b_radius', 'bomb', -140, 125, 'Bomb Radius', '+10% bomb radius.', 'radius', 'bomb', C, 450, 1.8, 6, [['bomb.radius', 'add', 0.1]]);
  node('orbital', 'b_dmg', -170, 140, 'Orbital Laser', 'An orbital beam sweeps along the line.', 'orbital', 'orbital', O, 3, 0, 1);
  node('o_dmg', 'orbital', -195, 120, 'Orbital Damage', '+25% orbital laser damage.', 'dmg', 'orbital', C, 900, 1.8, 10, [['orb.dmg', 'add', 0.25]]);
  node('o_cd', 'o_dmg', -215, 120, 'Orbital Reload', '-8% orbital laser cooldown.', 'cd', 'orbital', C, 1200, 1.8, 8, [['orb.cd', 'cd', 0.08]]);
  node('nuke', 'orbital', -145, 140, 'Nuke', 'Tactical nuke. Wipes out a huge area.', 'nuke', 'nuke', B, 2, 0, 1);
  node('n_dmg', 'nuke', -165, 125, 'Nuke Damage', '+30% nuke damage.', 'dmg', 'nuke', C, 2500, 1.9, 10, [['nuke.dmg', 'add', 0.3]]);
  node('n_radius', 'n_dmg', -185, 125, 'Nuke Radius', '+8% nuke radius.', 'radius', 'nuke', C, 3500, 1.9, 6, [['nuke.radius', 'add', 0.08]]);
  node('n_cd', 'nuke', -125, 125, 'Nuke Reload', '-8% nuke cooldown.', 'cd', 'nuke', C, 4000, 1.9, 6, [['nuke.cd', 'cd', 0.08]]);
  // cryo
  node('cryo', 'm_dmg', 210, 135, 'Cryo Beam', 'Freezes everything along the line.', 'snow', 'snow', O, 2, 0, 1);
  node('cr_dur', 'cryo', 235, 120, 'Freeze Duration', '+20% freeze duration.', 'dur', 'snow', C, 350, 1.8, 8, [['cryo.dur', 'add', 0.2]]);
  node('cr_cd', 'cr_dur', 255, 120, 'Cryo Reload', '-8% cryo cooldown.', 'cd', 'snow', C, 500, 1.8, 8, [['cryo.cd', 'cd', 0.08]]);
  node('cr_len', 'cryo', 195, 125, 'Cryo Length', '+10% cryo beam length.', 'range', 'snow', C, 450, 1.8, 5, [['cryo.len', 'add', 0.1]]);
})();

G.BASE_STATS = {
  'g.count': 4, 'g.dmg': 1, 'g.rate': 1, 'g.range': 1, 'g.pierce': 0, 'g.knock': 1,
  'c.count': 1, 'c.dmg': 1, 'c.rate': 1, 'c.pierce': 0,
  'f.count': 1, 'f.burn': 1, 'f.range': 1, 'f.arc': 1,
  'mo.count': 1, 'mo.dmg': 1, 'mo.rate': 1, 'mo.radius': 1,
  'l.count': 1, 'l.dmg': 1, 'l.range': 1,
  't.count': 1, 't.dmg': 1, 't.chain': 0,
  'gr.count': 1, 'gr.slow': 0,
  'miss.radius': 1, 'miss.dmg': 1, 'miss.cd': 1,
  'strafe.dmg': 1, 'strafe.cd': 1, 'strafe.len': 1,
  'bomb.dmg': 1, 'bomb.cd': 1, 'bomb.radius': 1,
  'orb.dmg': 1, 'orb.cd': 1,
  'cryo.dur': 1, 'cryo.cd': 1, 'cryo.len': 1,
  'nuke.dmg': 1, 'nuke.radius': 1, 'nuke.cd': 1,
  'pay': 1, 'gold': 0, 'expl': 0, 'head': 0, 'slow': 0, 'hp': 50,
};

G.S = Object.assign({}, G.BASE_STATS);
G.computeStats = function () {
  const S = G.S;
  Object.assign(S, G.BASE_STATS);
  const up = G.save.data.up;
  for (const n of G.TREE) {
    const l = up[n.id] || 0;
    if (!l) continue;
    for (const [k, mode, v] of n.fx) {
      if (mode === 'add') S[k] += v * l;
      else if (mode === 'cd') S[k] *= Math.pow(1 - v, l);
    }
  }
  S.silver = up.silver ? 0.01 + 0.0 : 0;
  S.autoMissile = !!up.m_auto;
  S.dstats = !!up.dstats;
  return S;
};

G.level = id => G.save.data.up[id] || 0;
G.owned = id => (G.save.data.up[id] || 0) > 0;

G.nodeCost = function (n) {
  const l = G.level(n.id);
  if (n.cur === 'crystal') return Math.round(n.base * Math.pow(n.step, l));
  return n.base + n.step * l;
};

G.nodeAvailable = function (n) {
  return !n.parent || G.owned(n.parent);
};

G.curKey = { crystal: 'crystals', orb: 'orbs', cube: 'cubes' };

G.buyNode = function (n) {
  const d = G.save.data;
  const l = G.level(n.id);
  if (l >= n.max || !G.nodeAvailable(n)) return false;
  const cost = G.nodeCost(n);
  const key = G.curKey[n.cur];
  if (d[key] < cost) return false;
  d[key] -= cost;
  d.up[n.id] = l + 1;
  G.computeStats();
  G.save.commit();
  return true;
};

G.turretCount = function (t) {
  if (!G.owned(t.unlock)) return 0;
  return Math.round(G.S[t.cnt]);
};
