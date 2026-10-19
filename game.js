import * as THREE from 'three';

function showErr(m) { let d = document.getElementById('errbox'); if (!d) { d = document.createElement('pre'); d.id = 'errbox'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40%;overflow:auto;margin:0;padding:8px;z-index:99;background:rgba(120,0,0,.9);color:#fff;font:11px monospace;white-space:pre-wrap'; document.body.appendChild(d); } d.textContent += m + '\n'; }
addEventListener('error', e => showErr('ERR ' + e.message + ' @' + (e.lineno || '')));
addEventListener('unhandledrejection', e => showErr('REJ ' + (e.reason && e.reason.message || e.reason)));

// =====================================================================
//  BLOCK CITY DRIVE — a blocky open-city driving simulator
// =====================================================================

// ---------- utils ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261019);           // city generation (deterministic)
const rr = (a, b) => a + (b - a) * rng();
const pick = a => a[(rng() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const isTouch = matchMedia('(pointer: coarse)').matches;
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const VERSION = 'v1.3.0 \u00b7 2026-10-19';
document.querySelectorAll('.ver').forEach(e => { e.textContent = VERSION; });

// ---------- settings ----------
const COLORS = ['#d62828', '#2a6fdb', '#2fa84f', '#f2c01e', '#f2f2f2', '#2b2b2b', '#ff7a1a', '#8a3fd1'];
const CARS = {
  hatch: { name: 'City Hatch', spec: 'hatch', vmax: 44, acc: 9.5, grip: 7.5, steer: 0.62, desc: 'Nimble and\neasy to park' },
  taxi:  { name: 'Yellow Cab', spec: 'sedan', vmax: 50, acc: 8.5, grip: 7.0, steer: 0.56, desc: 'Comfy cruiser\nfor fares', fixed: '#f2c01e', taxi: true },
  sport: { name: 'Sport GT', spec: 'sport', vmax: 68, acc: 13, grip: 8.5, steer: 0.5, desc: 'Fast and\nthirsty for lanes' },
};
const MODES = [['free', 'Free Drive'], ['taxi', 'Taxi Shift']];
const TIMES = [['cycle', 'Cycle'], ['morning', 'Morning'], ['sunset', 'Sunset'], ['night', 'Night']];
const TRAFFIC = [['Light', 22], ['Normal', 42], ['Heavy', 66]];
const SET = Object.assign({ car: 'hatch', color: 0, mode: 'free', time: 'cycle', traffic: isTouch ? 0 : 1, shadow: !isTouch, sound: true }, (() => { try { return JSON.parse(localStorage.getItem('blockcity.v2')) || {}; } catch { return {}; } })());
if (Q.get('car')) SET.car = Q.get('car');
if (Q.get('mode')) SET.mode = Q.get('mode');
if (Q.get('time')) SET.time = Q.get('time');
if (!CARS[SET.car]) SET.car = 'hatch';
SET.traffic = clamp(SET.traffic | 0, 0, 2); SET.color = clamp(SET.color | 0, 0, 7);
const saveSet = () => { try { localStorage.setItem('blockcity.v2', JSON.stringify(SET)); } catch {} };

// ---------- pixel textures ----------
function makeCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; }
function texFrom(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function noiseFill(g, x, y, w, h, base, vari) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const k = 1 + (rng() - 0.5) * vari;
    g.fillStyle = `rgb(${clamp(base[0] * k | 0, 0, 255)},${clamp(base[1] * k | 0, 0, 255)},${clamp(base[2] * k | 0, 0, 255)})`;
    g.fillRect(i, j, 1, 1);
  }
}
const WTW = 12.8, WTH = 14.4;            // window tile: 4 bays x 4 floors (3.2m x 3.6m each)
const litMask = Array.from({ length: 16 }, () => rng() < 0.5);
const TEX = {
  win: texFrom(makeCanvas(64, 64, g => {
    noiseFill(g, 0, 0, 64, 64, [236, 236, 236], 0.07);
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * 16, y = by * 16;
      g.fillStyle = '#b9b9b9'; g.fillRect(x, y + 14, 16, 2);
      g.fillStyle = '#2b3a52'; g.fillRect(x + 3, y + 3, 10, 9);
      g.fillStyle = '#58759c'; g.fillRect(x + 3, y + 3, 10, 3);
      g.fillStyle = '#1d2638'; g.fillRect(x + 8, y + 3, 1, 9);
      g.fillStyle = '#c9c9c9'; g.fillRect(x + 2, y + 12, 12, 1);
    }
  })),
  winLit: texFrom(makeCanvas(64, 64, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      if (!litMask[by * 4 + bx]) continue;
      g.fillStyle = rng() < 0.3 ? '#9fd4ff' : '#ffd98a'; g.fillRect(bx * 16 + 3, by * 16 + 3, 10, 9);
      g.fillStyle = '#000'; g.fillRect(bx * 16 + 8, by * 16 + 3, 1, 9);
    }
  })),
  road: texFrom(makeCanvas(32, 8, g => {
    noiseFill(g, 0, 0, 32, 8, [56, 58, 64], 0.13);
    g.fillStyle = '#d9d9d9'; g.fillRect(1, 0, 1, 8); g.fillRect(30, 0, 1, 8);
    g.fillStyle = '#e2b828'; g.fillRect(15, 0, 1, 8); g.fillRect(17, 0, 1, 8);
  })),
  asph: texFrom(makeCanvas(16, 16, g => noiseFill(g, 0, 0, 16, 16, [56, 58, 64], 0.13))),
  walk: texFrom(makeCanvas(16, 16, g => {
    noiseFill(g, 0, 0, 16, 16, [190, 188, 182], 0.08);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(0, 8, 16, 1); g.fillRect(8, 0, 1, 16);
  })),
  grass: texFrom(makeCanvas(16, 16, g => {
    const pal = [[95, 159, 53], [106, 171, 60], [85, 149, 48], [119, 182, 73], [78, 138, 43]];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = pal[(rng() * 5) | 0]; g.fillStyle = `rgb(${p})`; g.fillRect(x, y, 1, 1); }
  })),
};

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(isTouch ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = SET.shadow;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ab4f8);
scene.fog = new THREE.Fog(0x8ab4f8, 140, 620);
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.3, 1600);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a78, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
sun.castShadow = true; sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 420 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
scene.add(sun, sun.target);
const moon = new THREE.DirectionalLight(0x8fa6ff, 0);
scene.add(moon, moon.target);
const head = new THREE.SpotLight(0xfff0c8, 0, 75, 0.5, 0.5, 0);
scene.add(head, head.target);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// =====================================================================
//  CITY LAYOUT
// =====================================================================
const N = 8, S = 80, RHW = 7, LANE = 3.6;
const HALF = (N - 1) / 2 * S;                     // outer road line (280)
const LIM = HALF + S - 5;                         // hard world limit
const lineAt = i => (i - (N - 1) / 2) * S;
const nearestLine = v => clamp(Math.round(v / S + (N - 1) / 2), 0, N - 1);
const lineDist = v => Math.abs(v - lineAt(nearestLine(v)));
function onRoad(x, z) { if (Math.abs(x) > HALF + RHW || Math.abs(z) > HALF + RHW) return false; return lineDist(x) < RHW || lineDist(z) < RHW; }
const groundH = (x, z) => onRoad(x, z) ? 0 : 0.18;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const AVE = ['Maple Ave', 'Cedar Ave', 'Oak Ave', 'Main Ave', 'Pine Ave', 'Elm Ave', 'Birch Ave', 'Willow Ave'];
const STR = ['1st St', '2nd St', '3rd St', '4th St', '5th St', '6th St', '7th St', '8th St'];

// ---------- geometry builder ----------
class GB {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  face(vs, nx, ny, nz, uvs, col) {
    const b = this.p.length / 3;
    for (let k = 0; k < 4; k++) { this.p.push(vs[k][0], vs[k][1], vs[k][2]); this.n.push(nx, ny, nz); this.u.push(uvs[k][0], uvs[k][1]); this.c.push(col.r, col.g, col.b); }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  box(cx, y0, cz, w, h, d, col, m = 'flat', tile = 8) {
    col = col instanceof THREE.Color ? col : new THREE.Color(col);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const F = [[.02, .02], [.02, .02], [.02, .02], [.02, .02]];
    const top = m === 'world' ? [[x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile], [x0 / tile, z0 / tile]] : F;
    this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 0, 1, 0, top, col);
    const ou = m === 'win' ? Math.floor(rng() * 4) / 4 : 0, ov = m === 'win' ? Math.floor(rng() * 4) / 4 : 0;
    const su = (fw, fh) => m === 'win' ? [[ou, ov], [ou + fw / WTW, ov], [ou + fw / WTW, ov + fh / WTH], [ou, ov + fh / WTH]] : F;
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1, su(w, h), col);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0, 0, -1, su(w, h), col);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 1, 0, 0, su(d, h), col);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], -1, 0, 0, su(d, h), col);
  }
  quad(x0, z0, x1, z1, y, col, uvFn) {
    col = col instanceof THREE.Color ? col : new THREE.Color(col);
    const vs = [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]];
    this.face(vs, 0, 1, 0, vs.map(v => uvFn(v[0], v[2])), col);
  }
  mesh(mat, cast = false, recv = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.i), 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m;
  }
}
const buildMat = new THREE.MeshLambertMaterial({ map: TEX.win, vertexColors: true, emissive: 0xffffff, emissiveMap: TEX.winLit, emissiveIntensity: 0 });
const roadMat = new THREE.MeshLambertMaterial({ map: TEX.road });
const asphMat = new THREE.MeshLambertMaterial({ map: TEX.asph });
const walkMat = new THREE.MeshLambertMaterial({ map: TEX.walk, vertexColors: true });
const grassMat = new THREE.MeshLambertMaterial({ map: TEX.grass, vertexColors: true });
const miscMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const markMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const gbB = new GB(), gbRoad = new GB(), gbAsph = new GB(), gbWalk = new GB(), gbGrass = new GB(), gbMisc = new GB(), gbMark = new GB();

// ---------- colliders (spatial hash) ----------
const CELL = 40, colMap = new Map(), bldRects = [], parkRects = [];
const ck = (cx, cz) => (cx + 60) * 200 + (cz + 60);
function addCol(x0, x1, z0, z1) {
  const r = { x0, x1, z0, z1 };
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
    const k = ck(cx, cz); let a = colMap.get(k); if (!a) colMap.set(k, a = []); a.push(r);
  }
  return r;
}

