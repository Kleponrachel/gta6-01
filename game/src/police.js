// The law: wanted stars, police pursuit, roadblocks, spike strips and the
// second wave. HEAT rises with crime and cools when the player stays clean.
import * as THREE from 'three';
import { ROAD_LINES } from './city.js';
import { makeCar } from './vehicles.js';
import { HeliManager } from './heli.js';

export class PoliceManager {
  constructor(world) {
    this.world = world;
    this.wanted = 0;
    this.timeSinceCrime = 999;
    this.decayTimer = 0;
    this.chaseTime = 0;
    this.wave2Done = false;
    this.roadblockTimer = 20;
    this.bustedTimer = 0;
    this.cars = [];
    this.roadblocks = [];
    this.flashTimer = 0;
    this.flashOn = false;
    this.heli = new HeliManager(world);
  }

  addHeat(n, reason) {
    if (n <= 0) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.timeSinceCrime = 0;
    this.chaseTime = 0;
    this.wave2Done = false;
    this.world.hud.toast(reason, `Wanted level ${this.wanted}`);
    this.world.audio.alarm();
  }

  crimeSeen(maxDist) {
    // A crime counts as witnessed when a ped or a police car is close.
    const world = this.world;
    for (const ped of world.peds.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.pos.x - world.player.pos.x, ped.pos.z - world.player.pos.z) < maxDist) return true;
    }
    for (const c of this.cars) {
      if (Math.hypot(c.pos.x - world.player.pos.x, c.pos.z - world.player.pos.z) < maxDist) return true;
    }
    return false;
  }

  spawnPoliceCar() {
    const world = this.world;
    const rng = world.rng;
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(90, 130);
    const line = ROAD_LINES.reduce(
      (best, l) => (Math.abs(l - (world.player.pos.x + Math.cos(ang) * dist)) < Math.abs(best - (world.player.pos.x + Math.cos(ang) * dist)) ? l : best),
      ROAD_LINES[0],
    );
    const x = Math.max(-280, Math.min(280, world.player.pos.x + Math.cos(ang) * dist));
    const z = Math.max(-280, Math.min(280, world.player.pos.z + Math.sin(ang) * dist));
    const car = makeCar(world, line, z, 0, 0xecf0f1, true, 'police');
    car.pos.set(x, 0, z);
    car.targetSpeed = 30;
    this.cars.push(car);
    return car;
  }

  spawnRoadblock() {
    const world = this.world;
    const player = world.player;
    const car = player.car;
    if (!car) return;
    // Ahead of the player on their current road, two cruisers across it.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const bx = car.pos.x + fx * 70;
    const bz = car.pos.z + fz * 70;
    const group = new THREE.Group();
    const stripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 1.2), stripMat);
    strip.position.set(bx, 0.15, bz);
    strip.rotation.y = car.heading + Math.PI / 2;
    group.add(strip);
    const spikeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    for (let s = -6; s <= 6; s += 2) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 4), spikeMat);
      // Spread across the road, perpendicular to the player's heading.
      spike.position.set(bx - Math.sin(car.heading) * s, 0.4, bz + Math.cos(car.heading) * s);
      group.add(spike);
    }
    world.scene.add(group);
    const blockers = [];
    for (const side of [-1, 1]) {
      const c = makeCar(world, bx - fz * side * 5, bz + fx * side * 5, car.heading + Math.PI / 2, 0xecf0f1, true, 'roadblock');
      c.speed = 0;
      blockers.push(c);
    }
    this.roadblocks.push({ group, strip, x: bx, z: bz, cars: blockers, timer: 30, hit: false });
    world.hud.toast('Roadblock ahead!', 'The VPD is setting a trap');
    world.audio.alarm();
  }

  update(dt) {
    const world = this.world;
    const player = world.player;
    this.timeSinceCrime += dt;
    this.heli.update(dt);
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flashTimer = 0.35;
      this.flashOn = !this.flashOn;
      for (const c of this.cars) {
        if (c.lightRed) c.lightRed.visible = this.flashOn;
        if (c.lightBlue) c.lightBlue.visible = !this.flashOn;
      }
    }

    // Wanted decay: stay clean and out of sight and the heat cools off.
    if (this.wanted > 0 && this.timeSinceCrime > 12) {
      let nearest = 999;
      for (const c of this.cars) {
        nearest = Math.min(nearest, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z));
      }
      if (nearest > 70 || this.cars.length === 0) {
        this.decayTimer += dt;
        if (this.decayTimer > 4) {
          this.decayTimer = 0;
          this.wanted -= 1;
          if (this.wanted === 0) world.hud.toast('You lost them', 'The heat is off — for now');
        }
      } else {
        this.decayTimer = 0;
      }
    }

    // Fleet size follows the stars; a second wave joins long chases.
    if (this.wanted > 0) this.chaseTime += dt;
    let target = this.wanted;
    if (this.wanted >= 4 && this.chaseTime > 20 && !this.wave2Done) {
      this.wave2Done = true;
      target += 2;
      world.hud.toast('Second wave incoming!', 'More units are joining the chase');
    }
    if (world.missions && world.missions.trustLowExtra && this.wanted >= 3) target += 1;
    while (this.cars.length < target) this.spawnPoliceCar();
    while (this.cars.length > target) {
      const c = this.cars.pop();
      world.scene.remove(c.group);
    }
    if (this.wanted === 0) {
      for (const c of this.cars) world.scene.remove(c.group);
      this.cars.length = 0;
    }

    // Roadblocks at three stars and up.
    if (this.wanted >= 3 && player.car) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0) {
        this.roadblockTimer = 25;
        this.spawnRoadblock();
      }
    }

    // Spike strips burst the player's tires.
    for (const rb of this.roadblocks) {
      rb.timer -= dt;
      if (player.car && !rb.hit) {
        const d = Math.hypot(player.car.pos.x - rb.x, player.car.pos.z - rb.z);
        if (d < 4) {
          rb.hit = true;
          player.car.tiresBurst = true;
          player.car.health -= 10;
          world.hud.toast('Tires burst!', 'Find the Auto Shop to repair');
          world.audio.thud();
        }
      }
      if (rb.timer <= 0) {
        world.scene.remove(rb.group);
        for (const c of rb.cars) world.scene.remove(c.group);
      }
    }
    this.roadblocks = this.roadblocks.filter((rb) => rb.timer > 0);

    // Pursuit: steer at the player, ram them, and bust them on foot.
    for (const c of this.cars) {
      const dx = player.pos.x - c.pos.x;
      const dz = player.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      // Stuck against a building? Back out.
      const moved = Math.hypot(c.pos.x - c.lastPos.x, c.pos.z - c.lastPos.z);
      c.lastPos.copy(c.pos);
      if (moved < 0.05 && Math.abs(c.speed) > 4) c.stuckTimer += dt;
      else c.stuckTimer = 0;
      const reversing = c.stuckTimer > 1.5;
      const top = 24 + this.wanted * 3;
      // A cruiser that reaches an on-foot player stops and makes the bust
      // instead of circling at speed forever (which only ever ran them over).
      const targetSpeed = reversing ? -10 : (!player.car && dist < 5 ? 0 : Math.min(top, dist * 0.9 + 8));
      c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 1.8);
      c.heading += Math.max(-1, Math.min(1, dh * 2.2)) * dt * (reversing ? -1 : 1) * Math.min(1, Math.abs(c.speed) / 8 + 0.3);
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      c.group.rotation.y = c.heading;
      const spin = (c.speed * dt) / 0.42;
      c.wheels.forEach((w) => {
        w.rotation.x += spin;
      });
      // Ram the player's car.
      if (player.car && dist < 4.4) {
        player.car.health -= 12 * dt * 4;
        if (player.car.health <= 0) {
          world.hud.toast('Your car is wrecked', 'Get out and run');
        }
        const push = 4.4 - dist;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        player.car.pos.x += nx * push * 0.5;
        player.car.pos.z += nz * push * 0.5;
      }
      // Bust the player on foot when a cruiser sits on them.
      if (!player.car && dist < 4 && Math.abs(c.speed) < 4) {
        this.bustedTimer += dt;
        world.hud.showBustedMeter(this.bustedTimer / 2.5);
        if (this.bustedTimer >= 2.5) {
          world.setState('busted');
          return;
        }
      } else {
        this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
        world.hud.showBustedMeter(0);
      }
      if (dist > 320) {
        world.scene.remove(c.group);
        this.cars.splice(this.cars.indexOf(c), 1);
      }
    }
  }
}
