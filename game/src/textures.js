// Canvas textures, all drawn at load time: no image files, no network.
// The ground texture draws the whole street grid of Velamar in one 2048
// canvas: roads, lane dashes, crosswalks, sidewalks, parks and the beach.
import * as THREE from 'three';
import { ROAD_LINES, PITCH, CITY_HALF, GROUND_HALF } from './constants.js';
import { parkIndices } from './rng.js';

const PX = 2048 / (GROUND_HALF * 2); // pixels per world unit

function toPx(v) {
  return (v + GROUND_HALF) * PX;
}

export function makeGroundTexture(rng, seed) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const g = c.getContext('2d');
  // Base: sidewalk concrete.
  g.fillStyle = '#8f8f86';
  g.fillRect(0, 0, 2048, 2048);

  // City blocks: concrete slabs with a little variation, two parks, one lot.
  const blocks = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const x0 = ROAD_LINES[i] + 8;
      const x1 = ROAD_LINES[i + 1] - 8;
      const z0 = ROAD_LINES[j] + 8;
      const z1 = ROAD_LINES[j + 1] - 8;
      blocks.push([x0, z0, x1, z1]);
    }
  }
  const [parkA, parkB] = parkIndices(seed);
  blocks.forEach(([x0, z0, x1, z1], idx) => {
    if (idx === parkA || idx === parkB) {
      g.fillStyle = '#5d8a4a';
    } else {
      const v = 150 + rng.int(0, 18);
      g.fillStyle = `rgb(${v},${v},${v - 6})`;
    }
    g.fillRect(toPx(x0), toPx(z0), toPx(x1) - toPx(x0), toPx(z1) - toPx(z0));
  });

  // Roads: asphalt strips on every road line, both directions.
  g.fillStyle = '#2b2b30';
  for (const line of ROAD_LINES) {
    g.fillRect(toPx(line - 8), 0, 16 * PX, 2048);
    g.fillRect(0, toPx(line - 8), 2048, 16 * PX);
  }

  // Beach sand along the south edge (z beyond the last road).
  g.fillStyle = '#d9c08a';
  g.fillRect(0, toPx(288), 2048, 2048 - toPx(288));
  g.fillStyle = '#c9b078';
  g.fillRect(0, toPx(288), 2048, 6 * PX);

  // Lane dashes: yellow centre line on each road.
  g.fillStyle = '#d8b93a';
  for (const line of ROAD_LINES) {
    for (let d = -300; d < 300; d += 16) {
      g.fillRect(toPx(line) - 1.5 * PX, toPx(d), 3 * PX, 8 * PX);
      g.fillRect(toPx(d), toPx(line) - 1.5 * PX, 8 * PX, 3 * PX);
    }
  }

  // Edge lines and crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,230,0.85)';
  for (const line of ROAD_LINES) {
    g.fillRect(toPx(line - 7), 0, 1.2 * PX, 2048);
    g.fillRect(toPx(line + 7) - 1.2 * PX, 0, 1.2 * PX, 2048);
    g.fillRect(0, toPx(line - 7), 2048, 1.2 * PX);
    g.fillRect(0, toPx(line + 7) - 1.2 * PX, 2048, 1.2 * PX);
  }
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      for (let s = -7; s <= 7; s += 3.5) {
        g.fillRect(toPx(lx + s) - 1.4 * PX, toPx(lz - 8), 2.8 * PX, 3.4 * PX);
        g.fillRect(toPx(lx + s) - 1.4 * PX, toPx(lz + 8) - 3.4 * PX, 2.8 * PX, 3.4 * PX);
        g.fillRect(toPx(lx - 8), toPx(lz + s) - 1.4 * PX, 3.4 * PX, 2.8 * PX);
        g.fillRect(toPx(lx + 8) - 3.4 * PX, toPx(lz + s) - 1.4 * PX, 3.4 * PX, 2.8 * PX);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// One building facade: a base colour with a grid of windows, some lit warm.
export function makeFacadeTexture(base, litRatio, rng) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 512);
  const cols = 6;
  const rows = 12;
  const ww = 256 / cols;
  const wh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : `rgb(${30 + rng.int(0, 30)},${40 + rng.int(0, 30)},${55 + rng.int(0, 35)})`;
      g.fillRect(col * ww + 6, r * wh + 8, ww - 12, wh - 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft round blob for clouds.
export function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 30 + Math.random() * 196;
    const y = 40 + Math.random() * 48;
    const r = 22 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

// Ocean surface: deep blue with pale wave streaks.
export function makeOceanTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1b6f9e';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * 512;
    g.beginPath();
    g.moveTo(Math.random() * 512, y);
    g.bezierCurveTo(150, y + 8, 300, y - 8, 512, y + 4);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
