import { gameEvents, HudState } from './events';

const root = document.getElementById('hud-root');

function render(state: HudState) {
  if (!root) return;
  const groupLabel = (g: string) => (g === 'UNASSIGNED' ? '—' : g);
  root.innerHTML = `
    <div class="hud-bar">
      <div class="hud-player ${state.currentPlayer === 0 ? 'active' : ''}">
        You <span class="group">${groupLabel(state.playerGroups[0])}</span>
      </div>
      <div class="hud-status">
        ${state.gameOver ? `<strong>${state.winner === 0 ? 'You win!' : 'AI wins'}</strong>` : state.currentPlayer === 0 ? 'Your turn' : 'AI thinking…'}
        ${state.foulReasons.length ? `<div class="foul">FOUL: ${state.foulReasons.join(', ')}</div>` : ''}
      </div>
      <div class="hud-player ${state.currentPlayer === 1 ? 'active' : ''}">
        AI <span class="group">${groupLabel(state.playerGroups[1])}</span>
      </div>
    </div>
    <div class="power-meter">
      <div class="power-fill" style="width:${Math.round(state.power * 100)}%"></div>
    </div>
  `;
}

gameEvents.on('hud-update', render);

// Initial placeholder render before the first real update arrives.
render({
  currentPlayer: 0,
  playerGroups: ['UNASSIGNED', 'UNASSIGNED'],
  gameOver: false,
  winner: null,
  power: 0.5,
  foulReasons: [],
});
