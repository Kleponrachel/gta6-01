// Pedestrians: Velamar's locals. They stroll the sidewalks, cross streets
// at intersections, and run when a gun goes off or a car bears down on them.
import * as THREE from 'three';
import { ROAD_LINES } from './city.js';
import { resolveCircleCollision } from './player.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x95a5a6];

export class PedManager {
  constructor(world) {
    this.world = world;
    this.peds = [];
    this.spawnTimer = 0;
  }

  makePed(x, z) {
    const world = this.world;
    const g = new THREE.Group();
    const shirt = world.rng.pick(SHIRTS);
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.2), mat(0x2c3e50));
    legL.position.set(-0.13, 0.24, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.3), mat(shirt));
    torso.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), mat(0xd9a066));
    head.position.y = 1.28;
    g.add(legL, legR, torso, head);
    g.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    g.position.set(x, 0, z);
    world.scene.add(g);
    const ped = {
      group: g,
      pos: g.position,
      heading: world.rng.range(0, Math.PI * 2),
      target: new THREE.Vector3(x, 0, z),
      speed: world.rng.range(1.1, 2),
      state: 'walk',
      stateTimer: 0,
      walkPhase: world.rng.range(0, 6),
      legL,
      legR,
      downTimer: 0,
    };
    this.pickSidewalkTarget(ped);
    this.peds.push(ped);
    return ped;
  }

  // A point on a sidewalk: 11 units off a road line.
  pickSidewalkTarget(ped) {
    const rng = this.world.rng;
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-280, 280);
    const side = rng.pick([-1, 1]);
    if (rng.chance(0.5)) ped.target.set(line + side * 11, 0, along);
    else ped.target.set(along, 0, line + side * 11);
    // Sometimes cross the street at a nearby intersection instead of
    // strolling on to the next sidewalk.
    if (rng.chance(0.3)) {
      let bestX = null;
      let bestZ = null;
      let bestD = 30;
      for (const lx of ROAD_LINES) {
        for (const lz of ROAD_LINES) {
          const d = Math.hypot(ped.pos.x - lx, ped.pos.z - lz);
          if (d < bestD) {
            bestD = d;
            bestX = lx;
            bestZ = lz;
          }
        }
      }
      if (bestX !== null) {
        const side = ped.pos.x < bestX ? 1 : -1;
        ped.target.set(bestX + side * 11, 0, bestZ);
        ped.state = 'cross';
        return;
      }
    }
  }

  spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const rng = this.world.rng;
      const line = rng.pick(ROAD_LINES);
      const along = rng.range(-260, 260);
      const side = rng.pick([-1, 1]);
      if (rng.chance(0.5)) this.makePed(line + side * 11, along);
      else this.makePed(along, line + side * 11);
    }
  }

  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTimer = 6;
    ped.group.rotation.x = Math.PI / 2;
    ped.group.position.y = 0.3;
  }

  update(dt) {
    const world = this.world;
    const player = world.player;
    const playerCar = player.car;
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          this.respawn(ped);
        }
        continue;
      }
      // Flee: a recent gunshot nearby, or a fast car about to hit them.
      let fleeX = 0;
      let fleeZ = 0;
      let fleeing = false;
      const shot = world.lastShot;
      if (shot && world.elapsed - shot.t < 1.2) {
        const d = Math.hypot(ped.pos.x - shot.x, ped.pos.z - shot.z);
        if (d < 26) {
          fleeing = true;
          fleeX = ped.pos.x - shot.x;
          fleeZ = ped.pos.z - shot.z;
        }
      }
      if (playerCar && playerCar.speed > 6) {
        const d = Math.hypot(ped.pos.x - playerCar.pos.x, ped.pos.z - playerCar.pos.z);
        if (d < 9) {
          fleeing = true;
          fleeX = ped.pos.x - playerCar.pos.x;
          fleeZ = ped.pos.z - playerCar.pos.z;
        }
      }
      if (fleeing) {
        ped.state = 'flee';
        ped.stateTimer = 2.5;
        const len = Math.hypot(fleeX, fleeZ) || 1;
        ped.target.set(ped.pos.x + (fleeX / len) * 30, 0, ped.pos.z + (fleeZ / len) * 30);
      } else if (ped.state === 'flee') {
        ped.stateTimer -= dt;
        if (ped.stateTimer <= 0) {
          ped.state = 'walk';
          this.pickSidewalkTarget(ped);
        }
      }
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        ped.state = 'walk';
        this.pickSidewalkTarget(ped);
        continue;
      }
      const speed = ped.state === 'flee' ? 5.2 : ped.state === 'cross' ? 2.6 : ped.speed;
      const vx = (dx / dist) * speed;
      const vz = (dz / dist) * speed;
      ped.pos.x += vx * dt;
      ped.pos.z += vz * dt;
      ped.heading = Math.atan2(vx, vz);
      ped.group.rotation.y = ped.heading;
      ped.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(ped.walkPhase) * 0.55;
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      resolveCircleCollision(ped.pos, 0.5, world.city.colliders);
      // Thin the crowd far from the player, keep it dense near them.
      if (Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z) > 280) {
        this.respawn(ped);
      }
    }
    this.spawnTimer -= dt;
    if (this.peds.length < 16 && this.spawnTimer <= 0) {
      this.spawnPeds(2);
      this.spawnTimer = 4;
    }
  }

  respawn(ped) {
    const world = this.world;
    const rng = world.rng;
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(60, 140);
    const line = rng.pick(ROAD_LINES);
    const along = Math.max(-280, Math.min(280, world.player.pos.z + Math.sin(ang) * dist));
    ped.pos.set(line + 11, 0, along);
    ped.group.rotation.set(0, 0, 0);
    ped.group.position.y = 0;
    ped.state = 'walk';
    this.pickSidewalkTarget(ped);
  }
}
