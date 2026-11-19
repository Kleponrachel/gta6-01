// The Velamar Score: ten story missions, two heists, three endings, and
// side jobs for free roam. Missions are data; the manager just runs them.
import * as THREE from 'three';
import { ROAD_LINES } from './city.js';

const STORY = [
  {
    id: 'wheels',
    title: 'Wheels',
    brief: 'Ana: "You need wheels, Milo. Take any car on the street — just don\'t get seen."',
    type: 'enterCar',
    reward: 0,
  },
  {
    id: 'marina',
    title: 'Meet Ana',
    brief: 'Drive to the Marina. Ana is waiting by the water with the plan.',
    type: 'driveTo',
    target: 'marina',
    radius: 8,
    reward: 100,
  },
  {
    id: 'pickup',
    title: 'The Pickup',
    brief: 'The package is at the Docks. Get out and grab it (E).',
    type: 'pickup',
    target: 'docks',
    radius: 3,
    reward: 150,
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    brief: 'The pickup was hot — the VPD is on you. Lose the wanted level.',
    type: 'escape',
    reward: 200,
  },
  {
    id: 'informant',
    title: 'The Informant',
    brief: 'A snitch at the Club knows the vault layout. Drive there, get out and grab the intel (E).',
    type: 'pickup',
    target: 'club',
    radius: 3,
    reward: 250,
  },
  {
    id: 'race',
    title: 'Street Heat',
    brief: 'Prove the car is fast enough for the harbor job — hit all 3 checkpoints in 75 seconds.',
    type: 'race',
    checkpoints: [
      { x: 40, z: 200 },
      { x: 200, z: 40 },
      { x: 120, z: -200 },
    ],
    timeLimit: 75,
    reward: 400,
  },
  {
    id: 'collection',
    title: 'The Collection',
    brief: 'A bag of Marín cash is waiting at the Docks. Grab it on foot, then run it to the Safehouse — the VPD will be watching.',
    type: 'collect',
    target: 'docks',
    deliver: 'safehouse',
    radius: 3,
    reward: 600,
  },
  {
    id: 'store',
    title: 'Heist I: Corner Store',
    brief: 'Hold E at the store to rob the till. Fast — the alarm is loud.',
    type: 'heist',
    target: 'store',
    radius: 4,
    reward: 800,
  },
  {
    id: 'getaway',
    title: 'The Getaway',
    brief: 'Get the cash to the Safehouse in 90 seconds. The VPD wants it back.',
    type: 'timed',
    target: 'safehouse',
    radius: 8,
    timeLimit: 90,
    reward: 1200,
  },
  {
    id: 'harbor',
    title: 'Heist II: Harbor Vault',
    brief: 'The vault case is at the Harbor. Grab it, then run the gauntlet home.',
    type: 'heistDeliver',
    target: 'harbor',
    radius: 3,
    deliver: 'safehouse',
    reward: 5000,
  },
];

export class MissionManager {
  constructor(world) {
    this.world = world;
    this.index = 0;
    this.storyDone = false;
    this.heistProgress = 0;
    this.timer = 0;
    this.killsThisMission = 0;
    this.policeHandicap = 0;
    this.noRoadblocks = false;
    this.trustLowExtra = false;
    this.sideJob = null;
    this.sideJobTimer = 0;
    // Beacon: a pillar of light and a floating diamond over the objective.
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 35;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    diamond.position.y = 4;
    this.beacon = new THREE.Group();
    this.beacon.add(pillar, diamond);
    this.beacon.visible = false;
    world.scene.add(this.beacon);
    this.diamond = diamond;
    this.startMission(0);
  }

  get current() {
    return STORY[this.index];
  }

  get totalMissions() {
    return STORY.length;
  }

  targetPos(key) {
    const lm = this.world.landmarks[key];
    return new THREE.Vector3(lm.x, 0, lm.z);
  }

