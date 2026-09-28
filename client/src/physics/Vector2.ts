export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalized(): Vector2 {
    const len = this.length();
    if (len < 1e-9) return new Vector2(0, 0);
    return new Vector2(this.x / len, this.y / len);
  }

  // Rotate 90 degrees (perpendicular), used for tangential collision components
  perp(): Vector2 {
    return new Vector2(-this.y, this.x);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  static distance(a: Vector2, b: Vector2): number {
    return a.sub(b).length();
  }
}
