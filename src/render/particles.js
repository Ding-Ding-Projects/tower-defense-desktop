/**
 * Fixed-capacity particle and floating-damage-number systems, both built on
 * ObjectPool so nothing here allocates per frame. Budgets are hard: once a pool
 * is full, a new hit or kill simply does not get a particle rather than growing
 * the array, which is what keeps a 40-enemy leak wave from turning into a frame
 * drop.
 */

import { ObjectPool } from './object-pool.js';

export const PARTICLE_BUDGET = 400;
export const DAMAGE_NUMBER_BUDGET = 120;

const PARTICLE_LIFETIME_SECONDS = 0.5;
const DAMAGE_NUMBER_LIFETIME_SECONDS = 0.9;

function blankParticle() {
  return { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: PARTICLE_LIFETIME_SECONDS, color: '#ffffff' };
}

function resetParticle(p) {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.age = 0;
}

function blankDamageNumber() {
  return { x: 0, y: 0, amount: 0, age: 0, life: DAMAGE_NUMBER_LIFETIME_SECONDS, kind: 'damage' };
}

function resetDamageNumber(d) {
  d.x = 0;
  d.y = 0;
  d.amount = 0;
  d.age = 0;
}

export class ParticleSystem {
  constructor(particleBudget = PARTICLE_BUDGET, damageNumberBudget = DAMAGE_NUMBER_BUDGET) {
    this.particles = new ObjectPool(particleBudget, blankParticle, resetParticle);
    this.damageNumbers = new ObjectPool(damageNumberBudget, blankDamageNumber, resetDamageNumber);
    this._activeParticleIndex = new Set();
    this._activeDamageIndex = new Set();
  }

  /** Spawns a small burst of hit particles at a world position. Silently drops
   * particles once the budget is spent. */
  emitBurst(x, y, color, count = 6) {
    for (let i = 0; i < count; i += 1) {
      const slot = this.particles.acquire();
      if (!slot) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      slot.item.x = x;
      slot.item.y = y;
      slot.item.vx = Math.cos(angle) * speed;
      slot.item.vy = Math.sin(angle) * speed;
      slot.item.age = 0;
      slot.item.life = PARTICLE_LIFETIME_SECONDS;
      slot.item.color = color;
      this._activeParticleIndex.add(slot.index);
    }
  }

  emitDamageNumber(x, y, amount, kind = 'damage') {
    const slot = this.damageNumbers.acquire();
    if (!slot) return;
    slot.item.x = x;
    slot.item.y = y;
    slot.item.amount = amount;
    slot.item.age = 0;
    slot.item.life = DAMAGE_NUMBER_LIFETIME_SECONDS;
    slot.item.kind = kind;
    this._activeDamageIndex.add(slot.index);
  }

  /** @param {number} dtSeconds */
  update(dtSeconds) {
    for (const index of [...this._activeParticleIndex]) {
      const p = this.particles._items[index];
      p.age += dtSeconds;
      p.x += p.vx * dtSeconds;
      p.y += p.vy * dtSeconds;
      if (p.age >= p.life) {
        this.particles.release(index);
        this._activeParticleIndex.delete(index);
      }
    }
    for (const index of [...this._activeDamageIndex]) {
      const d = this.damageNumbers._items[index];
      d.age += dtSeconds;
      d.y -= dtSeconds * 1.2;
      if (d.age >= d.life) {
        this.damageNumbers.release(index);
        this._activeDamageIndex.delete(index);
      }
    }
  }

  forEachParticle(fn) {
    this.particles.forEachActive(fn);
  }

  forEachDamageNumber(fn) {
    this.damageNumbers.forEachActive(fn);
  }
}