  startMission(i) {
    const world = this.world;
    this.index = i;
    this.heistProgress = 0;
    this.killsThisMission = 0;
    if (i >= STORY.length) {
      this.storyDone = true;
      world.hud.showEndingChoice((choice) => this.finishStory(choice));
      this.beacon.visible = false;
      world.hud.setObjective('The score is done. Choose your ending.');
      return;
    }
    const m = STORY[i];
    this.timer = m.timeLimit || 0;
    this.raceCheckpoint = 0;
    this.collectPhase = 'grab';
    world.hud.showMissionCard(m.title, m.brief);
    world.hud.setObjective(`${m.title} — ${m.brief}`);
    if (m.type === 'race' && m.checkpoints) {
      const c = m.checkpoints[0];
      this.beacon.position.set(c.x, 0, c.z);
      this.beacon.visible = true;
    } else if (m.target) {
      const p = this.targetPos(m.target);
      this.beacon.position.set(p.x, 0, p.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
    // The pickup was hot: the heat mission only works if there is heat.
    if (m.id === 'heat') {
      world.police.addHeat(2, 'The VPD spotted the pickup!');
    }
    // Ana's tip: high trust at the final heist means fewer units and no traps.
    if (m.id === 'harbor') {
      if (world.player.trust >= 60) {
        this.policeHandicap = 1;
        this.noRoadblocks = true;
        world.hud.toast('Ana tipped you off', 'Fewer units, no roadblocks — trust pays');
      } else if (world.player.trust < 30) {
        this.trustLowExtra = true;
        world.hud.toast('Ana doesn\'t trust you', 'The VPD got a tip — extra units');
      }
    }
  }

  completeMission() {
    const world = this.world;
    const m = this.current;
    const player = world.player;
    player.money += m.reward;
    player.ammo += 12;
    if (this.killsThisMission === 0) player.trust = Math.min(100, player.trust + 10);
    else player.trust = Math.max(0, player.trust - 5 * this.killsThisMission);
    world.hud.toast(`Mission complete: ${m.title}`, `+$${m.reward}  •  Trust ${player.trust}`);
    world.audio.missionComplete();
    world.saveGame();
    this.startMission(this.index + 1);
  }

  finishStory(choice) {
    const world = this.world;
    const endings = {
      keep: {
        title: 'Ending — King of Velamar',
        text: 'Milo keeps the vault money and buys the whole Marina. Ana never calls again, but the sunsets are his.',
      },
      debt: {
        title: 'Ending — Clean Slate',
        text: 'Milo pays the debt in full. The Marín family lets him walk. He keeps the car, the city, and his name.',
      },
      split: {
        title: 'Ending — Partners',
        text: 'Milo splits the score with Ana, fifty-fifty. Two outlaws, one city, and a bigger job already on the table.',
      },
    };
    const e = endings[choice] || endings.keep;
    world.hud.showEnding(e.title, e.text, world.player);
    this.storyDone = true;
    this.startSideJob();
    world.saveGame();
  }

  startSideJob() {
    const world = this.world;
    const rng = world.rng;
    const lm = world.landmarks;
    if (rng.chance(0.5)) {
      // Taxi: pick up a local at a sidewalk nearby, drop them across town.
      const line = rng.pick(ROAD_LINES);
      const along = Math.max(-280, Math.min(280, world.player.pos.z + rng.range(-70, 70)));
      const pickup = { x: line + 11, z: along };
      const dest = rng.pick([lm.marina, lm.docks, lm.safehouse, lm.harbor, lm.autoshop]);
      this.sideJob = { kind: 'taxi', title: 'Taxi Fare', target: pickup, dest, reward: 150, phase: 'pickup' };
      world.hud.setObjective('Taxi Fare — pick up the passenger at the marker, then drive them to the destination.');
    } else {
      const dest = rng.pick([lm.marina, lm.docks, lm.safehouse, lm.harbor, lm.autoshop]);
      this.sideJob = { kind: 'courier', title: 'Courier Run', target: dest, reward: 200, phase: 'deliver' };
      this.sideJobTimer = 60;
      world.hud.setObjective('Courier Run — deliver the package in 60 seconds.');
    }
    const p = this.sideJob.target;
    this.beacon.position.set(p.x, 0, p.z);
    this.beacon.visible = true;
  }

  completeSideJob() {
    const world = this.world;
    const job = this.sideJob;
    world.player.money += job.reward;
    world.player.trust = Math.min(100, world.player.trust + 5);
    world.hud.toast(`${job.title} complete`, `+$${job.reward}`);
    world.audio.missionComplete();
    world.saveGame();
    this.sideJob = null;
    this.startSideJob();
  }

  update(dt) {
    const world = this.world;
    const player = world.player;
    this.diamond.rotation.y += dt * 2;
    this.diamond.position.y = 4 + Math.sin(world.elapsed * 2) * 0.5;
    if (this.storyDone) {
      this.updateSideJob(dt);
      return;
    }
    const m = this.current;
    if (!m) return;
    const dist = (key) => {
      const p = this.targetPos(key);
      return Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    };
    if (m.type === 'enterCar' && player.car) {
      this.completeMission();
      return;
    }
    if (m.type === 'driveTo' && dist(m.target) < m.radius) {
      this.completeMission();
      return;
    }
    if (m.type === 'pickup' && !player.car && dist(m.target) < m.radius && world.input.interact) {
      this.completeMission();
      return;
    }
    if (m.type === 'escape') {
      if (world.police.wanted === 0) this.completeMission();
      return;
    }
    if (m.type === 'race') {
      this.timer -= dt;
      world.hud.setTimer(this.timer);
      const cp = m.checkpoints[this.raceCheckpoint];
      const d = Math.hypot(player.pos.x - cp.x, player.pos.z - cp.z);
      if (d < 10) {
        this.raceCheckpoint += 1;
        if (this.raceCheckpoint >= m.checkpoints.length) {
          world.hud.setTimer(0);
          this.completeMission();
          return;
        }
        const next = m.checkpoints[this.raceCheckpoint];
        this.beacon.position.set(next.x, 0, next.z);
        world.hud.toast(`Checkpoint ${this.raceCheckpoint + 1}/3`, 'Keep it floored');
        world.audio.pickup();
      } else if (this.timer <= 0) {
        this.timer = m.timeLimit;
        this.raceCheckpoint = 0;
        const first = m.checkpoints[0];
        this.beacon.position.set(first.x, 0, first.z);
        world.hud.toast('Out of time!', 'The street race restarts — try it faster');
      }
      return;
    }
    if (m.type === 'collect') {
      if (this.collectPhase === 'grab') {
        if (!player.car && dist(m.target) < m.radius && world.input.interact) {
          this.collectPhase = 'deliver';
          world.police.addHeat(2, 'The Collection was watched!');
          const d = this.targetPos(m.deliver);
          this.beacon.position.set(d.x, 0, d.z);
          world.hud.setObjective(`${m.title} — bag grabbed! Get it to the Safehouse.`);
          world.audio.pickup();
        }
      } else if (dist(m.deliver) < 8) {
        this.completeMission();
      }
      return;
    }
    if (m.type === 'heist') {
      if (!player.car && dist(m.target) < m.radius && world.input.keys['e']) {
        this.heistProgress += dt / 3;
        world.hud.showHeistProgress(this.heistProgress);
        if (this.heistProgress >= 1) {
          world.police.addHeat(2, 'Store robbery reported!');
          this.completeMission();
        }
      } else {
        this.heistProgress = Math.max(0, this.heistProgress - dt / 2);
        world.hud.showHeistProgress(0);
      }
      return;
    }
    if (m.type === 'timed') {
      this.timer -= dt;
      world.hud.setTimer(this.timer);
      if (dist(m.target) < m.radius) {
        world.hud.setTimer(0);
        this.completeMission();
        return;
      }
      if (this.timer <= 0) {
        this.timer = m.timeLimit;
        world.hud.toast('Too slow!', 'The drop went cold — try the run again');
      }
      return;
    }
    if (m.type === 'heistDeliver') {
      if (this.heistProgress < 1) {
        if (!player.car && dist(m.target) < m.radius && world.input.keys['e']) {
          this.heistProgress += dt / 3;
          world.hud.showHeistProgress(this.heistProgress);
          if (this.heistProgress >= 1) {
            world.police.addHeat(3, 'Harbor vault hit — every unit in Velamar is coming!');
            const d = this.targetPos(m.deliver);
            this.beacon.position.set(d.x, 0, d.z);
            world.hud.setObjective(`${m.title} — case grabbed! Get it to the Safehouse.`);
          }
        } else {
          this.heistProgress = Math.max(0, this.heistProgress - dt / 2);
          world.hud.showHeistProgress(0);
        }
      } else if (dist(m.deliver) < 8) {
        this.completeMission();
      }
    }
  }

  updateSideJob(dt) {
    const world = this.world;
    const job = this.sideJob;
    if (!job) return;
    const player = world.player;
    const d = Math.hypot(player.pos.x - job.target.x, player.pos.z - job.target.z);
    if (job.kind === 'courier') {
      this.sideJobTimer -= dt;
      world.hud.setTimer(this.sideJobTimer);
      if (d < 8) {
        world.hud.setTimer(0);
        this.completeSideJob();
        return;
      }
      if (this.sideJobTimer <= 0) {
        world.hud.setTimer(0);
        world.hud.toast('Delivery failed', 'The package went to someone else');
        this.sideJob = null;
        this.startSideJob();
      }
    } else if (job.kind === 'taxi') {
      if (job.phase === 'pickup' && d < 6) {
        job.phase = 'drop';
        job.target = job.dest;
        this.beacon.position.set(job.target.x, 0, job.target.z);
        world.hud.setObjective('Taxi Fare — passenger aboard! Drive them to the marker.');
      } else if (job.phase === 'drop' && d < 8) {
        this.completeSideJob();
      }
    }
  }
}
