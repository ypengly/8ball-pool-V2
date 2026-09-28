import { Vector2 } from './Vector2';
import { TABLE_WIDTH, TABLE_HEIGHT, POCKET_RADIUS } from './Constants';

// A cushion segment is a straight wall the ball can bounce off. Real tables
// have angled "cut" cushions near the pockets to funnel balls in, but for a
// stable v1 we model six pockets with simple radius-based capture zones plus
// four straight rails (top/bottom split by middle pockets, and left/right).
export interface CushionSegment {
  a: Vector2;
  b: Vector2;
  // Outward normal, pointing into the table from the cushion.
  normal: Vector2;
}

export interface Pocket {
  id: number;
  position: Vector2;
  radius: number;
}

export class Table {
  width = TABLE_WIDTH;
  height = TABLE_HEIGHT;
  cushions: CushionSegment[];
  pockets: Pocket[];

  constructor() {
    this.pockets = this.buildPockets();
    this.cushions = this.buildCushions();
  }

  private buildPockets(): Pocket[] {
    const w = this.width;
    const h = this.height;
    const r = POCKET_RADIUS;
    return [
      { id: 0, position: new Vector2(0, 0), radius: r },
      { id: 1, position: new Vector2(w / 2, -r * 0.4), radius: r * 0.85 },
      { id: 2, position: new Vector2(w, 0), radius: r },
      { id: 3, position: new Vector2(w, h), radius: r },
      { id: 4, position: new Vector2(w / 2, h + r * 0.4), radius: r * 0.85 },
      { id: 5, position: new Vector2(0, h), radius: r },
    ];
  }

  private buildCushions(): CushionSegment[] {
    const w = this.width;
    const h = this.height;
    const inset = POCKET_RADIUS * 0.9; // gap left near pockets so balls can fall in
    return [
      // Top rail, split around the middle pocket
      { a: new Vector2(inset, 0), b: new Vector2(w / 2 - inset, 0), normal: new Vector2(0, 1) },
      { a: new Vector2(w / 2 + inset, 0), b: new Vector2(w - inset, 0), normal: new Vector2(0, 1) },
      // Bottom rail
      { a: new Vector2(inset, h), b: new Vector2(w / 2 - inset, h), normal: new Vector2(0, -1) },
      { a: new Vector2(w / 2 + inset, h), b: new Vector2(w - inset, h), normal: new Vector2(0, -1) },
      // Left rail
      { a: new Vector2(0, inset), b: new Vector2(0, h - inset), normal: new Vector2(1, 0) },
      // Right rail
      { a: new Vector2(w, inset), b: new Vector2(w, h - inset), normal: new Vector2(-1, 0) },
    ];
  }
}
