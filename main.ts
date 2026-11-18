// VELAMAR HEAT — a gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js vendored
// under game/vendor/, no network request). This program hands it in: it copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Run outside the grader with MAKEFUN_OUTPUT_DIR:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): game/ at most 993 files and
// 48 MiB in all, its index.html at most 1 MiB, screenshots 3-4 files of at
// most 256 KiB each, the dossier text at most 160 KiB. Refuse here what the
// scorer would refuse, so a bad build fails loudly before it is entered.
function assertLimits() {
  const gameDir = join(here, 'game');
  const index = join(gameDir, 'index.html');
  if (!existsSync(index)) throw new Error('game/index.html is missing');
  if (statSync(index).size > 1024 * 1024) throw new Error('game/index.html is over 1 MiB');
  let files = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      files += 1;
      if (st.isDirectory()) walk(p);
      else bytes += st.size;
    }
  };
  walk(gameDir);
  if (files > 993) throw new Error(`game/ holds ${files} files, over the 993 cap`);
  if (bytes > 48 * 1024 * 1024) throw new Error('game/ is over 48 MiB');
  const shots = existsSync(join(here, 'screenshots')) ? readdirSync(join(here, 'screenshots')) : [];
  if (shots.length < 3 || shots.length > 4) throw new Error(`screenshots/ holds ${shots.length} files, need 3 or 4`);
  for (const name of shots) {
    if (statSync(join(here, 'screenshots', name)).size > 256 * 1024) {
      throw new Error(`screenshots/${name} is over 256 KiB`);
    }
  }
}

assertLimits();
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
