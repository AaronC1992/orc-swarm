'use strict';
/* Static game data: turrets, abilities, upgrade cards, derived stats. */

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

/* ------------------------------------------------------------ economy
   Crystals come from orc kills. Every income knob lives here so it is easy to tune. */
G.ECON = {
  kill: 0.6,          // crystals per ordinary orc on level 1
  growth: 1.1,        // payout multiplier gained with every level
  goldPay: 12,        // golden orc payout multiplier
  silverPay: 4,       // silver orc payout multiplier
  payStep: 0.06,      // Resource Payout: extra income per level
  goldStep: 0.005,    // Golden Orcs: extra spawn chance per level
  silverChance: 0.02, // spawn chance once Silver Orcs are unlocked
};

/* ------------------------------------------------------------ upgrade cards
   One tab per weapon, plus Defense and Economy. A weapon's own card (same id as its tab)
   unlocks the rest of the tab, and `req` is the weapon that has to be owned before that
   unlock can be bought. Costs: crystal = round(base * step^level), orb/cube = base + step * level.
   Card fx entries are [stat, 'add'|'cd', value-per-level]. `show` picks how G.cardValue
   formats a card: 'mul' (default), 'num', 'pct', 'inv', or { k, off, unit }.               */
G.TABS = [
  { id: 'gunner', group: 'Turrets', name: 'Gunner', icon: 'gun', color: '#ffd15c' },
  { id: 'cannon', group: 'Turrets', name: 'Cannon', icon: 'cannon', color: '#ff9a4d', req: 'gunner', cost: ['orb', 1] },
  { id: 'flame', group: 'Turrets', name: 'Flame', icon: 'flame', color: '#ff6a3d', req: 'gunner', cost: ['orb', 1] },
  { id: 'mortar', group: 'Turrets', name: 'Mortar', icon: 'mortar', color: '#8fe36a', req: 'gunner', cost: ['orb', 2] },
  { id: 'laser', group: 'Turrets', name: 'Laser', icon: 'laser', color: '#5ce1ff', req: 'cannon', cost: ['cube', 1] },
  { id: 'tesla', group: 'Turrets', name: 'Tesla', icon: 'tesla', color: '#b58bff', req: 'flame', cost: ['cube', 1] },
  { id: 'grenade', group: 'Turrets', name: 'Grenade', icon: 'grenade', color: '#c9e04d', req: 'mortar', cost: ['orb', 2] },
  { id: 'missile', group: 'Abilities', name: 'Missile', icon: 'missile', color: '#ff8a5c' },
  { id: 'strafe', group: 'Abilities', name: 'Strafe', icon: 'plane', color: '#6fb7ff', cost: ['orb', 1] },
  { id: 'bomb', group: 'Abilities', name: 'Bomb', icon: 'bomb', color: '#ff7a3a', req: 'strafe', cost: ['orb', 2] },
  { id: 'orbital', group: 'Abilities', name: 'Orbital', icon: 'orbital', color: '#52f0ff', req: 'bomb', cost: ['orb', 3] },
  { id: 'cryo', group: 'Abilities', name: 'Cryo', icon: 'snow', color: '#9fe8ff', cost: ['orb', 2] },
  { id: 'nuke', group: 'Abilities', name: 'Nuke', icon: 'nuke', color: '#ff4c4c', req: 'orbital', cost: ['cube', 2] },
  { id: 'defense', group: 'Base', name: 'Defense', icon: 'heart', color: '#ff5c7a', title: 'Defense', desc: 'Protect the base and weaken the horde.' },
  { id: 'economy', group: 'Base', name: 'Economy', icon: 'coin', color: '#ffd84a', title: 'Economy', desc: 'Earn more crystals from every orc.' },
];
G.TAB_MAP = {};
G.CARDS = [];
G.CARD_MAP = {};
(function () {
  const C = 'crystal', O = 'orb';
  const E = G.ECON;
  const pc = v => Math.round(v * 1000) / 10;
  function push(c) {
    G.CARDS.push(c);
    G.CARD_MAP[c.id] = c;
  }
  // card(tab, id, name, desc, icon, currency, base, step, max, fx, show)
  function card(tab, id, name, desc, icon, cur, base, step, max, fx, show) {
    push({ id, tab, kind: fx && fx.length ? 'stat' : 'feature', name, desc, icon, cur, base, step, max, fx: fx || [], show: show || 'mul' });
  }

  // each weapon tab starts with its own unlock card
  for (const t of G.TABS) {
    G.TAB_MAP[t.id] = t;
    const w = G.TMAP[t.id] || G.ABILITIES.find(a => a.id === t.id);
    if (!w) continue;
    const cost = t.cost || ['orb', 0];
    Object.assign(t, { weapon: t.id, title: w.name, desc: w.desc, ability: !G.TMAP[t.id] });
    push({ id: t.id, tab: t.id, kind: 'weapon', name: w.name, desc: w.desc, icon: t.icon, cur: cost[0], base: cost[1], step: 0, max: 1, fx: [], show: null });
  }

  // gunner
  card('gunner', 'g_dmg', 'Damage', '+25% Gunner damage.', 'dmg', C, 12, 1.65, 10, [['g.dmg', 'add', 0.25]]);
  card('gunner', 'g_rate', 'Fire Rate', '+14% Gunner fire rate.', 'rate', C, 20, 1.7, 10, [['g.rate', 'add', 0.14]]);
  card('gunner', 'g_count', 'Count', 'Deploy +1 Gunner.', 'count', C, 30, 1.75, 10, [['g.count', 'add', 1]], 'num');
  card('gunner', 'g_pierce', 'Penetration', 'Gunner rounds penetrate 1 more orc.', 'pierce', C, 150, 2.4, 5, [['g.pierce', 'add', 1]], { k: 'num', off: 1 });
  card('gunner', 'g_range', 'Range', '+6% Gunner range.', 'range', C, 40, 1.8, 5, [['g.range', 'add', 0.06]]);
  card('gunner', 'g_knock', 'Knockback', '+30% Gunner knockback.', 'knock', C, 60, 1.9, 5, [['g.knock', 'add', 0.3]]);
  // cannon
  card('cannon', 'c_dmg', 'Damage', '+15% Cannon damage.', 'dmg', C, 60, 1.75, 10, [['c.dmg', 'add', 0.15]]);
  card('cannon', 'c_rate', 'Fire Rate', '+6% Cannon fire rate.', 'rate', C, 90, 1.8, 10, [['c.rate', 'add', 0.06]]);
  card('cannon', 'c_count', 'Count', 'Deploy +1 Cannon.', 'count', C, 120, 2.0, 8, [['c.count', 'add', 1]], 'num');
  card('cannon', 'c_pierce', 'Penetration', 'Shells penetrate 1 more orc.', 'pierce', C, 300, 2.3, 5, [['c.pierce', 'add', 1]], { k: 'num', off: 6 });
  // laser
  card('laser', 'l_dmg', 'Damage', '+25% Laser damage.', 'dmg', C, 400, 1.8, 10, [['l.dmg', 'add', 0.25]]);
  card('laser', 'l_count', 'Count', 'Deploy +1 Laser.', 'count', C, 900, 2.2, 6, [['l.count', 'add', 1]], 'num');
  card('laser', 'l_range', 'Range', '+8% Laser range.', 'range', C, 700, 2.0, 5, [['l.range', 'add', 0.08]]);
  // flamethrower
  card('flame', 'f_burn', 'Burn Damage', '+30% burn damage.', 'dmg', C, 70, 1.8, 10, [['f.burn', 'add', 0.3]]);
  card('flame', 'f_count', 'Count', 'Deploy +1 Flamethrower.', 'count', C, 100, 2.0, 8, [['f.count', 'add', 1]], 'num');
  card('flame', 'f_range', 'Range', '+8% flame range.', 'range', C, 110, 1.8, 5, [['f.range', 'add', 0.08]]);
  card('flame', 'f_arc', 'Flame Cone', '+10% wider flame cone.', 'arc', C, 130, 1.8, 5, [['f.arc', 'add', 0.1]]);
  // tesla
  card('tesla', 't_dmg', 'Damage', '+25% Tesla damage.', 'dmg', C, 500, 1.8, 10, [['t.dmg', 'add', 0.25]]);
  card('tesla', 't_chain', 'Chain Lightning', 'Lightning chains to 1 more orc.', 'chain', C, 600, 1.9, 8, [['t.chain', 'add', 1]], { k: 'num', off: 4 });
  card('tesla', 't_count', 'Count', 'Deploy +1 Tesla Coil.', 'count', C, 800, 2.1, 6, [['t.count', 'add', 1]], 'num');
  // mortar
  card('mortar', 'mo_dmg', 'Damage', '+25% Mortar damage.', 'dmg', C, 150, 1.75, 10, [['mo.dmg', 'add', 0.25]]);
  card('mortar', 'mo_rate', 'Fire Rate', '+12% Mortar fire rate.', 'rate', C, 200, 1.8, 10, [['mo.rate', 'add', 0.12]]);
  card('mortar', 'mo_count', 'Count', 'Deploy +1 Mortar.', 'count', C, 250, 2.0, 8, [['mo.count', 'add', 1]], 'num');
  card('mortar', 'mo_radius', 'Blast Radius', '+8% Mortar blast radius.', 'radius', C, 180, 1.8, 8, [['mo.radius', 'add', 0.08]]);
  // grenade launcher
  card('grenade', 'gr_slow', 'Sticky Grenades', '+10% slow and +8% damage taken.', 'slow', C, 300, 1.8, 5, [['gr.slow', 'add', 0.1]], 'pct');
  card('grenade', 'gr_count', 'Count', 'Deploy +1 Grenade Launcher.', 'count', C, 400, 2.1, 5, [['gr.count', 'add', 1]], 'num');
  // missile
  card('missile', 'm_dmg', 'Damage', '+30% missile damage.', 'dmg', C, 35, 1.75, 10, [['miss.dmg', 'add', 0.3]]);
  card('missile', 'm_radius', 'Blast Radius', '+10% missile blast radius.', 'radius', C, 25, 1.7, 10, [['miss.radius', 'add', 0.1]]);
  card('missile', 'm_cd', 'Reload', '-8% time between shots within a rack.', 'cd', C, 80, 1.8, 8, [['miss.cd', 'cd', 0.08]]);
  card('missile', 'm_auto', 'Automatic Missile', 'Hold the mouse button to keep firing missiles.', 'auto', O, 1, 0, 1);
  // strafing run
  card('strafe', 's_dmg', 'Damage', '+25% strafing damage.', 'dmg', C, 200, 1.8, 10, [['strafe.dmg', 'add', 0.25]]);
  card('strafe', 's_cd', 'Reload', '-8% strafing cooldown.', 'cd', C, 300, 1.8, 8, [['strafe.cd', 'cd', 0.08]]);
  card('strafe', 's_len', 'Run Length', '+10% strafing run length.', 'range', C, 250, 1.8, 5, [['strafe.len', 'add', 0.1]]);
  // bombing run
  card('bomb', 'b_dmg', 'Damage', '+25% bomb damage.', 'dmg', C, 400, 1.8, 10, [['bomb.dmg', 'add', 0.25]]);
  card('bomb', 'b_cd', 'Reload', '-8% bombing run cooldown.', 'cd', C, 550, 1.8, 8, [['bomb.cd', 'cd', 0.08]]);
  card('bomb', 'b_radius', 'Blast Radius', '+10% bomb radius.', 'radius', C, 450, 1.8, 6, [['bomb.radius', 'add', 0.1]]);
  // orbital laser
  card('orbital', 'o_dmg', 'Damage', '+25% orbital laser damage.', 'dmg', C, 900, 1.8, 10, [['orb.dmg', 'add', 0.25]]);
  card('orbital', 'o_cd', 'Reload', '-8% orbital laser cooldown.', 'cd', C, 1200, 1.8, 8, [['orb.cd', 'cd', 0.08]]);
  // cryo beam
  card('cryo', 'cr_dur', 'Freeze Duration', '+20% freeze duration.', 'dur', C, 350, 1.8, 8, [['cryo.dur', 'add', 0.2]]);
  card('cryo', 'cr_cd', 'Reload', '-8% cryo cooldown.', 'cd', C, 500, 1.8, 8, [['cryo.cd', 'cd', 0.08]]);
  card('cryo', 'cr_len', 'Beam Length', '+10% cryo beam length.', 'range', C, 450, 1.8, 5, [['cryo.len', 'add', 0.1]]);
  // nuke
  card('nuke', 'n_dmg', 'Damage', '+30% nuke damage.', 'dmg', C, 2500, 1.9, 10, [['nuke.dmg', 'add', 0.3]]);
  card('nuke', 'n_radius', 'Blast Radius', '+8% nuke radius.', 'radius', C, 3500, 1.9, 6, [['nuke.radius', 'add', 0.08]]);
  card('nuke', 'n_cd', 'Reload', '-8% nuke cooldown.', 'cd', C, 4000, 1.9, 6, [['nuke.cd', 'cd', 0.08]]);
  // defense
  card('defense', 'hp', 'Base Health', '+10 base health.', 'heart', C, 15, 1.6, 20, [['hp', 'add', 10]], { k: 'num', unit: ' HP' });
  card('defense', 'slow', 'Orc Fatigue', 'Orcs move 3% slower.', 'speed', C, 250, 1.9, 8, [['slow', 'add', 0.03]], 'inv');
  card('defense', 'expl', 'Explosive Orcs', '+1% chance an orc explodes on death, damaging wounded orcs nearby.', 'expl', C, 120, 1.8, 10, [['expl', 'add', 0.01]], 'pct');
  card('defense', 'head', 'Headhunter', '+15% damage against healthy orcs.', 'skull', C, 200, 1.9, 8, [['head', 'add', 0.15]], 'pct');
  card('defense', 'dstats', 'Damage Statistics', 'Shows which weapons dealt damage after each run.', 'stats', O, 1, 0, 1);
  // economy
  card('economy', 'pay', 'Resource Payout', '+' + pc(E.payStep) + '% crystals from kills.', 'coin', C, 40, 1.85, 12, [['pay', 'add', E.payStep]]);
  card('economy', 'gold', 'Golden Orcs', '+' + pc(E.goldStep) + '% chance an orc is golden and pays ' + E.goldPay + 'x crystals.', 'gold', C, 120, 2.0, 10, [['gold', 'add', E.goldStep]], 'pct');
  card('economy', 'silver', 'Silver Orcs', 'Silver orcs appear (' + pc(E.silverChance) + '% of orcs) and pay ' + E.silverPay + 'x crystals.', 'silver', O, 1, 0, 1);
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
  for (const c of G.CARDS) {
    const l = up[c.id] || 0;
    if (!l) continue;
    for (const [k, mode, v] of c.fx) {
      if (mode === 'add') S[k] += v * l;
      else if (mode === 'cd') S[k] *= Math.pow(1 - v, l);
    }
  }
  S.silver = up.silver ? G.ECON.silverChance : 0;
  S.autoMissile = !!up.m_auto;
  S.dstats = !!up.dstats;
  return S;
};

// Average crystals per kill on level 1, as shown on the Economy tab.
G.payPerKill = function () {
  const S = G.S, E = G.ECON;
  return E.kill * S.pay * (1 + S.gold * (E.goldPay - 1) + S.silver * (E.silverPay - 1));
};

G.level = id => G.save.data.up[id] || 0;
G.owned = id => (G.save.data.up[id] || 0) > 0;

G.curKey = { crystal: 'crystals', orb: 'orbs', cube: 'cubes' };

G.cardCost = function (c) {
  const l = G.level(c.id);
  if (c.cur === 'crystal') return Math.round(c.base * Math.pow(c.step, l));
  return c.base + c.step * l;
};

// Stat and feature cards need their tab's weapon; a weapon card needs the weapon it builds on.
G.cardAvailable = function (c) {
  const t = G.TAB_MAP[c.tab];
  if (c.kind === 'weapon') return !t.req || G.owned(t.req);
  return !t.weapon || G.owned(t.weapon);
};

// 'max' | 'locked' | 'ready' (can buy now) | 'poor' (cannot afford yet)
G.cardStatus = function (c) {
  if (G.level(c.id) >= c.max) return 'max';
  if (!G.cardAvailable(c)) return 'locked';
  return G.save.data[G.curKey[c.cur]] >= G.cardCost(c) ? 'ready' : 'poor';
};

G.buyCard = function (c) {
  if (typeof c === 'string') c = G.CARD_MAP[c];
  if (!c || G.cardStatus(c) !== 'ready') return false;
  const d = G.save.data;
  d[G.curKey[c.cur]] -= G.cardCost(c);
  d.up[c.id] = G.level(c.id) + 1;
  G.computeStats();
  G.save.commit();
  return true;
};

// Display text for a card's value at a given level, e.g. '125%', '5', '20.2s'.
G.cardValue = function (c, l) {
  const fx = c.fx[0];
  if (!fx) return '';
  const [stat, mode, per] = fx;
  const sh = typeof c.show === 'string' ? { k: c.show } : (c.show || { k: 'mul' });
  const n = (v, d) => String(Math.round(v * d) / d);
  if (mode === 'cd') {
    const a = G.ABILITIES.find(x => x.id === c.tab);
    const v = a.cd * Math.pow(1 - per, l);
    return n(v, v < 10 ? 100 : 10) + 's';
  }
  switch (sh.k) {
    case 'num': return n((sh.off != null ? sh.off : G.BASE_STATS[stat]) + per * l, 10) + (sh.unit || '');
    case 'pct': return n(per * l * 100, 10) + '%';
    case 'inv': return n((1 - per * l) * 100, 10) + '%';
    default: return n((G.BASE_STATS[stat] + per * l) * 100, 10) + '%';
  }
};

G.cardInfo = function (c) {
  const level = G.level(c.id);
  const status = G.cardStatus(c);
  const t = G.TAB_MAP[c.tab];
  let reason = '';
  if (status === 'locked') reason = c.kind === 'weapon' ? 'Requires ' + G.TAB_MAP[t.req].name : 'Unlock the ' + t.name + ' first';
  return {
    card: c, level, max: c.max, status, reason,
    cost: G.cardCost(c), have: G.save.data[G.curKey[c.cur]],
    value: G.cardValue(c, level),
    next: level < c.max ? G.cardValue(c, level + 1) : '',
  };
};

// Upgrade cards shown in a tab's grid (everything except the weapon's own unlock card).
G.cardsOf = tabId => G.CARDS.filter(c => c.tab === tabId && c.kind !== 'weapon');

G.tabInfo = function (t) {
  const w = t.weapon ? G.CARD_MAP[t.weapon] : null;
  const locked = !!w && !G.owned(w.id);
  const cards = G.cardsOf(t.id);
  let done = 0, total = 0, ready = false, maxed = true;
  for (const c of cards) {
    const l = G.level(c.id);
    done += l;
    total += c.max;
    if (l < c.max) maxed = false;
    if (!locked && G.cardStatus(c) === 'ready') ready = true;
  }
  if (locked) {
    maxed = false;
    ready = G.cardStatus(w) === 'ready';
  }
  return { locked, ready, done, total, maxed, reason: locked ? G.cardInfo(w).reason : '' };
};

G.turretCount = function (t) {
  if (!G.owned(t.unlock)) return 0;
  return Math.round(G.S[t.cnt]);
};
