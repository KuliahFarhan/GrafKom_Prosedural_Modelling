const mount = document.getElementById("threeMount");
let THREE = null;
let OrbitControls = null;

try {
  const threeMod = await import("../vendor/three/three.module.js");
  const controlsMod = await import("../vendor/three/OrbitControls.js");
  THREE = threeMod;
  OrbitControls = controlsMod.OrbitControls;
} catch (err) {
  console.warn("Three.js failed to load", err);
  if (mount) {
    mount.innerHTML =
      '<div class="hud">3D dimatikan (Three.js lokal tidak ditemukan). Pastikan folder vendor/three berisi three.module.js dan OrbitControls.js.</div>';
  }
}

const steps = [
  {
    title: "Noise 1D",
    desc: "Value noise 1D dengan interpolasi halus.",
    details: [
      "Titik lattice acak pada grid integer.",
      "Interpolasi quintic (smooth) untuk transisi lembut.",
      "Parameter utama: ukuran tabel lattice dan jenis interpolasi.",
    ],
  },
  {
    title: "Value Noise 2D",
    desc: "Value noise 2D di grid, hasil jadi tekstur kasar.",
    details: [
      "Empat sudut grid diinterpolasi bilinear.",
      "Frekuensi = 4 (lebih tinggi = detail lebih rapat).",
      "Parameter utama: frekuensi sampling dan interpolasi.",
    ],
  },
  {
    title: "Perlin 2D",
    desc: "Gradient noise (Perlin) untuk pola yang lebih organik.",
    details: [
      "Setiap lattice punya vektor gradien acak.",
      "Dot product + interpolasi quintic.",
      "Frekuensi = 4, kurva halus mengurangi blokiness.",
    ],
  },
  {
    title: "FBM",
    desc: "Fractal Brownian Motion: gabungkan banyak octave.",
    details: [
      "Octaves menambah lapisan detail.",
      "Gain mengatur amplitudo tiap octave.",
      "Lacunarity mengatur kenaikan frekuensi tiap octave.",
    ],
  },
  {
    title: "Terrain Heightmap",
    desc: "FBM jadi peta ketinggian (heightmap).",
    details: [
      "Frekuensi dasar lebih rendah (skala terrain lebih luas).",
      "Heightmap dinormalisasi ke [0,1].",
      "Parameter utama: frekuensi dasar + FBM params.",
    ],
  },
  {
    title: "Color Mapping",
    desc: "Warna berdasarkan ketinggian (air, pasir, rumput, batu, salju).",
    details: [
      "Threshold ketinggian menentukan band warna.",
      "Lerp antar band agar transisi lembut.",
      "Parameter utama: threshold ketinggian dan warna tiap band.",
    ],
  },
  {
    title: "Shading",
    desc: "Lighting sederhana dari normal map.",
    details: [
      "Normal dihitung dari gradient heightmap.",
      "Dot product dengan arah cahaya.",
      "Parameter utama: arah cahaya dan kekuatan shading.",
    ],
  },
  {
    title: "Final 3D",
    desc: "Terrain 3D aktif di langkah terakhir.",
    details: [
      "Heightmap memengaruhi elevasi mesh.",
      "Warna dan shading ditransfer ke vertex colors.",
      "Parameter utama: skala elevasi dan resolusi mesh.",
    ],
  },
];

