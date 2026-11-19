// The HUD: wanted stars, money, health, TRUST, the minimap, prompts and
// every overlay from the title screen to the three endings.
import { ROAD_LINES, districtAt } from './city.js';

export class HUD {
  constructor(world) {
    this.world = world;
    const $ = (id) => document.getElementById(id);
    this.el = {
      objective: $('objective'),
      timer: $('timer'),
      money: $('money'),
      district: $('district'),
      weaponName: $('weapon-name'),
      nosWrap: $('nos-wrap'),
      nosFill: $('nos-fill'),
      trustFill: $('trust-fill'),
      stars: $('stars'),
      healthFill: $('health-fill'),
      healthWrap: $('health-wrap'),
      carHealthFill: $('car-health-fill'),
      carHealthWrap: $('car-health-wrap'),
      minimap: $('minimap'),
      speed: $('speed'),
      radio: $('radio'),
      prompt: $('prompt'),
      crosshair: $('crosshair'),
      toast: $('toast'),
      toastTitle: $('toast-title'),
      toastSub: $('toast-sub'),
      missionCard: $('mission-card'),
      missionTitle: $('mission-title'),
      missionBrief: $('mission-brief'),
      heistBar: $('heist-bar'),
      heistFill: $('heist-fill'),
      bustedMeter: $('busted-meter'),
      bustedFill: $('busted-fill'),
      damage: $('damage'),
      titleScreen: $('title-screen'),
      continueBtn: $('continue-btn'),
      newBtn: $('new-btn'),
      pauseMenu: $('pause-menu'),
      resumeBtn: $('resume-btn'),
      saveBtn: $('save-btn'),
      quitBtn: $('quit-btn'),
      endingChoice: $('ending-choice'),
      endingScreen: $('ending-screen'),
      endingTitle: $('ending-title'),
      endingText: $('ending-text'),
      endingStats: $('ending-stats'),
      endingContinue: $('ending-continue'),
      bustedScreen: $('busted-screen'),
      wastedScreen: $('wasted-screen'),
      retryBtn: $('retry-btn'),
      retryBtn2: $('retry-btn2'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.cardTimer = 0;
    this.endingCb = null;
    this.el.continueBtn.addEventListener('click', () => this.world.startGame(true));
    this.el.newBtn.addEventListener('click', () => this.world.startGame(false));
    this.el.resumeBtn.addEventListener('click', () => this.world.setState('playing'));
    this.el.saveBtn.addEventListener('click', () => {
      this.world.saveGame();
      this.toast('Game saved', 'Progress stored in this browser');
    });
    this.el.quitBtn.addEventListener('click', () => this.world.quitToTitle());
    this.el.endingContinue.addEventListener('click', () => {
      this.el.endingScreen.classList.add('hidden');
      this.world.setState('playing');
    });
    this.el.retryBtn.addEventListener('click', () => this.world.respawnAfterBust());
    this.el.retryBtn2.addEventListener('click', () => this.world.respawnAfterBust());
    for (const btn of document.querySelectorAll('#ending-choice button')) {
      btn.addEventListener('click', () => {
        this.el.endingChoice.classList.add('hidden');
        if (this.endingCb) this.endingCb(btn.dataset.ending);
      });
    }
  }

  toast(title, sub) {
    this.el.toastTitle.textContent = title;
    this.el.toastSub.textContent = sub || '';
    this.el.toast.classList.remove('hidden');
    this.toastTimer = 3.5;
  }

  showMissionCard(title, brief) {
    this.el.missionTitle.textContent = title;
    this.el.missionBrief.textContent = brief;
    this.el.missionCard.classList.remove('hidden');
    this.cardTimer = 4;
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  setTimer(seconds) {
    if (seconds > 0) {
      this.el.timer.textContent = `${Math.ceil(seconds)}s`;
      this.el.timer.classList.remove('hidden');
    } else {
      this.el.timer.classList.add('hidden');
    }
  }

  showHeistProgress(frac) {
    if (frac > 0) {
      this.el.heistBar.classList.remove('hidden');
      this.el.heistFill.style.width = `${Math.round(frac * 100)}%`;
    } else {
      this.el.heistBar.classList.add('hidden');
    }
  }

  showBustedMeter(frac) {
    if (frac > 0) {
      this.el.bustedMeter.classList.remove('hidden');
      this.el.bustedFill.style.width = `${Math.round(frac * 100)}%`;
    } else {
      this.el.bustedMeter.classList.add('hidden');
    }
  }

  flashDamage() {
    this.el.damage.classList.remove('hidden');
    this.el.damage.style.opacity = '0.45';
    setTimeout(() => {
      this.el.damage.style.opacity = '0';
    }, 60);
  }

  showEndingChoice(cb) {
    this.endingCb = cb;
    this.el.endingChoice.classList.remove('hidden');
  }

  showEnding(title, text, player) {
    const total = this.world.missions ? this.world.missions.totalMissions : 10;
    this.el.endingTitle.textContent = title;
    this.el.endingText.textContent = text;
    this.el.endingStats.textContent = `Money: $${player.money}  •  Trust: ${player.trust}  •  Missions: ${total}/${total}`;
    this.el.endingScreen.classList.remove('hidden');
  }

  hideAllOverlays() {
    for (const key of ['titleScreen', 'pauseMenu', 'endingChoice', 'endingScreen', 'bustedScreen', 'wastedScreen']) {
      this.el[key].classList.add('hidden');
    }
  }

  drawMinimap() {
    const ctx = this.mapCtx;
    const S = 200;
    const scale = S / 640;
    const toMap = (v) => (v + 320) * scale;
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, S, S);
    // Ocean + beach at the south edge.
    ctx.fillStyle = '#1b6f9e';
    ctx.fillRect(0, toMap(296), S, S - toMap(296));
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, toMap(288), S, toMap(296) - toMap(288));
    // Blocks.
    ctx.fillStyle = '#3a3f45';
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        ctx.fillRect(toMap(ROAD_LINES[i] + 8), toMap(ROAD_LINES[j] + 8), (ROAD_LINES[i + 1] - ROAD_LINES[i] - 16) * scale, (ROAD_LINES[j + 1] - ROAD_LINES[j] - 16) * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#6a6f75';
    ctx.lineWidth = 16 * scale;
    for (const line of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(toMap(line), 0);
      ctx.lineTo(toMap(line), S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, toMap(line));
      ctx.lineTo(S, toMap(line));
      ctx.stroke();
    }
    const world = this.world;
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMap(x), toMap(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Mission beacon.
    if (world.missions && world.missions.beacon.visible) {
      const b = world.missions.beacon.position;
      const pulse = 6 + Math.sin(world.elapsed * 4) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(toMap(b.x), toMap(b.z) - pulse);
      ctx.lineTo(toMap(b.x) + pulse, toMap(b.z));
      ctx.lineTo(toMap(b.x), toMap(b.z) + pulse);
      ctx.lineTo(toMap(b.x) - pulse, toMap(b.z));
      ctx.closePath();
      ctx.fill();
    }
    // Auto Shop marker when the car needs repair.
    if (world.player.car && (world.player.car.tiresBurst || world.player.car.health < 60)) {
      dot(world.landmarks.autoshop.x, world.landmarks.autoshop.z, '#2ecc71', 5);
    }
    // Traffic and police.
    for (const car of world.traffic.cars) dot(car.pos.x, car.pos.z, '#f1c40f', 2.5);
    const flash = Math.floor(world.elapsed * 2.5) % 2 === 0;
    for (const car of world.police.cars) dot(car.pos.x, car.pos.z, flash ? '#ff2222' : '#2266ff', 3.5);
    // Police helicopter, when it is up.
    if (world.police.heli && world.police.heli.active) {
      dot(world.police.heli.pos.x, world.police.heli.pos.z, flash ? '#ff2222' : '#ffffff', 5);
    }
    // Player arrow.
    const p = world.player.pos;
    const heading = world.player.car ? world.player.car.heading : world.player.heading;
    ctx.save();
    ctx.translate(toMap(p.x), toMap(p.z));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', 8, 14);
  }

  update(dt) {
    const world = this.world;
    const player = world.player;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.el.missionCard.classList.add('hidden');
    }
    this.el.money.textContent = `$${player.money}`;
    if (this.el.district) this.el.district.textContent = districtAt(player.pos.x, player.pos.z);
    if (this.el.weaponName) {
      this.el.weaponName.textContent = player.weapon
        ? (player.weapon === 'smg' ? `SMG • ${player.ammo}` : `Pistol • ${player.ammo}`)
        : '';
    }
    this.el.trustFill.style.width = `${player.trust}%`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < world.police.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = world.police.wanted > 0 ? '#ffd23f' : '#888888';
    this.el.healthFill.style.width = `${Math.max(0, player.health)}%`;
    if (player.car) {
      this.el.carHealthWrap.classList.remove('hidden');
      const maxH = player.car.maxHealth || 100;
      this.el.carHealthFill.style.width = `${Math.max(0, (player.car.health / maxH) * 100)}%`;
      if (this.el.nosWrap) {
        if (player.car.upgrades && player.car.upgrades.nos) {
          this.el.nosWrap.classList.remove('hidden');
          this.el.nosFill.style.width = `${Math.max(0, (player.car.nosCharge / (player.car.nosMax || 1)) * 100)}%`;
        } else {
          this.el.nosWrap.classList.add('hidden');
        }
      }
      const kmh = Math.round(Math.abs(player.car.speed) * 3.2);
      this.el.speed.textContent = `${kmh} km/h`;
      this.el.radio.textContent = world.audio.radioStation;
      this.el.radio.classList.remove('hidden');
    } else {
      this.el.carHealthWrap.classList.add('hidden');
      if (this.el.nosWrap) this.el.nosWrap.classList.add('hidden');
      this.el.speed.textContent = '';
      this.el.radio.classList.add('hidden');
    }
    this.el.crosshair.classList.toggle('hidden', !player.weapon || !!player.car);
    // Context prompt.
    let prompt = '';
    if (world.state === 'playing') {
      if (!player.car) {
        const near = world.nearestCar(4);
        if (near) prompt = 'E — Get in the car';
        else if (world.missions && world.missions.current && world.missions.current.type === 'pickup') {
          const t = world.missions.targetPos(world.missions.current.target);
          if (Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < 4) prompt = 'E — Grab the package';
        } else if (world.missions && world.missions.current && world.missions.current.type === 'collect' && world.missions.collectPhase === 'grab') {
          const t = world.missions.targetPos(world.missions.current.target);
          if (Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < 4) prompt = 'E — Grab the bag';
        } else if (world.missions && world.missions.current && (world.missions.current.type === 'heist' || world.missions.current.type === 'heistDeliver')) {
          const t = world.missions.targetPos(world.missions.current.target);
          if (Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < 4.5) prompt = 'Hold E — Rob it';
        }
      } else {
        const a = world.landmarks.autoshop;
        const nearShop = Math.hypot(player.car.pos.x - a.x, player.car.pos.z - a.z) < 10;
        if (nearShop) {
          const up = player.car.upgrades || { engine: 0, armor: 0, nos: false };
          const eng = up.engine >= 2 ? 'Engine MAX' : `1 Engine $${300} (${up.engine}/2)`;
          const arm = up.armor >= 2 ? 'Armor MAX' : `2 Armor $${250} (${up.armor}/2)`;
          const nos = up.nos ? `3 NOS refill $150` : `3 NOS $400`;
          const rep = player.car.tiresBurst || player.car.health < (player.car.maxHealth || 100)
            ? ' • E Repair $50' : '';
          prompt = `GARAGE — ${eng} · ${arm} · ${nos}${rep}`;
        } else if (player.car.tiresBurst || player.car.health < 60) {
          prompt = 'Find the Auto Shop (green marker) to repair';
        } else {
          prompt = 'E — Get out  •  R — Radio  •  M — Mute';
        }
      }
    }
    this.el.prompt.textContent = prompt;
    this.drawMinimap();
  }
}
