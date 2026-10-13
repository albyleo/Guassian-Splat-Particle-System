// =============================================================================
//  Hibiscus — versione web in tempo reale (Three.js)
//
//  Stessa tecnica della rete TouchDesigner (v9):
//   1. ogni pixel della foto diventa un punto con il suo colore;
//   2. i punti della stessa riga sono uniti in linee; i pixel scuri del fondo
//      vengono saltati ma la riga continua sopra il vuoto (i filamenti);
//   3. nel vertex shader due noise simplex a più strati (come i Noise POP con
//      harmon=2: ogni strato a frequenza doppia e forza 0.7) spostano i punti:
//      uno lento e ampio (rilievo 3D che contorce le linee) e uno fine e
//      veloce (il "pelo");
//   4. tutto ruota piano in 3D; la foto vera sfuma sotto le linee.
//  Ciclo automatico come la v9: foto ferma → si scompone in linee → effetto
//  pieno → si ricompone → foto ferma, in loop. Il tocco lo comanda: toccando
//  o tenendo premuto si scompone subito (e resta in linee finché tieni),
//  trascinando il fiore si inclina e le fibre sotto il dito si agitano.
//
//  Uso:  createHibiscus(elementoContenitore, { ...opzioni })
// =============================================================================
import * as THREE from 'three';

export const DEFAULTS = {
  image: 'assets/ibisco.jpg',
  columns: 800,          // punti per riga (su schermi stretti ne usa 520)
  dark: 0.12,            // pixel con R, G e B sotto questa soglia: fondo, tolto
  maxGap: 0,             // salto massimo sui vuoti in pixel (0 = le righe li attraversano sempre)

  depthAmp: 0.05,        // rilievo 3D (la foto è larga 1 unità)
  depthPeriod: 0.30,
  depthSpeed: 0.06,
  depthOctaves: 3,       // strati di noise del rilievo (1 + harmon=2 della v9)
  furAmp: 0.003,         // il "pelo": spostamento dei singoli punti
  furPeriod: 0.006,
  furSpeed: 0.35,
  furOctaves: 2,         // strati di noise del pelo (il terzo sarebbe sotto il pixel)
  harmonicGain: 0.7,     // forza di ogni strato rispetto al precedente
  yaw: 16,               // gradi di rotazione avanti-indietro a effetto pieno
  pitch: 5,
  spinSpeed: 0.4,

  autoplay: true,        // ciclo automatico foto → linee → foto, come la v9
  hold: 4.0,             // secondi di foto ferma tra un ciclo e l'altro (al primo avvio la metà)
  transition: 6.5,       // secondi del passaggio foto → linee (e linee → foto)
  effect: 6.0,           // secondi di effetto pieno prima di tornare foto
  brushRadius: 0.12,     // raggio dell'effetto attorno al dito
  brushFur: 0.012,       // quanto si agitano le fibre sotto il dito
  brushLift: 0.06,       // quanto le fibre si sollevano verso il dito
  tilt: 0.35,            // inclinazione massima trascinando (radianti)
  trail: 0.55,           // scia: 0 = nessuna, 0.9 = lunga
  fov: 35,
};

// -----------------------------------------------------------------------------
//  Shader
// -----------------------------------------------------------------------------
// Simplex noise 3D di Ashima Arts / Stefan Gustavson (licenza MIT)
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERTEX = /* glsl */ `
uniform float uTime, uDepth, uFur, uBrush;
uniform float uDepthAmp, uDepthPeriod, uDepthSpeed;
uniform float uFurAmp, uFurPeriod, uFurSpeed;
uniform float uGain;
uniform int uDepthOct, uFurOct;
uniform float uBrushFur, uBrushLift;
uniform vec3 uTouch;               // xy = dito nello spazio della foto, z = raggio
attribute vec3 color;
varying vec3 vColor;
${SIMPLEX}

// noise vettoriale (x, y, z indipendenti)
vec3 noise3(vec3 q) {
  return vec3(snoise(q), snoise(q + vec3(17.3, 9.1, 3.7)), snoise(q + vec3(-41.7, 23.5, -8.2)));
}

// più strati, come le "harmonics" del Noise POP: frequenza ×2, forza ×gain
vec3 layered(vec3 q, int octaves) {
  vec3 sum = vec3(0.0);
  float amp = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    sum += amp * noise3(q);
    q *= 2.0;
    amp *= uGain;
  }
  return sum;
}

void main() {
  vec3 p = position;

  // rilievo: noise lento e ampio in X, Y e Z → le linee si contorcono
  vec3 q = vec3(position.xy / uDepthPeriod, uTime * uDepthSpeed);
  p += layered(q, uDepthOct) * uDepthAmp * uDepth;

  // il dito: le fibre vicine si agitano e si sollevano
  float d = distance(position.xy, uTouch.xy);
  float brush = exp(-(d * d) / (uTouch.z * uTouch.z)) * uBrush;

  // pelo: noise fine, punti vicini vanno in direzioni diverse
  vec3 f = vec3(position.xy / uFurPeriod, uTime * uFurSpeed);
  p += layered(f, uFurOct) * (uFurAmp * uFur + uBrushFur * brush);
  p.z += uBrushLift * brush;

  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform float uAlpha;
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, uAlpha); }`;