const stepRange = document.getElementById("stepRange");
const stepLabel = document.getElementById("stepLabel");
const stepDesc = document.getElementById("stepDesc");
const stepList = document.getElementById("stepList");
const stepInfo = document.getElementById("stepInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const playBtn = document.getElementById("playBtn");

const octavesRange = document.getElementById("octavesRange");
const gainRange = document.getElementById("gainRange");
const lacunarityRange = document.getElementById("lacunarityRange");
const octavesVal = document.getElementById("octavesVal");
const gainVal = document.getElementById("gainVal");
const lacunarityVal = document.getElementById("lacunarityVal");
const resetParamsBtn = document.getElementById("resetParamsBtn");

const canvas1d = document.getElementById("canvas1d");
const canvas2d = document.getElementById("canvas2d");
const canvasColor = document.getElementById("canvasColor");
const threeOverlay = document.getElementById("threeOverlay");
const ctx1d = canvas1d.getContext("2d");
const ctx2d = canvas2d.getContext("2d");
const ctxC = canvasColor.getContext("2d");

const SEED = 42;
const TABLE_SIZE = 256;
const RES_2D = 192;

function mulberry32(seed) {
  let t = seed;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);
const LATTICE = new Float32Array(TABLE_SIZE);
const GRAD_X = new Float32Array(TABLE_SIZE);
const GRAD_Y = new Float32Array(TABLE_SIZE);

for (let i = 0; i < TABLE_SIZE; i++) {
  LATTICE[i] = rng();
  const a = rng() * Math.PI * 2;
  GRAD_X[i] = Math.cos(a);
  GRAD_Y[i] = Math.sin(a);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
function quintic(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash2(ix, iy) {
  let h = (ix * 1619 + iy * 31337) % TABLE_SIZE;
  if (h < 0) h += TABLE_SIZE;
  return h;
}

function valueNoise1D(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = quintic(f);
  const v0 = LATTICE[i & 255];
  const v1 = LATTICE[(i + 1) & 255];
  return lerp(v0, v1, u);
}

function valueNoise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = quintic(fx);
  const uy = quintic(fy);

  const v00 = LATTICE[hash2(ix, iy)];
  const v10 = LATTICE[hash2(ix + 1, iy)];
  const v01 = LATTICE[hash2(ix, iy + 1)];
  const v11 = LATTICE[hash2(ix + 1, iy + 1)];

  return lerp(lerp(v00, v10, ux), lerp(v01, v11, ux), uy);
}

function perlin2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = quintic(fx);
  const uy = quintic(fy);

  function dot(ixc, iyc, dx, dy) {
    const idx = hash2(ixc, iyc);
    return GRAD_X[idx] * dx + GRAD_Y[idx] * dy;
  }

  const d00 = dot(ix, iy, fx, fy);
  const d10 = dot(ix + 1, iy, fx - 1, fy);
  const d01 = dot(ix, iy + 1, fx, fy - 1);
  const d11 = dot(ix + 1, iy + 1, fx - 1, fy - 1);

  const v = lerp(lerp(d00, d10, ux), lerp(d01, d11, ux), uy);
  return v * 0.5 + 0.5;
}

function fbm(x, y, octaves = 6, lacunarity = 2.0, gain = 0.5) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let total = 0;

  for (let i = 0; i < octaves; i++) {
    const n = perlin2D(x * frequency, y * frequency) * 2 - 1;
    value += amplitude * n;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / total;
}

function terrainColor(h) {
  const WATER = 0.35;
  const SAND = 0.4;
  const GRASS = 0.55;
  const ROCK = 0.75;
  const SNOW = 0.9;

  const c_deep = [0.1, 0.2, 0.55];
  const c_shallow = [0.25, 0.45, 0.75];
  const c_sand = [0.85, 0.78, 0.55];
  const c_grass = [0.25, 0.5, 0.15];
  const c_rock = [0.45, 0.4, 0.35];
  const c_snow = [0.95, 0.95, 1.0];

  function tBand(lo, hi) {
    return Math.min(1, Math.max(0, (h - lo) / (hi - lo + 1e-6)));
  }

  if (h < WATER) {
    const t = tBand(0, WATER);
    return [
      lerp(c_deep[0], c_shallow[0], t),
      lerp(c_deep[1], c_shallow[1], t),
      lerp(c_deep[2], c_shallow[2], t),
    ];
  }
  if (h < SAND) {
    const t = tBand(WATER, SAND);
    return [
      lerp(c_shallow[0], c_sand[0], t),
      lerp(c_shallow[1], c_sand[1], t),
      lerp(c_shallow[2], c_sand[2], t),
    ];
  }
  if (h < GRASS) {
    const t = tBand(SAND, GRASS);
    return [
      lerp(c_sand[0], c_grass[0], t),
      lerp(c_sand[1], c_grass[1], t),
      lerp(c_sand[2], c_grass[2], t),
    ];
  }
  if (h < ROCK) {
    const t = tBand(GRASS, ROCK);
    return [
      lerp(c_grass[0], c_rock[0], t),
      lerp(c_grass[1], c_rock[1], t),
      lerp(c_grass[2], c_rock[2], t),
    ];
  }

  const t = tBand(ROCK, SNOW);
  return [
    lerp(c_rock[0], c_snow[0], t),
    lerp(c_rock[1], c_snow[1], t),
    lerp(c_rock[2], c_snow[2], t),
  ];
}

function normalizeHeight(map) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < map.length; i++) {
    min = Math.min(min, map[i]);
    max = Math.max(max, map[i]);
  }
  const out = new Float32Array(map.length);
  const range = max - min + 1e-6;
  for (let i = 0; i < map.length; i++) {
    out[i] = (map[i] - min) / range;
  }
  return out;
}