// ---------- build the city ----------
const BCOL = [0xd9c9b0, 0xc4ccd6, 0xb8664b, 0xe6d8c3, 0xa4bccf, 0xd2d2d2, 0xcb9d70, 0xdcb7a5, 0xb9b4a6, 0x9db1a0];
const snap = v => Math.max(6.4, Math.round(v / 3.2) * 3.2);
function building(x0, x1, z0, z1, f, ring) {
  const w = snap(x1 - x0), d = snap(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let floors = 2 + Math.floor(Math.pow(rng(), 1.5) * (f * 17 + 5));
  if (ring) floors = 3 + Math.floor(rng() * 7);
  const h = floors * 3.6, col = pick(BCOL);
  gbB.box(cx, 0.18, cz, w, h, d, col, 'win');
  addCol(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); bldRects.push([cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2]);
  let top = 0.18 + h;
  if (floors > 9 && w > 16 && d > 16) {                       // setback tier
    const t = Math.floor(floors * 0.3) * 3.6, tw = snap(w - 6.4), td = snap(d - 6.4);
    gbB.box(cx, top, cz, tw, t, td, col, 'win'); top += t;
    if (rng() < 0.5) gbMisc.box(cx, top, cz, 0.3, rr(6, 14), 0.3, 0x888888);
  }
  gbMisc.box(cx + rr(-w / 4, w / 4), top, cz + rr(-d / 4, d / 4), rr(2, 4), rr(1, 2), rr(2, 4), 0x7a7a80);   // rooftop unit
  gbMisc.box(cx, top, cz, w + 0.4, 0.5, d + 0.4, 0x66666b);                                                // roof lip
}
const GREEN = [0x4e8a2b, 0x5f9f35, 0x3f7a26, 0x6aab3c];
function tree(x, z) {
  const s = rr(0.9, 1.35), g = pick(GREEN);
  gbMisc.box(x, 0.18, z, 0.6, 2.6 * s, 0.6, 0x6b4a2b);
  gbMisc.box(x, 0.18 + 2.2 * s, z, 3.4 * s, 1.7 * s, 3.4 * s, g);
  gbMisc.box(x, 0.18 + 3.8 * s, z, 2.3 * s, 1.4 * s, 2.3 * s, pick(GREEN));
  addCol(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
}
function genBlock(bi, bj) {
  const cx = (bi + 0.5 - (N - 1) / 2) * S, cz = (bj + 0.5 - (N - 1) / 2) * S;
  const ring = bi < 0 || bj < 0 || bi >= N - 1 || bj >= N - 1;
  const half = S / 2 - RHW;                                       // 33
  // sidewalk slab with curb
  gbWalk.box(cx, 0, cz, half * 2, 0.18, half * 2, 0xffffff, 'world', 8);
  const f = 1 - clamp(Math.hypot(cx, cz) / (HALF * 1.15), 0, 1);
  const r = rng();
  const ix0 = cx - half + 4, ix1 = cx + half - 4, iz0 = cz - half + 4, iz1 = cz + half - 4;   // building area
  if (!ring && r < 0.14) {                                        // park
    gbGrass.quad(ix0 - 3, iz0 - 3, ix1 + 3, iz1 + 3, 0.19, 0xffffff, (x, z) => [x / 8, z / 8]);
    parkRects.push([ix0 - 3, ix1 + 3, iz0 - 3, iz1 + 3]);
    gbMisc.box(cx, 0.19, cz, 9, 0.7, 9, 0x9a9a9a); gbMisc.box(cx, 0.89, cz, 7.6, 0.45, 7.6, 0x3f86d6); gbMisc.box(cx, 0.89, cz, 1.4, 2.6, 1.4, 0xb4b4b4);
    addCol(cx - 4.5, cx + 4.5, cz - 4.5, cz + 4.5);
    for (let k = 0; k < 11; k++) {
      const x = rr(ix0, ix1), z = rr(iz0, iz1);
      if (Math.abs(x - cx) < 8 && Math.abs(z - cz) < 8) continue;
      tree(x, z);
    }
    return;
  }
  const gap = 2, l = rng(), rects = [];
  const mx = (ix0 + ix1) / 2, mz = (iz0 + iz1) / 2;
  if (l < 0.25) rects.push([ix0, ix1, iz0, iz1]);
  else if (l < 0.5) { const sx = mx + rr(-8, 8); rects.push([ix0, sx - gap, iz0, iz1], [sx + gap, ix1, iz0, iz1]); }
  else if (l < 0.72) { const sz = mz + rr(-8, 8); rects.push([ix0, ix1, iz0, sz - gap], [ix0, ix1, sz + gap, iz1]); }
  else { const sx = mx + rr(-6, 6), sz = mz + rr(-6, 6); rects.push([ix0, sx - gap, iz0, sz - gap], [sx + gap, ix1, iz0, sz - gap], [ix0, sx - gap, sz + gap, iz1], [sx + gap, ix1, sz + gap, iz1]); }
  for (const q of rects) building(q[0], q[1], q[2], q[3], f, ring);
}
for (let bi = -1; bi < N; bi++) for (let bj = -1; bj < N; bj++) genBlock(bi, bj);

// ---------- roads, intersections, markings ----------
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const x = lineAt(i), z = lineAt(j);
  gbAsph.quad(x - RHW, z - RHW, x + RHW, z + RHW, 0.02, 0xffffff, (px, pz) => [px / 8, pz / 8]);
  for (let k = 0; k < 4; k++) {
    const o = DIRS[k], R = [o[1], -o[0]];
    // arms that exist (also outer edge arms get markings, harmless)
    const cxw = x + o[0] * 8.8, czw = z + o[1] * 8.8;
    for (let s = -6.3; s <= 6.4; s += 1.4) {                       // crosswalk zebra
      const sx = cxw + R[0] * s, sz = czw + R[1] * s;
      const hx = o[0] ? 1.0 : 0.35, hz = o[1] ? 1.0 : 0.35;
      gbMark.quad(sx - hx, sz - hz, sx + hx, sz + hz, 0.04, 0xe8e8e8, () => [0, 0]);
    }
    const lx = x + o[0] * 11.2 + R[0] * LANE, lz = z + o[1] * 11.2 + R[1] * LANE;   // stop line (incoming lane)
    const hx = o[0] ? 0.25 : 3.1, hz = o[1] ? 0.25 : 3.1;
    gbMark.quad(lx - hx, lz - hz, lx + hx, lz + hz, 0.04, 0xf2f2f2, () => [0, 0]);
  }
}
for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) {
  const x = lineAt(i), z0 = lineAt(j) + RHW, z1 = lineAt(j + 1) - RHW;      // road along z
  gbRoad.quad(x - RHW, z0, x + RHW, z1, 0.02, 0xffffff, (px, pz) => [(px - (x - RHW)) / (2 * RHW), (pz - z0) / 4]);
  const zz = lineAt(i), xx0 = lineAt(j) + RHW, xx1 = lineAt(j + 1) - RHW;  // road along x
  gbRoad.quad(xx0, zz - RHW, xx1, zz + RHW, 0.02, 0xffffff, (px, pz) => [(pz - (zz - RHW)) / (2 * RHW), (px - xx0) / 4]);
}

// ---------- ground + sky objects ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ map: TEX.grass }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.04; ground.receiveShadow = true;
const gTex = TEX.grass.clone(); gTex.needsUpdate = true; gTex.repeat.set(750, 750); ground.material.map = gTex; scene.add(ground);

// ---------- lamps + traffic signals ----------
const lampPos = [];
function addLamp(x, z, ax, az) {
  gbMisc.box(x, 0.18, z, 0.25, 7, 0.25, 0x55585e);
  gbMisc.box(x + ax * 0.9, 7.1, z + az * 0.9, ax ? 1.8 : 0.2, 0.15, az ? 1.8 : 0.2, 0x55585e);
  lampPos.push([x + ax * 1.7, 6.95, z + az * 1.7]);
  addCol(x - 0.25, x + 0.25, z - 0.25, z + 0.25);
}
for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) {
  const m = lineAt(j) + S / 2;
  addLamp(lineAt(i) - (RHW + 0.9), m, 1, 0); addLamp(lineAt(i) + (RHW + 0.9), m, -1, 0);
  addLamp(m, lineAt(i) - (RHW + 0.9), 0, 1); addLamp(m, lineAt(i) + (RHW + 0.9), 0, -1);
}
const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x777777 }), lampPos.length);
{ const o = new THREE.Object3D(); lampPos.forEach((p, k) => { o.position.set(p[0], p[1], p[2]); o.rotation.y = (Math.abs(p[0]) % S < 1 ? 0 : 0); o.updateMatrix(); lampMesh.setMatrixAt(k, o.matrix); }); scene.add(lampMesh); }

const sigList = [];   // {i,j,axis}
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const x = lineAt(i), z = lineAt(j);
  for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
    const px = x + sx * 9.2, pz = z + sz * 9.2;
    gbMisc.box(px, 0.18, pz, 0.3, 5.2, 0.3, 0x44474d);
    addCol(px - 0.3, px + 0.3, pz - 0.3, pz + 0.3);
    sigList.push({ i, j, axis: sx === sz ? 1 : 0, x: px, z: pz });
  }
}
const sigMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }), sigList.length);
{ const o = new THREE.Object3D(); sigList.forEach((s, k) => { o.position.set(s.x, 5.6, s.z); o.updateMatrix(); sigMesh.setMatrixAt(k, o.matrix); sigMesh.setColorAt(k, new THREE.Color(0x22ff44)); }); scene.add(sigMesh); }
const SIGC = [new THREE.Color(0x22ff44), new THREE.Color(0xffc21a), new THREE.Color(0xff2a1a)];
const CYCLE = 30;
const sigOff = (i, j) => ((i * 7 + j * 13) % 11) * 2.7;
function lightState(i, j, axis, t) {                 // axis 1 = north-south, 0 = east-west ; 0 green 1 yellow 2 red
  const p = (t + sigOff(i, j)) % CYCLE;
  if (axis === 1) return p < 12 ? 0 : p < 14 ? 1 : 2;
  return p >= 15 && p < 27 ? 0 : p >= 27 && p < 29 ? 1 : 2;
}
let lastSigKey = -1;
function updateSignals(t) {
  const key = Math.floor(t * 2); if (key === lastSigKey) return; lastSigKey = key;
  sigList.forEach((s, k) => sigMesh.setColorAt(k, SIGC[lightState(s.i, s.j, s.axis, t)]));
  sigMesh.instanceColor.needsUpdate = true;
}

// finish geometry
gbB.mesh(buildMat, true, true);
gbRoad.mesh(roadMat); gbAsph.mesh(asphMat); gbWalk.mesh(walkMat); gbGrass.mesh(grassMat);
gbMisc.mesh(miscMat, true, true); gbMark.mesh(markMat);

