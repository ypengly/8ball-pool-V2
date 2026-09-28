import Phaser from 'phaser';

// Single shared emitter: the Phaser scene (game logic / rendering) pushes
// match-state updates here; the plain HTML/CSS HUD (per the "HTML/CSS only
// for HUD/menus" rule — the table itself is WebGL) subscribes and re-renders
// itself. Keeps the HUD decoupled from Phaser internals entirely.
export const gameEvents = new Phaser.Events.EventEmitter();

export interface HudState {
  currentPlayer: 0 | 1;
  playerGroups: ['UNASSIGNED' | 'SOLIDS' | 'STRIPES', 'UNASSIGNED' | 'SOLIDS' | 'STRIPES'];
  gameOver: boolean;
  winner: 0 | 1 | null;
  power: number;
  foulReasons: string[];
}