function generateHeightmap(type, params) {
  const data = new Float32Array(RES_2D * RES_2D);
  let idx = 0;
  for (let y = 0; y < RES_2D; y++) {
    for (let x = 0; x < RES_2D; x++) {
      const fx = x / RES_2D;
      const fy = y / RES_2D;
      let v = 0;

      if (type === "value") {
        v = valueNoise2D(fx * 4, fy * 4);
      } else if (type === "perlin") {
        v = perlin2D(fx * 4, fy * 4);
      } else if (type === "fbm") {
        v =
          fbm(fx * 3, fy * 3, params.octaves, params.lacunarity, params.gain) *
            0.5 +
          0.5;
      } else if (type === "terrain") {
        v =
          fbm(
            fx * 2.5,
            fy * 2.5,
            params.octaves,
            params.lacunarity,
            params.gain,
          ) *
            0.5 +
          0.5;
      }

      data[idx++] = v;
    }
  }
  return data;
}

function draw1D() {
  ctx1d.clearRect(0, 0, canvas1d.width, canvas1d.height);
  ctx1d.strokeStyle = "#6ec1c3";
  ctx1d.lineWidth = 2;
  ctx1d.beginPath();
  const samples = 300;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 8;
    const v = valueNoise1D(x);
    const px = (i / (samples - 1)) * canvas1d.width;
    const py = canvas1d.height - v * (canvas1d.height - 20) - 10;
    if (i === 0) ctx1d.moveTo(px, py);
    else ctx1d.lineTo(px, py);
  }
  ctx1d.stroke();
}