// ---------- sky ----------
const skyPlane = (c, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, fog: false, depthWrite: false })); scene.add(m); return m; };
const sunMesh = skyPlane(0xfffbd0, 90), moonMesh = skyPlane(0xdfe6ff, 55);
const starGeo = new THREE.BufferGeometry();
{ const a = []; for (let k = 0; k < 500; k++) { const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95 + 0.05); a.push(Math.sin(ph) * Math.cos(th) * 900, Math.cos(ph) * 900, Math.sin(ph) * Math.sin(th) * 900); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
scene.add(stars);
const clouds = [];
for (let k = 0; k < 26; k++) {
  const g = new THREE.Group(); const n = 3 + (Math.random() * 4 | 0);
  for (let b = 0; b < n; b++) { const m = new THREE.Mesh(new THREE.BoxGeometry(rr(18, 34), 5, rr(12, 22)), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.9 })); m.position.set(b * 20 - n * 10, Math.random() * 2, Math.random() * 10); g.add(m); }
  g.position.set(rr(-700, 700), rr(150, 220), rr(-700, 700)); scene.add(g); clouds.push(g);
}

// ---------- time of day ----------
const TOD = { h: 8, e: 1, night: 0, cycle: true };
const skyCol = new THREE.Color(), cDay = new THREE.Color(0x8ab4f8), cDusk = new THREE.Color(0xff9a5c), cNight = new THREE.Color(0x070b1e);
const sunDir = new THREE.Vector3();
function setTime(mode) {
  TOD.cycle = mode === 'cycle';
  TOD.h = { cycle: 8, morning: 9.5, sunset: 17.6, night: 22.5 }[mode] ?? 8;
}
function applyTod() {
  const phi = 2 * Math.PI * (TOD.h - 6) / 24, e = Math.sin(phi);
  TOD.e = e; TOD.night = 1 - smooth(-0.12, 0.22, e);
  sunDir.set(Math.cos(phi) * 0.85, Math.max(e, 0.04), 0.35).normalize();
  if (e >= 0) skyCol.copy(cDusk).lerp(cDay, smooth(0, 0.45, e)); else skyCol.copy(cDusk).lerp(cNight, smooth(0, 0.3, -e));
  scene.background.copy(skyCol); scene.fog.color.copy(skyCol);
  scene.fog.near = lerp(50, 140, 1 - TOD.night); scene.fog.far = lerp(330, 620, 1 - TOD.night);
  hemi.intensity = 0.38 + 1.05 * (1 - TOD.night);
  hemi.color.set(0xffffff).lerp(new THREE.Color(0x6f86d8), TOD.night * 0.8);
  sun.intensity = 1.9 * smooth(0.0, 0.3, e); sun.color.set(0xfff4e0).lerp(new THREE.Color(0xffb070), 1 - smooth(0.05, 0.5, e));
  moon.intensity = 0.55 * smooth(0, 0.35, -e);
  buildMat.emissiveIntensity = TOD.night * 1.15;
  lampMesh.material.color.set(0x777777).lerp(new THREE.Color(0xffe39a), smooth(0.3, 0.6, TOD.night));
  stars.material.opacity = smooth(0.35, 0.9, TOD.night);
  sunMesh.visible = e > -0.12; moonMesh.visible = e < 0.1;
  const hh = Math.floor(TOD.h) % 24, mm = Math.floor((TOD.h % 1) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function sunFollow(c) {
  sun.position.copy(c).addScaledVector(sunDir, 200); sun.target.position.copy(c);
  moon.position.set(c.x - sunDir.x * 150, 150, c.z - sunDir.z * 150); moon.target.position.copy(c);
  sunMesh.position.copy(camera.position).addScaledVector(sunDir, 1100); sunMesh.lookAt(camera.position);
  moonMesh.position.copy(camera.position).set(camera.position.x - sunDir.x * 1100, camera.position.y + Math.max(300, 800 * Math.abs(TOD.e)), camera.position.z - sunDir.z * 1100); moonMesh.lookAt(camera.position);
  stars.position.copy(camera.position);
}

// =====================================================================
//  PARTICLES
// =====================================================================
const PMAX = 700;
const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
pMesh.frustumCulled = false; scene.add(pMesh);
const parts = []; for (let k = 0; k < PMAX; k++) parts.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, g: 0, d: 0, c: new THREE.Color() });
const zeroM = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4(), qI = new THREE.Quaternion(), vS = new THREE.Vector3(), vP = new THREE.Vector3();
for (let k = 0; k < PMAX; k++) { pMesh.setMatrixAt(k, zeroM); pMesh.setColorAt(k, parts[k].c); }
let pNext = 0;
function emit(x, y, z, vx, vy, vz, life, size, color, grav = 0, drag = 0) {
  const p = parts[pNext]; pNext = (pNext + 1) % PMAX;
  p.life = p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = size; p.g = grav; p.d = drag; p.c.set(color);
}
function updateParticles(dt) {
  for (let k = 0; k < PMAX; k++) {
    const p = parts[k];
    if (p.life <= 0) { if (p.on) { pMesh.setMatrixAt(k, zeroM); p.on = false; } continue; }
    p.life -= dt; p.vy -= p.g * dt; const dr = Math.max(0, 1 - p.d * dt); p.vx *= dr; p.vz *= dr; p.vy *= (p.d ? dr : 1);
    p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
    const sc = p.s * (p.d ? 1 + (1 - p.life / p.max) * 1.4 : Math.min(1, p.life * 3));
    m4.compose(vP.set(p.x, p.y, p.z), qI, vS.set(sc, sc, sc)); pMesh.setMatrixAt(k, m4); pMesh.setColorAt(k, p.c); p.on = true;
  }
  pMesh.instanceMatrix.needsUpdate = true; if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}
function sparks(x, y, z, n = 10) { for (let k = 0; k < n; k++) emit(x, y, z, rr(-4, 4), rr(1, 5), rr(-4, 4), 0.5, 0.14, Math.random() < 0.5 ? 0xffd23f : 0xffffff, 12); }
function puff(x, y, z, n, color = 0xcfcfcf, spread = 1.2) { for (let k = 0; k < n; k++) emit(x + rr(-0.3, 0.3), y, z + rr(-0.3, 0.3), rr(-spread, spread), rr(0.6, 2), rr(-spread, spread), rr(0.6, 1.1), 0.5, color, 0, 1.2); }

// =====================================================================
//  AUDIO
// =====================================================================
const Snd = {
  ctx: null, on: SET.sound,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(ctx.destination);
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 700;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o1.connect(this.eFilter); this.o2.connect(this.eFilter); this.eFilter.connect(this.eGain); this.eGain.connect(this.master);
    this.o1.start(); this.o2.start();
    const len = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, len, ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.sSrc = ctx.createBufferSource(); this.sSrc.buffer = this.noise; this.sSrc.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2200; sf.Q.value = 5;
    this.sGain = ctx.createGain(); this.sGain.gain.value = 0; this.sSrc.connect(sf); sf.connect(this.sGain); this.sGain.connect(this.master); this.sSrc.start();
    this.hGain = ctx.createGain(); this.hGain.gain.value = 0; this.hGain.connect(this.master);
    for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(this.hGain); o.start(); }
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.8 : 0; },
  engine(rpm, gas, active) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.o1.frequency.setTargetAtTime(34 + rpm * 100, t, 0.05); this.o2.frequency.setTargetAtTime(17 + rpm * 50, t, 0.05);
    this.eFilter.frequency.setTargetAtTime(260 + rpm * 700 + gas * 350, t, 0.06);
    this.eGain.gain.setTargetAtTime(active ? 0.05 + 0.07 * gas + 0.03 * rpm : 0, t, 0.08);
  },
  skid(l) { if (this.ctx) this.sGain.gain.setTargetAtTime(l * 0.13, this.ctx.currentTime, 0.04); },
  horn(on) { if (this.ctx) this.hGain.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.015); },
  crash(v) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + v * 40;
    const g = ctx.createGain(); g.gain.setValueAtTime(clamp(v / 25, 0.1, 0.9), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.5);
  },
  tone(seq) {
    if (!this.ctx) return; const ctx = this.ctx; let t = ctx.currentTime;
    for (const [f, d, ty] of seq) {
      const o = ctx.createOscillator(); o.type = ty || 'square'; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
    }
  },
};

