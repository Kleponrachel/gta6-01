// Saves live in localStorage: money, trust, mission progress, position and
// time of day. The title screen offers Continue when one exists.
const SAVE_KEY = 'velamar-heat-save-v1';

export function saveGame(world) {
  try {
    const player = world.player;
    const data = {
      version: 1,
      money: player.money,
      trust: player.trust,
      missionIndex: world.missions ? world.missions.index : 0,
      storyDone: world.missions ? world.missions.storyDone : false,
      health: player.health,
      weapon: player.weapon,
      ammo: player.ammo,
      pos: { x: player.pos.x, z: player.pos.z },
      tod: world.tod,
      elapsed: world.elapsed,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // Storage unavailable; a new game just starts fresh in memory.
  }
}
