// VELAMAR HEAT — an open-world crime game in the browser.
// Boots the world, owns the game loop, the camera, input and the state
// machine (title / playing / paused / busted / wasted / ending).
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { buildCity, ROAD_LINES } from './city.js';
import { createPlayer, updatePlayerOnFoot, resolveCircleCollision } from './player.js';
import { makeCar, drivePlayerCar, TrafficManager } from './vehicles.js';
import { PedManager } from './peds.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { parseShotParams, stageShot } from './shots.js';

const params = parseShotParams();
const seed = params.seed;
const rng = makeRng(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);

const world = {
  scene,
  camera,
  renderer,
  rng,
  seed,
  tod: params.tod,
  elapsed: 0,
  state: 'title',
  input: { keys: {}, interact: false, mouseDown: false },
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 8,
  landmarks: null,
  lastShot: null,
  shotMode: params.shot,
  sunTimer: 0,
  lastCrashSound: 0,
};

world.city = buildCity(world);
world.landmarks = world.city.landmarks;
world.player = createPlayer(world);
world.traffic = new TrafficManager(world);
world.traffic.spawnTraffic(14);
world.parkedCars = [];
const PARKED_SPOTS = [
  { x: -193.5, z: 60, h: Math.PI / 2 },
  { x: 46.5, z: -160, h: 0 },
  { x: -113.5, z: 120, h: -Math.PI / 2 },
  { x: 126.5, z: -40, h: Math.PI },
  { x: -33.5, z: 200, h: Math.PI / 2 },
  { x: 206.5, z: 80, h: 0 },
];
const PARKED_COLORS = [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22];
PARKED_SPOTS.forEach((s, i) => {
  world.parkedCars.push(makeCar(world, s.x, s.z, s.h, PARKED_COLORS[i], false, 'parked'));
});
world.peds = new PedManager(world);
world.peds.spawnPeds(16);
world.police = new PoliceManager(world);
world.audio = new AudioEngine();
world.hud = new HUD(world);
world.missions = new MissionManager(world);
world.combat = new Combat(world);
world.saveGame = () => saveGame(world);

// --- Cars: getting in, getting out, finding the nearest stealable one. ---
world.nearestCar = (maxDist) => {
  const player = world.player;
  let best = null;
  let bestD = maxDist;
  const consider = (car) => {
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  };
  for (const car of world.parkedCars) consider(car);
  for (const car of world.traffic.cars) if (car.speed < 3) consider(car);
  return best;
};

world.enterCar = (car) => {
  const player = world.player;
  if (player.car || !car) return;
  if (car.driver === 'traffic') {
    world.traffic.cars.splice(world.traffic.cars.indexOf(car), 1);
  } else if (car.driver === 'parked') {
    world.parkedCars.splice(world.parkedCars.indexOf(car), 1);
  }
  if (car.driver !== 'player' && world.police.crimeSeen(30)) {
    world.police.addHeat(1, 'Car stolen!');
  }
  car.driver = 'player';
  player.car = car;
  player.group.visible = false;
  // Swing the camera behind the car so the road ahead is what you see.
  world.cameraYaw = car.heading + Math.PI;
  world.audio.ensure();
};

world.exitCar = () => {
  const player = world.player;
  const car = player.car;
  if (!car) return;
  car.speed = 0;
  car.driver = 'parked';
  world.parkedCars.push(car);
  const rx = Math.cos(car.heading);
  const rz = -Math.sin(car.heading);
  player.pos.set(car.pos.x + rx * 3, 0, car.pos.z + rz * 3);
  player.heading = car.heading;
  player.group.visible = true;
  player.car = null;
};

// --- State machine. ---
world.setState = (s) => {
  world.state = s;
  const hud = world.hud;
  // On the title screen the in-game HUD stays out of the way.
  document.body.classList.toggle('title-mode', s === 'title');
  if (s === 'title') {
    hud.hideAllOverlays();
    hud.el.titleScreen.classList.remove('hidden');
    hud.el.continueBtn.classList.toggle('hidden', !hasSave());
  } else if (s === 'playing') {
    hud.hideAllOverlays();
  } else if (s === 'paused') {
    hud.hideAllOverlays();
    hud.el.pauseMenu.classList.remove('hidden');
  } else if (s === 'busted') {
    world.player.money = Math.max(0, world.player.money - 200);
    hud.hideAllOverlays();
    hud.el.bustedScreen.classList.remove('hidden');
  } else if (s === 'wasted') {
    world.player.money = Math.max(0, world.player.money - 150);
    hud.hideAllOverlays();
    hud.el.wastedScreen.classList.remove('hidden');
  }
};

