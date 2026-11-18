// Cars: the player's ride, parked cars to steal, traffic that fills the
// streets, and the police fleet. One arcade driving model drives them all.
import * as THREE from 'three';
import { ROAD_LINES } from './city.js';
import { resolveCircleCollision } from './player.js';

const CAR_COLORS = [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a, 0x16a085];
const DIRS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.85, 2), bodyMat);
  body.position.y = 0.62;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.72, 1.8),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0x111111 : 0x223344 }),
  );
  cabin.position.set(-0.2, 1.35, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const hz of [0.7, -0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), headMat);
    h.position.set(2.22, 0.7, hz);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const tz of [0.7, -0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.4), tailMat);
    t.position.set(-2.22, 0.72, tz);
    g.add(t);
  }
  let lightBar = null;
  let lightRed = null;
  let lightBlue = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    lightRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lightRed.position.set(-0.2, 1.8, 0.45);
    lightBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    lightBlue.position.set(-0.2, 1.8, -0.45);
    lightBar.add(lightRed, lightBlue);
    g.add(lightBar);
  }
  g.add(body, cabin);
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
  return { group: g, wheels, lightRed, lightBlue };
}

export function makeCar(world, x, z, heading, color, isPolice, driver) {
  const parts = makeCarMesh(color, isPolice);
  parts.group.position.set(x, 0, z);
  parts.group.rotation.y = heading;
  world.scene.add(parts.group);
  return {
    ...parts,
    pos: parts.group.position,
    heading,
    speed: 0,
    steer: 0,
    color,
    isPolice,
    driver,
    health: 100,
    tiresBurst: false,
    dirIndex: 0,
    turnCooldown: 0,
    targetSpeed: 0,
    stuckTimer: 0,
    lastPos: new THREE.Vector3(x, 0, z),
  };
}

// Arcade driving for the car the player sits in.
export function drivePlayerCar(world, car, dt) {
  const input = world.input;
  const maxSpeed = (car.tiresBurst ? 22 : 40) * (car.health <= 0 ? 0 : 1);
  let accel = 0;
  if (input.keys['w'] || input.keys['arrowup']) accel = 16;
  if (input.keys['s'] || input.keys['arrowdown']) accel = car.speed > 0.5 ? -30 : -10;
  car.speed += accel * dt;
  car.speed -= car.speed * 0.35 * dt; // drag
  if (car.speed > maxSpeed) car.speed = maxSpeed;
  if (car.speed < -12) car.speed = -12;
  if (Math.abs(car.speed) < 0.15 && accel === 0) car.speed = 0;

  const steerTarget = ((input.keys['a'] || input.keys['arrowleft']) ? 1 : 0) - ((input.keys['d'] || input.keys['arrowright']) ? 1 : 0);
  const steerMax = 0.55 * (1 - Math.min(1, Math.abs(car.speed) / 45) * 0.55);
  car.steer += (steerTarget * steerMax - car.steer) * Math.min(1, dt * 8);
  const wobble = car.tiresBurst ? Math.sin(world.elapsed * 22) * 0.05 : 0;
  car.heading += (car.speed / 2.8) * Math.tan(car.steer) * dt + wobble * Math.abs(car.speed) * dt * 0.1;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  car.group.rotation.y = car.heading;

  // Wheels spin and steer.
  const spin = (car.speed * dt) / 0.42;
  car.wheels.forEach((w, i) => {
    w.rotation.y = i < 2 ? car.steer * 0.7 : 0;
    w.rotation.x += spin;
  });

  // Building collision: slide out, scrub speed, damage on a hard hit.
  const before = { x: car.pos.x, z: car.pos.z };
  resolveCircleCollision(car.pos, 2.2, world.city.colliders);
  const hit = Math.hypot(car.pos.x - before.x, car.pos.z - before.z) > 0.001;
  if (hit && Math.abs(car.speed) > 6) {
    car.health -= Math.abs(car.speed) * 0.7;
    world.audio.thud();
    world.hud.flashDamage();
    car.speed *= 0.45;
  }
  // World bounds and the seawall.
  car.pos.x = Math.max(-298, Math.min(298, car.pos.x));
  car.pos.z = Math.max(-298, Math.min(294, car.pos.z));
}

