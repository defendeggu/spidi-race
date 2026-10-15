import type { ItemWorld } from './items';
import { mulberry32 } from './math';
import { forwardSpeed, type CarInput, type CarState } from './physics';
import type { Track } from './track';

/**
 * Item tactics and drifting for AI karts, on top of the normal AIDriver line:
 * - blaster: fire when a kart is in a narrow cone ahead; homing: when anyone is ahead in the race
 * - mine: drop it when a kart follows closely, or after carrying it for a while
 * - turbo: on a straight stretch; shield: when a projectile closes in (or after a while)
 * - drift through tight corners to collect boosts
 */
export class KartBrain {
  private held = 0;
  private delay: number;
  private rnd: () => number;

  constructor(seed: number) {
    this.rnd = mulberry32(seed * 131 + 7);
    this.delay = 0.5 + this.rnd() * 1.5;
  }

  /** Adjust the driving input (drift) and decide whether to use the held item. */
  update(c: CarState, inp: CarInput, track: Track, items: ItemWorld, cars: CarState[], dt: number): { input: CarInput; use: boolean } {
    const ks = items.kart(c.id);
    const vf = forwardSpeed(c);
    // drift through tight corners: curvature some metres ahead
    const i = Math.floor((((c.s + 12) % track.length) + track.length) % track.length / track.ds) % track.n;
    const tight = Math.abs(track.curv[i]) > 0.018 && vf > 12 && Math.abs(inp.steer) > 0.45;
    const input = tight ? { ...inp, handbrake: true } : inp;

    if (!ks.item) {
      this.held = 0;
      return { input, use: false };
    }
    this.held += dt;
    if (this.held < this.delay) return { input, use: false };
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    let ahead = Infinity, cone = false, behind = Infinity;
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
      const along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
      if (along > 0) {
        ahead = Math.min(ahead, d);
        if (along < 60 && side < Math.max(2, along * 0.12)) cone = true;
      } else if (d < 25) behind = Math.min(behind, d);
    }
    let use = false;
    switch (ks.item) {
      case 'blaster': use = cone || this.held > 12; break;
      case 'homing': use = ahead < 150 || this.held > 8; break;
      case 'mine': use = behind < 20 || this.held > 9; break;
      case 'turbo': {
        let straight = true;
        for (let d = 0; d < 70 && straight; d += 10) {
          const k = Math.floor((((c.s + d) % track.length) + track.length) % track.length / track.ds) % track.n;
          straight = Math.abs(track.curv[k]) < 0.006;
        }
        use = straight || this.held > 10;
        break;
      }
      case 'shield': {
        const threat = items.projectiles.some((p) => p.owner !== c.id && Math.hypot(p.x - c.x, p.z - c.z) < 30);
        use = threat || this.held > 10;
        break;
      }
    }
    if (use) {
      this.held = 0;
      this.delay = 0.5 + this.rnd() * 1.5;
    }
    return { input, use };
  }
}
