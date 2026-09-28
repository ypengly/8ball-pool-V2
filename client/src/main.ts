import Phaser from 'phaser';
import { TableScene } from './scenes/TableScene';
import './ui/hud';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-root',
  width: 640,
  height: 380,
  backgroundColor: '#083019',
  scene: [TableScene],
  render: { antialias: true },
};

new Phaser.Game(config);
