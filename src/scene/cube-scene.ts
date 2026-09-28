import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCircuitTextures, createGlowTexture } from './circuit-texture';

/**
 * Sayfa kaydırıldıkça biçim değiştiren küp.
 *
 * 27 parçalı (3×3×3) küp, her bölüm için ayrı bir "poz" alır ve kaydırma ilerlemesi
 * (0 → 5) bu pozlar arasında yumuşakça geçiş yapar:
 *   0 Hoş geldiniz  – bütün küp
 *   1 Stand          – katmanlar Rubik gibi dönüp aralanır
 *   2 Biz kimiz?     – kamera küpün içine dalar, parçalar etrafa saçılır, çekirdek görünür
 *   3 Misyon/Vizyon  – parçalar ışıklı bir ağa dönüşür
 *   4 Öneriler       – merkezli topluluk grafiği (çekirdek → 6 merkez → yapraklar)
 *   5 Üye ol         – her şey yeniden küpte birleşir
 * Hareket eden her parça arkasında sönümlenen altın bir iz bırakır.
 */

export type CubeScene = {
  setProgress(progress: number): void;
  pulse(): void;
};

type Stage = {
  /** Masaüstü: küpün ekran konumu, yarım genişlik / yarım yükseklik oranı olarak */
  desk: [number, number];
  /** Mobil (dikey): aynı şekilde */
  mob: [number, number];
  dolly: number;
  board: number;
  netLines: number;
  graphLines: number;
  core: number;
  dust: number;
  spin: number;
  scale: number;
};

const STAGES: Stage[] = [
  { desk: [0.58, 0.02], mob: [0, 0.46], dolly: 1, board: 0.6, netLines: 0, graphLines: 0, core: 0, dust: 0.45, spin: 0.16, scale: 0.88 },
  { desk: [-0.56, 0.02], mob: [0, 0.5], dolly: 0.92, board: 0.3, netLines: 0, graphLines: 0, core: 0.45, dust: 0.6, spin: 0.1, scale: 0.8 },
  { desk: [0, 0], mob: [0, 0.05], dolly: 0.34, board: 0, netLines: 0, graphLines: 0, core: 1, dust: 1, spin: 0.07, scale: 1 },
  { desk: [0, 0], mob: [0, 0.1], dolly: 1.05, board: 0, netLines: 0.55, graphLines: 0, core: 0.6, dust: 0.9, spin: 0.06, scale: 1 },
  { desk: [0.44, 0], mob: [0, 0.66], dolly: 1.08, board: 0.15, netLines: 0.08, graphLines: 0.75, core: 0.85, dust: 0.8, spin: 0.09, scale: 0.7 },
  { desk: [0, 0.6], mob: [0, 0.52], dolly: 1, board: 0.8, netLines: 0, graphLines: 0, core: 0.35, dust: 0.7, spin: 0.2, scale: 0.62 },
];

type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number; glow: number };

const GRID = 3;
const CORE_INDEX = 13;
const SPACING = 0.68;
const CUBELET = 0.64;
const TRAIL_LENGTH = 24;
const TRAIL_SECONDS = 0.35;
const BG = 0x060708;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = THREE.MathUtils.lerp;

function randomQuat(rng: () => number, maxAngle: number) {
  const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
  return new THREE.Quaternion().setFromAxisAngle(axis, (rng() * 2 - 1) * maxAngle);
}

