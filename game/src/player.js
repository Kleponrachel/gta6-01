// Milo Reyes on foot: a third-person walker with a run, a jump, a punch,
// and the ability to climb into any car. Movement is relative to the camera.
import * as THREE from 'three';

// Push a circle (x/z) out of every building AABB it overlaps. Shared with
// the driving code: cars and walkers use the same city collision.
export function resolveCircleCollision(pos, radius, colliders) {
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 0.0001) {
        pos.x = b.maxX + radius;
      } else {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      }
    }
  }
}

const JACKET = 0x2a9d8f;
const SKIN = 0xd9a066;
const PANTS = 0x2e4057;

export function createPlayer(world) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), mat(PANTS));
  legL.position.set(-0.14, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.32), mat(JACKET));
  torso.position.y = 0.86;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), mat(SKIN));
  head.position.y = 1.38;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), mat(0xc0392b));
  cap.position.y = 1.58;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.16), mat(JACKET));
  armL.position.set(-0.38, 0.86, 0);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(legL, legR, torso, head, cap, armL, armR);
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
  const p = world.landmarks.spawn;
  g.position.set(p.x, 0, p.z);
  world.scene.add(g);

  return {
    group: g,
    pos: g.position,
    heading: 0,
    velY: 0,
    onGround: true,
    health: 100,
    money: 0,
    trust: 50,
    weapon: false,
    hasSmg: false,
    ammo: 0,
    car: null,
    walkPhase: 0,
    parts: { legL, legR, armL, armR },
  };
}

export function updatePlayerOnFoot(world, dt) {
  const player = world.player;
  const input = world.input;
  const camYaw = world.cameraYaw;
  const speed = input.keys['shift'] ? 10 : 6;
  let mx = 0;
  let mz = 0;
  if (input.keys['w'] || input.keys['arrowup']) mz -= 1;
  if (input.keys['s'] || input.keys['arrowdown']) mz += 1;
  if (input.keys['a'] || input.keys['arrowleft']) mx -= 1;
  if (input.keys['d'] || input.keys['arrowright']) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    // Camera-relative: forward is where the camera looks.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = -fz;
    const rz = fx;
    const vx = (fx * -mz + rx * mx) * speed;
    const vz = (fz * -mz + rz * mx) * speed;
    player.pos.x += vx * dt;
    player.pos.z += vz * dt;
    const targetHeading = Math.atan2(vx, vz);
    let dh = targetHeading - player.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    player.heading += dh * Math.min(1, dt * 12);
    player.walkPhase += dt * speed * 1.6;
  }
  // Jump + gravity.
  if (input.keys[' '] && player.onGround) {
    player.velY = 7;
    player.onGround = false;
  }
  if (!player.onGround) {
    player.velY -= 22 * dt;
    player.pos.y += player.velY * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.velY = 0;
      player.onGround = true;
    }
  }
  // City collision and world bounds.
  resolveCircleCollision(player.pos, 0.6, world.city.colliders);
  player.pos.x = Math.max(-298, Math.min(298, player.pos.x));
  player.pos.z = Math.max(-298, Math.min(294, player.pos.z));

  // Limb swing while walking, idle sway otherwise.
  const swing = moving ? Math.sin(player.walkPhase) * 0.65 : 0;
  const parts = player.parts;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = swing * 0.8;
  player.group.rotation.y = player.heading;
}
