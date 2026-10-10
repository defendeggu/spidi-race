import type { CarSpec } from './cars';
import { clamp, mulberry32, wrapAngle } from './math';
import { forwardSpeed, type CarInput, type CarState } from './physics';
import type { Track } from './track';

/** Simple line-following AI: steers towards a point ahead and brakes for upcoming curvature. */
export class AIDriver {
  private lane: number;
  private laneTarget: number;
  private laneTimer = 0;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private rand: () => number;

  /** skill in ~0.8..1.0: share of available grip and top speed the driver uses */
  constructor(seed: number, public skill = 0.95) {
    this.rand = mulberry32(seed * 7919 + 13);
    this.lane = this.laneTarget = (this.rand() - 0.5) * 0.8;
  }

  update(c: CarState, spec: CarSpec, track: Track, dt: number, others: CarState[] = []): CarInput {
    const vf = forwardSpeed(c);
    const hw = track.hw[c.idx];

    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 3 + this.rand() * 5;
      this.laneTarget = (this.rand() - 0.5) * 0.9;
    }
    // dodge cars directly ahead
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    for (const o of others) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * -fz + dz * fx;
      if (ahead > 2 && ahead < 18 && Math.abs(side) < 2.4 && forwardSpeed(o) < vf + 1) {
        this.laneTarget = clamp(this.lane + (side > 0 ? -0.7 : 0.7), -0.75, 0.75);
        this.laneTimer = 1.5;
      }
    }
    this.lane += clamp(this.laneTarget - this.lane, -dt * 0.5, dt * 0.5);

    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      const p = track.pointAt(c.s + 15, 0);
      const err = wrapAngle(Math.atan2(p.x - c.x, p.z - c.z) - c.heading);
      return { throttle: 0, brake: 1, steer: clamp(err * 2, -1, 1), handbrake: false };
    }

    const look = 7 + Math.abs(vf) * 0.42;
    const target = track.pointAt(c.s + look, this.lane * hw);
    const err = wrapAngle(Math.atan2(target.x - c.x, target.z - c.z) - c.heading);
    const steer = clamp(-err * 2.4, -1, 1);

    // target speed from curvature ahead, accounting for braking distance
    const decel = spec.brake * 0.7;
    let vTarget = spec.topSpeed * (0.82 + 0.18 * this.skill);
    const scan = 25 + Math.max(0, vf) * 2.4;
    for (let d = 0; d < scan; d += 4) {
      const i = Math.floor(((((c.s + d) % track.length) + track.length) % track.length) / track.ds) % track.n;
      const k = Math.abs(track.curv[i]);
      if (k < 1e-4) continue;
      const vMax = Math.sqrt(((spec.grip + track.bankGrip(i)) * 0.88 * this.skill) / k);
      vTarget = Math.min(vTarget, Math.sqrt(vMax * vMax + 2 * decel * d));
    }

    let throttle = 0, brake = 0;
    if (vf < vTarget - 1) throttle = 1;
    else if (vf < vTarget) throttle = 0.4;
    else if (vf > vTarget + 1.5) brake = clamp((vf - vTarget) / 6, 0.2, 1);
    if (Math.abs(err) > 1.2 && vf > 8) {
      throttle = 0;
      brake = 0.5;
    }

    // unstick: if barely moving for a while, back up
    if (Math.abs(vf) < 1.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.5) {
        this.stuckTimer = 0;
        this.reverseTimer = 1.3;
      }
    } else {
      this.stuckTimer = 0;
    }
    return { throttle, brake, steer, handbrake: false };
  }
}