/** Her parça için 6 bölümün pozlarını ve ağ/grafik bağlantılarını hesaplar. */
function buildPoses() {
  const rng = mulberry32(2026);
  const grid: THREE.Vector3[] = [];
  for (let x = 0; x < GRID; x++)
    for (let y = 0; y < GRID; y++)
      for (let z = 0; z < GRID; z++) grid.push(new THREE.Vector3(x - 1, y - 1, z - 1));

  const poses: Pose[][] = grid.map(() => []);
  const up = new THREE.Vector3(0, 1, 0);

  // 0 ve 5: bütün küp
  const whole = (g: THREE.Vector3): Pose => ({
    pos: g.clone().multiplyScalar(SPACING),
    quat: new THREE.Quaternion(),
    scale: 1,
    glow: 0,
  });

  // 1: üst ve alt katmanlar zıt yönlere döner, küp hafifçe aralanır
  const twisted = (g: THREE.Vector3): Pose => {
    const angle = g.y === 1 ? 0.5 : g.y === -1 ? -0.34 : 0.08;
    const q = new THREE.Quaternion().setFromAxisAngle(up, angle);
    const pos = g.clone().multiplyScalar(SPACING * 1.14).applyQuaternion(q);
    pos.y += g.y * 0.14;
    return { pos, quat: q, scale: 1, glow: 0.25 };
  };

  // 3: Fibonacci küresi üzerinde düğümler
  const nonCore = grid.map((_, i) => i).filter((i) => i !== CORE_INDEX);
  const sphere = new Map<number, THREE.Vector3>();
  nonCore.forEach((idx, k) => {
    const n = nonCore.length;
    const y = 1 - (2 * (k + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const theta = Math.PI * (3 - Math.sqrt(5)) * k;
    sphere.set(idx, new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(2.55));
  });

  // 4: yüz merkezleri → merkez düğümler, kenar/köşe parçaları → en az yüklü komşu merkeze yaprak
  const hubs = grid
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => Math.abs(g.x) + Math.abs(g.y) + Math.abs(g.z) === 1)
    .map(({ i }) => i);
  const leavesOf = new Map<number, number[]>(hubs.map((h) => [h, []]));
  grid.forEach((g, i) => {
    if (i === CORE_INDEX || hubs.includes(i)) return;
    const candidates = hubs.filter((h) => {
      const hg = grid[h];
      return (hg.x !== 0 && hg.x === g.x) || (hg.y !== 0 && hg.y === g.y) || (hg.z !== 0 && hg.z === g.z);
    });
    candidates.sort((a, b) => leavesOf.get(a)!.length - leavesOf.get(b)!.length);
    leavesOf.get(candidates[0])!.push(i);
  });
  const graphPos = new Map<number, THREE.Vector3>();
  graphPos.set(CORE_INDEX, new THREE.Vector3());
  for (const h of hubs) {
    const dir = grid[h].clone();
    const hubPos = dir.clone().multiplyScalar(1.85);
    graphPos.set(h, hubPos);
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    const leaves = leavesOf.get(h)!;
    leaves.forEach((leaf, k) => {
      const a = (k / leaves.length) * Math.PI * 2 + h;
      graphPos.set(
        leaf,
        hubPos
          .clone()
          .addScaledVector(dir, 0.55)
          .addScaledVector(u, Math.cos(a) * 0.72)
          .addScaledVector(v, Math.sin(a) * 0.72),
      );
    });
  }

  grid.forEach((g, i) => {
    const isCore = i === CORE_INDEX;
    const isHub = hubs.includes(i);
    const jitter = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.7);

    poses[i].push(whole(g));
    poses[i].push(isCore ? { ...whole(g), glow: 0.6 } : twisted(g));
    poses[i].push({
      pos: isCore ? new THREE.Vector3() : g.clone().multiplyScalar(SPACING * 2.9).add(jitter),
      quat: isCore ? new THREE.Quaternion() : randomQuat(rng, 1.1),
      scale: isCore ? 0.5 : 0.92,
      glow: isCore ? 1.4 : 0.35,
    });
    poses[i].push({
      pos: isCore ? new THREE.Vector3() : sphere.get(i)!.clone(),
      quat: randomQuat(rng, Math.PI),
      scale: isCore ? 0.42 : 0.2,
      glow: isCore ? 1.6 : 0.85,
    });
    poses[i].push({
      pos: graphPos.get(i)!.clone(),
      quat: randomQuat(rng, Math.PI),
      scale: isCore ? 0.5 : isHub ? 0.3 : 0.15,
      glow: isCore ? 1.8 : isHub ? 1.1 : 0.7,
    });
    poses[i].push({ ...whole(g), glow: isCore ? 0.4 : 0 });
  });

  // Ağ bağlantıları: her düğüm en yakın 2 komşusuna, çekirdek birkaç düğüme
  const netEdges: [number, number][] = [];
  const seen = new Set<string>();
  const addEdge = (a: number, b: number, into: [number, number][]) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    into.push([a, b]);
  };
  for (const i of nonCore) {
    const p = sphere.get(i)!;
    const nearest = nonCore
      .filter((j) => j !== i)
      .sort((a, b) => sphere.get(a)!.distanceTo(p) - sphere.get(b)!.distanceTo(p))
      .slice(0, 2);
    for (const j of nearest) addEdge(i, j, netEdges);
  }
  nonCore.filter((_, k) => k % 3 === 0).forEach((i) => addEdge(CORE_INDEX, i, netEdges));

  seen.clear();
  const graphEdges: [number, number][] = [];
  for (const h of hubs) {
    addEdge(CORE_INDEX, h, graphEdges);
    for (const leaf of leavesOf.get(h)!) addEdge(h, leaf, graphEdges);
  }

  return { poses, netEdges, graphEdges, hubs };
}

