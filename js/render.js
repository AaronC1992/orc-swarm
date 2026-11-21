'use strict';
/* WebGL point-sprite renderer for the orc horde.
   Each orc is a 13x13 top-down pixel-art sprite (round head with a mohawk stripe, red eyes, tusks,
   dark shoulders, fists and a blade) drawn about 30 px wide (~2.3 screen px per art pixel) and rotated toward its
   heading in the shader. A drop-shadow pass and pile-height ordering make dense crowds read as
   heaps: orcs on top of a pile are drawn last, slightly larger and brighter. */
G.render = (function () {
  const T = 13, COLS = 2, ROWS = 6, AW = T * COLS, AH = T * ROWS;
  const SIZE = 30, SHADOW_X = -3, SHADOW_Y = 4, BUCKETS = 12;
  // b head, l head highlight, d shoulders, f fists, m mohawk, e eyes, k tusks, w blade
  const PAL = [
    { b: [152, 162, 64], l: [182, 190, 96], d: [70, 96, 36], f: [118, 128, 50], m: [132, 52, 58], e: [206, 20, 16], k: [226, 222, 206], w: [92, 112, 124] },
    { b: [98, 152, 60], l: [130, 180, 86], d: [44, 84, 38], f: [80, 124, 48], m: [126, 46, 52], e: [206, 20, 16], k: [226, 222, 206], w: [92, 112, 124] },
    { b: [70, 146, 104], l: [98, 172, 128], d: [32, 80, 60], f: [56, 120, 86], m: [120, 46, 56], e: [206, 20, 16], k: [226, 222, 206], w: [92, 112, 124] },
    { b: [112, 150, 66], l: [146, 182, 88], d: [124, 136, 150], f: [92, 128, 56], m: [204, 212, 222], e: [214, 40, 30], k: [238, 232, 204], w: [176, 186, 198] },
    { b: [226, 178, 46], l: [255, 226, 118], d: [170, 120, 26], f: [200, 150, 36], m: [255, 240, 170], e: [214, 40, 30], k: [255, 248, 220], w: [255, 214, 90] },
    { b: [124, 156, 60], l: [156, 186, 86], d: [176, 52, 34], f: [100, 130, 50], m: [56, 42, 34], e: [255, 214, 60], k: [238, 232, 204], w: [240, 200, 60] },
  ];
  const OUT = [22, 44, 26];

  function makeAtlas() {
    const cv = document.createElement('canvas');
    cv.width = AW; cv.height = AH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(AW, AH), d = img.data;
    const cell = new Array(T * T);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < T && y < T) cell[y * T + x] = c; };
    for (let row = 0; row < ROWS; row++) {
      const P = PAL[row], dk = P.d.map(q => q * 0.78), bd = P.b.map(q => q * 0.84), m2 = P.m.map(q => q * 0.8);
      for (let fr = 0; fr < COLS; fr++) {
        const sw = fr ? 1 : -1;
        cell.fill(null);
        // +x is the facing direction, centre pixel is (6, 6)
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const sx = (x - 4.2) / 3.3, sy = (y - 6) / 5.6;       // shoulders, wide across the heading
          if (sx * sx + sy * sy < 1) put(x, y, (x < 3 || y > 9) ? dk : P.d);
        }
        // pointed shoulder/ear tips sticking out backwards
        put(2, 0, P.d); put(1, 1, P.d); put(2, 12, dk); put(1, 11, dk);
        // fists swing with the walk cycle, blade in the upper hand
        for (const [fx, fy] of [[8 + sw, 1], [8 - sw, 11]]) {
          put(fx, fy, P.f); put(fx + 1, fy, P.f); put(fx, fy + (fy < 6 ? 1 : -1), P.f);
        }
        put(10 + sw, 0, P.w); put(11 + sw, 0, P.w); put(12 + sw, 0, P.w); put(10 + sw, 1, P.w);
        // head
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const hx = x - 6.6, hy = y - 6;
          const r = hx * hx + hy * hy;
          if (r < 13.5) put(x, y, (hx > 1.5 && r > 6) || hy > 2.2 ? bd : P.b);
          if (r < 5 && hx < 0.5 && hy < 0) put(x, y, P.l);
        }
        // mohawk stripe along the heading
        for (let x = 3; x <= 8; x++) put(x, 6, x < 5 ? m2 : P.m);
        put(5, 5, P.m);
        // eyes, tusks
        put(9, 5, P.e); put(9, 7, P.e);
        put(10, 4, P.k); put(11, 5, P.k); put(11, 7, P.k); put(10, 8, P.k);
        // outline pass, then copy into the atlas
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          let c = cell[y * T + x];
          if (!c) {
            const nb = (x > 0 && cell[y * T + x - 1] && cell[y * T + x - 1] !== OUT) || (x < T - 1 && cell[y * T + x + 1] && cell[y * T + x + 1] !== OUT)
              || (y > 0 && cell[(y - 1) * T + x] && cell[(y - 1) * T + x] !== OUT) || (y < T - 1 && cell[(y + 1) * T + x] && cell[(y + 1) * T + x] !== OUT);
            if (!nb) continue;
            c = OUT;
            cell[y * T + x] = OUT;
          }
        }
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const c = cell[y * T + x];
          if (!c) continue;
          const p = ((row * T + y) * AW + fr * T + x) * 4;
          d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  const VS = `attribute vec2 aPos; attribute vec4 aA; attribute vec2 aB;
uniform vec2 uRes; uniform vec2 uOff; uniform float uSize;
varying vec4 vA; varying vec2 vB;
void main(){
  vec2 p = aPos + uOff;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = uSize * (0.95 + 0.12 * aA.w);
  vA = aA; vB = aB;
}`;
  const FS = `precision mediump float;
uniform sampler2D uTex; uniform float uShadow;
varying vec4 vA; varying vec2 vB;
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float c = cos(vA.x), s = sin(vA.x);
  vec2 t = vec2(c * pc.x + s * pc.y, -s * pc.x + c * pc.y);
  if (abs(t.x) > 0.49 || abs(t.y) > 0.49) discard;
  float row = floor(vA.y * 0.5 + 0.01), col = vA.y - row * 2.0;
  vec2 uv = (vec2(col, row) + t + 0.5) * vec2(${T}.0 / ${AW}.0, ${T}.0 / ${AH}.0);
  vec4 tx = texture2D(uTex, uv);
  if (tx.a < 0.5) discard;
  if (uShadow > 0.5) { gl_FragColor = vec4(0.0, 0.02, 0.0, 0.36); return; }
  vec3 col3 = tx.rgb;
  float h = vA.w, v = vA.z;
  col3 *= mix(vec3(1.05, 1.03, 0.9), vec3(0.9, 0.98, 1.0), v);
  col3 *= 0.84 + 0.26 * h;
  col3 = mix(col3, col3 * vec3(1.1, 1.06, 0.84), h * 0.25);
  col3 = mix(col3, vec3(1.0, 0.93, 0.64), max(vB.x, 0.0) * 0.85);
  col3 = mix(col3, vec3(0.8, 0.3, 0.06), max(-vB.x, 0.0) * 0.62);
  col3 = mix(col3, vec3(0.66, 0.9, 1.0), vB.y * 0.72);
  gl_FragColor = vec4(col3, 1.0);
}`;

  const STRIDE = 8;
  let gl = null, prog, buf, tex, ctx2 = null, canvas, data, keys, counts, uOff, uShadow, uSize;

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init(cv) {
    canvas = cv;
    data = new Float32Array(G.sim.cap * STRIDE);
    keys = new Uint8Array(G.sim.cap);
    counts = new Int32Array(BUCKETS + 1);
    try {
      gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
        || cv.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) { ctx2 = cv.getContext('2d'); return false; }
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos'), aA = gl.getAttribLocation(prog, 'aA'), aB = gl.getAttribLocation(prog, 'aB');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, STRIDE * 4, 0);
    gl.enableVertexAttribArray(aA); gl.vertexAttribPointer(aA, 4, gl.FLOAT, false, STRIDE * 4, 8);
    gl.enableVertexAttribArray(aB); gl.vertexAttribPointer(aB, 2, gl.FLOAT, false, STRIDE * 4, 24);
    gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), G.W, G.H);
    uOff = gl.getUniformLocation(prog, 'uOff');
    uShadow = gl.getUniformLocation(prog, 'uShadow');
    uSize = gl.getUniformLocation(prog, 'uSize');
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.disable(gl.DEPTH_TEST);
    return true;
  }

  const ANG = G.TAU / 256;

  function draw(now) {
    const s = G.sim, n = s.n;
    const x = s.x, y = s.y, vx = s.vx, vy = s.vy, dir = s.dir, anim = s.anim, type = s.type, burn = s.burn, frz = s.frz, dead = s.dead, dens = s.dens, fl = s.fl;
    const tick = (now * 0.0085) | 0;
    counts.fill(0);
    let m = 0;
    // pass 1: heading, pile height bucket
    for (let i = 0; i < n; i++) {
      if (dead[i]) { keys[i] = 255; continue; }
      const ux = vx[i], uy = vy[i], sp2 = ux * ux + uy * uy;
      if (sp2 > 50 && frz[i] <= 0) {
        const want = (Math.atan2(uy, ux) / ANG) & 255;
        let df = ((want - dir[i] + 384) & 255) - 128;
        if (df > 14) df = 14; else if (df < -14) df = -14;
        dir[i] = (dir[i] + (sp2 > 400 ? df : df >> 1)) & 255;
      }
      let h = (dens[i] - 1.3) * 0.14 + (anim[i] & 7) * 0.016;
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const k = (h * (BUCKETS - 1) + 0.5) | 0;
      keys[i] = k;
      counts[k + 1]++;
      m++;
    }
    for (let b = 0; b < BUCKETS; b++) counts[b + 1] += counts[b];
    // pass 2: write sorted vertex data (low orcs first, pile tops last)
    for (let i = 0; i < n; i++) {
      const k = keys[i];
      if (k === 255) continue;
      const o = (counts[k]++) * STRIDE, t = type[i], a = anim[i];
      const moving = vx[i] * vx[i] + vy[i] * vy[i] > 200;
      data[o] = x[i]; data[o + 1] = y[i];
      data[o + 2] = dir[i] * ANG;
      data[o + 3] = (t === 0 ? a % 3 : t + 2) * 2 + (moving ? ((tick + a) & 1) : 0);
      data[o + 4] = ((a >> 3) & 15) / 15;
      data[o + 5] = k / (BUCKETS - 1);
      data[o + 6] = burn[i] > 0 ? 1 : fl[i] > 0 ? -Math.min(1, fl[i] * 6) : 0;
      data[o + 7] = frz[i] > 0 ? 1 : 0;
    }
    if (gl) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!m) return;
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, m * STRIDE));
      gl.uniform1f(uSize, SIZE);
      // shadows
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(uShadow, 1);
      gl.uniform2f(uOff, SHADOW_X, SHADOW_Y);
      gl.drawArrays(gl.POINTS, 0, m);
      // sprites
      gl.disable(gl.BLEND);
      gl.uniform1f(uShadow, 0);
      gl.uniform2f(uOff, 0, 0);
      gl.drawArrays(gl.POINTS, 0, m);
    } else if (ctx2) {
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      for (let k = 0; k < m; k++) {
        const o = k * STRIDE, row = data[o + 3] >> 1, P = PAL[row], hh = 0.6 + 0.5 * data[o + 5];
        ctx2.fillStyle = 'rgba(0,0,0,0.3)';
        ctx2.fillRect(data[o] - 8 + SHADOW_X, data[o + 1] - 8 + SHADOW_Y, 16, 16);
        const c = data[o + 6] > 0 ? [255, 236, 160] : data[o + 6] < 0 ? [200, 80, 20] : P.b;
        ctx2.fillStyle = 'rgb(' + (c[0] * hh | 0) + ',' + (c[1] * hh | 0) + ',' + (c[2] * hh | 0) + ')';
        ctx2.fillRect(data[o] - 8, data[o + 1] - 8, 16, 16);
      }
    }
  }

  return { init, draw, makeAtlas, size: SIZE, get webgl() { return !!gl; } };
})();