// =====================================================================
//  VEHICLE MODELS
// =====================================================================
const SPEC = {
  hatch: { len: 3.9, wid: 1.78, bh: 0.78, ch: 0.6, cl: 2.1, cz: -0.2, wz: 1.2, wr: 0.34 },
  sedan: { len: 4.6, wid: 1.84, bh: 0.74, ch: 0.58, cl: 2.4, cz: -0.25, wz: 1.45, wr: 0.35 },
  sport: { len: 4.5, wid: 1.96, bh: 0.56, ch: 0.48, cl: 1.9, cz: -0.25, wz: 1.4, wr: 0.36, spoiler: true },
  van:   { len: 5.2, wid: 2.0, bh: 1.0, ch: 1.0, cl: 3.7, cz: -0.55, wz: 1.6, wr: 0.4 },
  bus:   { len: 11, wid: 2.6, bh: 2.9, ch: 0, cl: 0, cz: 0, wz: 3.6, wr: 0.55, bus: true },
};
const darkM = new THREE.MeshLambertMaterial({ color: 0x222226 }), glassM = new THREE.MeshLambertMaterial({ color: 0x1b2837 });
const headM = new THREE.MeshBasicMaterial({ color: 0xfff2b8 }), hubM = new THREE.MeshLambertMaterial({ color: 0x9a9a9f });
const tailBase = new THREE.MeshBasicMaterial({ color: 0x8c1414 });
const signTex = texFrom(makeCanvas(64, 32, g => { g.fillStyle = '#ffe36a'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#111'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAXI', 32, 17); }));
const signM = new THREE.MeshBasicMaterial({ map: signTex });
const bx = (parent, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
function buildCar(kind, color, opts = {}) {
  const sp = SPEC[kind], root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bodyM = new THREE.MeshLambertMaterial({ color }), roofM = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, 0.06) });
  const tailM = opts.ownTail ? tailBase.clone() : tailBase;
  const y0 = 0.28;
  bx(body, sp.wid, sp.bh, sp.len, bodyM, 0, y0 + sp.bh / 2, 0);
  bx(body, sp.wid + 0.02, 0.2, 0.16, darkM, 0, y0 + 0.14, sp.len / 2); bx(body, sp.wid + 0.02, 0.2, 0.16, darkM, 0, y0 + 0.14, -sp.len / 2);
  let topY = y0 + sp.bh;
  if (sp.bus) {
    bx(body, sp.wid + 0.04, 0.95, sp.len - 1.4, glassM, 0, 1.95, -0.2);
    bx(body, sp.wid - 0.1, 0.12, sp.len - 0.2, roofM, 0, y0 + sp.bh + 0.06, 0);
    bx(body, sp.wid - 0.4, 0.9, 0.05, glassM, 0, 1.9, sp.len / 2 + 0.01);
    topY += 0.12;
  } else {
    bx(body, sp.wid - 0.14, sp.ch, sp.cl, glassM, 0, topY + sp.ch / 2, sp.cz);
    bx(body, sp.wid - 0.14, 0.07, sp.cl + 0.04, roofM, 0, topY + sp.ch + 0.035, sp.cz);
    topY += sp.ch + 0.07;
    bx(body, 0.1, 0.12, 0.3, darkM, sp.wid / 2 + 0.05, topY - sp.ch * 0.5, sp.cz + sp.cl / 2 - 0.1); bx(body, 0.1, 0.12, 0.3, darkM, -sp.wid / 2 - 0.05, topY - sp.ch * 0.5, sp.cz + sp.cl / 2 - 0.1);
  }
  if (sp.spoiler) { bx(body, sp.wid - 0.2, 0.08, 0.5, darkM, 0, topY - 0.1, -sp.len / 2 + 0.2); bx(body, 0.1, 0.35, 0.1, darkM, 0.6, topY - 0.28, -sp.len / 2 + 0.25); bx(body, 0.1, 0.35, 0.1, darkM, -0.6, topY - 0.28, -sp.len / 2 + 0.25); }
  if (opts.taxi) bx(body, 0.9, 0.26, 0.42, signM, 0, topY + 0.16, sp.cz);
  if (opts.stripe) bx(body, sp.wid + 0.02, 0.1, sp.len * 0.55, darkM, 0, y0 + sp.bh * 0.45, 0);
  const hy = y0 + sp.bh * 0.62;
  for (const s of [-1, 1]) {
    bx(body, 0.38, 0.17, 0.06, headM, s * (sp.wid / 2 - 0.32), hy, sp.len / 2 + 0.03);
    bx(body, sp.bus ? 0.5 : 0.38, 0.15, 0.06, tailM, s * (sp.wid / 2 - 0.32), hy, -sp.len / 2 - 0.03);
  }
  const wheels = [];
  for (const [sx, sz, fr] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
    const piv = new THREE.Group(); piv.position.set(sx * (sp.wid / 2 - 0.14), sp.wr, sz * sp.wz); root.add(piv);
    const wh = new THREE.Group(); piv.add(wh);
    bx(wh, 0.3, sp.wr * 2, sp.wr * 2, darkM, 0, 0, 0); bx(wh, 0.06, sp.wr * 0.9, sp.wr * 0.9, hubM, sx * 0.14, 0, 0); bx(wh, 0.06, sp.wr * 0.25, sp.wr * 1.4, hubM, sx * 0.14, 0, 0);
    wheels.push({ piv, wh, front: fr });
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, body, wheels, tailM, sp };
}

// =====================================================================
//  PLAYER
// =====================================================================
const P = { x: 0, z: 0, y: 0.18, vx: 0, vz: 0, th: 0, steer: 0, dmg: 0, hand: 0, slip: 0, car: null, lightsMode: 0, speed: 0, vf: 0, accel: 0, lat: 0, spin: 0, dist: 0, top: 0 };
const SPAWN = { x: lineAt(3) - 10.6, z: lineAt(3) + S / 2, th: 0 };
function mountPlayer() {
  if (P.car) scene.remove(P.car.root);
  const def = CARS[SET.car], col = def.fixed || COLORS[SET.color];
  P.car = buildCar(def.spec, col, { ownTail: true, taxi: def.taxi, stripe: SET.car === 'sport' });
  scene.add(P.car.root);
}
function placeOnRoad(x, z, th) {
  // snap to the nearest road lane aligned to heading
  const ax = lineDist(x), az = lineDist(z);
  let hx = Math.sin(th), hz = Math.cos(th);
  if (ax <= az) { const i = nearestLine(x), dz = hz >= 0 ? 1 : -1; P.x = lineAt(i) + (dz > 0 ? -LANE : LANE); P.z = clamp(z, -HALF, HALF); P.th = dz > 0 ? 0 : Math.PI; }
  else { const j = nearestLine(z), dx = hx >= 0 ? 1 : -1; P.z = lineAt(j) + (dx > 0 ? LANE : -LANE); P.x = clamp(x, -HALF, HALF); P.th = dx > 0 ? Math.PI / 2 : -Math.PI / 2; }
  P.vx = P.vz = 0; P.y = 0;
}

// =====================================================================
//  TRAFFIC
// =====================================================================
const TRAFFIC_MAX = 66;
const TCOL = ['#c0392b', '#2c6fbb', '#3a9a56', '#d8d8d8', '#2b2b2b', '#e08a1e', '#7d4fb3', '#e6e0c8', '#5d6b7a', '#b8325c'];
const traffic = [];
function makeTraffic() {
  for (let k = 0; k < TRAFFIC_MAX; k++) {
    const r = Math.random();
    const kind = r < 0.34 ? 'sedan' : r < 0.62 ? 'hatch' : r < 0.74 ? 'van' : r < 0.82 ? 'bus' : r < 0.88 ? 'sport' : 'sedan';
    const taxi = r >= 0.88;
    const color = kind === 'bus' ? '#d94a2b' : taxi ? '#f2c01e' : TCOL[(Math.random() * TCOL.length) | 0];
    const car = buildCar(kind, color, { taxi });
    const len = SPEC[kind].len, bus = kind === 'bus';
    const c = { car, kind, x: 0, z: 0, th: 0, v: 0, cruise: rr(10, 15) * (bus ? 0.8 : 1), i: 0, j: 0, d: 0, nd: -1, active: false, stuck: 0, ghost: 0,
      offs: bus ? [-4, -2, 0, 2, 4] : [-len * 0.3, 0, len * 0.3], rad: bus ? 1.35 : SPEC[kind].wid * 0.5, mass: bus ? 4 : kind === 'van' ? 1.6 : 1.2, spin: 0, len };
    car.root.visible = false; scene.add(car.root); traffic.push(c);
  }
}
const validDir = (i, j, k) => { const ni = i + DIRS[k][0], nj = j + DIRS[k][1]; return ni >= 0 && ni < N && nj >= 0 && nj < N; };
function spawnTraffic(c, far) {
  for (let tries = 0; tries < 40; tries++) {
    const i = (Math.random() * N) | 0, j = (Math.random() * N) | 0, k = (Math.random() * 4) | 0;
    if (!validDir(i, j, k)) continue;
    const d = DIRS[k], R = [-d[1], d[0]], t = rr(18, S - 22);
    const x = lineAt(i) + d[0] * t + R[0] * LANE, z = lineAt(j) + d[1] * t + R[1] * LANE;
    if (far && Math.hypot(x - P.x, z - P.z) < 70) continue;
    let bad = false; for (const o of traffic) if (o.active && o !== c && Math.hypot(o.x - x, o.z - z) < 14) { bad = true; break; }
    if (bad) continue;
    c.x = x; c.z = z; c.th = Math.atan2(d[0], d[1]); c.v = c.cruise * 0.6; c.i = i + d[0]; c.j = j + d[1]; c.d = k; c.nd = -1; c.bez = null; c.stuck = 0; c.ghost = 0; c.active = true; c.car.root.visible = true; return true;
  }
  c.active = false; c.car.root.visible = false; return false;
}
function setTrafficCount(n) {
  let a = 0;
  for (const c of traffic) {
    if (a < n) { if (!c.active) spawnTraffic(c, G.state === 'play'); if (c.active) a++; }
    else { c.active = false; c.car.root.visible = false; }
  }
}
function updateTraffic(dt, t) {
  for (const c of traffic) {
    if (!c.active) continue;
    const d = DIRS[c.d], R = [-d[1], d[0]];
    const bx0 = lineAt(c.i), bz0 = lineAt(c.j);
    const along = (bx0 - c.x) * d[0] + (bz0 - c.z) * d[1];
    if (c.nd < 0 && along < 46) {
      const opts = []; const back = (c.d + 2) % 4;
      for (const [k, wgt] of [[c.d, 6], [(c.d + 1) % 4, 2], [(c.d + 3) % 4, 2]]) if (validDir(c.i, c.j, k)) for (let w = 0; w < wgt; w++) opts.push(k);
      if (!opts.length) for (let k = 0; k < 4; k++) if (k !== back && validDir(c.i, c.j, k)) opts.push(k);
      c.nd = opts.length ? opts[(Math.random() * opts.length) | 0] : back;
    }
    // target speed
    let vT = c.cruise;
    const axis = d[0] ? 0 : 1;
    if (along > 13.8 && along < 70 && lightState(c.i, c.j, axis, t) !== 0) vT = Math.min(vT, Math.sqrt(2 * 5 * Math.max(0, along - 13.6)));
    if (c.nd >= 0 && c.nd !== c.d && along < 26) vT = Math.min(vT, c.nd === (c.d + 1) % 4 ? 6.5 : 7.5);
    // car following
    let blocked = false;
    if (c.ghost <= 0) {
      const fx = Math.sin(c.th), fz = Math.cos(c.th), rx = -fz, rz = fx;
      const check = (ox, oz, ov, olen) => {
        const dx = ox - c.x, dz = oz - c.z, fw = dx * fx + dz * fz, lat = dx * rx + dz * rz;
        if (fw > 0 && fw < 26 && Math.abs(lat) < 2.3) {
          const gap = fw - c.len / 2 - olen / 2 - 1.2;
          vT = Math.min(vT, Math.max(0, gap) * 1.1 + Math.max(0, ov) * 0.6); if (gap < 4) blocked = true;
        }
      };
      for (const o of traffic) if (o !== c && o.active) check(o.x, o.z, o.v, o.len);
      if (G.state === 'play') check(P.x, P.z, P.speed, 4.2);
    } else c.ghost -= dt;
    c.v += clamp(vT - c.v, -8 * dt, 3.6 * dt); if (c.v < 0) c.v = 0;
    // stuck handling
    if (c.v < 0.4 && blocked) c.stuck += dt; else if (c.v > 1) c.stuck = 0;
    if (c.stuck > 8) { c.ghost = 4; c.stuck = 0; }
    // steering: pure pursuit on the lane lines, Bezier arc through the junction when turning
    const turning = c.nd >= 0 && c.nd !== c.d;
    if (c.bez) {
      const bz = c.bez; bz.t += c.v * dt / bz.len;
      if (bz.t >= 1) {
        const nd = DIRS[c.nd]; c.x = bz.x2; c.z = bz.z2; c.th = Math.atan2(nd[0], nd[1]); c.d = c.nd; c.i += nd[0]; c.j += nd[1]; c.nd = -1; c.bez = null;
      } else {
        const t = bz.t, u = 1 - t;
        c.x = u * u * bz.x0 + 2 * u * t * bz.xc + t * t * bz.x2; c.z = u * u * bz.z0 + 2 * u * t * bz.zc + t * t * bz.z2;
        c.th = Math.atan2(2 * u * (bz.xc - bz.x0) + 2 * t * (bz.x2 - bz.xc), 2 * u * (bz.zc - bz.z0) + 2 * t * (bz.z2 - bz.zc));
      }
    } else {
      const look = clamp(c.v * 0.55 + 5, 5, 11);
      const ta = along - look;
      const tx = bx0 + R[0] * LANE - d[0] * ta, tz = bz0 + R[1] * LANE - d[1] * ta;
      const want = Math.atan2(tx - c.x, tz - c.z), diff = wrapA(want - c.th), rate = Math.max(c.v, 2.5) / 3.6;
      c.th += clamp(diff * 5, -rate, rate) * dt;
      c.x += Math.sin(c.th) * c.v * dt; c.z += Math.cos(c.th) * c.v * dt;
      if (turning && along <= 10) {
        const nd = DIRS[c.nd], nR = [-nd[1], nd[0]], left = c.nd !== (c.d + 1) % 4;
        const cxl = left ? bx0 + d[0] * LANE + R[0] * LANE : bx0 - d[0] * LANE + R[0] * LANE, czl = left ? bz0 + d[1] * LANE + R[1] * LANE : bz0 - d[1] * LANE + R[1] * LANE;
        const x2 = bx0 + nd[0] * 10 + nR[0] * LANE, z2 = bz0 + nd[1] * 10 + nR[1] * LANE;
        c.bez = { x0: c.x, z0: c.z, xc: cxl, zc: czl, x2, z2, t: 0, len: 0.8 * (Math.hypot(cxl - c.x, czl - c.z) + Math.hypot(x2 - cxl, z2 - czl)) };
      } else if (c.nd >= 0 && !turning) {
        if ((c.x - bx0) * d[0] + (c.z - bz0) * d[1] > 2.5) { c.i += d[0]; c.j += d[1]; c.nd = -1; }
      }
    }
    if (Math.abs(c.x) > LIM || Math.abs(c.z) > LIM || !onRoad(c.x, c.z) && c.stuck > 3) spawnTraffic(c, true);
    // visuals
    const r = c.car.root; r.position.set(c.x, 0, c.z); r.rotation.y = c.th;
    c.spin += c.v * dt / c.car.sp.wr;
    for (const w of c.car.wheels) w.wh.rotation.x = c.spin;
  }
}
function trafficHitsPlayer() {
  const def = CARS[SET.car], pc = P.car.sp.len * 0.3, pr = P.car.sp.wid * 0.5 - 0.05, fx = Math.sin(P.th), fz = Math.cos(P.th);
  for (const c of traffic) {
    if (!c.active || Math.hypot(c.x - P.x, c.z - P.z) > 8) continue;
    const cfx = Math.sin(c.th), cfz = Math.cos(c.th);
    let best = null;
    for (const po of [-pc, 0, pc]) for (const co of c.offs) {
      const ax = P.x + fx * po, az = P.z + fz * po, bx = c.x + cfx * co, bz = c.z + cfz * co;
      const dx = ax - bx, dz = az - bz, dd = Math.hypot(dx, dz), pen = pr + c.rad - dd;
      if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: dd > 1e-4 ? dx / dd : 1, nz: dd > 1e-4 ? dz / dd : 0 };
    }
    if (!best) continue;
    P.x += best.nx * best.pen * 0.7; P.z += best.nz * best.pen * 0.7; c.x -= best.nx * best.pen * 0.3; c.z -= best.nz * best.pen * 0.3;
    const tvx = cfx * c.v, tvz = cfz * c.v, rel = (P.vx - tvx) * best.nx + (P.vz - tvz) * best.nz;
    if (rel < 0) {
      const j = -(1.35) * rel / (1 + 1 / c.mass);
      P.vx += best.nx * j; P.vz += best.nz * j;
      c.v = Math.max(0, c.v + (-best.nx * j / c.mass) * cfx + (-best.nz * j / c.mass) * cfz);
      c.ghost = Math.max(c.ghost, 0); c.stuck = 0;
      onImpact(-rel, P.x - best.nx * pr, 0.8, P.z - best.nz * pr, 'car');
    }
  }
}