function draw2D(map, ctx, colorize = false, shading = false) {
  const img = ctx.createImageData(RES_2D, RES_2D);
  for (let i = 0; i < map.length; i++) {
    const v = map[i];
    let r = v;
    let g = v;
    let b = v;

    if (colorize) {
      const c = terrainColor(v);
      r = c[0];
      g = c[1];
      b = c[2];

      const peak = Math.max(0, (v - 0.78) / 0.22);
      if (peak > 0) {
        const boost = peak * 0.35;
        r = Math.min(1, r + boost);
        g = Math.min(1, g + boost * 0.9);
        b = Math.min(1, b + boost * 0.8);
      }
    }

    if (shading) {
      const x = i % RES_2D;
      const y = Math.floor(i / RES_2D);
      const h = map[i];
      const hx = map[y * RES_2D + Math.min(RES_2D - 1, x + 1)] - h;
      const hy = map[Math.min(RES_2D - 1, y + 1) * RES_2D + x] - h;
      const nx = -hx * 20;
      const ny = -hy * 20;
      const nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6;
      const l =
        (nx / len) * sunLightDir.x +
        (ny / len) * sunLightDir.y +
        (nz / len) * sunLightDir.z;
      const slope = Math.abs(hx) + Math.abs(hy);
      const ao = Math.max(0.85, 1.0 - slope * 1.8);
      const light = (0.35 + 0.65 * Math.max(0, l)) * ao;
      r *= light;
      g *= light;
      b *= light;
    }

    img.data[i * 4 + 0] = Math.floor(r * 255);
    img.data[i * 4 + 1] = Math.floor(g * 255);
    img.data[i * 4 + 2] = Math.floor(b * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

const DEFAULT_PARAMS = {
  octaves: 6,
  gain: 0.5,
  lacunarity: 2.0,
};

const sunLightDir = { x: 0.6, y: 0.5, z: 0.8 };

const fbmParams = {
  octaves: parseInt(octavesRange.value, 10),
  gain: parseFloat(gainRange.value),
  lacunarity: parseFloat(lacunarityRange.value),
};

function syncParamLabels() {
  octavesVal.textContent = fbmParams.octaves;
  gainVal.textContent = fbmParams.gain.toFixed(2);
  lacunarityVal.textContent = fbmParams.lacunarity.toFixed(1);
}

function renderStepInfo(step) {
  const info = steps[step];
  const list = info.details.map((item) => `<li>${item}</li>`).join("");
  stepInfo.innerHTML = `
    <div><strong>Detail Langkah</strong></div>
    <div class="legend">${info.desc}</div>
    <ul>${list}</ul>
  `;
}

function createSkyTexture() {
  const size = 512;
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = size;
  skyCanvas.height = size;
  const skyCtx = skyCanvas.getContext("2d");

  const grad = skyCtx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "#0a1d3a");
  grad.addColorStop(0.45, "#234a7a");
  grad.addColorStop(1, "#b8d1ec");

  skyCtx.fillStyle = grad;
  skyCtx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(skyCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunSprite() {
  const size = 256;
  const sunCanvas = document.createElement("canvas");
  sunCanvas.width = size;
  sunCanvas.height = size;
  const sunCtx = sunCanvas.getContext("2d");

  const grad = sunCtx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  grad.addColorStop(0.0, "rgba(255, 245, 220, 1.0)");
  grad.addColorStop(0.35, "rgba(255, 220, 160, 0.8)");
  grad.addColorStop(0.7, "rgba(255, 200, 120, 0.25)");
  grad.addColorStop(1.0, "rgba(255, 200, 120, 0.0)");

  sunCtx.fillStyle = grad;
  sunCtx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(sunCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.9, 0.9);
  return sprite;
}

function createDetailNormalTexture(size = 256, freq = 12, strength = 3.0) {
  const data = new Uint8Array(size * size * 3);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      height[y * size + x] = perlin2D(nx * freq, ny * freq);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const hx = height[y * size + Math.min(size - 1, x + 1)] - height[idx];
      const hy = height[Math.min(size - 1, y + 1) * size + x] - height[idx];

      let nx = -hx * strength;
      let ny = -hy * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6;
      nx /= len;
      ny /= len;
      nz /= len;

      data[idx * 3 + 0] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[idx * 3 + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[idx * 3 + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

let mapValue = normalizeHeight(generateHeightmap("value", fbmParams));
let mapPerlin = normalizeHeight(generateHeightmap("perlin", fbmParams));
let mapFbm = normalizeHeight(generateHeightmap("fbm", fbmParams));
let mapTerrain = normalizeHeight(generateHeightmap("terrain", fbmParams));

function rebuildMaps() {
  mapFbm = normalizeHeight(generateHeightmap("fbm", fbmParams));
  mapTerrain = normalizeHeight(generateHeightmap("terrain", fbmParams));
  renderStep(parseInt(stepRange.value, 10));
}

function applyParamsFromUI() {
  fbmParams.octaves = parseInt(octavesRange.value, 10);
  fbmParams.gain = parseFloat(gainRange.value);
  fbmParams.lacunarity = parseFloat(lacunarityRange.value);
  syncParamLabels();
  rebuildMaps();
}

// Three.js scene (optional, depends on module load)
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let geometry = null;
let terrainMaterial = null;
let waterMesh = null;
let waterBasePositions = null;
let skyMesh = null;
let sunSprite = null;
let threeInitialized = false;

const geoSize = 1.8;
const segments = 128;

function initThree() {
  if (!THREE || !OrbitControls || !mount || threeInitialized) return;
  threeInitialized = true;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    45,
    mount.clientWidth / mount.clientHeight,
    0.1,
    100,
  );
  camera.position.set(0, 2.2, 3.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.physicallyCorrectLights = true;
  mount.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const skyTexture = createSkyTexture();
  scene.background = skyTexture;
  scene.fog = new THREE.Fog(0x9ab7d5, 2.6, 7.2);

  const skyGeo = new THREE.SphereGeometry(6, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
  });
  skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  const hemiLight = new THREE.HemisphereLight(0xbfd6ff, 0x24333a, 0.5);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff3d6, 1.55);
  dirLight.position.set(2.8, 3.2, 1.4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 9;
  dirLight.shadow.camera.left = -3.0;
  dirLight.shadow.camera.right = 3.0;
  dirLight.shadow.camera.top = 3.0;
  dirLight.shadow.camera.bottom = -3.0;
  dirLight.shadow.bias = -0.0002;
  dirLight.shadow.normalBias = 0.01;
  dirLight.shadow.radius = 5;
  scene.add(dirLight);

  dirLight.target.position.set(0, 0, 0);
  scene.add(dirLight.target);

  const len = Math.hypot(
    dirLight.position.x,
    dirLight.position.y,
    dirLight.position.z,
  );
  sunLightDir.x = dirLight.position.x / len;
  sunLightDir.y = dirLight.position.y / len;
  sunLightDir.z = dirLight.position.z / len;

  sunSprite = createSunSprite();
  sunSprite.position.copy(dirLight.position).multiplyScalar(1.1);
  scene.add(sunSprite);

  scene.add(new THREE.AmbientLight(0x8899aa, 0.3));

  geometry = new THREE.PlaneGeometry(geoSize, geoSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const colors = new Float32Array((segments + 1) * (segments + 1) * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const detailNormal = createDetailNormalTexture();
  terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.1,
    normalMap: detailNormal,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });

  const mesh = new THREE.Mesh(geometry, terrainMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const groundGeo = new THREE.PlaneGeometry(6, 6);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2b3a42,
    roughness: 1.0,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);

  const waterGeo = new THREE.PlaneGeometry(4.2, 4.2, 112, 112);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a7ab2,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.35,
    clearcoat: 0.7,
    clearcoatRoughness: 0.08,
    ior: 1.33,
  });
  waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = 0.12;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  waterBasePositions = new Float32Array(waterGeo.attributes.position.array);
}

function updateTerrain(step) {
  if (!geometry) return;
  const verts = geometry.attributes.position;
  const cols = geometry.attributes.color;
  const size = segments + 1;

  let heightMap = mapTerrain;
  let colorMap = mapTerrain;
  let amp = 0.0;
  let useColor = false;
  let useShading = false;

  if (step <= 1) {
    heightMap = mapValue;
    amp = step === 0 ? 0.0 : 0.2;
  } else if (step === 2) {
    heightMap = mapPerlin;
    amp = 0.25;
  } else if (step === 3) {
    heightMap = mapFbm;
    amp = 0.35;
  } else if (step >= 4) {
    heightMap = mapTerrain;
    amp = 0.45;
    useColor = step >= 5;
    useShading = step >= 6;
  }

  const applyShading = useShading && step < 7;

  if (waterMesh) {
    waterMesh.position.y = amp * 0.28;
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const idx = i * size + j;
      const mapX = Math.floor((j / (size - 1)) * (RES_2D - 1));
      const mapY = Math.floor((i / (size - 1)) * (RES_2D - 1));
      const h = heightMap[mapY * RES_2D + mapX];
      const vIndex = idx * 3;

      verts.array[vIndex + 1] = h * amp;

      let r = h;
      let g = h;
      let b = h;

      if (useColor) {
        const c = terrainColor(h);
        r = c[0];
        g = c[1];
        b = c[2];

        const peak = Math.max(0, (h - 0.78) / 0.22);
        if (peak > 0) {
          const boost = peak * 0.35;
          r = Math.min(1, r + boost);
          g = Math.min(1, g + boost * 0.9);
          b = Math.min(1, b + boost * 0.8);
        }
      }

      if (applyShading) {
        const hx =
          heightMap[mapY * RES_2D + Math.min(RES_2D - 1, mapX + 1)] - h;
        const hy =
          heightMap[Math.min(RES_2D - 1, mapY + 1) * RES_2D + mapX] - h;
        const nx = -hx * 20;
        const ny = -hy * 20;
        const nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6;
        const l =
          (nx / len) * sunLightDir.x +
          (ny / len) * sunLightDir.y +
          (nz / len) * sunLightDir.z;
        const slope = Math.abs(hx) + Math.abs(hy);
        const ao = Math.max(0.85, 1.0 - slope * 1.8);
        const light = (0.35 + 0.65 * Math.max(0, l)) * ao;
        r *= light;
        g *= light;
        b *= light;
      }

      cols.array[vIndex + 0] = r;
      cols.array[vIndex + 1] = g;
      cols.array[vIndex + 2] = b;
    }
  }

  verts.needsUpdate = true;
  cols.needsUpdate = true;
  geometry.computeVertexNormals();
}

function renderStep(step) {
  stepLabel.textContent = step;
  stepDesc.textContent = steps[step].desc;
  renderStepInfo(step);

  [...stepList.children].forEach((el, idx) => {
    el.classList.toggle("active", idx === step);
  });

  if (step === 0) {
    draw1D();
    draw2D(mapValue, ctx2d, false, false);
    draw2D(mapValue, ctxC, false, false);
  } else if (step === 1) {
    draw1D();
    draw2D(mapValue, ctx2d, false, false);
    draw2D(mapValue, ctxC, false, false);
  } else if (step === 2) {
    draw2D(mapPerlin, ctx2d, false, false);
    draw2D(mapPerlin, ctxC, false, false);
  } else if (step === 3) {
    draw2D(mapFbm, ctx2d, false, false);
    draw2D(mapFbm, ctxC, false, false);
  } else if (step === 4) {
    draw2D(mapTerrain, ctx2d, false, false);
    draw2D(mapTerrain, ctxC, false, false);
  } else if (step === 5) {
    draw2D(mapTerrain, ctx2d, false, false);
    draw2D(mapTerrain, ctxC, true, false);
  } else if (step === 6) {
    draw2D(mapTerrain, ctx2d, false, false);
    draw2D(mapTerrain, ctxC, true, true);
  } else {
    draw2D(mapTerrain, ctx2d, false, false);
    draw2D(mapTerrain, ctxC, true, true);
  }

  if (step >= 7) {
    if (threeOverlay) threeOverlay.style.display = "none";
    initThree();
    updateTerrain(step);
  } else if (threeOverlay) {
    threeOverlay.style.display = "grid";
  }
}

steps.forEach((s, idx) => {
  const div = document.createElement("div");
  div.className = "step-item";
  div.textContent = `${idx}. ${s.title}`;
  stepList.appendChild(div);
});

let playing = false;
let playTimer = null;

function setStep(step) {
  const clamped = Math.max(0, Math.min(7, step));
  stepRange.value = clamped;
  renderStep(clamped);
}

stepRange.addEventListener("input", (e) =>
  setStep(parseInt(e.target.value, 10)),
);
prevBtn.addEventListener("click", () =>
  setStep(parseInt(stepRange.value, 10) - 1),
);
nextBtn.addEventListener("click", () =>
  setStep(parseInt(stepRange.value, 10) + 1),
);

octavesRange.addEventListener("input", applyParamsFromUI);
gainRange.addEventListener("input", applyParamsFromUI);
lacunarityRange.addEventListener("input", applyParamsFromUI);

resetParamsBtn.addEventListener("click", () => {
  octavesRange.value = DEFAULT_PARAMS.octaves;
  gainRange.value = DEFAULT_PARAMS.gain;
  lacunarityRange.value = DEFAULT_PARAMS.lacunarity;
  applyParamsFromUI();
});

playBtn.addEventListener("click", () => {
  playing = !playing;
  playBtn.textContent = playing ? "Stop" : "Auto Play";
  if (playing) {
    playTimer = setInterval(() => {
      const next = (parseInt(stepRange.value, 10) + 1) % 8;
      setStep(next);
    }, 1600);
  } else {
    clearInterval(playTimer);
  }
});

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const t = performance.now() * 0.001;

  if (waterMesh && waterBasePositions) {
    const pos = waterMesh.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      const x = waterBasePositions[ix];
      const y = waterBasePositions[ix + 1];
      const wave =
        Math.sin(x * 1.4 + t * 0.8) * 0.006 +
        Math.cos(y * 1.6 - t * 0.7) * 0.005 +
        Math.sin((x + y) * 7.8 + t * 2.4) * 0.0025 +
        Math.cos((x - y) * 8.4 - t * 2.8) * 0.0018 +
        Math.sin(x * 14.0 + t * 5.0) * 0.0012;
      arr[ix + 2] = wave;
    }
    pos.needsUpdate = true;
    waterMesh.geometry.computeVertexNormals();
    waterMesh.material.opacity = 0.5 + Math.sin(t * 0.6) * 0.01;
  }

  if (sunSprite) {
    sunSprite.material.opacity = 0.75 + Math.sin(t * 0.5) * 0.08;
  }
  if (controls) controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  if (!renderer || !camera || !mount) return;
  camera.aspect = mount.clientWidth / mount.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(mount.clientWidth, mount.clientHeight);
});

syncParamLabels();
draw1D();
initThree();
renderStep(0);
animate();