function makeLines(edges: [number, number][], color: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  return { lines, material, edges, positions: geometry.attributes.position as THREE.BufferAttribute };
}

export function createCubeScene(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }): CubeScene {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 8, 30);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  const camDir = new THREE.Vector3(0, 0.3, 1).normalize();

  // Işıklar: sıcak ana ışık, soğuk mavi kontur, çekirdekte mavi nokta ışık
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xffd9a0, 2.4);
  key.position.set(-4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ab8ff, 1.6);
  rim.position.set(5, 2, -4);
  scene.add(rim);

  // Arka plandaki devre kartı zemini
  const boardTex = createCircuitTextures(77, 1024, false);
  for (const t of [boardTex.map, boardTex.emissiveMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 7);
  }
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex.map,
    emissiveMap: boardTex.emissiveMap,
    emissive: 0xffffff,
    color: 0x9a9a9a,
    emissiveIntensity: 0.35,
    metalness: 0.7,
    roughness: 0.45,
    transparent: true,
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), boardMat);
  board.rotation.x = -Math.PI / 2;
  board.position.y = -2.3;
  scene.add(board);

  // Küp
  const rig = new THREE.Group();
  scene.add(rig);
  const { poses, netEdges, graphEdges, hubs } = buildPoses();
  const geometry = new RoundedBoxGeometry(CUBELET, CUBELET, CUBELET, 3, 0.045);
  const texSize = coarse ? 384 : 512;
  const materials = [11, 23, 37, 59].map((seed) => {
    const { map, emissiveMap } = createCircuitTextures(seed, texSize);
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.3,
      metalness: 0.78,
      roughness: 0.36,
    });
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x0d1c2c,
    emissive: 0x69c1ff,
    emissiveIntensity: 2.2,
    metalness: 0.4,
    roughness: 0.25,
  });
  const hubMat = materials[0];

  const glowTex = createGlowTexture();
  const cubelets = poses.map((_, i) => {
    const mesh = new THREE.Mesh(geometry, i === CORE_INDEX ? coreMat : hubs.includes(i) ? hubMat : materials[i % materials.length]);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: i === CORE_INDEX ? 0xa8dcff : hubs.includes(i) ? 0xf0cf8e : 0x8fd3ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    rig.add(mesh, glow);
    return { mesh, glow };
  });
  const coreLight = new THREE.PointLight(0x69c1ff, 0, 9, 1.6);
  rig.add(coreLight);

  const net = makeLines(netEdges, 0x8fd3ff);
  const graph = makeLines(graphEdges, 0xe6c07c);
  rig.add(net.lines, graph.lines);

  // Hareket izleri (dünya koordinatında, böylece küpün ekranda kayması da iz bırakır)
  const trailSegs = TRAIL_LENGTH - 1;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(cubelets.length * trailSegs * 6);
  const trailCol = new Float32Array(cubelets.length * trailSegs * 8);
  const gold = new THREE.Color(0xf0cf8e);
  for (let c = 0; c < cubelets.length; c++) {
    for (let s = 0; s < trailSegs; s++) {
      for (let e = 0; e < 2; e++) {
        const o = ((c * trailSegs + s) * 2 + e) * 4;
        const a = Math.pow(1 - (s + e) / trailSegs, 1.6);
        trailCol.set([gold.r, gold.g, gold.b, a], o);
      }
    }
  }
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4));
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: opts.reducedMotion ? 0 : 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trails = new THREE.LineSegments(trailGeo, trailMat);
  trails.frustumCulled = false;
  scene.add(trails);
  const history = cubelets.map(() => Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3()));
  const sampleTimes = new Array<number>(TRAIL_LENGTH).fill(0);
  let historyReady = false;

  // Toz / yıldız parçacıkları
  const dustCount = coarse ? 260 : 480;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  const drng = mulberry32(99);
  const blue = new THREE.Color(0x8fd3ff);
  for (let i = 0; i < dustCount; i++) {
    dustPos.set([(drng() - 0.5) * 22, (drng() - 0.35) * 12, (drng() - 0.6) * 18], i * 3);
    const c = drng() < 0.55 ? gold : blue;
    dustCol.set([c.r, c.g, c.b], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.08,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ── Yerleşim ──────────────────────────────────────────────────────
  let baseDist = 10;
  let halfW = 1;
  let halfH = 1;
  let portrait = false;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    portrait = w < 820 || camera.aspect < 0.9;
    baseDist = Math.max(3.3 / tanHalf, 2.1 / (tanHalf * camera.aspect));
    halfH = baseDist * tanHalf;
    halfW = halfH * camera.aspect;
    scene.fog = new THREE.Fog(BG, baseDist * 0.85, baseDist * 2.6);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Etkileşim ─────────────────────────────────────────────────────
  const tilt = new THREE.Vector2();
  const tiltTarget = new THREE.Vector2();
  if (!coarse) {
    window.addEventListener('pointermove', (e) => {
      tiltTarget.set((e.clientY / window.innerHeight - 0.5) * 0.25, (e.clientX / window.innerWidth - 0.5) * 0.35);
    });
  }

  let target = 0;
  let current = 0;
  let pulse = 0;
  let spin = -0.75;
  let selfAngle = 0;
  let time = 0;
  const timer = new THREE.Timer();
  timer.connect(document);
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const mix = (key: keyof Stage, i: number, t: number) =>
    lerp(STAGES[i][key] as number, STAGES[i + 1][key] as number, t);

  function tick(timestamp: number) {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.05);
    time += dt;
    current += (target - current) * (1 - Math.exp(-dt * (opts.reducedMotion ? 12 : 4.2)));
    pulse *= Math.exp(-dt * 2.2);

    const p = THREE.MathUtils.clamp(current, 0, STAGES.length - 1);
    const i = Math.min(Math.floor(p), STAGES.length - 2);
    const t = smoother(p - i);

    // Küpün ekran konumu ve kamera
    const off = portrait ? [STAGES[i].mob, STAGES[i + 1].mob] : [STAGES[i].desk, STAGES[i + 1].desk];
    const offX = lerp(off[0][0], off[1][0], t) * halfW;
    const offY = lerp(off[0][1], off[1][1], t) * halfH;
    const dolly = mix('dolly', i, t);
    camera.position.copy(camDir).multiplyScalar(baseDist * dolly);
    camera.lookAt(0, 0, 0);
    rig.position.set(offX, offY, 0);
    rig.scale.setScalar(mix('scale', i, t) * (portrait ? 0.8 : 1));

    if (!opts.reducedMotion) spin += dt * mix('spin', i, t);
    tilt.lerp(tiltTarget, 1 - Math.exp(-dt * 3));
    const sway = coarse && !opts.reducedMotion ? Math.sin(time * 0.6) * 0.05 : 0;
    rig.rotation.set(0.42 + tilt.x + sway, spin + tilt.y, 0);

    // Parçalar
    // Küp bütünken parçalar sabit; dağıldıkça hafifçe süzülüp kendi etraflarında dönerler
    const motion = opts.reducedMotion ? 0 : 1;
    const float = Math.min(p, 5 - p, 1) * motion;
    const selfSpin = THREE.MathUtils.clamp(Math.min(p - 1.5, 4.5 - p), 0, 1) * motion;
    selfAngle += dt * 0.3 * selfSpin;
    cubelets.forEach(({ mesh, glow }, c) => {
      const a = poses[c][i];
      const b = poses[c][i + 1];
      mesh.position.lerpVectors(a.pos, b.pos, t);
      if (float > 0 && c !== CORE_INDEX) mesh.position.y += Math.sin(time * 1.1 + c * 1.7) * 0.05 * float;
      mesh.quaternion.slerpQuaternions(a.quat, b.quat, t);
      if (c !== CORE_INDEX && selfSpin > 0) {
        tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), selfAngle * selfSpin * (c % 2 ? 1 : -1));
        mesh.quaternion.multiply(tmpQ);
      }
      mesh.scale.setScalar(lerp(a.scale, b.scale, t));
      glow.position.copy(mesh.position);
      const g = lerp(a.glow, b.glow, t) * (c === CORE_INDEX ? 1 + pulse * 1.5 : 1);
      glow.scale.setScalar(g * (c === CORE_INDEX ? 2.4 : 0.95));
      glow.visible = g > 0.01;
    });
    coreLight.intensity = mix('core', i, t) * (14 + pulse * 30);
    coreMat.emissiveIntensity = 1.6 + pulse * 3;

    // Bağlantı çizgileri parçaları takip eder
    for (const set of [net, graph]) {
      const alpha = set === net ? mix('netLines', i, t) : mix('graphLines', i, t) * (1 + pulse * 0.6);
      set.material.opacity = alpha;
      set.lines.visible = alpha > 0.005;
      if (!set.lines.visible) continue;
      set.edges.forEach(([ea, eb], k) => {
        const pa = cubelets[ea].mesh.position;
        const pb = cubelets[eb].mesh.position;
        set.positions.setXYZ(k * 2, pa.x, pa.y, pa.z);
        set.positions.setXYZ(k * 2 + 1, pb.x, pb.y, pb.z);
      });
      set.positions.needsUpdate = true;
    }

    boardMat.opacity = mix('board', i, t);
    board.visible = boardMat.opacity > 0.01;
    dustMat.opacity = mix('dust', i, t);
    if (!opts.reducedMotion) dust.rotation.y = time * 0.012;

    // İzler
    rig.updateMatrixWorld();
    sampleTimes.pop();
    sampleTimes.unshift(time);
    // İz uzunluğu kare sayısına değil süreye bağlı: yavaş cihazda da kısa kalır
    let liveSegs = 0;
    while (liveSegs < trailSegs && time - sampleTimes[liveSegs + 1] < TRAIL_SECONDS) liveSegs++;
    cubelets.forEach(({ mesh }, c) => {
      const h = history[c];
      const last = h.pop()!;
      mesh.getWorldPosition(last);
      h.unshift(last);
      if (!historyReady) for (const v of h) v.copy(last);
      for (let s = 0; s < trailSegs; s++) {
        const o = (c * trailSegs + s) * 6;
        const from = h[Math.min(s, liveSegs)];
        const to = h[Math.min(s + 1, liveSegs)];
        trailPos[o] = from.x;
        trailPos[o + 1] = from.y;
        trailPos[o + 2] = from.z;
        trailPos[o + 3] = to.x;
        trailPos[o + 4] = to.y;
        trailPos[o + 5] = to.z;
      }
    });
    historyReady = true;
    trailGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(tick);
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : tick);
  });

  return {
    setProgress(progress: number) {
      target = progress;
    },
    pulse() {
      pulse = 1;
    },
  };
}