// =====================================================================
//  PEDESTRIANS
// =====================================================================
const PED_N = 110;
const pedBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 1.0, 0.34), new THREE.MeshLambertMaterial({ color: 0xffffff }), PED_N);
const pedHead = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), new THREE.MeshLambertMaterial({ color: 0xe0b48c }), PED_N);
pedBody.castShadow = true; scene.add(pedBody, pedHead);
const PCOL = ['#d62828', '#2a6fdb', '#2fa84f', '#f2c01e', '#f2f2f2', '#6b3fa0', '#ff7a1a', '#1f8a8a'];
const peds = [];
for (let k = 0; k < PED_N; k++) {
  const bi = Math.floor(Math.random() * (N - 1)), bj = Math.floor(Math.random() * (N - 1));
  peds.push({ cx: (bi + 0.5 - (N - 1) / 2) * S, cz: (bj + 0.5 - (N - 1) / 2) * S, s: Math.random() * 248, dir: Math.random() < 0.5 ? 1 : -1, sp: rr(1.0, 1.7), hide: 0, x: 0, z: 0, ph: Math.random() * 6 });
  pedBody.setColorAt(k, new THREE.Color(PCOL[(Math.random() * PCOL.length) | 0]));
}
function perim(s, H) {
  s = ((s % (8 * H)) + 8 * H) % (8 * H); const side = Math.floor(s / (2 * H)), t = s - side * 2 * H - H;
  return side === 0 ? [t, -H, 1, 0] : side === 1 ? [H, t, 0, 1] : side === 2 ? [-t, H, -1, 0] : [-H, -t, 0, -1];
}
const dummy = new THREE.Object3D();
function updatePeds(dt) {
  for (let k = 0; k < PED_N; k++) {
    const p = peds[k];
    if (p.hide > 0) { p.hide -= dt; dummy.position.set(0, -50, 0); dummy.scale.setScalar(0); dummy.updateMatrix(); pedBody.setMatrixAt(k, dummy.matrix); pedHead.setMatrixAt(k, dummy.matrix); continue; }
    p.s += p.dir * p.sp * dt;
    const q = perim(p.s, S / 2 - 9); p.x = p.cx + q[0]; p.z = p.cz + q[1];
    const bob = Math.abs(Math.sin(G.t * 6 + p.ph)) * 0.06;
    dummy.scale.setScalar(1); dummy.position.set(p.x, 0.18 + 0.9 + bob, p.z); dummy.rotation.y = Math.atan2(q[2] * p.dir, q[3] * p.dir); dummy.updateMatrix(); pedBody.setMatrixAt(k, dummy.matrix);
    dummy.position.y += 0.7; dummy.updateMatrix(); pedHead.setMatrixAt(k, dummy.matrix);
  }
  pedBody.instanceMatrix.needsUpdate = pedHead.instanceMatrix.needsUpdate = true; if (pedBody.instanceColor) pedBody.instanceColor.needsUpdate = true;
}
{ const c = new THREE.Color(0xe0b48c); for (let k = 0; k < PED_N; k++) pedHead.setColorAt(k, c); }

// =====================================================================
//  GAME STATE + INPUT
// =====================================================================
const G = { state: 'loading', t: 0, clock: 0, shake: 0, camMode: 0, camA: 0, msgT: 0, hudT: 0, lastFine: 0, speedingT: 0, speedCool: 0, prevState: null };
const M = { state: 'idle', cash: 0, jobs: 0, earned: 0, fines: 0, tLeft: 0, tTotal: 0, fare: 0, pickup: null, drop: null, hold: 0, clean: true, dist: 0, startAt: 0 };
const keys = {};
const touch = { left: false, right: false, gas: false, brake: false, hand: false };
function readInput() {
  let gas = (keys.KeyW || keys.ArrowUp || touch.gas) ? 1 : 0, brake = (keys.KeyS || keys.ArrowDown || touch.brake) ? 1 : 0;
  let steer = ((keys.KeyD || keys.ArrowRight || touch.right) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft || touch.left) ? 1 : 0);
  let hand = (keys.Space || touch.hand) ? 1 : 0;
  const gp = navigator.getGamepads && navigator.getGamepads()[0];
  if (gp) {
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = ax;
    const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    if (rt > 0.05) gas = rt; if (lt > 0.05) brake = lt; if (gp.buttons[0] && gp.buttons[0].pressed) hand = 1;
  }
  return { gas, brake, steer, hand };
}
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; keys[e.code] = true;
  if (G.state === 'play') {
    if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % 3; $('camName').textContent = ['CHASE CAM', 'HOOD CAM', 'SKY CAM'][G.camMode]; }
    else if (e.code === 'KeyL') { P.lightsMode = (P.lightsMode + 1) % 3; }
    else if (e.code === 'KeyN') { TOD.cycle = false; TOD.h = (Math.floor(TOD.h / 6) * 6 + 6) % 24; toast('Time: ' + applyTod()); }
    else if (e.code === 'KeyR') resetCar(false);
    else if (e.code === 'KeyJ' && SET.mode === 'taxi') { newJob(); toast('New fare requested'); }
    else if (e.code === 'Escape' || e.code === 'KeyP') pause(true);
  } else if (G.state === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) pause(false);
});
addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { for (const k in keys) keys[k] = false; if (G.state === 'play') pause(true); } });
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); if (k === 'pause') { pause(true); return; } touch[k] = true; b.classList.add('on'); };
  const off = e => { e.preventDefault(); if (k !== 'pause') { touch[k] = false; b.classList.remove('on'); } };
  b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off, { passive: false }); b.addEventListener('touchcancel', off, { passive: false });
  b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
});
if (isTouch) document.body.classList.add('touch');

// ---------- HUD helpers ----------
let titleTimer = 0;
function title(main, sub = '', color = '#fff', dur = 1.8) { $('tMain').textContent = main; $('tMain').style.color = color; $('tSub').textContent = sub; $('title').style.opacity = 1; titleTimer = dur; }
function toast(text, color = '#fff') { const d = document.createElement('div'); d.textContent = text; d.style.color = color; $('toast').appendChild(d); setTimeout(() => d.remove(), 2800); while ($('toast').children.length > 4) $('toast').firstChild.remove(); }
function flash(a = 0.35) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = 0; }); }

