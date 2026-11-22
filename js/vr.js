'use strict';
/* One game surface shared by both eyes. All coordinates below the battlefield are VR controls. */
G.vr = (function () {
  const width = G.W, height = 1280, meters = 2.5, z = -1.9;
  function intersect(m) {
    if (!m || m[10] < 0.0001) return null;
    const t = (m[14] - z) / m[10];
    if (t < 0) return null;
    const x = width / 2 + (m[12] - t * m[8]) * width / meters;
    const y = height / 2 - (m[13] - t * m[9]) * width / meters;
    return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
  }
  const $ = id => document.getElementById(id);
  let session, gl, layer, base, space, surface, ctx, uniforms, buttons = [];
  let activeSource, held, gesture, lastPaint, uiState;
  const state = () => G.paused ? 'pause' : G.state;
  const action = id => () => $(id).click();
  function cancel() {
    G.ui.board.cancel();
    held = gesture = null;
  }
  function row(items, y, h = 68) {
    const w = Math.min(415, (width - 64) / items.length);
    items.forEach(([label, fn, selected], i) => {
      const x = (width - w * items.length) / 2 + w * i;
      ctx.fillStyle = !fn ? '#262e36' : selected ? '#277c68' : '#28475a';
      ctx.fillRect(x + 4, y, w - 8, h);
      ctx.fillStyle = fn ? '#fff' : '#959fa7';
      ctx.fillText(label, x + w / 2, y + h / 2, w - 20);
      if (fn) buttons.push({ x: x + 4, y, w: w - 8, h, fn });
    });
  }
  // one upgrade card: a plain panel with its own buy button on the right
  function card(i, x, y, w, h) {
    const c = i.card, stat = c.kind === 'stat', done = i.status === 'max', ready = i.status === 'ready';
    const bw = 250, bx = x + w - bw - 18, by = y + 18, bh = h - 36, tw = bx - x - 60;
    ctx.save();
    ctx.fillStyle = '#1d262d'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = G.TAB_MAP[c.tab].color; ctx.fillRect(x, y, 10, h);
    ctx.textAlign = 'left';
    ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(c.name + (stat ? `   ${i.level}/${i.max}` : ''), x + 34, y + 38, tw);
    ctx.font = '27px sans-serif'; ctx.fillStyle = '#c3ccd3';
    ctx.fillText(stat ? (done ? i.value : `${i.value}  >  ${i.next}`) : c.desc, x + 34, y + 80, tw);
    ctx.font = '23px sans-serif'; ctx.fillStyle = stat ? '#8d99a3' : '#ff9a8a';
    ctx.fillText(stat ? c.desc : i.reason, x + 34, y + 118, tw);
    ctx.textAlign = 'center'; ctx.font = 'bold 31px sans-serif';
    if (!done) { ctx.fillStyle = ready ? '#277c68' : '#262e36'; ctx.fillRect(bx, by, bw, bh); }
    ctx.fillStyle = done ? '#ffd84a' : ready ? '#fff' : i.status === 'poor' ? '#ff8a7a' : '#959fa7';
    ctx.fillText(done ? (stat ? 'MAX' : 'UNLOCKED') : i.status === 'locked' ? 'Locked' : `${G.fmt(i.cost)} ${G.curKey[c.cur]}`, bx + bw / 2, by + bh / 2, bw - 20);
    ctx.restore();
    if (ready) buttons.push({ x: bx, y: by, w: bw, h: bh, fn: () => G.meta.buy(c.id) });
  }
  function paint(now) {
    G.gameFrame(now);
    const st = state(), A = G.abilities, U = G.ui;
    uiState = st; buttons = [];
    ctx.fillStyle = '#10191f'; ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 31px sans-serif';
    function label(text, y) { ctx.fillStyle = '#fff'; ctx.fillText(text, width / 2, y, width - 48); }
    if (st === 'battle' || st === 'build') {
      for (const id of ['terrain','decal','glc','fx']) ctx.drawImage($(id), 0, 0, width, G.H);
      const build = st === 'build', r = G.run;
      label(build ? 'Choose a turret, then point at high ground. Drag its handle to aim.' :
        `Base ${r.hp}/${r.maxhp}   |   Kills ${r.kills}   |   Incoming ${r.remaining}`, 1105);
      const picks = build ? G.TURRETS.filter(d => G.turretCount(d)).map(d =>
        [`${d.name} (${G.weapons.left(d)} left)`, () => U.pickType(d), U.placing === d]) :
        A.unlocked().map(a => [a.name + (A.ready(a.id) ? '' : ` ${Math.ceil(A.cd[a.id])}s`),
          () => A.arm(a.id), A.armed === a.id]);
      row(picks, 1130, 62);
      row(build ? [['Levels', action('btnMenu')], ['Deselect', action('buildDone')], ['Arc -', action('arcLess')],
        ['Arc +', action('arcMore')], ['Remove', action('buildRemove')], G.turrets.length ?
          ['Start battle', action('btnStart')] : ['Place a turret first', null]] :
        [['Pause', action('btnPause')], [`Speed x${G.speed}`, action('btnSpeed')]], 1202);
    } else if (st === 'upgrades') {
      const m = G.meta.model();
      label(m.wallet.map(w => `${w.name} ${G.fmt(w.have)}`).join('   |   '), 44);
      const tabs = turrets => m.tabs.filter(t => (t.tab.group === 'Turrets') === turrets).map(t =>
        [t.tab.name + (t.locked ? ' (locked)' : t.maxed ? ' (max)' : t.ready ? ' *' : ''), () => G.meta.select(t.tab.id), t.selected]);
      row(tabs(true), 88, 64);
      row(tabs(false), 158, 64);
      label(`${m.tab.title}: ${m.tab.desc}`, 262);
      label(`${m.info.done} / ${m.info.total} upgrades` + (m.note ? `   |   ${m.note}` : ''), 302);
      let col = 0, y = 346;
      for (const i of (m.unlock ? [m.unlock] : []).concat(m.cards)) {
        const wide = i.card.kind !== 'stat';
        if (wide && col) { col = 0; y += 166; }
        card(i, wide ? 32 : 32 + col * 936, y, wide ? 1856 : 920, 150);
        if (wide || col) { col = 0; y += 166; } else col = 1;
      }
      label('* you can afford an upgrade there', 1140);
      row([['Menu', action('btnUpBack')], ['Play', action('btnPlay')]], 1202);
    } else if (st === 'levels') {
      label('Choose a battlefield', 235);
      const cards = Array.from($('levelgrid').children);
      for (let i = 0; i < cards.length; i += 3) {
        row(cards.slice(i, i+3).map((c, j) => {
          const d = G.LEVELS[i+j], locked = c.classList.contains('locked');
          return [d.id + ' ' + d.name + (locked ? ' (locked)' : ''), locked ? null : () => c.click()];
        }), 340 + i / 3 * 115, 92);
      }
      row([['Upgrades', action('btnLevelsBack')]], 930);
    } else {
      label(st === 'title' ? 'Orc Swarm' : st === 'pause' ? 'Paused' : $('resTitle').textContent, 400);
      if (st === 'result') label(`${G.run.kills} orcs stopped   |   ${G.run.leaked} leaked`, 510);
      const ids = st === 'title' ? ['btnContinue','btnSound'] : st === 'pause' ? ['btnResume','btnRestart','btnQuit'] :
        ['btnResAgain','btnResNext','btnResUp'].filter(id => !$(id).classList.contains('hidden'));
      row(ids.map(id => [$(id).textContent, action(id)]), 635);
      row([['Leave VR', () => session.end()]], 800);
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, surface);
  }
  let texture;
  function graphics() {
    const vert = `attribute vec2 a; varying vec2 uv; uniform mat4 eye,projection;
      void main(){uv=vec2(a.x+.5,.5-a.y);gl_Position=projection*eye*vec4(a.x*${meters},a.y*${meters * height / width},${z},1.);}`;
    const frag = `precision mediump float; varying vec2 uv;uniform sampler2D image;uniform vec2 cursor;
      void main(){vec3 c=texture2D(image,uv).rgb;float d=length((uv-cursor)*vec2(1.,${height / width}));
      if(d<.008)c=d<.004?vec3(1.):vec3(.04,.26,.22);gl_FragColor=vec4(c,1.);}`;
    const prog = gl.createProgram();
    for (const [type, code] of [[gl.VERTEX_SHADER,vert],[gl.FRAGMENT_SHADER,frag]]) {
      const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog,s); gl.deleteShader(s);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    uniforms = Object.fromEntries(['eye','projection','cursor'].map(k => [k, gl.getUniformLocation(prog,k)]));
    const a = gl.getAttribLocation(prog,'a');
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,.5,.5]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
    for (const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
    for (const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
    surface = document.createElement('canvas'); surface.width = 1200; surface.height = 800;
    ctx = surface.getContext('2d',{alpha:false}); ctx.scale(surface.width/width,surface.height/height);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,surface.width,surface.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  }
  function point(frame, source) {
    const pose = space && source && frame.getPose(source.targetRaySpace,space);
    return pose ? intersect(pose.transform.matrix) : null;
  }
  function boardAt(p) {
    if (!p || p.y >= G.H) return null;
    return ['build','battle'].includes(state()) ? G.ui.board : null;
  }
  function selectStart(e) {
    if (held || session.visibilityState !== 'visible' || uiState !== state()) return;
    const p = point(e.frame,e.inputSource);
    if (!p) return;
    held = activeSource = e.inputSource;
    const b = buttons.find(b => p.x >= b.x && p.x < b.x+b.w && p.y >= b.y && p.y < b.y+b.h);
    if (b) { b.fn(); return; }
    gesture = boardAt(p);
    if (gesture) gesture.down(p,'xr');
  }
  function selectEnd(e) {
    if (held !== e.inputSource) return;
    const p = point(e.frame,e.inputSource);
    if (gesture && gesture === boardAt(p)) gesture.up(p,'xr');
    cancel();
  }
  function onFrame(now, frame) {
    if (!session || frame.session !== session) return;
    session.requestAnimationFrame(onFrame);
    if (session.visibilityState !== 'visible') return;
    if (!space) {
      const viewer = frame.getViewerPose(base);
      if (!viewer) return;
      const m = viewer.transform.matrix, yaw = Math.atan2(m[8],m[10]);
      space = base.getOffsetReferenceSpace(new XRRigidTransform({x:m[12],y:m[13],z:m[14]},
        {x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)}));
    }
    const pose = frame.getViewerPose(space);
    if (!pose) { cancel(); return; }
    if (!activeSource) activeSource = Array.from(session.inputSources).find(s => s.targetRayMode === 'tracked-pointer') || session.inputSources[0];
    const p = point(frame,activeSource), board = boardAt(p);
    if (gesture && gesture !== board) cancel();
    if (board && (!held || gesture === board)) {
      G.ui.input.inside = board === G.ui.board;
      board.move(p);
    } else if (!board) G.ui.input.inside = false;
    if (now - lastPaint >= 1000/30 || uiState !== state()) { paint(now); lastPaint = now; }
    gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);
    gl.clearColor(.025,.045,.055,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.cursor,p ? p.x/width : -1,p ? p.y/height : -1);
    for (const v of pose.views) {
      const vp = layer.getViewport(v); gl.viewport(vp.x,vp.y,vp.width,vp.height);
      gl.uniformMatrix4fv(uniforms.eye,false,v.transform.inverse.matrix);
      gl.uniformMatrix4fv(uniforms.projection,false,v.projectionMatrix);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
  }
  function ended() {
    cancel(); activeSource = space = base = null;
    G.inVR = false; G.fit(); if (G.state === 'battle') G.setPaused(true);
    if (gl) { const loss = gl.getExtension('WEBGL_lose_context'); if (loss) loss.loseContext(); }
    gl = ctx = surface = session = layer = texture = uniforms = null;
    buttons = []; $('btnVR').disabled = false;
  }
  async function enter() {
    const btn = $('btnVR'); btn.disabled = true;
    try {
      session = await navigator.xr.requestSession('immersive-vr');
      session.addEventListener('end',ended,{once:true});
      gl = document.createElement('canvas').getContext('webgl',{xrCompatible:true,antialias:false,depth:false});
      if (!gl) throw new Error('No XR-compatible WebGL context');
      await gl.makeXRCompatible();
      base = await session.requestReferenceSpace('local');
      layer = new XRWebGLLayer(session,gl,{alpha:false,depth:false,stencil:false,antialias:false});
      session.updateRenderState({baseLayer:layer});
      graphics();
      session.addEventListener('selectstart',selectStart); session.addEventListener('selectend',selectEnd);
      session.addEventListener('inputsourceschange',e => {
        if (e.removed.includes(activeSource)) { cancel(); activeSource = null; }
      });
      session.addEventListener('visibilitychange',() => {
        if (session.visibilityState !== 'visible') { cancel(); if (G.state === 'battle') G.setPaused(true); }
      });
      base.addEventListener('reset',() => { space = null; cancel(); });
      G.audio.init(); G.inVR = true; G.fit(); lastPaint = -Infinity; uiState = null;
      session.requestAnimationFrame(onFrame);
    } catch (err) {
      if (session) await session.end();
      btn.disabled = false;
      G.ui.toast('VR could not start. Check headset permissions or use Play.', 5000);
      console.warn('VR session setup:',err);
    }
  }
  if (typeof navigator !== 'undefined' && navigator.xr && typeof document !== 'undefined') {
    const check = () => navigator.xr.isSessionSupported('immersive-vr').then(ok =>
      $('btnVR').classList.toggle('hidden',!ok)).catch(err => console.warn('VR availability:',err));
    $('btnVR').onclick = enter;
    navigator.xr.addEventListener('devicechange',check); check();
  }
  return { intersect };
})();
