/**
 * Visor de imágenes 360° (equirectangulares) con three.js.
 * Sin dependencias de build: funciona como sitio estático en GitHub Pages.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Configuración
 * ------------------------------------------------------------------ */
const FOV_MIN = 25;
const FOV_MAX = 100;
const FOV_DEF = 75;
const LAT_LIMIT = 85;          // evita voltear el polo
const AUTOROTATE_SPEED = 0.06; // grados por fotograma
const DAMPING = 0.88;          // inercia al soltar el arrastre

const panoramas = Array.isArray(window.PANORAMAS) ? window.PANORAMAS.slice() : [];

/* ------------------------------------------------------------------ *
 * Elementos del DOM
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const canvas    = $('view');
const loaderEl  = $('loader');
const barFill   = $('bar-fill');
const loaderPct = $('loader-pct');
const errorEl   = $('error');
const errorMsg  = $('error-msg');
const hintEl    = $('hint');
const titleEl   = $('title');
const scenesEl  = $('scenes');
const fileEl    = $('file');

/* ------------------------------------------------------------------ *
 * Escena three.js
 * ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV_DEF, 1, 0.1, 1000);

// Esfera vista desde dentro: se invierte en X para que la textura no salga espejada.
const geometry = new THREE.SphereGeometry(500, 64, 40);
geometry.scale(-1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x111418 });
const sphere   = new THREE.Mesh(geometry, material);
scene.add(sphere);

const target = new THREE.Vector3();

/* ------------------------------------------------------------------ *
 * Estado de la cámara
 * ------------------------------------------------------------------ */
const state = {
  lon: 0, lat: 0, fov: FOV_DEF,
  velLon: 0, velLat: 0,
  autorotate: false,
  index: -1,
  home: { lon: 0, lat: 0, fov: FOV_DEF }
};

/* ------------------------------------------------------------------ *
 * Carga de texturas
 * ------------------------------------------------------------------ */
let currentTexture = null;
let currentObjectURL = null;
let loadToken = 0;

function setProgress(p) {
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  barFill.style.width = pct + '%';
  loaderPct.textContent = pct + '%';
}

function showLoader(show) {
  loaderEl.classList.toggle('hidden', !show);
  if (show) setProgress(0);
}

function showError(message) {
  errorMsg.textContent = message;
  errorEl.classList.remove('hidden');
  showLoader(false);
}

/** Descarga la imagen mostrando progreso real. Devuelve un ImageBitmap. */
async function fetchBitmap(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const total = Number(res.headers.get('content-length')) || 0;
  let blob;

  if (res.body && total) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(received / total);
    }
    blob = new Blob(chunks, { type: res.headers.get('content-type') || 'image/jpeg' });
  } else {
    blob = await res.blob();
  }
  onProgress(1);
  return createImageBitmap(blob, { imageOrientation: 'flipY' });
}

/** Reduce la imagen si supera el tamaño máximo de textura de la GPU. */
function fitToGPU(bitmap) {
  const max = renderer.capabilities.maxTextureSize;
  if (bitmap.width <= max) return bitmap;

  const scale = max / bitmap.width;
  const cv = document.createElement('canvas');
  cv.width  = max;
  cv.height = Math.round(bitmap.height * scale);
  cv.getContext('2d').drawImage(bitmap, 0, 0, cv.width, cv.height);
  if (bitmap.close) bitmap.close();
  console.warn('Panorámica reescalada a ' + cv.width + 'x' + cv.height +
               ' (máximo de la GPU: ' + max + 'px).');
  return cv;
}

/** Carga alternativa por <img>, para navegadores sin createImageBitmap. */
function loadViaImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
    img.src = url;
  });
}

async function loadPanorama(url, opts = {}) {
  const token = ++loadToken;
  errorEl.classList.add('hidden');
  showLoader(true);

  let source;
  let flipY = false;

  try {
    if (typeof createImageBitmap !== 'function') throw new Error('sin createImageBitmap');
    source = fitToGPU(await fetchBitmap(url, setProgress));
  } catch (err) {
    try {
      setProgress(0.5);
      source = await loadViaImage(url);   // reintento simple
      flipY = true;
      setProgress(1);
    } catch (e2) {
      if (token === loadToken) showError(String(err.message || err));
      return;
    }
  }

  if (token !== loadToken) return;        // llegó otra carga más reciente

  const texture = new THREE.Texture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;   // sin mipmaps: ahorra memoria en 8K
  texture.generateMipmaps = false;
  texture.flipY = flipY;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;

  if (currentTexture) currentTexture.dispose();
  currentTexture = texture;

  material.map = texture;
  material.color.setHex(0xffffff);
  material.needsUpdate = true;

  state.home = {
    lon: Number(opts.lon) || 0,
    lat: Number(opts.lat) || 0,
    fov: Number(opts.fov) || FOV_DEF
  };
  resetView();
  showLoader(false);
}

/* ------------------------------------------------------------------ *
 * Escenas
 * ------------------------------------------------------------------ */
function buildSceneList() {
  scenesEl.innerHTML = '';
  panoramas.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.title || ('Escena ' + (i + 1));
    scenesEl.appendChild(opt);
  });
  const multiple = panoramas.length > 1;
  scenesEl.classList.toggle('hidden', !multiple);
  $('btn-prev').classList.toggle('hidden', !multiple);
  $('btn-next').classList.toggle('hidden', !multiple);
  $('sep1').classList.toggle('hidden', !multiple);
}

function showScene(i) {
  if (!panoramas.length) return;
  state.index = (i + panoramas.length) % panoramas.length;
  const p = panoramas[state.index];
  titleEl.textContent = p.title || 'Visor 360°';
  scenesEl.value = String(state.index);
  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }
  loadPanorama(p.url, p);
}