// =====================================================================
//  MISSIONS (taxi shift)
// =====================================================================
function beaconMesh(color) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.BoxGeometry(3.2, 70, 3.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  col.position.y = 35; g.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
  const man = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.4), new THREE.MeshBasicMaterial({ color })); man.position.y = 0.95; man.name = 'man'; g.add(man);
  g.visible = false; scene.add(g); return g;
}
const bPick = beaconMesh(0x3fa7ff), bDrop = beaconMesh(0x55ff55);
function streetPoint(minD, maxD) {
  for (let tries = 0; tries < 80; tries++) {
    let x, z, name;
    if (Math.random() < 0.5) { const i = (Math.random() * N) | 0, j = (Math.random() * (N - 1)) | 0; x = lineAt(i) + (Math.random() < 0.5 ? LANE : -LANE); z = lineAt(j) + S / 2 + rr(-14, 14); name = `${AVE[i]} near ${STR[j + 1]}`; }
    else { const j = (Math.random() * N) | 0, i = (Math.random() * (N - 1)) | 0; z = lineAt(j) + (Math.random() < 0.5 ? LANE : -LANE); x = lineAt(i) + S / 2 + rr(-14, 14); name = `${STR[j]} near ${AVE[i + 1]}`; }
    const d = Math.hypot(x - P.x, z - P.z); if (d >= minD && d <= maxD) return { x, z, name };
  }
  return { x: lineAt(2), z: lineAt(2) + S / 2, name: 'Oak Ave near 3rd St' };
}
function newJob() {
  M.pickup = streetPoint(90, 320); M.drop = null; M.state = 'pickup'; M.hold = 0; M.clean = true;
  bPick.position.set(M.pickup.x, 0.18, M.pickup.z); bPick.visible = true; bDrop.visible = false;
}
function startRide() {
  M.state = 'drive'; M.drop = streetPoint(160, 520);
  const dist = Math.hypot(M.drop.x - M.pickup.x, M.drop.z - M.pickup.z);
  M.fare = Math.round(14 + dist * 0.22); M.tTotal = M.tLeft = 22 + dist / 8.5; M.dist = dist;
  bPick.visible = false; bDrop.position.set(M.drop.x, 0.18, M.drop.z); bDrop.visible = true;
  Snd.tone([[660, 0.09], [880, 0.14]]); toast('Passenger on board!', '#9fd8ff'); title('PASSENGER ABOARD', M.drop.name, '#9fd8ff', 2.2);
}
function endRide(ok) {
  if (ok) {
    const bonus = Math.round(M.tLeft * 0.55) + (M.clean ? 12 : 0), total = M.fare + bonus;
    M.cash += total; M.earned += total; M.jobs++; P.dmg = Math.max(0, P.dmg - 25);
    Snd.tone([[880, 0.08], [1175, 0.08], [1568, 0.2]]);
    title('FARE COMPLETE', `+$${total}` + (M.clean ? '  (smooth ride +$12)' : ''), '#aef58f', 2.4); toast(`+$${total} fare`, '#aef58f');
  } else {
    M.cash -= 25; M.fines += 25; Snd.tone([[300, 0.14, 'sawtooth'], [200, 0.25, 'sawtooth']]); title('TOO SLOW', 'Passenger left. -$25', '#ff7a7a', 2.2); flash(0.3);
  }
  newJob();
}
function fine(amount, reason) {
  if (SET.mode !== 'taxi') return;
  M.cash -= amount; M.fines += amount; M.clean = false; G.lastFine = G.t;
  toast(`${reason}  -$${amount}`, '#ff7a7a'); flash(0.28); Snd.tone([[240, 0.12, 'sawtooth'], [180, 0.18, 'sawtooth']]);
}
function updateMission(dt) {
  if (SET.mode !== 'taxi') return;
  const target = M.state === 'pickup' ? M.pickup : M.state === 'drive' ? M.drop : null;
  if (!target) return;
  const dd = Math.hypot(P.x - target.x, P.z - target.z);
  if (M.state === 'drive') { M.tLeft -= dt; if (M.tLeft <= 0) { endRide(false); return; } }
  if (dd < 7 && P.speed < 2.6) {
    M.hold += dt; $('hold').classList.remove('hidden'); $('holdTxt').textContent = M.state === 'pickup' ? 'Picking up...' : 'Dropping off...'; $('holdFill').style.width = clamp(M.hold / 1.1, 0, 1) * 100 + '%';
    if (M.hold >= 1.1) { M.hold = 0; $('hold').classList.add('hidden'); if (M.state === 'pickup') startRide(); else endRide(true); }
  } else { M.hold = Math.max(0, M.hold - dt * 2); $('hold').classList.add('hidden'); }
}

// =====================================================================
//  PLAYER PHYSICS
// =====================================================================
function resolveRect(cx, cz, r, k) {
  const px = clamp(cx, k.x0, k.x1), pz = clamp(cz, k.z0, k.z1);
  let dx = cx - px, dz = cz - pz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); return { nx: dx / d, nz: dz / d, pen: r - d }; }
  const l = cx - k.x0, rt = k.x1 - cx, t = cz - k.z0, b = k.z1 - cz, m = Math.min(l, rt, t, b);
  if (m === l) return { nx: -1, nz: 0, pen: l + r }; if (m === rt) return { nx: 1, nz: 0, pen: rt + r };
  if (m === t) return { nx: 0, nz: -1, pen: t + r }; return { nx: 0, nz: 1, pen: b + r };
}
let impactCool = 0;
function onImpact(v, x, y, z, kind) {
  if (v < 2.2) return;
  G.shake = Math.max(G.shake, clamp(v / 18, 0.15, 1)); Snd.crash(v);
  sparks(x, y, z, Math.min(18, 4 + v | 0));
  if (impactCool > 0) return; impactCool = 0.35;
  P.dmg = clamp(P.dmg + v * 0.85, 0, 100);
  if (v > 6) { flash(0.18); }
  if (kind === 'car' && v > 3.5) fine(20, 'COLLISION');
  if (P.dmg >= 100) wreck();
}
function wreck() {
  title('WRECKED!', SET.mode === 'taxi' ? 'Tow fee -$100' : 'Car repaired', '#ff5555', 2.4);
  if (SET.mode === 'taxi') { M.cash -= 100; M.fines += 100; }
  puff(P.x, 1, P.z, 24, 0x555555, 4); P.dmg = 0; resetCar(true);
}
function resetCar(silent) {
  placeOnRoad(P.x, P.z, P.th); P.steer = 0; P.slip = 0;
  if (!silent) toast('Back on the road');
}
function updatePlayer(dt, inp) {
  const def = CARS[SET.car], dmgF = 1 - 0.4 * clamp(P.dmg / 100, 0, 1);
  const vmax = def.vmax * dmgF;
  const sn = Math.sin(P.th), cs = Math.cos(P.th), fx = sn, fz = cs, rx = -cs, rz = sn;
  let vf = P.vx * fx + P.vz * fz, vr = P.vx * rx + P.vz * rz;
  const sp = Math.abs(vf), off = !onRoad(P.x, P.z);
  P.hand += (inp.hand - P.hand) * Math.min(1, dt * 12);
  let a = 0;
  if (inp.gas > 0) a += vf < -0.8 ? 15 * inp.gas : def.acc * inp.gas * Math.max(0, 1 - Math.pow(Math.max(vf, 0) / vmax, 2.4));
  if (inp.brake > 0) a += vf > 0.8 ? -17 * inp.brake : (vf > -11 ? -6.5 * inp.brake : 0);
  const accelStr = a;
  vf += a * dt;
  let res = 0.3 + 0.0011 * vf * vf + (off ? 3.2 : 0) + P.hand * 4.5 + (inp.gas === 0 && inp.brake === 0 ? 1.3 : 0);
  if (inp.brake > 0 && vf > 0.8) res = 0;
  const mv = res * dt; vf = Math.abs(vf) <= mv ? 0 : vf - Math.sign(vf) * mv;
  const grip = def.grip * (1 - 0.82 * P.hand) * (sp < 3 ? 1.6 : 1);
  vr *= Math.exp(-grip * dt);
  // steering
  const dmax = def.steer / (1 + Math.pow(sp / 8, 1.6));
  P.steer += (inp.steer - P.steer) * Math.min(1, dt * (inp.steer !== 0 ? 7 : 10));
  const L = P.car.sp.wz * 2;
  let yaw = -(vf / L) * Math.tan(P.steer * dmax) * (1 + 0.45 * P.hand);
  const cap = (13 + P.hand * 6) / Math.max(sp, 1.5); yaw = clamp(yaw, -cap, cap);
  // recompose world velocity (world vector persists across the heading change => slip)
  P.vx = fx * vf + rx * vr; P.vz = fz * vf + rz * vr;
  P.th += yaw * dt;
  P.x += P.vx * dt; P.z += P.vz * dt;
  // collisions: buildings / poles / trees
  const pc = P.car.sp.len * 0.3, pr = P.car.sp.wid * 0.5 - 0.04, nfx = Math.sin(P.th), nfz = Math.cos(P.th);
  for (let pass = 0; pass < 2; pass++) for (const po of [pc, 0, -pc]) {
    const cx = P.x + nfx * po, cz = P.z + nfz * po;
    const k0 = Math.floor((cx - 2) / CELL), k1 = Math.floor((cx + 2) / CELL), l0 = Math.floor((cz - 2) / CELL), l1 = Math.floor((cz + 2) / CELL);
    for (let a0 = k0; a0 <= k1; a0++) for (let b0 = l0; b0 <= l1; b0++) {
      const list = colMap.get(ck(a0, b0)); if (!list) continue;
      for (const k of list) {
        const h = resolveRect(P.x + nfx * po, P.z + nfz * po, pr, k); if (!h) continue;
        P.x += h.nx * h.pen; P.z += h.nz * h.pen;
        const vn = P.vx * h.nx + P.vz * h.nz;
        if (vn < 0) { P.vx -= h.nx * vn * 1.25; P.vz -= h.nz * vn * 1.25; P.vx *= 0.97; P.vz *= 0.97; onImpact(-vn, P.x - h.nx * pr, 0.7, P.z - h.nz * pr, 'wall'); }
        else { P.vx *= 1 - dt * 1.5; P.vz *= 1 - dt * 1.5; }
      }
    }
  }
  if (Math.abs(P.x) > LIM) { P.x = Math.sign(P.x) * LIM; P.vx *= -0.3; } if (Math.abs(P.z) > LIM) { P.z = Math.sign(P.z) * LIM; P.vz *= -0.3; }
  trafficHitsPlayer();
  // pedestrians
  if (P.speed > 3) for (const p of peds) if (p.hide <= 0 && Math.abs(p.x - P.x) < 2.2 && Math.abs(p.z - P.z) < 2.2 && Math.hypot(p.x - P.x, p.z - P.z) < 1.5) {
    p.hide = 18; puff(p.x, 1, p.z, 10, 0xffe0b0, 3); Snd.crash(10); G.shake = 0.5; P.vx *= 0.85; P.vz *= 0.85; fine(150, 'PEDESTRIAN HIT'); if (SET.mode !== 'taxi') toast('Watch the sidewalk!', '#ffb0b0');
  }
  // derived
  const nvf = P.vx * nfx + P.vz * nfz, nvr = P.vx * -nfz + P.vz * nfx;
  P.accel += (accelStr - P.accel) * Math.min(1, dt * 6);
  P.lat += ((-yaw * nvf) - P.lat) * Math.min(1, dt * 6);
  P.vf = nvf; P.speed = Math.hypot(P.vx, P.vz); P.slip = Math.abs(nvr);
  P.dist += P.speed * dt; P.top = Math.max(P.top, P.speed);
  P.spin += nvf * dt / P.car.sp.wr;
  P.y += (groundH(P.x, P.z) - P.y) * Math.min(1, dt * 14);
  impactCool = Math.max(0, impactCool - dt);
}