// Traffic: cars that cruise the road grid, turn at intersections and stop
// for the car ahead, like real Velamar drivers (mostly).
export class TrafficManager {
  constructor(world) {
    this.world = world;
    this.cars = [];
    this.spawnTimer = 0;
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) this.spawnOne(true);
  }

  spawnOne(anywhere) {
    const world = this.world;
    const rng = world.rng;
    const line = rng.pick(ROAD_LINES);
    const dirIndex = rng.int(0, 3);
    const d = DIRS[dirIndex];
    // Lane offset: right-hand traffic.
    const rx = -d.z;
    const rz = d.x;
    let x;
    let z;
    if (anywhere) {
      const along = rng.range(-280, 280);
      x = d.x !== 0 ? along : line + rx * 4.5;
      z = d.z !== 0 ? along : line + rz * 4.5;
    } else {
      // Near the player, 90-150 units away on a road, in the correct lane
      // for the direction it drives (right-hand traffic).
      const ang = rng.range(0, Math.PI * 2);
      const dist = rng.range(90, 150);
      const px = world.player.pos.x + Math.cos(ang) * dist;
      const pz = world.player.pos.z + Math.sin(ang) * dist;
      const nearestLine = (v) => ROAD_LINES.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), ROAD_LINES[0]);
      if (d.z !== 0) {
        // Driving north/south: the lane is an x road line.
        x = nearestLine(px) + rx * 4.5;
        z = Math.max(-280, Math.min(280, pz));
      } else {
        // Driving east/west: the lane is a z road line.
        x = Math.max(-280, Math.min(280, px));
        z = nearestLine(pz) + rz * 4.5;
      }
    }
    const car = makeCar(world, x, z, Math.atan2(d.x, d.z), rng.pick(CAR_COLORS), false, 'traffic');
    car.dirIndex = dirIndex;
    car.targetSpeed = rng.range(9, 14);
    car.speed = car.targetSpeed;
    this.cars.push(car);
    return car;
  }

  nearestRoadCoord(v) {
    return ROAD_LINES.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), ROAD_LINES[0]);
  }

  update(dt) {
    const world = this.world;
    const playerPos = world.player.pos;
    for (const car of this.cars) {
      const d = DIRS[car.dirIndex];
      // At an intersection, sometimes turn.
      car.turnCooldown -= dt;
      const nearX = Math.abs(car.pos.x - this.nearestRoadCoord(car.pos.x)) < 2.5;
      const nearZ = Math.abs(car.pos.z - this.nearestRoadCoord(car.pos.z)) < 2.5;
      if (nearX && nearZ && car.turnCooldown <= 0) {
        const roll = world.rng.next();
        if (roll < 0.25) car.dirIndex = (car.dirIndex + 3) % 4; // left
        else if (roll < 0.5) car.dirIndex = (car.dirIndex + 1) % 4; // right
        car.turnCooldown = 4;
      }
      // Stop for the car ahead in the same lane.
      let blocked = false;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const ahead = dx * d.x + dz * d.z;
        const side = Math.abs(dx * -d.z + dz * d.x);
        if (ahead > 0 && ahead < 13 && side < 3) {
          blocked = true;
          break;
        }
      }
      const want = blocked ? 0 : car.targetSpeed;
      car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
      // Smooth heading toward the lane direction.
      const targetHeading = Math.atan2(d.x, d.z);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += dh * Math.min(1, dt * 3);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.group.rotation.y = car.heading;
      const spin = (car.speed * dt) / 0.42;
      car.wheels.forEach((w) => {
        w.rotation.x += spin;
      });
      // Keep the streets full near the player, thin far away.
      if (Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z) > 280) {
        this.despawn(car);
        this.spawnOne(false);
      }
    }
    // Top the fleet up.
    this.spawnTimer -= dt;
    if (this.cars.length < 14 && this.spawnTimer <= 0) {
      this.spawnOne(false);
      this.spawnTimer = 3;
    }
  }

  despawn(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.world.scene.remove(car.group);
  }

  // All cars the player could steal or crash into.
  allCars() {
    return this.cars;
  }
}
