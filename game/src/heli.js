// The VPD helicopter: spawns at four stars and up, hovers ahead of the
// player with a searchlight on them, and leaves when the heat cools off.
import * as THREE from 'three';

export class HeliManager {
  constructor(world) {
    this.world = world;
    this.group = null;
    this.rotor = null;
    this.tailRotor = null;
    this.spot = null;
    this.spotTarget = null;
    this.active = false;
    this.pos = new THREE.Vector3(0, 11, 0);
  }

  spawn() {
    const world = this.world;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 2.2), bodyMat);
    body.position.y = 0;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.9), new THREE.MeshLambertMaterial({ color: 0x2c4a66 }));
    nose.position.set(3, -0.1, 0);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 0.5), bodyMat);
    tail.position.set(-4.2, 0.4, 0);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.3), bodyMat);
    fin.position.set(-6.2, 1, 0);
    // Skids.
    const skidMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const sz of [0.9, -0.9]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.12), skidMat);
      skid.position.set(0, -1.15, sz);
      g.add(skid);
    }
    // Main rotor: two long blades on a mast.
    const rotor = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), skidMat);
    mast.position.y = 1.2;
    rotor.add(mast);
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const s of [1, -1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 0.5), bladeMat);
      blade.position.set(s * 3.2, 1.65, 0);
      rotor.add(blade);
    }
    // Tail rotor.
    const tailRotor = new THREE.Group();
    tailRotor.position.set(-6.2, 1, 0.35);
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.08), bladeMat);
      b.position.y = s * 0.8;
      tailRotor.add(b);
    }
    // Searchlight cone + a real light aimed at the player.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 11, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -6;
    cone.rotation.x = Math.PI;
    g.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.45, 0.5, 1.2);
    const spotTarget = new THREE.Object3D();
    world.scene.add(spotTarget);
    spot.target = spotTarget;
    g.add(spot);
    g.add(body, nose, tail, fin, rotor, tailRotor);
    g.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    const p = world.player.pos;
    this.pos.set(p.x, 11, p.z - 20);
    g.position.copy(this.pos);
    world.scene.add(g);
    this.group = g;
    this.rotor = rotor;
    this.tailRotor = tailRotor;
    this.spot = spot;
    this.spotTarget = spotTarget;
    this.active = true;
    // Screenshots hide pop-ups; the heli itself must carry the frame.
    if (!world.shotMode) world.hud.toast('VPD helicopter overhead!', 'Four stars — the eye in the sky is on you');
    world.audio.alarm();
  }

  clear() {
    if (!this.group) return;
    this.world.scene.remove(this.group);
    if (this.spotTarget) this.world.scene.remove(this.spotTarget);
    this.group = null;
    this.rotor = null;
    this.tailRotor = null;
    this.spot = null;
    this.spotTarget = null;
    this.active = false;
    this.world.audio.setRotor(false);
  }

  update(dt) {
    const world = this.world;
    const wanted = world.police.wanted;
    if (wanted >= 4 && !this.active) this.spawn();
    else if (wanted < 4 && this.active) this.clear();
    if (!this.active || !this.group) return;
    // Hover ahead of the player, low enough to read in the frame.
    const p = world.player.pos;
    const heading = world.player.car ? world.player.car.heading : world.player.heading;
    const tx = p.x + Math.sin(heading) * 18;
    const tz = p.z + Math.cos(heading) * 18;
    this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 1.6);
    this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 1.6);
    this.pos.y += (11 - this.pos.y) * Math.min(1, dt * 2);
    // Gentle bob so it reads as flying, not parked in the sky.
    this.group.position.set(this.pos.x, this.pos.y + Math.sin(world.elapsed * 1.4) * 0.7, this.pos.z);
    this.group.rotation.y = heading;
    if (this.rotor) this.rotor.rotation.y += dt * 22;
    if (this.tailRotor) this.tailRotor.rotation.z += dt * 30;
    if (this.spotTarget) {
      this.spotTarget.position.set(p.x, 0, p.z);
      this.spotTarget.updateMatrixWorld();
    }
    world.audio.setRotor(true);
  }
}