// ---------- rules ----------
let lastNode = null;
function updateRules(dt) {
  if (SET.mode !== 'taxi') return;
  const kmh = P.speed * 3.6;
  // speeding
  G.speedCool = Math.max(0, G.speedCool - dt);
  if (kmh > 78) { G.speedingT += dt; if (G.speedingT > 2.2 && G.speedCool <= 0) { fine(30, 'SPEEDING'); G.speedCool = 9; G.speedingT = 0; } } else G.speedingT = Math.max(0, G.speedingT - dt);
  // red lights: when entering an intersection box
  const i = nearestLine(P.x), j = nearestLine(P.z), dx = P.x - lineAt(i), dz = P.z - lineAt(j);
  const inside = onRoad(P.x, P.z) && Math.abs(dx) < RHW && Math.abs(dz) < RHW;
  const key = inside ? i * 10 + j : null;
  if (key !== null && key !== lastNode) {
    const axis = Math.abs(P.vx) > Math.abs(P.vz) ? 0 : 1;
    if (kmh > 14 && lightState(i, j, axis, G.clock) === 2) fine(50, 'RED LIGHT');
  }
  lastNode = key;
}

// =====================================================================
//  CAMERA
// =====================================================================
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const sp = P.speed;
  G.camA += wrapA(P.th - G.camA) * Math.min(1, dt * (G.camMode === 1 ? 14 : 4.2));
  const ca = G.camA, f = [Math.sin(ca), Math.cos(ca)], yb = P.y;
  let fov = 62 + Math.min(sp, 50) * 0.28;
  if (G.camMode === 0) {
    const d = 7.4 + sp * 0.05;
    camera.position.set(P.x - f[0] * d, yb + 3.0 + sp * 0.012, P.z - f[1] * d);
    camLook.set(P.x + f[0] * 5, yb + 1.3, P.z + f[1] * 5);
  } else if (G.camMode === 1) {
    const pf = [Math.sin(P.th), Math.cos(P.th)];
    camera.position.set(P.x - pf[0] * 0.2, yb + 1.42, P.z - pf[1] * 0.2);
    camLook.set(P.x + pf[0] * 30, yb + 1.5, P.z + pf[1] * 30); fov += 8;
  } else {
    const d = 14;
    camera.position.set(P.x - f[0] * d, yb + 34, P.z - f[1] * d);
    camLook.set(P.x + f[0] * 4, yb, P.z + f[1] * 4);
  }
  if (G.shake > 0) { camera.position.x += rr(-1, 1) * G.shake * 0.35; camera.position.y += rr(-1, 1) * G.shake * 0.25; G.shake = Math.max(0, G.shake - dt * 2.4); }
  camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 4)); camera.updateProjectionMatrix();
  camera.position.y = Math.max(camera.position.y, 0.6);
  camera.lookAt(camLook);
}
function menuCamera(dt) {
  G.camA += dt * 0.28;
  camera.position.set(P.x + Math.cos(G.camA) * 11, P.y + 5.2, P.z + Math.sin(G.camA) * 11);
  camLook.set(P.x, P.y + 0.6, P.z); camera.lookAt(camLook);
  camera.fov = 52;
  if (innerWidth > 900) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.27, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// =====================================================================
//  MINIMAP
// =====================================================================
const MAPW = 1024, MK = MAPW / (2 * (HALF + S));
const mapBase = makeCanvas(MAPW, MAPW, g => {
  g.fillStyle = '#2d3a2a'; g.fillRect(0, 0, MAPW, MAPW);
  const X = x => (x + HALF + S) * MK;
  g.fillStyle = '#5a5f66';
  for (let bi = -1; bi < N; bi++) for (let bj = -1; bj < N; bj++) { const cx = (bi + 0.5 - (N - 1) / 2) * S, cz = (bj + 0.5 - (N - 1) / 2) * S; g.fillRect(X(cx - 33), X(cz - 33), 66 * MK, 66 * MK); }
  g.fillStyle = '#9aa0aa'; for (const r of bldRects) g.fillRect(X(r[0]), X(r[2]), (r[1] - r[0]) * MK, (r[3] - r[2]) * MK);
  g.fillStyle = '#3f8a3a'; for (const r of parkRects) g.fillRect(X(r[0]), X(r[2]), (r[1] - r[0]) * MK, (r[3] - r[2]) * MK);
  g.fillStyle = '#20232a';
  for (let i = 0; i < N; i++) { g.fillRect(X(lineAt(i) - RHW), X(-HALF - RHW), 14 * MK, (2 * HALF + 14) * MK); g.fillRect(X(-HALF - RHW), X(lineAt(i) - RHW), (2 * HALF + 14) * MK, 14 * MK); }
  g.fillStyle = '#d8c25a';
  for (let i = 0; i < N; i++) { g.fillRect(X(lineAt(i)) - 1, X(-HALF - RHW), 2, (2 * HALF + 14) * MK); g.fillRect(X(-HALF - RHW), X(lineAt(i)) - 1, (2 * HALF + 14) * MK, 2); }
});
const mapG = $('map').getContext('2d');
function drawMap() {
  const zoom = 0.62, W = 176;
  mapG.save(); mapG.clearRect(0, 0, W, W); mapG.fillStyle = '#111'; mapG.fillRect(0, 0, W, W);
  mapG.translate(W / 2, W / 2); mapG.rotate(P.th + Math.PI); mapG.scale(zoom, zoom);
  const px = (P.x + HALF + S) * MK, pz = (P.z + HALF + S) * MK;
  mapG.drawImage(mapBase, -px, -pz);
  const dot = (x, z, c, r) => { mapG.fillStyle = c; mapG.beginPath(); mapG.arc((x + HALF + S) * MK - px, (z + HALF + S) * MK - pz, r, 0, 7); mapG.fill(); };
  mapG.fillStyle = '#ff6a4a'; for (const c of traffic) if (c.active && Math.abs(c.x - P.x) < 150 && Math.abs(c.z - P.z) < 150) mapG.fillRect((c.x + HALF + S) * MK - px - 1.5, (c.z + HALF + S) * MK - pz - 1.5, 3, 3);
  const tg = M.state === 'pickup' ? M.pickup : M.state === 'drive' ? M.drop : null;
  if (SET.mode === 'taxi' && tg) {
    let dx = tg.x - P.x, dz = tg.z - P.z; const d = Math.hypot(dx, dz), lim = 70 / zoom / MK;
    if (d > lim) { dx *= lim / d; dz *= lim / d; }
    dot(P.x + dx, P.z + dz, M.state === 'pickup' ? '#3fa7ff' : '#55ff55', 7 / zoom * 0.7);
  }
  mapG.restore();
  mapG.save(); mapG.translate(W / 2, W / 2); mapG.fillStyle = '#fff'; mapG.strokeStyle = '#000'; mapG.lineWidth = 2;
  mapG.beginPath(); mapG.moveTo(0, -8); mapG.lineTo(6, 7); mapG.lineTo(0, 3); mapG.lineTo(-6, 7); mapG.closePath(); mapG.fill(); mapG.stroke(); mapG.restore();
}

// =====================================================================
//  HUD UPDATE
// =====================================================================
function gearInfo(def) {
  const kmh = P.speed * 3.6, top = def.vmax * 3.6;
  if (P.vf < -0.6) return { g: 'R', rpm: clamp(0.25 + Math.abs(P.vf) / 12, 0, 1) };
  if (kmh < 1.5) return { g: 'N', rpm: 0.12 };
  const n = 6, gi = Math.min(n - 1, Math.floor((kmh / top) * 1.15 * n)), lo = gi / (n * 1.15) * top, hi = (gi + 1) / (n * 1.15) * top;
  return { g: String(gi + 1), rpm: clamp(0.3 + 0.7 * (kmh - lo) / (hi - lo), 0, 1) };
}
let rpmSmooth = 0.1;
function updateHUD(dt) {
  const def = CARS[SET.car], gi = gearInfo(def);
  rpmSmooth += (gi.rpm - rpmSmooth) * Math.min(1, dt * 12);
  const kmh = P.speed * 3.6;
  $('spd').firstChild.nodeValue = Math.round(kmh); $('gear').textContent = gi.g;
  $('rpmFill').style.width = rpmSmooth * 100 + '%'; $('dmgFill').style.width = P.dmg + '%';
  $('limit').classList.toggle('over', SET.mode === 'taxi' && kmh > 70);
  G.hudT -= dt;
  if (G.hudT > 0) return; G.hudT = 0.12;
  $('cash').textContent = (M.cash < 0 ? '-$' : '$') + Math.abs(Math.round(M.cash)); $('cash').classList.toggle('neg', M.cash < 0);
  $('cash').style.display = SET.mode === 'taxi' ? '' : 'none';
  $('clock').textContent = clockStr;
  $('lights').textContent = 'HEADLIGHTS: ' + ['AUTO', 'ON', 'OFF'][P.lightsMode];
  const ms = $('mission'), aw = $('arrowWrap');
  if (SET.mode !== 'taxi') { ms.innerHTML = ''; aw.classList.add('hidden'); return; }
  const tg = M.state === 'pickup' ? M.pickup : M.state === 'drive' ? M.drop : null;
  if (!tg) { ms.innerHTML = ''; aw.classList.add('hidden'); return; }
  if (M.state === 'pickup') ms.innerHTML = `<span class="t">PICK UP FARE</span><br><span class="d">${tg.name}</span><br>Stop on the blue marker`;
  else ms.innerHTML = `<span class="t">DROP OFF &middot; $${M.fare}</span><br><span class="d">${tg.name}</span><div id="mbar"><div id="mbarFill" style="width:${clamp(M.tLeft / M.tTotal, 0, 1) * 100}%;background:${M.tLeft < 12 ? '#ff5a3c' : '#ffd23f'}"></div></div>${Math.ceil(M.tLeft)}s left`;
  aw.classList.remove('hidden');
  const dx = tg.x - P.x, dz = tg.z - P.z, f = dx * Math.sin(P.th) + dz * Math.cos(P.th), r = dx * -Math.cos(P.th) + dz * Math.sin(P.th);
  $('arrow').style.transform = `rotate(${Math.atan2(r, f)}rad)`; $('dist').textContent = Math.round(Math.hypot(dx, dz)) + ' m';
}

// =====================================================================
//  FLOW
// =====================================================================
function showScreen(id) { for (const s of ['menu', 'pause', 'results']) $(s).classList.toggle('hidden', s !== id); }
function showMenu() {
  G.state = 'menu'; showScreen('menu'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  P.x = SPAWN.x; P.z = SPAWN.z; P.th = SPAWN.th; P.vx = P.vz = 0; P.y = 0.18; P.dmg = 0; P.speed = 0; bPick.visible = bDrop.visible = false; M.state = 'idle';
  if (P.car) P.car.root.visible = true;
  setTime(SET.time); setTrafficCount(TRAFFIC[SET.traffic][1]); Snd.skid(0); Snd.engine(0, 0, false); Snd.horn(false);
}
function start() {
  if (isTouch) setTimeout(() => { try { const r = document.documentElement; (r.requestFullscreen ? r.requestFullscreen() : Promise.reject()).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {}); } catch {} }, 600);
  Snd.init(); if (Snd.ctx) Snd.ctx.resume();
  showScreen(null); $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  placeOnRoad(SPAWN.x + 10.6 - LANE, SPAWN.z, 0); P.vx = P.vz = 0; P.dmg = 0; P.dist = 0; P.top = 0; P.steer = 0; P.lightsMode = 0; G.camMode = 0; G.camA = P.th; $('camName').textContent = 'CHASE CAM';
  Object.assign(M, { state: 'idle', cash: 0, jobs: 0, earned: 0, fines: 0 }); G.speedingT = 0; G.speedCool = 0; lastNode = null;
  camera.clearViewOffset(); G.state = 'play';
  setTrafficCount(0); setTrafficCount(TRAFFIC[SET.traffic][1]);
  if (SET.mode === 'taxi') { newJob(); title('TAXI SHIFT', 'Find the blue marker. Obey the lights!', '#ffd23f', 2.8); }
  else title('BLOCK CITY', 'Free drive. Take your time.', '#fff', 2.2);
}
function pause(on) {
  if (on && G.state === 'play') { G.state = 'pause'; showScreen('pause'); $('btnEnd').classList.toggle('hidden', SET.mode !== 'taxi'); Snd.engine(0, 0, false); Snd.skid(0); Snd.horn(false); }
  else if (!on && G.state === 'pause') { G.state = 'play'; showScreen(null); }
}
function endShift() {
  G.state = 'results'; showScreen('results'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); bPick.visible = bDrop.visible = false;
  let best = 0; try { best = +localStorage.getItem('blockcity.best') || 0; if (M.cash > best) { best = M.cash; localStorage.setItem('blockcity.best', String(Math.round(best))); } } catch {}
  $('resStats').innerHTML = `Fares completed: <b>${M.jobs}</b><br>Earned: <b>$${Math.round(M.earned)}</b><br>Fines &amp; fees: <b style="color:#ff7a7a">-$${Math.round(M.fines)}</b><br>Take-home: <b>$${Math.round(M.cash)}</b> &nbsp;(best $${Math.round(best)})<br>Distance: <b>${(P.dist / 1000).toFixed(1)} km</b> &nbsp; Top speed: <b>${Math.round(P.top * 3.6)} km/h</b>`;
}

// ---------- menu UI ----------
function renderCars() {
  const el = $('cars'); el.innerHTML = '';
  for (const [id, c] of Object.entries(CARS)) {
    const d = document.createElement('div'); d.className = 'car' + (id === SET.car ? ' sel' : '');
    d.innerHTML = `<b>${c.name}</b>${c.desc.replace('\n', '<br>')}<br>Top ${Math.round(c.vmax * 3.6)} km/h`;
    d.onclick = () => { SET.car = id; saveSet(); renderCars(); renderColors(); mountPlayer(); };
    el.appendChild(d);
  }
}
function renderColors() {
  const el = $('colors'); el.innerHTML = '';
  if (CARS[SET.car].fixed) { el.innerHTML = '<span style="font-size:8px;color:#ccc">Cab yellow only</span>'; return; }
  COLORS.forEach((c, k) => { const d = document.createElement('div'); d.className = 'sw' + (k === SET.color ? ' on' : ''); d.style.background = c; d.onclick = () => { SET.color = k; saveSet(); renderColors(); mountPlayer(); }; el.appendChild(d); });
}
function renderBtns() {
  $('btnMode').textContent = 'Mode: ' + MODES.find(m => m[0] === SET.mode)[1];
  $('btnTime').textContent = 'Time: ' + TIMES.find(m => m[0] === SET.time)[1];
  $('btnTraffic').textContent = 'Traffic: ' + TRAFFIC[SET.traffic][0];
  $('btnShadow').textContent = 'Shadows: ' + (SET.shadow ? 'ON' : 'OFF');
  $('btnSound').textContent = 'Sound: ' + (SET.sound ? 'ON' : 'OFF');
}
$('btnStart').onclick = start;
$('btnMode').onclick = () => { SET.mode = SET.mode === 'free' ? 'taxi' : 'free'; saveSet(); renderBtns(); };
$('btnTime').onclick = () => { const k = TIMES.findIndex(t => t[0] === SET.time); SET.time = TIMES[(k + 1) % TIMES.length][0]; setTime(SET.time); saveSet(); renderBtns(); };
$('btnTraffic').onclick = () => { SET.traffic = (SET.traffic + 1) % TRAFFIC.length; setTrafficCount(TRAFFIC[SET.traffic][1]); saveSet(); renderBtns(); };
$('btnShadow').onclick = () => { SET.shadow = !SET.shadow; renderer.shadowMap.enabled = SET.shadow; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); saveSet(); renderBtns(); };
$('btnSound').onclick = () => { SET.sound = !SET.sound; Snd.setOn(SET.sound); saveSet(); renderBtns(); };
$('btnResume').onclick = () => pause(false);
$('btnEnd').onclick = endShift;
$('btnQuit').onclick = showMenu;
$('btnAgain').onclick = () => { showMenu(); start(); };
$('btnTitle').onclick = showMenu;

