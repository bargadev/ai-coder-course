/* Arena Duelo — FPS 1×1 contra um bot. Usa Three.js r128 (global THREE). */
(() => {
  'use strict';

  // ---------- Configuração ----------
  const ARENA = 28;          // meia largura da arena (m)
  const WALL_H = 5;
  const EYE = 1.6;
  const PLAYER_R = 0.45;
  const PLAYER_H = 1.8;
  const BOT_R = 0.55;
  const BOT_H = 2.2;
  const MAX_HP = 100;
  const WIN_KILLS = 5;
  const BULLET_SPEED = 75;
  const BG = 0x161b26;

  const PLAYER = { speed: 7, turnMin: 0.9, turnMax: 2.6, fireDelay: 0.2, damage: 20 };

  const DIFFICULTY = {
    easy:   { label: 'Fácil',   reaction: 0.9,  spread: 0.10,  fireDelay: 0.75, damage: 8,  turn: 2.2, speed: 4.2 },
    normal: { label: 'Normal',  reaction: 0.55, spread: 0.06,  fireDelay: 0.5,  damage: 10, turn: 3.2, speed: 5.0 },
    hard:   { label: 'Difícil', reaction: 0.3,  spread: 0.035, fireDelay: 0.36, damage: 12, turn: 4.5, speed: 5.8 },
  };

  // Obstáculos: x, z, largura, profundidade, altura, material
  const LAYOUT = [
    [0, 0, 4, 4, 4, 'wall'],
    [-11, -11, 3, 3, 3.5, 'wall'], [11, -11, 3, 3, 3.5, 'wall'],
    [-11, 11, 3, 3, 3.5, 'wall'], [11, 11, 3, 3, 3.5, 'wall'],
    [0, -17, 9, 1.2, 2.4, 'wall'], [0, 17, 9, 1.2, 2.4, 'wall'],
    [-17, 0, 1.2, 9, 2.4, 'wall'], [17, 0, 1.2, 9, 2.4, 'wall'],
    [-5, 7, 2, 2, 2.2, 'crate'], [6, -6, 2, 2, 2.2, 'crate'],
    [7, 5.5, 1.8, 1.8, 2.2, 'crate'], [-6.5, -5, 1.8, 1.8, 2.2, 'crate'],
    [-21, -21, 2.6, 2.6, 2.6, 'crate'], [21, 21, 2.6, 2.6, 2.6, 'crate'],
    [21, -21, 2.2, 2.2, 2.2, 'crate'], [-21, 21, 2.2, 2.2, 2.2, 'crate'],
  ];

  // Pares de spawn em lados opostos
  const SPAWNS = [
    [[-24.5, -24.5], [24.5, 24.5]],
    [[24.5, -24.5], [-24.5, 24.5]],
    [[0, -24], [0, 24]],
    [[-24, 0], [24, 0]],
  ];

  // ---------- Utilidades ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  // yaw 0 olha para -Z (convenção da câmera do Three.js)
  const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
  const fwdX = (yaw) => -Math.sin(yaw);
  const fwdZ = (yaw) => -Math.cos(yaw);

  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $('hud'), menu: $('menu'), pause: $('pause'), end: $('end'),
    scoreYou: $('score-you'), scoreBot: $('score-bot'), roundLabel: $('round-label'),
    hpYou: $('hp-you'), hpYouNum: $('hp-you-num'), hpBot: $('hp-bot'), vitals: document.querySelector('.vitals'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    hitmarker: $('hitmarker'), dmg: $('dmg'), vignette: $('vignette'), radar: $('radar'), lockHint: $('lock-hint'),
    endTitle: $('end-title'), endScore: $('end-score'),
    stShots: $('st-shots'), stHits: $('st-hits'), stAcc: $('st-acc'), stDiff: $('st-diff'),
  };

  let diffKey = 'normal';
  try { const saved = localStorage.getItem('arena-duelo-diff'); if (saved && DIFFICULTY[saved]) diffKey = saved; } catch (e) { /* sem storage */ }
  const DIFF = () => DIFFICULTY[diffKey];

  // ---------- Renderer, cena, câmeras ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(BG);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  $('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 35, 110);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x3a2f28, 0.75));
  const sun = new THREE.DirectionalLight(0xffe0bc, 1.1);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 100 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Luzes de disparo (criadas já, com intensidade 0, para não recompilar shaders)
  const playerFlashLight = new THREE.PointLight(0xffc070, 0, 10);
  playerFlashLight.position.set(0.25, -0.1, -0.9);
  camera.add(playerFlashLight);
  const botFlashLight = new THREE.PointLight(0xff6a50, 0, 10);
  scene.add(botFlashLight);

  // ---------- Texturas procedurais ----------
  function canvasTexture(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function speckle(g, s, base, n, alpha) {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      const v = Math.random() < 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
      const w = 1 + Math.random() * 3;
      g.fillRect(Math.random() * s, Math.random() * s, w, w);
    }
  }

  const floorTex = canvasTexture(512, (g, s) => {
    speckle(g, s, '#3a404c', 5000, 0.06);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const p = (i * s) / 4;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 4;
    g.strokeRect(0, 0, s, s);
  });
  floorTex.repeat.set((ARENA * 2) / 8, (ARENA * 2) / 8);

  const wallTex = canvasTexture(512, (g, s) => {
    speckle(g, s, '#596173', 3000, 0.07);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 6, s);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(6, 0, 2, s);
    // faixa de sinalização na base
    const h = s * 0.1;
    g.fillStyle = '#262b35'; g.fillRect(0, s - h, s, h);
    g.fillStyle = '#d99a3c';
    for (let x = -h; x < s + h; x += 48) {
      g.beginPath();
      g.moveTo(x, s); g.lineTo(x + 24, s); g.lineTo(x + 24 + h, s - h); g.lineTo(x + h, s - h);
      g.closePath(); g.fill();
    }
  });

  const crateTex = canvasTexture(256, (g, s) => {
    speckle(g, s, '#2f4a52', 1500, 0.08);
    g.strokeStyle = '#1d2f35'; g.lineWidth = 18; g.strokeRect(9, 9, s - 18, s - 18);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.strokeRect(19, 19, s - 38, s - 38);
    g.strokeStyle = '#1d2f35'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(18, 18); g.lineTo(s - 18, s - 18); g.moveTo(s - 18, 18); g.lineTo(18, s - 18); g.stroke();
  });

  const flashTex = canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,230,1)');
    grad.addColorStop(0.3, 'rgba(255,200,110,0.9)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8, metalness: 0.1 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.6, metalness: 0.25 });

  // Caixa com UV proporcional ao tamanho (textura não estica)
  function boxGeo(w, h, d, tile, sidesFullHeight) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    // ordem das faces: +x, -x, +y, -y, +z, -z
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const top = f === 2 || f === 3;
      const su = dims[f][0] / tile;
      const sv = !top && sidesFullHeight ? 1 : dims[f][1] / tile;
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  // ---------- Arena ----------
  const boxes = []; // AABB de colisão: { minX, maxX, minZ, maxZ, h }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  function addBox(x, z, w, d, h, kind) {
    const isCrate = kind === 'crate';
    const mesh = new THREE.Mesh(
      isCrate ? boxGeo(w, h, d, Math.max(w, h), false) : boxGeo(w, h, d, 4, true),
      isCrate ? crateMat : wallMat
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, kind });
  }

  // Muros externos (1 m de espessura, por fora da área jogável)
  addBox(0, -ARENA - 0.5, ARENA * 2 + 2, 1, WALL_H, 'boundary');
  addBox(0, ARENA + 0.5, ARENA * 2 + 2, 1, WALL_H, 'boundary');
  addBox(-ARENA - 0.5, 0, 1, ARENA * 2, WALL_H, 'boundary');
  addBox(ARENA + 0.5, 0, 1, ARENA * 2, WALL_H, 'boundary');
  LAYOUT.forEach((o) => addBox(...o));

  // Faixas luminosas no topo dos muros externos
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  [[0, -ARENA + 0.03, ARENA * 2, 0.04], [0, ARENA - 0.03, ARENA * 2, 0.04],
   [-ARENA + 0.03, 0, 0.04, ARENA * 2], [ARENA - 0.03, 0, 0.04, ARENA * 2]].forEach(([x, z, w, d]) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), stripMat);
    s.position.set(x, WALL_H - 0.35, z);
    scene.add(s);
  });

  // Marcas de spawn no chão
  const ringGeo = new THREE.RingGeometry(0.9, 1.05, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, depthWrite: false });
  SPAWNS.flat().forEach(([x, z]) => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.02, z);
    scene.add(r);
  });

  // ---------- Modelo do bot ----------
  function makeBot() {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const body = new THREE.MeshStandardMaterial({ color: 0x8d97aa, roughness: 0.55, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.7, metalness: 0.2 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff5a4a });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.62, 0.9, 0.4), dark, 0, 0.45, 0);
    const upper = new THREE.Group();
    g.add(upper);
    const addU = (geo, mat, x, y, z) => { const m = add(geo, mat, x, y, z); upper.add(m); return m; };
    addU(new THREE.BoxGeometry(0.85, 0.85, 0.52), body, 0, 1.33, 0);
    addU(new THREE.BoxGeometry(0.5, 0.07, 0.02), glow, 0, 1.52, -0.27);
    addU(new THREE.BoxGeometry(0.46, 0.42, 0.46), body, 0, 2.0, 0);
    addU(new THREE.BoxGeometry(0.38, 0.09, 0.02), glow, 0, 2.03, -0.24);
    addU(new THREE.BoxGeometry(0.2, 0.62, 0.22), body, 0.53, 1.38, -0.05);
    addU(new THREE.BoxGeometry(0.2, 0.62, 0.22), body, -0.53, 1.38, -0.05);
    addU(new THREE.BoxGeometry(0.12, 0.14, 0.75), dark, 0.53, 1.15, -0.38);
    return { group: g, upper, body, glow, muzzle: new THREE.Vector3(0.53, 1.15, -0.8) };
  }
  const botModel = makeBot();
  scene.add(botModel.group);

  // ---------- Arma em primeira pessoa (cena própria, desenhada por cima) ----------
  const weaponScene = new THREE.Scene();
  const weaponCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
  weaponScene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30281f, 0.9));
  const wLight = new THREE.DirectionalLight(0xffe2c0, 0.8);
  wLight.position.set(1, 2, 1);
  weaponScene.add(wLight);
  const wFlashLight = new THREE.PointLight(0xffc070, 0, 2);
  wFlashLight.position.set(0.2, -0.15, -0.9);
  weaponScene.add(wFlashLight);

  const weapon = new THREE.Group();
  weaponScene.add(weapon);
  {
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a404c, roughness: 0.45, metalness: 0.6 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x1e2229, roughness: 0.85 });
    const accent = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    const part = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      weapon.add(m);
    };
    part(new THREE.BoxGeometry(0.09, 0.11, 0.42), metal, 0, 0, 0);
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 12), metal, 0, 0.02, -0.34, Math.PI / 2);
    part(new THREE.BoxGeometry(0.06, 0.15, 0.07), grip, 0, -0.11, 0.1, 0.3);
    part(new THREE.BoxGeometry(0.07, 0.1, 0.05), grip, 0, -0.09, -0.08, 0.1);
    part(new THREE.BoxGeometry(0.02, 0.03, 0.05), metal, 0, 0.07, -0.16);
    part(new THREE.BoxGeometry(0.092, 0.014, 0.22), accent, 0, 0.022, 0.02);
  }
  const muzzleFlash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  muzzleFlash.position.set(0, 0.02, -0.52);
  weapon.add(muzzleFlash);

  // ---------- Entidades ----------
  const player = {
    pos: new THREE.Vector3(), yaw: 0, hp: MAX_HP, alive: true, cooldown: 0,
    vel: 0, strafeVel: 0, turnHold: 0, turnRate: 0, recoil: 0, bob: 0, shake: 0, deathT: 0,
    pitch: 0, swayX: 0, swayY: 0, shots: 0, hits: 0,
  };
  const bot = {
    pos: new THREE.Vector3(), yaw: 0, hp: MAX_HP, alive: true, cooldown: 0,
    seen: 0, memory: 0, alert: 0, lastKnown: new THREE.Vector3(),
    wander: null, wanderT: 0, strafeDir: 1, strafeT: 0, stuck: 0, detourSide: 1,
    flash: 0, revealed: 0, deathT: 0, moving: 0, walk: 0, visibleToPlayer: false,
  };
  const score = { you: 0, bot: 0 };
  let round = 0;
  let state = 'menu';       // menu | countdown | playing | roundEnd | paused | over
  let pausedFrom = null;
  let stateT = 0;
  let time = 0;

  // ---------- Colisão e visão ----------
  function collideCircle(pos, r) {
    for (const b of boxes) {
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centro dentro da caixa: empurra pelo lado mais próximo
        const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) pos.x = b.minX - r;
        else if (m === rr) pos.x = b.maxX + r;
        else if (m === t) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
      }
    }
  }

  function separate() {
    if (!player.alive || !bot.alive) return;
    const dx = bot.pos.x - player.pos.x, dz = bot.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz), min = PLAYER_R + BOT_R;
    if (d >= min || d < 1e-6) return;
    const push = (min - d) / 2;
    player.pos.x -= (dx / d) * push; player.pos.z -= (dz / d) * push;
    bot.pos.x += (dx / d) * push; bot.pos.z += (dz / d) * push;
    collideCircle(player.pos, PLAYER_R);
    collideCircle(bot.pos, BOT_R);
  }

  // Interseção segmento × AABB no plano XZ; devolve t em [0,1] ou -1
  function segmentBox(ax, az, bx, bz, b, pad) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    const minX = b.minX - pad, maxX = b.maxX + pad, minZ = b.minZ - pad, maxZ = b.maxZ + pad;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minX || ax > maxX) return -1;
    } else {
      let ta = (minX - ax) / dx, tb = (maxX - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    if (Math.abs(dz) < 1e-9) {
      if (az < minZ || az > maxZ) return -1;
    } else {
      let ta = (minZ - az) / dz, tb = (maxZ - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    return t0;
  }

  // Interseção segmento × círculo no plano XZ; devolve t em [0,1] ou -1
  function segmentCircle(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az, fx = ax - cx, fz = az - cz;
    const a = dx * dx + dz * dz;
    const c = fx * fx + fz * fz - r * r;
    if (c <= 0) return 0;
    if (a < 1e-12) return -1;
    const b = 2 * (fx * dx + fz * dz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }

  function hasLOS(ax, az, bx, bz) {
    for (const b of boxes) if (segmentBox(ax, az, bx, bz, b, 0) >= 0) return false;
    return true;
  }

  function pathClear(x, z, dx, dz, len, r) {
    for (const b of boxes) if (segmentBox(x, z, x + dx * len, z + dz * len, b, r) >= 0) return false;
    return true;
  }

  // Desvia de obstáculos testando ângulos crescentes em torno da direção desejada
  function steer(ent, dirX, dirZ, r) {
    const base = Math.atan2(dirX, dirZ);
    const offsets = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2];
    for (const o of offsets) {
      const a = base + o * ent.detourSide;
      const dx = Math.sin(a), dz = Math.cos(a);
      if (pathClear(ent.pos.x, ent.pos.z, dx, dz, 2.2, r * 0.9)) return [dx, dz];
    }
    return [dirX, dirZ];
  }

  function freePoint(margin) {
    for (let i = 0; i < 40; i++) {
      const x = rand(-ARENA + 2, ARENA - 2), z = rand(-ARENA + 2, ARENA - 2);
      const blocked = boxes.some((b) => x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin);
      if (!blocked) return { x, z };
    }
    return { x: 0, z: 8 };
  }

  // ---------- Áudio (sintetizado) ----------
  let actx = null, noiseBuf = null;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    return actx;
  }
  function audioOut(a, pan) {
    if (a.createStereoPanner) {
      const p = a.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(a.destination);
      return p;
    }
    return a.destination;
  }
  function sfxShot(vol, pan, bright) {
    const a = audio();
    if (!a || a.state !== 'running') return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.4), a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime, dest = audioOut(a, pan);
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + 0.2);
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const og = a.createGain();
    og.gain.setValueAtTime(vol * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);
    o.connect(og); og.connect(dest);
    o.start(t); o.stop(t + 0.14);
  }
  function sfxTone(freq, dur, type, vol, slide, delay = 0) {
    const a = audio();
    if (!a || a.state !== 'running') return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------- Projéteis e efeitos ----------
  const bullets = [];
  const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1.2);
  const tracerMat = {
    player: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    bot: new THREE.MeshBasicMaterial({ color: 0xff5a4a }),
  };
  function spawnBullet(owner, origin, dir) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat[owner]);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    scene.add(mesh);
    bullets.push({ owner, pos: origin.clone(), dir: dir.clone(), mesh, life: 1.5 });
  }
  function clearBullets() {
    bullets.forEach((b) => scene.remove(b.mesh));
    bullets.length = 0;
  }

  const sparks = [];
  const sparkGeo = new THREE.SphereGeometry(0.12, 8, 6);
  function spark(pos, color, size) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(sparkGeo, mat);
    m.position.copy(pos);
    scene.add(m);
    sparks.push({ m, t: 0, size });
  }

  function updateBullets(dt) {
    const end = new THREE.Vector3();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      end.copy(b.pos).addScaledVector(b.dir, BULLET_SPEED * dt);
      let hitT = Infinity, hit = null;
      for (const box of boxes) {
        const t = segmentBox(b.pos.x, b.pos.z, end.x, end.z, box, 0);
        if (t >= 0 && t < hitT && b.pos.y + (end.y - b.pos.y) * t <= box.h) { hitT = t; hit = 'wall'; }
      }
      if (end.y <= 0) {
        const t = b.pos.y / (b.pos.y - end.y);
        if (t < hitT) { hitT = t; hit = 'wall'; }
      }
      const target = b.owner === 'player' ? bot : player;
      if (target.alive) {
        const r = b.owner === 'player' ? BOT_R : PLAYER_R;
        const h = b.owner === 'player' ? BOT_H : PLAYER_H;
        const t = segmentCircle(b.pos.x, b.pos.z, end.x, end.z, target.pos.x, target.pos.z, r);
        const y = b.pos.y + (end.y - b.pos.y) * t;
        if (t >= 0 && t < hitT && y >= 0 && y <= h) { hitT = t; hit = 'target'; }
      }
      if (hit) {
        const p = b.pos.clone().lerp(end, hitT);
        if (hit === 'target') {
          spark(p, b.owner === 'player' ? 0xff7a5a : 0xffffff, 1.4);
          if (b.owner === 'player') damageBot(PLAYER.damage);
          else damagePlayer(DIFF().damage, b.pos);
        } else {
          spark(p, b.owner === 'player' ? 0xffc070 : 0xff6a50, 0.8);
        }
        scene.remove(b.mesh);
        bullets.splice(i, 1);
        continue;
      }
      b.pos.copy(end);
      b.mesh.position.copy(end);
      b.life -= dt;
      if (b.life <= 0) { scene.remove(b.mesh); bullets.splice(i, 1); }
    }
  }

  // ---------- Dano ----------
  const fx = { hitmarker: 0, vignette: 0, dmg: 0, dmgAngle: 0, muzzle: 0, botMuzzle: 0, banner: 0 };

  function damagePlayer(amount, fromPos) {
    if (!player.alive || state !== 'playing') return;
    player.hp = Math.max(0, player.hp - amount);
    player.shake = Math.min(1, player.shake + 0.5);
    fx.vignette = 1;
    fx.dmg = 1;
    fx.dmgAngle = wrapAngle(yawTo(player.pos.x, player.pos.z, fromPos.x, fromPos.z) - player.yaw);
    sfxTone(150, 0.18, 'sawtooth', 0.1, 0.6);
    if (player.hp <= 0) {
      player.alive = false;
      sfxTone(220, 0.6, 'sawtooth', 0.12, 0.25);
      endRound('bot');
    }
  }

  function damageBot(amount) {
    if (!bot.alive || state !== 'playing') return;
    bot.hp = Math.max(0, bot.hp - amount);
    bot.flash = 0.12;
    bot.alert = 2;
    bot.lastKnown.copy(player.pos);
    bot.memory = 3;
    player.hits++;
    fx.hitmarker = 0.14;
    sfxTone(1300, 0.05, 'square', 0.05, 1);
    if (bot.hp <= 0) {
      bot.alive = false;
      sfxTone(660, 0.12, 'square', 0.06, 1);
      sfxTone(990, 0.2, 'square', 0.06, 1, 0.1);
      endRound('player');
    }
  }

  // ---------- Jogador ----------
  function playerShoot() {
    player.cooldown = PLAYER.fireDelay;
    player.recoil = 1;
    player.shots++;
    const dx = fwdX(player.yaw), dz = fwdZ(player.yaw);
    const cp = Math.cos(player.pitch);
    const origin = new THREE.Vector3(player.pos.x + dx * 0.3, EYE - 0.05, player.pos.z + dz * 0.3);
    spawnBullet('player', origin, new THREE.Vector3(dx * cp, Math.sin(player.pitch), dz * cp));
    fx.muzzle = 0.06;
    muzzleFlash.rotation.z = Math.random() * Math.PI;
    sfxShot(0.35, 0.1, 2400);
    // o bot ouve o disparo
    if (bot.alive && bot.pos.distanceTo(player.pos) < 35) {
      bot.alert = Math.max(bot.alert, 1.5);
      if (!hasLOS(bot.pos.x, bot.pos.z, player.pos.x, player.pos.z)) {
        bot.lastKnown.copy(player.pos);
        bot.memory = Math.max(bot.memory, 2.5);
      }
    }
  }

  const keys = {};

  function updatePlayer(dt, canShoot) {
    if (!player.alive) { player.deathT += dt; return; }
    const strafeMod = keys.ShiftLeft || keys.ShiftRight;
    const left = keys.ArrowLeft ? 1 : 0, right = keys.ArrowRight ? 1 : 0;
    const turnIn = strafeMod ? 0 : left - right;
    const strafeIn = clamp((strafeMod ? right - left : 0) + (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), -1, 1);

    // giro acelera enquanto a tecla é segurada: toques curtos permitem mira fina
    player.turnHold = turnIn ? player.turnHold + dt : 0;
    const turnSpeed = PLAYER.turnMin + (PLAYER.turnMax - PLAYER.turnMin) * clamp(player.turnHold / 0.35, 0, 1);
    player.turnRate = turnIn * turnSpeed;
    player.yaw = wrapAngle(player.yaw + player.turnRate * dt);

    const fwdIn = clamp((keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0), -1, 1);
    const k = Math.min(1, dt * 10);
    player.vel += (fwdIn * PLAYER.speed - player.vel) * k;
    player.strafeVel += (strafeIn * PLAYER.speed * 0.85 - player.strafeVel) * k;

    const fx_ = fwdX(player.yaw), fz_ = fwdZ(player.yaw);
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    player.pos.x += (fx_ * player.vel + rx * player.strafeVel) * dt;
    player.pos.z += (fz_ * player.vel + rz * player.strafeVel) * dt;
    collideCircle(player.pos, PLAYER_R);
    separate();

    player.cooldown -= dt;
    if (canShoot && (keys.Space || mouse.down) && player.cooldown <= 0) playerShoot();

    const moveAmt = Math.min(1, Math.hypot(player.vel, player.strafeVel) / PLAYER.speed);
    player.bob += dt * 9 * moveAmt;
  }

  // ---------- Bot ----------
  function pickWander() {
    // metade das vezes vai para perto do jogador, para manter o ritmo
    if (Math.random() < 0.5) {
      const p = freePoint(1.2);
      bot.wander = { x: clamp(player.pos.x + (p.x / ARENA) * 9, -ARENA + 2, ARENA - 2), z: clamp(player.pos.z + (p.z / ARENA) * 9, -ARENA + 2, ARENA - 2) };
    } else {
      bot.wander = freePoint(1.2);
    }
    bot.wanderT = rand(4, 8);
  }

  function updateBot(dt, canShoot) {
    if (!bot.alive) { bot.deathT += dt; return; }
    const d = DIFF();
    const dx = player.pos.x - bot.pos.x, dz = player.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const los = player.alive && hasLOS(bot.pos.x, bot.pos.z, player.pos.x, player.pos.z);
    const yawP = yawTo(bot.pos.x, bot.pos.z, player.pos.x, player.pos.z);
    const facingErr = Math.abs(wrapAngle(yawP - bot.yaw));
    const sees = los && (facingErr < 1.1 || dist < 7 || bot.alert > 0);

    bot.alert = Math.max(0, bot.alert - dt);
    if (sees) { bot.seen += dt; bot.memory = 4; bot.lastKnown.copy(player.pos); }
    else { bot.seen = Math.max(0, bot.seen - dt * 1.5); bot.memory = Math.max(0, bot.memory - dt); }

    let mx = 0, mz = 0, faceYaw = bot.yaw, speed = d.speed;
    if (sees) {
      // combate: encara o jogador, mantém distância e anda de lado
      faceYaw = yawP;
      const ux = dx / dist, uz = dz / dist;
      bot.strafeT -= dt;
      if (bot.strafeT <= 0) { bot.strafeDir = Math.random() < 0.5 ? -1 : 1; bot.strafeT = rand(0.7, 2.2); }
      const approach = dist > 15 ? 1 : dist < 7 ? -0.8 : 0;
      mx = ux * approach - uz * bot.strafeDir * 0.9;
      mz = uz * approach + ux * bot.strafeDir * 0.9;
      speed *= 0.8;
    } else if (bot.memory > 0) {
      // caça: vai até a última posição conhecida
      const tx = bot.lastKnown.x - bot.pos.x, tz = bot.lastKnown.z - bot.pos.z;
      const l = Math.hypot(tx, tz);
      if (l < 1.2) bot.memory = 0;
      else { mx = tx / l; mz = tz / l; }
    } else {
      // patrulha
      bot.wanderT -= dt;
      if (!bot.wander || bot.wanderT <= 0 || Math.hypot(bot.wander.x - bot.pos.x, bot.wander.z - bot.pos.z) < 1.5) pickWander();
      const tx = bot.wander.x - bot.pos.x, tz = bot.wander.z - bot.pos.z;
      const l = Math.hypot(tx, tz) || 1;
      mx = tx / l; mz = tz / l;
      speed *= 0.75;
    }

    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) {
      [mx, mz] = steer(bot, mx / ml, mz / ml, BOT_R);
      if (!sees) faceYaw = Math.atan2(-mx, -mz);
      const px = bot.pos.x, pz = bot.pos.z;
      bot.pos.x += mx * speed * dt;
      bot.pos.z += mz * speed * dt;
      collideCircle(bot.pos, BOT_R);
      separate();
      const moved = Math.hypot(bot.pos.x - px, bot.pos.z - pz);
      bot.moving = moved / dt;
      if (moved < speed * dt * 0.3) {
        bot.stuck += dt;
        if (bot.stuck > 0.35) { bot.stuck = 0; bot.strafeDir *= -1; bot.detourSide *= -1; bot.wander = null; }
      } else bot.stuck = 0;
    } else bot.moving = 0;

    const diff = wrapAngle(faceYaw - bot.yaw);
    const maxTurn = d.turn * dt;
    bot.yaw = wrapAngle(bot.yaw + clamp(diff, -maxTurn, maxTurn));

    bot.cooldown -= dt;
    if (canShoot && sees && bot.seen > d.reaction && bot.cooldown <= 0 && facingErr < 0.2) botShoot(d);
  }

  function botShoot(d) {
    bot.cooldown = d.fireDelay * rand(0.8, 1.4);
    syncBotModel(0);
    botModel.group.updateMatrixWorld(true);
    const origin = botModel.group.localToWorld(botModel.muzzle.clone());
    const dir = new THREE.Vector3(player.pos.x, 1.2, player.pos.z).sub(origin).normalize();
    // jogador em movimento é mais difícil de acertar
    const moving = Math.min(1, (Math.abs(player.vel) + Math.abs(player.strafeVel)) / PLAYER.speed);
    const spread = d.spread * (1 + moving * 0.8);
    const yaw = Math.atan2(dir.x, dir.z) + rand(-spread, spread);
    const pitch = Math.asin(clamp(dir.y, -1, 1)) + rand(-spread, spread) * 0.6;
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    spawnBullet('bot', origin, dir);

    bot.revealed = 1.2;
    fx.botMuzzle = 0.07;
    botFlashLight.position.copy(origin);

    // som posicionado: volume pela distância, pan pelo lado
    const tx = bot.pos.x - player.pos.x, tz = bot.pos.z - player.pos.z;
    const dist = Math.hypot(tx, tz) || 1;
    const pan = (tx * Math.cos(player.yaw) - tz * Math.sin(player.yaw)) / dist;
    sfxShot(clamp(0.45 - dist * 0.008, 0.08, 0.4), pan * 0.8, 1600);
  }

  function syncBotModel(dt) {
    const g = botModel.group;
    g.position.set(bot.pos.x, 0, bot.pos.z);
    g.rotation.y = bot.yaw;
    if (bot.alive) {
      bot.walk += dt * bot.moving * 1.8;
      g.rotation.x = 0;
      botModel.upper.position.y = Math.abs(Math.sin(bot.walk)) * 0.05;
      g.visible = true;
    } else {
      const k = Math.min(1, bot.deathT / 0.6);
      g.rotation.x = k * k * (Math.PI / 2);
      g.position.y = -Math.max(0, bot.deathT - 1.2) * 0.6;
      g.visible = bot.deathT < 3;
    }
    bot.flash = Math.max(0, bot.flash - dt);
    botModel.body.emissive.setHex(bot.flash > 0 ? 0x993322 : 0x000000);
  }

  // ---------- Câmera e arma ----------
  function updateCamera(dt) {
    if (state === 'menu' || state === 'over') {
      const a = time * 0.08;
      camera.position.set(Math.sin(a) * 24, 10, Math.cos(a) * 24);
      camera.rotation.set(0, 0, 0);
      camera.lookAt(0, 1, 0);
      return;
    }
    const moveAmt = Math.min(1, Math.hypot(player.vel, player.strafeVel) / PLAYER.speed);
    let y = EYE + Math.sin(player.bob * 2) * 0.035 * moveAmt;
    let roll = -player.strafeVel * 0.004;
    let pitch = player.pitch + player.recoil * 0.012;
    if (!player.alive) {
      const k = Math.min(1, player.deathT / 0.7);
      y = EYE - (EYE - 0.35) * k * k;
      roll = 0.5 * k;
      pitch = player.pitch * (1 - k) - 0.3 * k;
    }
    player.shake = Math.max(0, player.shake - dt * 3);
    const sh = player.shake * player.shake * 0.05;
    camera.position.set(player.pos.x + rand(-sh, sh), y + rand(-sh, sh), player.pos.z + rand(-sh, sh));
    camera.rotation.set(pitch, player.yaw, roll);
  }

  function updateWeapon(dt) {
    player.recoil = Math.max(0, player.recoil - dt * 8);
    const moveAmt = Math.min(1, Math.hypot(player.vel, player.strafeVel) / PLAYER.speed);
    const drop = player.alive ? 0 : Math.min(0.6, player.deathT);
    weapon.position.set(
      0.2 + Math.cos(player.bob) * 0.012 * moveAmt,
      -0.2 - Math.abs(Math.sin(player.bob)) * 0.014 * moveAmt - drop,
      -0.45 + player.recoil * 0.06
    );
    const swayDecay = Math.max(0, 1 - dt * 10);
    player.swayX *= swayDecay;
    player.swayY *= swayDecay;
    weapon.rotation.set(player.recoil * 0.12 + player.swayY, player.turnRate * 0.02 + player.swayX, 0);
    fx.muzzle = Math.max(0, fx.muzzle - dt);
    const on = fx.muzzle > 0 ? 1 : 0;
    muzzleFlash.material.opacity = on;
    muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
    playerFlashLight.intensity = on * 2.5;
    wFlashLight.intensity = on * 3;
  }

  // ---------- HUD ----------
  const radarCtx = ui.radar.getContext('2d');
  function sizeRadar() {
    const r = ui.radar.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ui.radar.width = Math.max(1, Math.round(r.width * dpr));
    ui.radar.height = Math.max(1, Math.round(r.height * dpr));
  }

  function drawRadar() {
    const g = radarCtx, s = ui.radar.width;
    if (s < 2) return;
    const k = s / 2 / 24; // 24 m do centro à borda
    const c = Math.cos(player.yaw), sn = Math.sin(player.yaw);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s, s);
    g.save();
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); g.clip();
    // mundo → radar com a frente do jogador apontando para cima
    const a = c * k, b = sn * k, cc = -sn * k, d = c * k;
    g.setTransform(a, b, cc, d, s / 2 - (a * player.pos.x + cc * player.pos.z), s / 2 - (b * player.pos.x + d * player.pos.z));
    g.fillStyle = 'rgba(139,148,168,0.55)';
    for (const bx of boxes) g.fillRect(bx.minX, bx.minZ, bx.maxX - bx.minX, bx.maxZ - bx.minZ);
    if (bot.alive && (bot.visibleToPlayer || bot.revealed > 0)) {
      g.fillStyle = '#ff5a4a';
      g.beginPath(); g.arc(bot.pos.x, bot.pos.z, 0.9, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // jogador no centro
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffb347';
    g.beginPath();
    g.moveTo(s / 2, s / 2 - s * 0.05);
    g.lineTo(s / 2 + s * 0.035, s / 2 + s * 0.035);
    g.lineTo(s / 2 - s * 0.035, s / 2 + s * 0.035);
    g.closePath(); g.fill();
  }

  function showBanner(title, sub, dur, tone) {
    ui.bannerTitle.textContent = title;
    ui.bannerSub.textContent = sub || '';
    ui.banner.className = 'show' + (tone ? ' ' + tone : '');
    fx.banner = dur;
  }

  function updateEffects(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.t += dt;
      const k = s.t / 0.2;
      if (k >= 1) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); continue; }
      s.m.scale.setScalar((0.4 + k * 1.4) * s.size);
      s.m.material.opacity = 1 - k;
    }
    fx.botMuzzle = Math.max(0, fx.botMuzzle - dt);
    botFlashLight.intensity = fx.botMuzzle > 0 ? 3 : 0;
    fx.hitmarker = Math.max(0, fx.hitmarker - dt);
    fx.vignette = Math.max(0, fx.vignette - dt * 1.6);
    fx.dmg = Math.max(0, fx.dmg - dt * 1.2);
    bot.revealed = Math.max(0, bot.revealed - dt);
    if (fx.banner > 0) {
      fx.banner -= dt;
      if (fx.banner <= 0) ui.banner.className = '';
    }
  }

  function updateHUD() {
    ui.hpYou.style.width = (player.hp / MAX_HP) * 100 + '%';
    ui.hpYouNum.textContent = Math.ceil(player.hp);
    ui.vitals.classList.toggle('low', player.alive && player.hp <= 30);
    ui.hpBot.style.width = (bot.hp / MAX_HP) * 100 + '%';
    ui.hitmarker.style.opacity = fx.hitmarker > 0 ? 1 : 0;
    const lowHp = player.alive ? Math.max(0, (35 - player.hp) / 35) * 0.5 : 0.8;
    ui.vignette.style.opacity = Math.max(fx.vignette, lowHp);
    ui.dmg.style.opacity = fx.dmg;
    ui.dmg.style.transform = `rotate(${-fx.dmgAngle}rad)`;
    bot.visibleToPlayer = bot.alive && hasLOS(player.pos.x, player.pos.z, bot.pos.x, bot.pos.z);
    ui.lockHint.hidden = isLocked() || !inGame();
    drawRadar();
  }

  function updateScoreUI() {
    ui.scoreYou.textContent = score.you;
    ui.scoreBot.textContent = score.bot;
    ui.roundLabel.textContent = 'Round ' + round;
  }

  // ---------- Fluxo da partida ----------
  function resetBotAt(x, z) {
    Object.assign(bot, {
      yaw: yawTo(x, z, 0, 0), hp: MAX_HP, alive: true, cooldown: 0.6,
      seen: 0, memory: 0, alert: 0, wander: null, wanderT: 0, stuck: 0,
      flash: 0, revealed: 0, deathT: 0, moving: 0,
    });
    bot.pos.set(x, 0, z);
    botModel.group.position.y = 0;
    botModel.group.rotation.x = 0;
    botModel.group.visible = true;
  }

  function startMatch() {
    if (state !== 'menu' && state !== 'over') return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const a = audio();
    if (a && a.state === 'suspended') a.resume();
    score.you = 0;
    score.bot = 0;
    round = 0;
    player.shots = 0;
    player.hits = 0;
    ui.menu.hidden = true;
    ui.end.hidden = true;
    ui.pause.hidden = true;
    ui.hud.hidden = false;
    sizeRadar();
    startRound();
    requestLock();
  }

  function startRound() {
    round++;
    clearBullets();
    const pair = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    const swap = Math.random() < 0.5;
    const ps = pair[swap ? 1 : 0], bs = pair[swap ? 0 : 1];
    player.pos.set(ps[0], 0, ps[1]);
    Object.assign(player, {
      yaw: yawTo(ps[0], ps[1], 0, 0), pitch: 0, hp: MAX_HP, alive: true, cooldown: 0,
      vel: 0, strafeVel: 0, turnHold: 0, turnRate: 0, recoil: 0, shake: 0, deathT: 0,
    });
    resetBotAt(bs[0], bs[1]);
    fx.vignette = 0;
    fx.dmg = 0;
    updateScoreUI();
    state = 'countdown';
    stateT = 1.6;
    showBanner('Round ' + round, `Você ${score.you} × ${score.bot} Bot`, 1.6);
  }

  function endRound(winner) {
    if (state !== 'playing') return;
    if (winner === 'player') {
      score.you++;
      showBanner('Abate', 'Você derrubou o bot', 2.4, 'win');
    } else {
      score.bot++;
      showBanner('Você caiu', 'O bot venceu este round', 2.4, 'lose');
    }
    updateScoreUI();
    state = 'roundEnd';
    stateT = 2.6;
  }

  function nextRound() {
    if (score.you >= WIN_KILLS || score.bot >= WIN_KILLS) showEnd();
    else startRound();
  }

  function showEnd() {
    state = 'over';
    releaseLock();
    clearBullets();
    ui.hud.hidden = true;
    ui.end.hidden = false;
    const won = score.you > score.bot;
    ui.endTitle.textContent = won ? 'Vitória' : 'Derrota';
    ui.endTitle.style.color = won ? 'var(--amber)' : 'var(--red)';
    ui.endScore.textContent = `${score.you} × ${score.bot}`;
    ui.stShots.textContent = player.shots;
    ui.stHits.textContent = player.hits;
    ui.stAcc.textContent = player.shots ? Math.round((player.hits / player.shots) * 100) + '%' : '—';
    ui.stDiff.textContent = DIFF().label;
    resetBotAt(0, 8);
  }

  function toMenu() {
    state = 'menu';
    releaseLock();
    clearBullets();
    ui.hud.hidden = true;
    ui.pause.hidden = true;
    ui.end.hidden = true;
    ui.menu.hidden = false;
    resetBotAt(0, 8);
  }

  const canvas = renderer.domElement;
  const MOUSE_SENS = 0.0022;
  const mouse = { down: false };
  let lastLockExit = 0;
  const inGame = () => state === 'countdown' || state === 'playing' || state === 'roundEnd';
  const isLocked = () => document.pointerLockElement === canvas;
  function requestLock() {
    if (isLocked() || !canvas.requestPointerLock) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* sem permissão: segue no teclado */ });
    } catch (e) { /* idem */ }
  }
  function releaseLock() {
    if (isLocked() && document.exitPointerLock) document.exitPointerLock();
  }

  function togglePause() {
    if (state === 'paused') {
      state = pausedFrom;
      ui.pause.hidden = true;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      requestLock();
    } else if (inGame()) {
      pausedFrom = state;
      state = 'paused';
      ui.pause.hidden = false;
      for (const k in keys) keys[k] = false;
      mouse.down = false;
      releaseLock();
    }
  }

  // ---------- Entrada ----------
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code) && state !== 'menu') e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      // Esc com o mouse travado já pausou via pointerlockchange
      if (e.code === 'Escape' && performance.now() - lastLockExit < 300) return;
      togglePause();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      if (state === 'menu' || state === 'over') startMatch();
      else if (state === 'paused') togglePause();
      return;
    }
    keys[e.code] = true;
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Mouse: mira com pointer lock, botão esquerdo atira
  addEventListener('mousemove', (e) => {
    if (!isLocked() || !inGame() || !player.alive) return;
    player.yaw = wrapAngle(player.yaw - e.movementX * MOUSE_SENS);
    player.pitch = clamp(player.pitch - e.movementY * MOUSE_SENS, -1.35, 1.35);
    player.swayX = clamp(player.swayX + e.movementX * 0.0004, -0.06, 0.06);
    player.swayY = clamp(player.swayY + e.movementY * 0.0004, -0.06, 0.06);
  });
  addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !inGame()) return;
    if (!isLocked()) { requestLock(); return; }
    mouse.down = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) return;
    mouse.down = false;
    lastLockExit = performance.now();
    if (inGame()) togglePause();
  });
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (state === 'playing' || state === 'countdown' || state === 'roundEnd') togglePause();
  });

  $('start').addEventListener('click', startMatch);
  $('restart').addEventListener('click', startMatch);
  $('resume').addEventListener('click', togglePause);
  $('quit').addEventListener('click', toMenu);
  $('to-menu').addEventListener('click', toMenu);

  const diffButtons = document.querySelectorAll('[data-diff]');
  function renderDiff() {
    diffButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.diff === diffKey)));
  }
  diffButtons.forEach((b) => b.addEventListener('click', () => {
    diffKey = b.dataset.diff;
    try { localStorage.setItem('arena-duelo-diff', diffKey); } catch (e) { /* sem storage */ }
    renderDiff();
  }));
  renderDiff();

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = weaponCam.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    weaponCam.updateProjectionMatrix();
    if (!ui.hud.hidden) sizeRadar();
  });

  // ---------- Loop principal ----------
  function step(dt) {
    switch (state) {
      case 'countdown':
        stateT -= dt;
        if (stateT <= 0) { state = 'playing'; showBanner('Lute!', '', 0.7); }
        break;
      case 'playing':
        updatePlayer(dt, true);
        updateBot(dt, true);
        updateBullets(dt);
        break;
      case 'roundEnd':
        updatePlayer(dt, false);
        updateBot(dt, false);
        updateBullets(dt);
        stateT -= dt;
        if (stateT <= 0) nextRound();
        break;
      default:
        break;
    }
    updateEffects(dt);
    syncBotModel(dt);
    updateCamera(dt);
    updateWeapon(dt);
    if (!ui.hud.hidden) updateHUD();
  }

  function render() {
    renderer.clear();
    renderer.render(scene, camera);
    const inGame = state === 'countdown' || state === 'playing' || state === 'roundEnd' || state === 'paused';
    if (inGame) {
      renderer.clearDepth();
      renderer.render(weaponScene, weaponCam);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state !== 'paused') {
      time += dt;
      step(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  resetBotAt(0, 8);
  requestAnimationFrame(frame);
})();