world.startGame = (fromSave) => {
  world.audio.ensure();
  const player = world.player;
  if (fromSave) {
    const data = loadGame();
    if (data) {
      player.money = data.money;
      player.trust = data.trust;
      player.health = data.health;
      player.weapon = data.weapon;
      player.hasSmg = !!data.hasSmg || data.weapon === 'smg';
      player.ammo = data.ammo;
      player.pos.set(data.pos.x, 0, data.pos.z);
      world.tod = data.tod || 17.2;
      if (data.storyDone) {
        world.missions.storyDone = true;
        world.missions.startSideJob();
      } else {
        world.missions.startMission(data.missionIndex || 0);
      }
    }
  } else {
    clearSave();
    player.money = 0;
    player.trust = 50;
    player.health = 100;
    player.weapon = false;
    player.hasSmg = false;
    player.ammo = 0;
    player.pos.set(world.landmarks.spawn.x, 0, world.landmarks.spawn.z);
    world.tod = 17.2;
    world.missions.startMission(0);
  }
  world.setState('playing');
};

world.quitToTitle = () => {
  if (world.player.car) world.exitCar();
  world.saveGame();
  world.setState('title');
};

world.respawnAfterBust = () => {
  const player = world.player;
  if (player.car) world.exitCar();
  player.health = 100;
  player.pos.set(world.landmarks.safehouse.x, 0, world.landmarks.safehouse.z);
  player.group.visible = true;
  world.police.wanted = 0;
  for (const c of world.police.cars) world.scene.remove(c.group);
  world.police.cars.length = 0;
  world.police.heli.clear();
  world.setState('playing');
  world.hud.toast('Back on the street', 'The VPD let you go — this time');
};

// --- Input. ---
const PREVENT = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (PREVENT.includes(key)) e.preventDefault();
  if (e.repeat) return;
  world.input.keys[key] = true;
  world.audio.ensure();
  if (key === 'e') {
    world.input.interact = true;
    if (world.state !== 'playing') return;
    const player = world.player;
    if (player.car) {
      const a = world.landmarks.autoshop;
      const nearShop = Math.hypot(player.car.pos.x - a.x, player.car.pos.z - a.z) < 10;
      if (nearShop && (player.car.tiresBurst || player.car.health < (player.car.maxHealth || 100)) && player.money >= 50) {
        player.money -= 50;
        player.car.tiresBurst = false;
        player.car.health = player.car.maxHealth || 100;
        world.hud.toast('Car repaired', 'Fresh tires, full tank — $50');
        world.audio.pickup();
        return;
      }
      world.exitCar();
    } else {
      const car = world.nearestCar(4);
      if (car) world.enterCar(car);
    }
  } else if ((key === '1' || key === '2' || key === '3') && world.state === 'playing' && world.player.car) {
    // Garage upgrades at the Auto Shop (in the car, near the shop).
    const player = world.player;
    const car = player.car;
    const a = world.landmarks.autoshop;
    if (Math.hypot(car.pos.x - a.x, car.pos.z - a.z) >= 10) return;
    if (!car.upgrades) car.upgrades = { engine: 0, armor: 0, nos: false };
    const buy = (price, ok, apply, label) => {
      if (!ok) {
        world.hud.toast('Already maxed out', label);
        return;
      }
      if (player.money < price) {
        world.hud.toast('Not enough cash', `${label} costs $${price}`);
        return;
      }
      player.money -= price;
      apply();
      world.hud.toast(`${label} installed`, `-$${price}`);
      world.audio.pickup();
    };
    if (key === '1') {
      buy(300, car.upgrades.engine < 2, () => { car.upgrades.engine += 1; }, `Engine Lv ${car.upgrades.engine + 1}`);
    } else if (key === '2') {
      buy(250, car.upgrades.armor < 2, () => {
        car.upgrades.armor += 1;
        car.maxHealth = 100 + car.upgrades.armor * 50;
        car.health = Math.min(car.maxHealth, car.health + 50);
      }, `Armor Lv ${car.upgrades.armor + 1}`);
    } else if (key === '3') {
      if (car.upgrades.nos) {
        buy(150, car.nosCharge < 100, () => { car.nosCharge = 100; }, 'NOS refilled');
      } else {
        buy(400, true, () => { car.upgrades.nos = true; car.nosMax = 100; car.nosCharge = 100; }, 'NOS installed');
      }
    }
  } else if (key === 'q' && world.state === 'playing' && !world.player.car && world.player.hasSmg) {
    // Switch between the pistol and the SMG on foot.
    const player = world.player;
    player.weapon = player.weapon === 'smg' ? true : 'smg';
    world.hud.toast(player.weapon === 'smg' ? 'SMG equipped' : 'Pistol equipped', player.weapon === 'smg' ? 'Rapid fire — Q to switch back' : 'Heavy hits — Q to switch to SMG');
    world.audio.click();
  } else if (key === 'f' && world.state === 'playing' && !world.player.car) {
    world.combat.punch();
  } else if (key === 'r' && world.player.car) {
    world.audio.cycleRadio();
  } else if (key === 'm') {
    const muted = world.audio.toggleMute();
    world.hud.toast(muted ? 'Sound off' : 'Sound on', '');
  } else if (key === 'escape' || key === 'p') {
    if (world.state === 'playing') world.setState('paused');
    else if (world.state === 'paused') world.setState('playing');
  }
});
window.addEventListener('keyup', (e) => {
  world.input.keys[e.key.toLowerCase()] = false;
});

