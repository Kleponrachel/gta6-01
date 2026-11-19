// Velamar: the city itself. A 7x7 block grid with a waterfront on the south,
// built from one ground texture, instanced buildings, palms and lamps, and a
// sun that follows the time of day. Everything here is deterministic per seed.
import * as THREE from 'three';
import { PITCH, ROAD_LINES, CITY_HALF, GROUND_HALF, BLOCK_CENTERS, LANDMARKS, districtAt } from './constants.js';
import { makeRng, parkIndices } from './rng.js';
import { makeGroundTexture, makeFacadeTexture, makeCloudTexture, makeOceanTexture } from './textures.js';

export { PITCH, ROAD_LINES, CITY_HALF, GROUND_HALF, BLOCK_CENTERS, LANDMARKS, districtAt };

const SKY_STOPS = [
  { tod: 6, sky: 0xffd9a0, sun: 0xffb36b, fog: 0xe8c49a, sunI: 1.6, hemiI: 0.5 },
  { tod: 10, sky: 0x7ec8f0, sun: 0xfff2d0, fog: 0x9fd4ee, sunI: 2.6, hemiI: 0.75 },
  { tod: 14, sky: 0x6fb9ec, sun: 0xffffff, fog: 0x9ccfee, sunI: 2.8, hemiI: 0.8 },
  { tod: 17.5, sky: 0xf7b267, sun: 0xff9a4d, fog: 0xf0b070, sunI: 2.2, hemiI: 0.65 },
  { tod: 19.5, sky: 0xe8825a, sun: 0xff7a3d, fog: 0xd88a68, sunI: 1.4, hemiI: 0.5 },
];

