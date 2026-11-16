// Start screen: pick a faction and a battlefield before the match begins.

import { generateMap, MAP_PRESETS } from '../sim/map.js';
import type { MapKind, MapPreset } from '../sim/map.js';
import { FACTION_NAMES, FACTION_TRAITS, UNIT_DEFS } from '../sim/stats.js';
import type { Faction, UnitKind } from '../sim/types.js';

export interface GameSetup {
  playerFaction: Faction;
  aiFaction: Faction;
  mapKind: MapKind;
  seed: number;
}

const MAP_SEEDS: Record<MapKind, number> = {
  plains: 1101,
  river: 2202,
  mountain: 3303,
  islands: 4404,
};

const FACTION_UNITS: Record<Faction, UnitKind[]> = {
  han: ['han_zu', 'han_nuge', 'han_wugang'],
  chu: ['chu_zidi', 'chu_qi', 'chu_chongche'],
};

const THUMB = 132;

function terrainColor(t: number): string {
  switch (t) {
    case 1:
      return '#6b5a3e';
    case 2:
      return '#1e3a52';
    case 3:
      return '#4a4a54';
    default:
      return '#3c5a30';
  }
}

function drawThumb(canvas: HTMLCanvasElement, preset: MapPreset): void {
  const map = generateMap(preset.kind, MAP_SEEDS[preset.kind]);
  const g = canvas.getContext('2d');
  if (!g) return;
  const S = map.size;
  const s = canvas.width / S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = map.idx(x, y);
      g.fillStyle = map.ore[i] > 0 ? '#8a7429' : terrainColor(map.terrain[i]);
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
    }
  }
  // base pads
  g.fillStyle = '#5b9bd5';
  g.fillRect(4 * s, 4 * s, 8 * s, 8 * s);
  g.fillStyle = '#d15a4a';
  g.fillRect((S - 12) * s, (S - 12) * s, 8 * s, 8 * s);
}

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

export function showMenu(): Promise<GameSetup> {
  return new Promise((resolve) => {
    let faction: Faction = 'han';
    let mapKind: MapKind = 'plains';

    const root = document.createElement('div');
    root.id = 'menu';

    const inner = div('menu-inner', root);
    div('menu-title', inner).textContent = '楚 汉 · 争 霸';
    div('menu-sub', inner).textContent = '选择阵营与战场';

    const grid = div('menu-grid', inner);

    // ---- faction column
    const left = div('menu-sec', grid);
    div('menu-h', left).textContent = '阵营';
    const factionRow = div('menu-cards', left);
    const factionHint = div('menu-hint', left);

    const factionCards = new Map<Faction, HTMLDivElement>();
    (['han', 'chu'] as Faction[]).forEach((f) => {
      const card = document.createElement('div');
      card.className = 'mcard faction-card';
      const units = FACTION_UNITS[f].map((k) => UNIT_DEFS[k].name).join(' · ');
      card.innerHTML = `
        <div class="mcard-title">${FACTION_NAMES[f]}</div>
        <div class="mcard-tag">${FACTION_TRAITS[f]}</div>
        <div class="mcard-units">${units}</div>`;
      card.addEventListener('click', () => {
        faction = f;
        refresh();
      });
      factionRow.appendChild(card);
      factionCards.set(f, card);
    });

    // ---- map column
    const right = div('menu-sec', grid);
    div('menu-h', right).textContent = '战场';
    const mapRow = div('menu-cards map-cards', right);
    const mapHint = div('menu-hint', right);

    const mapCards = new Map<MapKind, HTMLDivElement>();
    for (const preset of MAP_PRESETS) {
      const card = document.createElement('div');
      card.className = 'mcard map-card';
      const canvas = document.createElement('canvas');
      canvas.width = THUMB;
      canvas.height = THUMB;
      canvas.className = 'thumb';
      card.appendChild(canvas);
      const nm = document.createElement('div');
      nm.className = 'mcard-title small';
      nm.textContent = preset.name;
      card.appendChild(nm);
      const tg = document.createElement('div');
      tg.className = 'mcard-tag';
      tg.textContent = preset.tagline;
      card.appendChild(tg);
      card.addEventListener('click', () => {
        mapKind = preset.kind;
        refresh();
      });
      mapRow.appendChild(card);
      mapCards.set(preset.kind, card);
      drawThumb(canvas, preset);
    }

    const startBtn = document.createElement('button');
    startBtn.className = 'menu-start';
    startBtn.textContent = '开 始 战 斗';
    inner.appendChild(startBtn);

    const refresh = (): void => {
      for (const [f, card] of factionCards) card.classList.toggle('active', f === faction);
      for (const [k, card] of mapCards) card.classList.toggle('active', k === mapKind);
      const preset = MAP_PRESETS.find((p) => p.kind === mapKind) as MapPreset;
      factionHint.textContent =
        faction === 'han'
          ? '汉军：兵廉量多，弩阵破甲，靠数量与后劲拖垮对手。'
          : '楚军：精锐骁勇，铁骑冲阵，前期一波流最猛。';
      mapHint.textContent = `${preset.name} · ${preset.desc}`;
    };

    startBtn.addEventListener('click', () => {
      root.classList.add('leaving');
      setTimeout(() => root.remove(), 220);
      resolve({
        playerFaction: faction,
        aiFaction: faction === 'han' ? 'chu' : 'han',
        mapKind,
        seed: MAP_SEEDS[mapKind] + 7,
      });
    });

    document.body.appendChild(root);
    refresh();
  });
}
