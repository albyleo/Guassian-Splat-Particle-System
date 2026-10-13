// =============================================================================
//  Hibiscus — versione web in tempo reale (Three.js)
//
//  Stessa tecnica della rete TouchDesigner (v9):
//   1. ogni pixel della foto diventa un punto con il suo colore;
//   2. i punti della stessa riga sono uniti in linee; i pixel scuri del fondo
//      vengono saltati ma la riga continua sopra il vuoto (i filamenti);
//   3. nel vertex shader due noise simplex spostano i punti: uno lento e ampio
//      (rilievo 3D) e uno fine e veloce (il "pelo");
//   4. tutto ruota piano in 3D; la foto vera sfuma sotto le linee.
//  Il tocco fa da "timeline": toccando la foto si scompone, lasciando si
//  ricompone. Trascinando il fiore si inclina e le fibre sotto il dito si
//  agitano.
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
  furAmp: 0.003,         // il "pelo": spostamento dei singoli punti
  furPeriod: 0.006,
  furSpeed: 0.35,
  yaw: 16,               // gradi di rotazione avanti-indietro a effetto pieno
  pitch: 5,
  spinSpeed: 0.4,

  decompose: 3.5,        // secondi per passare da foto a linee
  recompose: 4.5,        // secondi per tornare foto
  linger: 6.0,           // secondi in cui resta in linee dopo aver tolto il dito
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
uniform float uBrushFur, uBrushLift;
uniform vec3 uTouch;               // xy = dito nello spazio della foto, z = raggio
attribute vec3 color;
varying vec3 vColor;
${SIMPLEX}
void main() {
  vec3 p = position;

  // rilievo: noise lento e ampio, soprattutto in profondità
  vec3 q = vec3(position.xy / uDepthPeriod, uTime * uDepthSpeed);
  vec3 dn = vec3(snoise(q), snoise(q + vec3(17.3, 9.1, 0.0)), snoise(q + vec3(-41.7, 23.5, 0.0)));
  p += dn * vec3(0.5, 0.5, 1.0) * uDepthAmp * uDepth;

  // il dito: le fibre vicine si agitano e si sollevano
  float d = distance(position.xy, uTouch.xy);
  float brush = exp(-(d * d) / (uTouch.z * uTouch.z)) * uBrush;

  // pelo: noise fine, punti vicini vanno in direzioni diverse
  vec3 f = vec3(position.xy / uFurPeriod, uTime * uFurSpeed);
  vec3 fn = vec3(snoise(f), snoise(f + vec3(5.2, 1.3, 0.0)), snoise(f + vec3(9.7, -3.1, 0.0)));
  p += fn * (uFurAmp * uFur + uBrushFur * brush);
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
  const state = {
    p: 0, target: 0, pressed: false, releaseAt: -1, lingerPending: false,
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
    state.target = 1;
    state.releaseAt = -1;
    state.lingerPending = false;
    container.dispatchEvent(new CustomEvent('hibiscus:touch'));
  });
  canvas.addEventListener('pointermove', (e) => {
    setPointer(e);
    state.hover = e.pointerType === 'mouse';
    if (state.pressed) state.tiltTarget.set(state.ndc.x * cfg.tilt, -state.ndc.y * cfg.tilt * 0.7);
  });
  // lasciando il dito: si arriva comunque all'effetto pieno, che resta per
  // `linger` secondi, poi il fiore si ricompone
  const release = () => {
    if (!state.pressed) return;
    state.pressed = false;
    state.lingerPending = true;
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
      state.target = state.target > 0.5 ? 0 : 1;
      state.releaseAt = -1;
      state.lingerPending = false;
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
    const now = performance.now() / 1000;

    if (!state.pressed && state.lingerPending && state.p >= 0.999) {
      state.lingerPending = false;
      state.releaseAt = now + cfg.linger;
    }
    if (!state.pressed && state.releaseAt > 0 && now > state.releaseAt) {
      state.target = 0;
      state.releaseAt = -1;
    }
    if (state.target === 0) state.tiltTarget.set(0, 0);

    // avanzamento lineare: le curve smoothstep qui sotto danno la morbidezza
    const rate = state.target > state.p ? 1 / cfg.decompose : 1 / cfg.recompose;
    state.p += Math.sign(state.target - state.p) * Math.min(Math.abs(state.target - state.p), rate * dt);
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
      return { p: state.p, target: state.target, pressed: state.pressed, brush: state.brush,
               tilt: state.tilt.toArray(), rot: [group.rotation.x, group.rotation.y], cam: camera.position.toArray(),
               touch: uniforms.uTouch.value.toArray() };
    },
    /** 0 = foto, 1 = linee (come un tocco prolungato) */
    set(value) { state.target = value; state.releaseAt = -1; state.lingerPending = false; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose(); lineMat.dispose(); photoMat.dispose(); tex.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