// -----------------------------------------------------------------------------
//  Utilità
// -----------------------------------------------------------------------------
const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Immagine non trovata: ${src}`));
    img.src = src;
  });
}

// Foto → punti colorati + linee (una per riga, che attraversano i vuoti)
function buildLines(img, cfg) {
  const W = cfg.columns;
  const H = Math.round(W * img.naturalHeight / img.naturalWidth);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;

  const thr = cfg.dark * 255;
  const pos = new Float32Array(W * H * 3);
  const col = new Float32Array(W * H * 3);
  const idx = new Uint32Array(W * H * 2);
  const s = 1 / W;                               // lato di un pixel: la foto è larga 1
  let n = 0;
  let m = 0;
  for (let y = 0; y < H; y++) {
    let prev = -1;
    let prevX = 0;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const r = px[o], g = px[o + 1], b = px[o + 2];
      if (r < thr && g < thr && b < thr) continue;   // fondo scuro: saltato
      pos[n * 3] = (x + 0.5) * s - 0.5;
      pos[n * 3 + 1] = (H / 2 - y - 0.5) * s;
      col[n * 3] = r / 255;
      col[n * 3 + 1] = g / 255;
      col[n * 3 + 2] = b / 255;
      if (prev >= 0 && (cfg.maxGap <= 0 || x - prevX <= cfg.maxGap)) {
        idx[m++] = prev;
        idx[m++] = n;
      }
      prev = n;
      prevX = x;
      n++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col.slice(0, n * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(idx.slice(0, m), 1));
  return { geo, points: n, segments: m / 2 };
}

// -----------------------------------------------------------------------------
//  Effetto
// -----------------------------------------------------------------------------
export async function createHibiscus(container, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!options.columns && matchMedia('(max-width: 700px)').matches) cfg.columns = 520;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cfg.furAmp *= 0.5;
    cfg.yaw *= 0.3;
    cfg.pitch *= 0.3;
    cfg.trail = 0;
  }

  const img = await loadImage(cfg.image);
  const aspect = img.naturalWidth / img.naturalHeight;

  // la scia si ottiene non cancellando lo schermo: ogni frame lo scuriamo un po'
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // nessuna conversione: foto e linee identiche
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cfg.fov, 1, 0.01, 100);
  const group = new THREE.Group();
  scene.add(group);

  // la foto nitida, stessa posizione e misura delle linee
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  const photoMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / aspect), photoMat);
  photo.renderOrder = 0;
  group.add(photo);

  // le linee
  const { geo, points, segments } = buildLines(img, cfg);
  const uniforms = {
    uTime: { value: 0 }, uDepth: { value: 0 }, uFur: { value: 0 }, uBrush: { value: 0 }, uAlpha: { value: 0 },
    uDepthAmp: { value: cfg.depthAmp }, uDepthPeriod: { value: cfg.depthPeriod }, uDepthSpeed: { value: cfg.depthSpeed },
    uFurAmp: { value: cfg.furAmp }, uFurPeriod: { value: cfg.furPeriod }, uFurSpeed: { value: cfg.furSpeed },
    uGain: { value: cfg.harmonicGain }, uDepthOct: { value: cfg.depthOctaves }, uFurOct: { value: cfg.furOctaves },
    uBrushFur: { value: cfg.brushFur }, uBrushLift: { value: cfg.brushLift },
    uTouch: { value: new THREE.Vector3(10, 10, cfg.brushRadius) },
  };
  const lineMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthTest: false, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 1;
  group.add(lines);

  // velo nero per la scia
  const fadeScene = new THREE.Scene();
  const fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1 - cfg.trail, depthTest: false, depthWrite: false });
  fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));

  // inquadratura: la foto sta tutta nello schermo, con un piccolo margine
  let needClear = true;
  function fit() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (!w || !h) return;                        // contenitore nascosto: aspetta di avere una misura
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(cfg.fov / 2));
    const dist = Math.max((0.5 / aspect) / t, 0.5 / (t * camera.aspect)) * 1.06;
    camera.position.set(0, 0, dist);
    camera.near = dist / 100;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    needClear = true;
  }
  const ro = new ResizeObserver(fit);
  ro.observe(container);
  fit();

  // ---------------------------------------------------------------------------
  //  Tocco e mouse
  // ---------------------------------------------------------------------------
  // Il ciclo ha quattro fasi: 'hold' (foto ferma), 'up' (si scompone),
  // 'full' (effetto pieno), 'down' (si ricompone). p va da 0 (foto) a 1 (linee).
  const state = {
    p: 0, phase: 'hold', phaseTime: 0, firstCycle: true, pressed: false, pinned: false,
    brush: 0, hover: false,
    tilt: new THREE.Vector2(), tiltTarget: new THREE.Vector2(),
    ndc: new THREE.Vector2(),
  };
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const invWorld = new THREE.Matrix4();
  const localRay = new THREE.Ray();

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    state.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    setPointer(e);
    state.pressed = true;
    if (state.phase === 'hold' || state.phase === 'down') state.phase = 'up';   // si scompone subito
    container.dispatchEvent(new CustomEvent('hibiscus:touch'));
  });
  canvas.addEventListener('pointermove', (e) => {
    setPointer(e);
    state.hover = e.pointerType === 'mouse';
    if (state.pressed) state.tiltTarget.set(state.ndc.x * cfg.tilt, -state.ndc.y * cfg.tilt * 0.7);
  });
  // lasciando il dito: l'effetto pieno dura ancora `effect` secondi, poi il
  // fiore si ricompone e il ciclo riprende
  const release = () => {
    if (!state.pressed) return;
    state.pressed = false;
    state.tiltTarget.set(0, 0);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { state.hover = false; });

  // tastiera: barra spaziatrice o invio alternano foto / linee
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Ibisco rosso che si scompone in linee al tocco');
  canvas.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      state.phase = state.p > 0.5 ? 'down' : 'up';
      state.phaseTime = 0;
    }
  });

  // ---------------------------------------------------------------------------
  //  Animazione
  // ---------------------------------------------------------------------------
  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    // ciclo foto → linee → foto (avanzamento lineare: le curve smoothstep qui
    // sotto danno la morbidezza, e al ritorno tutto avviene in ordine inverso)
    state.phaseTime += dt;
    const step = dt / cfg.transition;
    switch (state.phase) {
      case 'hold':
        state.p = 0;
        if (cfg.autoplay && state.phaseTime >= (state.firstCycle ? cfg.hold / 2 : cfg.hold)) {
          state.phase = 'up';
          state.phaseTime = 0;
        }
        break;
      case 'up':
        state.firstCycle = false;
        state.p = Math.min(1, state.p + step);
        if (state.p >= 1) { state.phase = 'full'; state.phaseTime = 0; }
        break;
      case 'full':
        if (state.pressed || state.pinned) state.phaseTime = 0;     // resta in linee finché tieni
        if (state.phaseTime >= cfg.effect) { state.phase = 'down'; state.phaseTime = 0; }
        break;
      case 'down':
        state.p = Math.max(0, state.p - step);
        if (state.p <= 0) { state.phase = 'hold'; state.phaseTime = 0; }
        break;
    }
    const p = state.p;

    const linesIn = smooth(0.00, 0.30, p);
    const photoOut = smooth(0.10, 0.65, p);
    const fur = smooth(0.00, 0.60, p);
    const depth = smooth(0.20, 1.00, p);
    const spin = smooth(0.40, 1.00, p);

    const k = 1 - Math.exp(-dt * 6);
    const brushTarget = state.pressed ? 1 : (state.hover && p > 0.05 ? 0.45 : 0);
    state.brush += (brushTarget - state.brush) * k;
    state.tilt.lerp(state.tiltTarget, 1 - Math.exp(-dt * 3));

    const deg = THREE.MathUtils.degToRad;
    group.rotation.y = deg(cfg.yaw) * spin * Math.sin(t * cfg.spinSpeed) + state.tilt.x * fur;
    group.rotation.x = deg(cfg.pitch) * spin * Math.sin(t * cfg.spinSpeed * 0.7 + 1.0) + state.tilt.y * fur;
    group.updateMatrixWorld();

    // dito → coordinate della foto (anche quando il fiore è inclinato)
    raycaster.setFromCamera(state.ndc, camera);
    invWorld.copy(group.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(invWorld);
    if (localRay.intersectPlane(plane, hit)) uniforms.uTouch.value.set(hit.x, hit.y, cfg.brushRadius);

    uniforms.uTime.value = t;
    uniforms.uAlpha.value = linesIn;
    uniforms.uFur.value = fur;
    uniforms.uDepth.value = depth;
    uniforms.uBrush.value = state.brush * fur;
    photoMat.opacity = 1 - photoOut;
    lines.visible = linesIn > 0.001;

    if (needClear || cfg.trail <= 0) {
      renderer.clear();
      needClear = false;
    } else {
      renderer.render(fadeScene, fadeCam);
    }
    renderer.render(scene, camera);
  }
  frame();

  return {
    points, segments,
    /** stato interno, utile per il debug dalla console */
    get debug() {
      return { p: state.p, phase: state.phase, phaseTime: state.phaseTime, pressed: state.pressed,
               pinned: state.pinned, brush: state.brush, tilt: state.tilt.toArray(),
               rot: [group.rotation.x, group.rotation.y], cam: camera.position.toArray(),
               touch: uniforms.uTouch.value.toArray() };
    },
    /** 1 = va in linee e ci resta, 0 = torna foto e riprende il ciclo */
    set(value) {
      state.pinned = value >= 0.5;
      state.phase = state.pinned ? 'up' : 'down';
      state.phaseTime = 0;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose(); lineMat.dispose(); photoMat.dispose(); tex.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