/** Muestra una imagen elegida por el usuario (no se sube a ningún servidor). */
function showLocalFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (currentObjectURL) URL.revokeObjectURL(currentObjectURL);
  currentObjectURL = URL.createObjectURL(file);
  state.index = -1;
  titleEl.textContent = file.name;
  scenesEl.value = '';
  loadPanorama(currentObjectURL, {});
}

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */
const pointers = new Map();
let pinchStart = 0;
let pinchFov = 0;
let interacted = false;

function markInteraction() {
  if (interacted) return;
  interacted = true;
  hintEl.classList.add('hidden');
}

function zoom(delta) {
  state.fov = THREE.MathUtils.clamp(state.fov + delta, FOV_MIN, FOV_MAX);
  markInteraction();
}

function resetView() {
  state.lon = state.home.lon;
  state.lat = state.home.lat;
  state.fov = THREE.MathUtils.clamp(state.home.fov, FOV_MIN, FOV_MAX);
  state.velLon = 0;
  state.velLat = 0;
}

function pinchDistance() {
  const pts = [...pointers.values()];
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.classList.add('grabbing');
  state.velLon = 0;
  state.velLat = 0;
  if (pointers.size === 2) {
    pinchStart = pinchDistance();
    pinchFov = state.fov;
  }
  markInteraction();
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const d = pinchDistance();
    if (pinchStart > 0 && d > 0) {
      state.fov = THREE.MathUtils.clamp(pinchFov * (pinchStart / d), FOV_MIN, FOV_MAX);
    }
    return;
  }

  // La sensibilidad sigue al zoom para que el arrastre se sienta igual de fino.
  const k = 0.12 * (state.fov / FOV_DEF);
  state.lon -= dx * k;
  state.lat = THREE.MathUtils.clamp(state.lat + dy * k, -LAT_LIMIT, LAT_LIMIT);
  state.velLon = -dx * k;
  state.velLat = dy * k;
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = 0;
  if (pointers.size === 0) canvas.classList.remove('grabbing');
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom(e.deltaY * 0.05);
}, { passive: false });

canvas.addEventListener('dblclick', () => zoom(-15));

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.matches && e.target.matches('input,select,textarea')) return;
  const step = 4 * (state.fov / FOV_DEF);
  switch (e.key) {
    case 'ArrowLeft':  state.lon -= step; markInteraction(); break;
    case 'ArrowRight': state.lon += step; markInteraction(); break;
    case 'ArrowUp':    state.lat = Math.min(state.lat + step, LAT_LIMIT); markInteraction(); break;
    case 'ArrowDown':  state.lat = Math.max(state.lat - step, -LAT_LIMIT); markInteraction(); break;
    case '+': case '=': zoom(-5); break;
    case '-': case '_': zoom(5); break;
    case '0': resetView(); break;
    case 'r': case 'R': toggleAutorotate(); break;
    case 'f': case 'F': toggleFullscreen(); break;
    default: return;
  }
  e.preventDefault();
});

/* ------------------------------------------------------------------ *
 * Interfaz
 * ------------------------------------------------------------------ */
function toggleAutorotate() {
  state.autorotate = !state.autorotate;
  $('btn-auto').classList.toggle('active', state.autorotate);
  markInteraction();
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

$('btn-prev').addEventListener('click', () => showScene(state.index - 1));
$('btn-next').addEventListener('click', () => showScene(state.index + 1));
$('btn-in').addEventListener('click', () => zoom(-8));
$('btn-out').addEventListener('click', () => zoom(8));
$('btn-reset').addEventListener('click', resetView);
$('btn-auto').addEventListener('click', toggleAutorotate);
$('btn-full').addEventListener('click', toggleFullscreen);
$('btn-open').addEventListener('click', () => fileEl.click());

fileEl.addEventListener('change', () => {
  showLocalFile(fileEl.files[0]);
  fileEl.value = '';
});

scenesEl.addEventListener('change', () => showScene(Number(scenesEl.value)));

document.addEventListener('fullscreenchange', () => {
  $('btn-full').classList.toggle('active', !!document.fullscreenElement);
});

// Arrastrar y soltar una imagen sobre la ventana
['dragenter', 'dragover'].forEach((type) => {
  window.addEventListener(type, (e) => {
    e.preventDefault();
    document.body.classList.add('dropping');
  });
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget) return;
  document.body.classList.remove('dropping');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dropping');
  if (e.dataTransfer && e.dataTransfer.files) showLocalFile(e.dataTransfer.files[0]);
});

/* ------------------------------------------------------------------ *
 * Bucle de render
 * ------------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);

  if (pointers.size === 0) {
    if (Math.abs(state.velLon) > 0.01 || Math.abs(state.velLat) > 0.01) {
      state.lon += state.velLon;
      state.lat = THREE.MathUtils.clamp(state.lat + state.velLat, -LAT_LIMIT, LAT_LIMIT);
      state.velLon *= DAMPING;
      state.velLat *= DAMPING;
    } else if (state.autorotate) {
      state.lon += AUTOROTATE_SPEED;
    }
  }

  const phi   = THREE.MathUtils.degToRad(90 - state.lat);
  const theta = THREE.MathUtils.degToRad(state.lon);
  target.set(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
  camera.lookAt(target);

  if (Math.abs(camera.fov - state.fov) > 0.01) {
    camera.fov += (state.fov - camera.fov) * 0.2;   // zoom suavizado
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ *
 * Arranque
 * ------------------------------------------------------------------ */
buildSceneList();
animate();

if (panoramas.length) {
  showScene(0);
} else {
  showError('No hay panorámicas configuradas en js/panoramas.js. ' +
            'Puedes abrir una imagen local con el botón de carpeta.');
}