// =====================================================================
//  MAIN LOOP
// =====================================================================
let last = performance.now(), clockStr = '08:00';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'loading') return;
  G.t += dt; G.clock += dt;
  if (G.state !== 'pause' && G.state !== 'results') { if (TOD.cycle) TOD.h = (TOD.h + dt * 24 / 720) % 24; }
  clockStr = applyTod();
  updateSignals(G.clock);
  const running = G.state !== 'pause';
  if (running) { updateTraffic(dt, G.clock); updatePeds(dt); }
  for (const c of clouds) { c.position.x += dt * 3; if (c.position.x > 800) c.position.x = -800; }
  const def = CARS[SET.car];
  if (G.state === 'play') {
    const inp = readInput();
    const steps = dt > 0.026 ? 2 : 1; for (let s = 0; s < steps; s++) updatePlayer(dt / steps, inp);
    updateRules(dt); updateMission(dt);
    // smoke / skid
    const sk = clamp((P.slip - 3.2) / 6, 0, 1) * (P.speed > 4 ? 1 : 0);
    Snd.skid(sk); if (sk > 0.2 && Math.random() < sk * 0.8) { const sn = Math.sin(P.th), cs = Math.cos(P.th); for (const s of [-0.8, 0.8]) emit(P.x - sn * 1.3 + -cs * s, 0.25, P.z - cs * 1.3 + sn * s, rr(-0.5, 0.5), rr(0.4, 1), rr(-0.5, 0.5), 0.7, 0.4, 0xdedede, 0, 1.4); }
    if (P.dmg > 55 && Math.random() < (P.dmg - 50) / 160) puff(P.x + Math.sin(P.th) * 1.6, 1.0, P.z + Math.cos(P.th) * 1.6, 1, P.dmg > 80 ? 0x303030 : 0x9a9a9a, 0.5);
    const gi = gearInfo(def); Snd.engine(gi.rpm, readInput().gas, true);
    const horn = !!(keys.KeyH); Snd.horn(horn);
    updateCamera(dt); updateHUD(dt);
    if (titleTimer > 0) { titleTimer -= dt; if (titleTimer <= 0) $('title').style.opacity = 0; }
    if (G.t % 0.1 < dt) drawMap();
  } else if (G.state === 'menu' || G.state === 'results') menuCamera(dt);
  // player model
  if (P.car) {
    const r = P.car.root; r.position.set(P.x, P.y, P.z); r.rotation.y = P.th;
    P.car.body.rotation.z = clamp(-P.lat * 0.0042, -0.07, 0.07); P.car.body.rotation.x = clamp(-P.accel * 0.0032 - 0, -0.05, 0.05);
    for (const w of P.car.wheels) { w.wh.rotation.x = P.spin; if (w.front) w.piv.rotation.y = -P.steer * 0.35; }
    const braking = G.state === 'play' && (keys.KeyS || keys.ArrowDown || touch.brake) && P.vf > 0.8;
    P.car.tailM.color.setHex(braking ? 0xff2a2a : 0x8c1414);
    const lightsOn = P.lightsMode === 1 || (P.lightsMode === 0 && TOD.night > 0.45);
    head.intensity = lightsOn && G.state === 'play' ? 8 : 0;
    const sn = Math.sin(P.th), cs = Math.cos(P.th);
    head.position.set(P.x + sn * 2, P.y + 0.9, P.z + cs * 2); head.target.position.set(P.x + sn * 30, P.y, P.z + cs * 30);
  }
  // beacons
  for (const b of [bPick, bDrop]) if (b.visible) { b.children[1].rotation.z += dt * 1.5; b.children[2].position.y = 0.95 + Math.sin(G.t * 3) * 0.15; }
  updateParticles(dt);
  sunFollow(P.car && G.state !== 'loading' ? new THREE.Vector3(P.x, 0, P.z) : new THREE.Vector3());
  renderer.render(scene, camera);
}

// ---------- boot ----------
function boot() {
  makeTraffic(); mountPlayer(); renderCars(); renderColors(); renderBtns();
  setTime(SET.time); applyTod();
  showMenu();
  $('loading').classList.add('hidden');
  requestAnimationFrame(t => { last = t; frame(t); });
  if (Q.get('autostart')) start();
}
setTimeout(boot, 30);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__game = { G, P, M, SET, TOD, traffic, start, setTime, scene, camera, renderer };
