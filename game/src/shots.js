// Screenshot staging: ?shot=start|drive|chase|foot&seed=N&tod=H puts the
// game into a fixed, readable scene so the four screenshots are real renders
// of the game itself, each showing a different slice of Velamar.
import { makeCar } from './vehicles.js';

export function parseShotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || null,
    seed: q.get('seed') ? parseInt(q.get('seed'), 10) || 1 : 1,
    tod: q.get('tod') ? parseFloat(q.get('tod')) : 17.2,
  };
}

export function stageShot(world, name) {
  const player = world.player;
  const lm = world.landmarks;
  if (name === 'start') {
    world.setState('title');
    world.tod = 17.5;
    return;
  }
  // Every other shot starts the game for real, then stages a scene.
  world.startGame(false);
  if (name === 'drive') {
    world.tod = 17.2;
    const car = makeCar(world, 40, -200, 0, 0xc0392b, false, 'player');
    car.speed = 16;
    world.enterCar(car);
    world.missions.startMission(1);
    world.traffic.spawnOne(false);
    world.traffic.spawnOne(false);
  } else if (name === 'chase') {
    world.tod = 17.6;
    // On the road x=40, heading north, so the chase runs down an avenue.
    const car = makeCar(world, 40, 120, Math.PI, 0x2471a3, false, 'player');
    car.speed = 26;
    world.enterCar(car);
    world.missions.startMission(3);
    world.police.addHeat(4, '');
    // Three cruisers in pursuit, staggered behind on the same road.
    const spots = [
      { x: 34, z: 152 },
      { x: 46, z: 162 },
      { x: 40, z: 174 },
    ];
    for (const s of spots) {
      const p = world.police.spawnPoliceCar();
      p.pos.set(s.x, 0, s.z);
      p.heading = Math.PI;
      p.speed = 24;
    }
    // A roadblock ahead on the avenue so the chase reads in one frame.
    for (const bx of [34, 46]) {
      const block = makeCar(world, bx, 75, Math.PI / 2, 0xecf0f1, true, 'roadblock');
      block.speed = 0;
    }
    world.hud.setObjective('Lose the Heat — the VPD is on you. Lose the wanted level.');
  } else if (name === 'foot') {
    world.tod = 18.1;
    player.pos.set(-44, 0, -124);
    player.heading = -Math.PI / 2;
    // Camera east of the player, on the road, looking west down the street.
    world.cameraYaw = Math.PI / 2;
    player.weapon = true;
    player.ammo = 24;
    world.missions.startMission(0);
    world.peds.spawnPeds(4);
  }
  world.city.updateSun(world.tod, player.pos);
  // Screenshots show the game, not its pop-ups.
  world.hud.cardTimer = 0;
  world.hud.toastTimer = 0;
  world.hud.el.missionCard.classList.add('hidden');
  world.hud.el.toast.classList.add('hidden');
}
