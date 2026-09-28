import Phaser from 'phaser';
import { GameSession } from '../rules/GameSession';
import { ShotInput } from '../physics/Cue';
import { PoolAI } from '../ai/PoolAI';
import { gameEvents } from '../ui/events';

// Renders the live World state each frame via Phaser's WebGL renderer. All
// gameplay truth lives in GameSession/World — this scene is a pure view: it
// never mutates ball positions itself except by asking GameSession to
// simulate a shot and then drawing whatever state results. That separation
// is what lets the exact same GameSession run headless on the Go server.
export class TableScene extends Phaser.Scene {
  private session!: GameSession;
  private ai = new PoolAI('MEDIUM');
  private ballSprites = new Map<number, Phaser.GameObjects.Container>();
  private cueLine!: Phaser.GameObjects.Graphics;
  private aiming = false;
  private aimAngle = 0;
  private power = 0.5;
  private tableOriginX = 60;
  private tableOriginY = 60;
  private scale = 0.22; // world mm -> pixels

  constructor() {
    super('TableScene');
  }

  create() {
    this.session = new GameSession(Date.now() & 0xffff, 0);
    this.drawTable();
    this.cueLine = this.add.graphics();
    this.spawnBallSprites();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateAim(p));
    this.input.on('pointerdown', () => (this.aiming = true));
    this.input.on('pointerup', () => this.attemptShoot());
    this.input.on('wheel', (_p: any, _o: any, _dx: number, dy: number) => {
      this.power = Phaser.Math.Clamp(this.power - dy * 0.0005, 0.05, 1);
    });
  }

  update() {
    this.renderBalls();
    this.renderAimGuides();
    this.emitHud();
  }

  private emitHud() {
    const m = this.session.match;
    gameEvents.emit('hud-update', {
      currentPlayer: m.currentPlayer,
      playerGroups: [m.players[0].group, m.players[1].group],
      gameOver: m.gameOver,
      winner: m.winner,
      power: this.power,
      foulReasons: [],
    });
  }

  private worldToScreen(x: number, y: number): [number, number] {
    return [this.tableOriginX + x * this.scale, this.tableOriginY + y * this.scale];
  }

  private drawTable() {
    const g = this.add.graphics();
    const table = this.session.world.table;
    const [x0, y0] = this.worldToScreen(0, 0);
    const [x1, y1] = this.worldToScreen(table.width, table.height);
    g.fillStyle(0x0b6e3a, 1);
    g.fillRoundedRect(x0 - 20, y0 - 20, x1 - x0 + 40, y1 - y0 + 40, 12);
    g.fillStyle(0x0e8a48, 1);
    g.fillRect(x0, y0, x1 - x0, y1 - y0);

    g.fillStyle(0x111111, 1);
    for (const pocket of table.pockets) {
      const [px, py] = this.worldToScreen(pocket.position.x, pocket.position.y);
      g.fillCircle(px, py, pocket.radius * this.scale);
    }
  }

  private spawnBallSprites() {
    for (const ball of this.session.world.balls) {
      const container = this.add.container(0, 0);
      const circle = this.add.circle(0, 0, ball.radius * this.scale, this.colorFor(ball.number));
      circle.setStrokeStyle(1, 0x000000, 0.4);
      container.add(circle);
      if (ball.number > 0) {
        const label = this.add.text(0, 0, String(ball.number), { fontSize: '10px', color: '#111' }).setOrigin(0.5);
        container.add(label);
      }
      this.ballSprites.set(ball.id, container);
    }
  }

  private renderBalls() {
    for (const ball of this.session.world.balls) {
      const sprite = this.ballSprites.get(ball.id);
      if (!sprite) continue;
      if (ball.pocketed) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setVisible(true);
      const [sx, sy] = this.worldToScreen(ball.position.x, ball.position.y);
      sprite.setPosition(sx, sy);
    }
  }

  private renderAimGuides() {
    this.cueLine.clear();
    if (this.session.match.gameOver) return;
    const cue = this.session.world.balls.find((b) => b.number === 0 && !b.pocketed);
    if (!cue || !this.world.isSettled()) return;

    const [cx, cy] = this.worldToScreen(cue.position.x, cue.position.y);
    const length = 120 + this.power * 200;
    const ex = cx + Math.cos(this.aimAngle) * length;
    const ey = cy + Math.sin(this.aimAngle) * length;
    this.cueLine.lineStyle(2, 0xffffff, 0.8);
    this.cueLine.lineBetween(cx, cy, ex, ey);
  }

  private get world() {
    return this.session.world;
  }

  private updateAim(pointer: Phaser.Input.Pointer) {
    const cue = this.session.world.balls.find((b) => b.number === 0 && !b.pocketed);
    if (!cue) return;
    const [cx, cy] = this.worldToScreen(cue.position.x, cue.position.y);
    this.aimAngle = Math.atan2(pointer.y - cy, pointer.x - cx);
  }

  private attemptShoot() {
    if (!this.world.isSettled() || this.session.match.gameOver) return;
    const input: ShotInput = { direction: this.aimAngle, power: this.power, spinX: 0, spinY: 0 };
    this.session.playShot(input);
    this.aiming = false;

    // Simple turn loop: if it becomes the AI's turn (player index 1), let it
    // play automatically after a short delay once balls settle.
    this.time.delayedCall(400, () => this.maybePlayAITurn());
  }

  private maybePlayAITurn() {
    if (this.session.match.gameOver) return;
    if (this.session.match.currentPlayer !== 1) return;
    const input = this.ai.chooseShot(this.world.table, this.world.balls, this.session.match, 1);
    this.session.playShot(input);
    this.time.delayedCall(400, () => this.maybePlayAITurn());
  }

  private colorFor(number: number): number {
    if (number === 0) return 0xffffff;
    if (number === 8) return 0x111111;
    const solidColors = [0xf3c623, 0x2d6cdf, 0xd6303c, 0x6a1b9a, 0xff7f0e, 0x2e8b57, 0x8b0000];
    const idx = number > 8 ? number - 9 : number - 1;
    return solidColors[idx % solidColors.length];
  }
}
