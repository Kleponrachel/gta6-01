// Combat: a pistol with a tracer and a muzzle flash, a punch for close
// work, and the pickup that arms the player in the first place.
import * as THREE from 'three';

export class Combat {
  constructor(world) {
    this.world = world;
    this.raycaster = new THREE.Raycaster();
    this.tracer = null;
    this.tracerTimer = 0;
    this.flash = new THREE.PointLight(0xffcc66, 0, 30);
    world.scene.add(this.flash);
    // Pistol pickup glowing on the sidewalk near the spawn.
    const p = world.landmarks.pistol;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.22), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    const glow = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35 }),
    );
    g.add(body, glow);
    g.position.set(p.x, 0.5, p.z);
    world.scene.add(g);
    this.pickup = { group: g, taken: false };
  }

  shoot() {
    const world = this.world;
    const player = world.player;
    if (!player.weapon) return;
    if (player.ammo <= 0) {
      world.audio.click();
      world.hud.toast('Out of ammo', 'Finish a mission to restock');
      return;
    }
    player.ammo -= 1;
    world.audio.shot();
    const from = world.camera.position.clone();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, world.camera);
    this.raycaster.far = 120;
    const targets = [];
    for (const ped of world.peds.peds) {
      if (ped.state !== 'down') targets.push(ped.group);
    }
    for (const car of world.traffic.cars) targets.push(car.group);
    for (const car of world.police.cars) targets.push(car.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(90));
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let obj = hit.object;
      while (obj.parent && obj.parent !== world.scene) obj = obj.parent;
      const ped = world.peds.peds.find((p) => p.group === obj);
      if (ped) {
        world.peds.knockDown(ped);
        world.missions.killsThisMission += 1;
        if (world.police.crimeSeen(45)) world.police.addHeat(1, 'Someone saw that!');
      } else {
        const car = [...world.traffic.cars, ...world.police.cars].find((c) => c.group === obj);
        if (car) {
          car.health -= 25;
          if (car.health <= 0 && car.driver === 'traffic') {
            car.targetSpeed = 0;
            car.speed = 0;
          }
          if (world.police.crimeSeen(45)) world.police.addHeat(1, 'Shots fired!');
        }
      }
    }
    // Tracer line + muzzle flash, both gone in a blink.
    if (this.tracer) world.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    world.scene.add(this.tracer);
    this.tracerTimer = 0.08;
    this.flash.position.copy(from);
    this.flash.intensity = 60;
    world.lastShot = { x: player.pos.x, z: player.pos.z, t: world.elapsed };
  }

  punch() {
    const world = this.world;
    const player = world.player;
    world.audio.punch();
    for (const ped of world.peds.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z);
      if (d < 2.4) {
        world.peds.knockDown(ped);
        world.missions.killsThisMission += 1;
        if (world.police.crimeSeen(35)) world.police.addHeat(1, 'Assault witnessed!');
        return;
      }
    }
    const cars = [...world.traffic.cars, ...world.police.cars];
    if (player.car) cars.push(player.car);
    for (const car of cars) {
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < 3.2) {
        car.health -= 8;
        if (world.police.crimeSeen(35)) world.police.addHeat(1, 'Car alarm!');
        return;
      }
    }
  }

  update(dt) {
    const world = this.world;
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0 && this.tracer) {
        world.scene.remove(this.tracer);
        this.tracer = null;
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 900);
    // Pistol pickup.
    if (!this.pickup.taken) {
      this.pickup.group.rotation.y += dt;
      const player = world.player;
      if (!player.car && Math.hypot(player.pos.x - this.pickup.group.position.x, player.pos.z - this.pickup.group.position.z) < 2) {
        this.pickup.taken = true;
        world.scene.remove(this.pickup.group);
        player.weapon = true;
        player.ammo = 24;
        world.hud.toast('Pistol picked up', 'Click to shoot • F to punch');
        world.audio.pickup();
      }
    }
  }
}