let dragging = false;
renderer.domElement.addEventListener('mousedown', (e) => {
  world.audio.ensure();
  world.input.mouseDown = true;
  if (world.state !== 'playing') return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
  dragging = true;
  if (document.pointerLockElement === renderer.domElement && !world.player.car && world.player.weapon) {
    world.combat.shoot();
  }
});
window.addEventListener('mouseup', () => {
  dragging = false;
  world.input.mouseDown = false;
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement || dragging) {
    world.cameraYaw -= e.movementX * 0.0035;
    world.cameraPitch = Math.max(-0.1, Math.min(0.6, world.cameraPitch + e.movementY * 0.002));
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Collisions between the player, cars and peds. ---
function collidePlayerAndCars(dt) {
  const worldRef = world;
  const player = world.player;
  if (player.car) {
    const car = player.car;
    const others = [...world.traffic.cars, ...world.police.cars];
    for (const other of others) {
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) * 0.5;
        car.pos.x += (dx / d) * push;
        car.pos.z += (dz / d) * push;
        other.pos.x -= (dx / d) * push;
        other.pos.z -= (dz / d) * push;
        if (Math.abs(car.speed) > 8 && world.elapsed - world.lastCrashSound > 0.4) {
          world.lastCrashSound = world.elapsed;
          car.health -= 6;
          world.audio.thud();
          world.hud.flashDamage();
          car.speed *= 0.8;
        }
      }
    }
    // Running over peds.
    for (const ped of world.peds.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 2.2 && Math.abs(car.speed) > 3) {
        world.peds.knockDown(ped);
        world.missions.killsThisMission += 1;
        if (world.police.crimeSeen(40)) world.police.addHeat(1, 'Pedestrian hit!');
        world.audio.thud();
        car.speed *= 0.85;
      }
    }
  } else {
    // On foot: traffic can run the player over.
    const cars = [...world.traffic.cars, ...world.police.cars];
    for (const car of cars) {
      const dx = player.pos.x - car.pos.x;
      const dz = player.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.8 && Math.abs(car.speed) > 4) {
        player.health -= 20;
        player.pos.x += (dx / (d || 1)) * 2.5;
        player.pos.z += (dz / (d || 1)) * 2.5;
        world.audio.thud();
        world.hud.flashDamage();
        if (player.health <= 0) world.setState('wasted');
        break;
      }
    }
  }
}

// --- Camera. ---
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (world.state === 'title') {
    const a = world.elapsed * 0.045;
    camera.position.set(Math.cos(a) * 230, 72, Math.sin(a) * 230);
    camera.lookAt(0, 0, 40);
    return;
  }
  const player = world.player;
  const focus = player.car ? player.car.pos : player.pos;
  const wanted = world.police.wanted;
  const dist = player.car ? (wanted >= 2 ? 13.5 : 10.5) : 8;
  const height = player.car ? 4.4 : 3.4;
  const yaw = world.cameraYaw;
  const desired = new THREE.Vector3(
    focus.x + Math.sin(yaw) * dist,
    focus.y + height,
    focus.z + Math.cos(yaw) * dist,
  );
  camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
  camTarget.set(focus.x, focus.y + (player.car ? 1.6 : 1.8), focus.z);
  camera.lookAt(camTarget);
}

// --- Main loop. ---
const clock = new THREE.Clock();
let staged = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  world.elapsed += dt;

  if (world.state === 'playing') {
    const player = world.player;
    if (player.car) {
      drivePlayerCar(world, player.car, dt);
      // The player's position IS the car while driving: missions, police,
      // the heli and the HUD all read player.pos.
      player.pos.set(player.car.pos.x, 0, player.car.pos.z);
    } else updatePlayerOnFoot(world, dt);
    world.traffic.update(dt);
    world.peds.update(dt);
    world.police.update(dt);
    world.missions.update(dt);
    world.combat.update(dt);
    collidePlayerAndCars(dt);
    world.tod += dt * 0.005;
    if (world.tod > 20) world.tod = 6;
    world.sunTimer += dt;
    if (world.sunTimer > 0.5) {
      world.sunTimer = 0;
      world.city.updateSun(world.tod, player.pos);
    }
    world.city.oceanTex.offset.x += dt * 0.008;
    world.city.oceanTex.offset.y += dt * 0.003;
    for (const c of world.city.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 450) c.position.x = -450;
    }
    let nearestPolice = 999;
    for (const c of world.police.cars) {
      nearestPolice = Math.min(nearestPolice, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z));
    }
    world.audio.setEngine(player.car ? Math.abs(player.car.speed) / 40 : 0, !!player.car);
    world.audio.setSiren(nearestPolice);
    world.audio.updateRadio(dt, !!player.car);
    world.hud.update(dt);
    world.input.interact = false;
  } else if (world.state === 'title') {
    world.city.oceanTex.offset.x += dt * 0.008;
    for (const c of world.city.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 450) c.position.x = -450;
    }
  }

  updateCamera(dt);
  renderer.render(scene, camera);

  if (world.shotMode && !staged) {
    staged = true;
    stageShot(world, world.shotMode);
  }
  if (world.shotMode && !window.__gameReady) {
    window.__gameReady = true;
  }
}

window.__game = world;
world.setState('title');
animate();