export function buildCity(world) {
  const { scene, rng, seed } = world;
  const cityRng = makeRng(seed + 101);
  const [parkA, parkB] = parkIndices(seed);

  // Ground: one textured plane for streets, sidewalks, parks and beach.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng, seed) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ocean south of the seawall, with a slow scrolling wave texture.
  const oceanTex = makeOceanTexture();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 460),
    new THREE.MeshPhongMaterial({ map: oceanTex, shininess: 90, specular: 0x88bbdd }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.6, 320 + 230);
  scene.add(ocean);

  // Seawall segments along the beach.
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (let x = -320; x < 320; x += 40) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 2.4, 2), wallMat);
    wall.position.set(x + 20, 1.2, 296);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  // Buildings: three instanced meshes, one per facade, so the whole city is
  // a handful of draw calls (merged geometry) with per-instance tints.
  const facades = [
    makeFacadeTexture('#7d90a8', 0.25, makeRng(seed + 7)),
    makeFacadeTexture('#c9ad68', 0.2, makeRng(seed + 8)),
    makeFacadeTexture('#9a6a58', 0.18, makeRng(seed + 9)),
  ];

  const lots = [[], [], []];
  const colliders = [];
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let idx = 0;
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      if (idx === parkA || idx === parkB) {
        idx++;
        continue; // park block: no buildings
      }
      const cx = BLOCK_CENTERS[i];
      const cz = BLOCK_CENTERS[j];
      const distC = Math.hypot(cx, cz);
      const downtown = Math.max(0, 1 - distC / 420);
      const tall = downtown > 0.55 && cityRng.chance(0.5);
      const n = tall ? 1 : cityRng.int(2, 4);
      for (let k = 0; k < n; k++) {
        const w = cityRng.range(16, 26);
        const d = cityRng.range(16, 26);
        const h = tall
          ? cityRng.range(55, 105)
          : cityRng.range(13, 22 + downtown * 42);
        const ox = n === 1 ? 0 : cityRng.range(-14, 14);
        const oz = n === 1 ? 0 : cityRng.range(-14, 14);
        const x = cx + ox;
        const z = cz + oz;
        const variant = (idx + k) % 3;
        lots[variant].push({ x, z, w, h, d });
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      idx++;
    }
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  lots.forEach((list, v) => {
    const mat = new THREE.MeshLambertMaterial({ map: facades[v] });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, n) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      const s = 0.85 + cityRng.next() * 0.3;
      tint.setRGB(s, s, s);
      mesh.setColorAt(n, tint);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  });

  // Palm trees along the sidewalks, instanced trunk + canopy.
  const palmSpots = [];
  for (let n = 0; n < 90; n++) {
    const line = cityRng.pick(ROAD_LINES);
    const along = cityRng.range(-280, 280);
    const side = cityRng.pick([-1, 1]);
    if (cityRng.chance(0.5)) palmSpots.push({ x: line + side * 11, z: along });
    else palmSpots.push({ x: along, z: line + side * 11 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.IcosahedronGeometry(2.6, 0);
  canopyGeo.scale(1, 0.45, 1);
  canopyGeo.translate(0, 7.4, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach((p, n) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.setScalar(0.8 + cityRng.next() * 0.5);
    dummy.rotation.set(0, cityRng.next() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    canopies.setMatrixAt(n, dummy.matrix);
  });
  trunks.castShadow = true;
  canopies.castShadow = true;
  scene.add(trunks);
  scene.add(canopies);

  // Street lamps at intersections.
  const lampSpots = [];
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      if (cityRng.chance(0.5)) lampSpots.push({ x: lx + 10, z: lz + 10 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6);
  poleGeo.translate(0, 2.75, 0);
  const poles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
    lampSpots.length,
  );
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  headGeo.translate(0, 5.6, 0);
  const heads = new THREE.InstancedMesh(
    headGeo,
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    lampSpots.length,
  );
  lampSpots.forEach((p, n) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(n, dummy.matrix);
    heads.setMatrixAt(n, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  // Drifting clouds.
  const cloudTex = makeCloudTexture();
  const clouds = [];
  for (let n = 0; n < 12; n++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.position.set(cityRng.range(-400, 400), cityRng.range(120, 180), cityRng.range(-400, 400));
    spr.scale.set(cityRng.range(90, 180), cityRng.range(30, 55), 1);
    spr.userData.speed = cityRng.range(0.6, 1.6);
    scene.add(spr);
    clouds.push(spr);
  }

  // Sun + sky, driven by time of day.
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.65);
  scene.add(hemi);

  function updateSun(tod, focus) {
    // Find the two sky stops around tod and lerp.
    let a = SKY_STOPS[0];
    let b = SKY_STOPS[SKY_STOPS.length - 1];
    for (let s = 0; s < SKY_STOPS.length - 1; s++) {
      if (tod >= SKY_STOPS[s].tod && tod <= SKY_STOPS[s + 1].tod) {
        a = SKY_STOPS[s];
        b = SKY_STOPS[s + 1];
        break;
      }
    }
    const span = Math.max(0.001, b.tod - a.tod);
    const f = Math.min(1, Math.max(0, (tod - a.tod) / span));
    const lerpC = (ca, cb) => new THREE.Color(ca).lerp(new THREE.Color(cb), f);
    scene.background = lerpC(a.sky, b.sky);
    scene.fog = new THREE.Fog(lerpC(a.fog, b.fog), 260, 900);
    sun.color = lerpC(a.sun, b.sun);
    sun.intensity = a.sunI + (b.sunI - a.sunI) * f;
    hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * f;
    // Sun path: rises east, sets west, low at golden hour.
    const ang = ((tod - 6) / 13.5) * Math.PI;
    const elev = Math.sin(ang) * 0.9 + 0.12;
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    sun.position.set(fx + Math.cos(ang) * 320, elev * 320 + 40, fz + 160);
    sun.target.position.set(fx, 0, fz);
    sun.target.updateMatrixWorld();
  }

  updateSun(world.tod, null);

  return { colliders, landmarks: LANDMARKS, updateSun, oceanTex, clouds };
}
