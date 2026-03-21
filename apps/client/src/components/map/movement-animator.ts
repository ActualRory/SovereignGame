/**
 * Movement replay animator.
 * Plays back the step-by-step movement log using PixiJS Graphics,
 * showing armies moving across the hex map after a turn resolves.
 */

import { Container, Graphics } from 'pixi.js';
import { hexToPixel } from './hex-layout.js';
import { drawArmy } from './map-icons.js';
import type { MovementLog, MovementStep, MovementCombatEvent } from '@kingdoms/shared';

interface AnimationOptions {
  /** Milliseconds per movement step (default 300) */
  stepDurationMs?: number;
  /** Milliseconds for combat flash effect (default 250) */
  combatFlashMs?: number;
  /** Pause between ticks in ms (default 50) */
  tickPauseMs?: number;
}

/**
 * Animates army movement on the map.
 * Creates temporary graphics that lerp between hex positions,
 * then cleans up and resolves when done.
 */
export function animateMovement(
  worldContainer: Container,
  movementLog: MovementLog,
  playerColors: Map<string, number>,
  options?: AnimationOptions,
): Promise<void> {
  const stepDuration = options?.stepDurationMs ?? 300;
  const combatFlashDuration = options?.combatFlashMs ?? 250;
  const tickPause = options?.tickPauseMs ?? 50;

  if (!movementLog.ticks || movementLog.ticks.length === 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const animLayer = new Container();
    animLayer.label = 'movement-animation';
    worldContainer.addChild(animLayer);

    // Track each army's current visual position and its Graphics object
    const armyGraphics = new Map<string, Graphics>();
    const armyPositions = new Map<string, { x: number; y: number }>();

    // Create graphics for all armies that will move
    const allArmyIds = new Set<string>();
    for (const tick of movementLog.ticks) {
      for (const step of tick) {
        allArmyIds.add(step.armyId);
      }
    }

    for (const armyId of allArmyIds) {
      // Find the first step for this army to get its starting position
      let startStep: MovementStep | null = null;
      for (const tick of movementLog.ticks) {
        const step = tick.find(s => s.armyId === armyId);
        if (step) { startStep = step; break; }
      }
      if (!startStep) continue;

      const g = new Graphics();
      const startPos = hexToPixel(startStep.fromQ, startStep.fromR);
      const color = playerColors.get(startStep.ownerId) ?? 0x666666;
      drawArmy(g, 0, 0, color, false);
      g.x = startPos.x;
      g.y = startPos.y + 10; // army offset below hex center (matches MapCanvas)
      animLayer.addChild(g);
      armyGraphics.set(armyId, g);
      armyPositions.set(armyId, { x: startPos.x, y: startPos.y + 10 });
    }

    // State machine for animation
    let currentTick = 0;
    // Using string instead of union for phase so TS doesn't narrow inside switch cases
    // (setupTick/showCombatFlash mutate phase but TS can't track that)
    let phase = 'lerp' as string;
    let phaseStartTime = performance.now();
    let lerpTargets = new Map<string, { fromX: number; fromY: number; toX: number; toY: number }>();

    // Combat flash state
    let combatFlashGraphics: Graphics[] = [];

    function setupTick(tickIndex: number) {
      if (tickIndex >= movementLog.ticks.length) {
        phase = 'done';
        return;
      }

      const tick = movementLog.ticks[tickIndex];
      lerpTargets.clear();

      for (const step of tick) {
        const g = armyGraphics.get(step.armyId);
        if (!g) continue;

        const currentPos = armyPositions.get(step.armyId)!;
        const targetPixel = hexToPixel(step.toQ, step.toR);
        const targetY = targetPixel.y + 10;

        lerpTargets.set(step.armyId, {
          fromX: currentPos.x,
          fromY: currentPos.y,
          toX: targetPixel.x,
          toY: targetY,
        });
      }

      phase = 'lerp';
      phaseStartTime = performance.now();
    }

    function showCombatFlash(tickIndex: number) {
      // Find combats at this tick
      const combats = movementLog.combats.filter(c => c.tick === tickIndex);
      if (combats.length === 0) {
        phase = 'pause';
        phaseStartTime = performance.now();
        return;
      }

      for (const combat of combats) {
        const pos = hexToPixel(combat.hexQ, combat.hexR);
        const flash = new Graphics();
        flash.circle(0, 0, 20);
        flash.fill({ color: 0xFF3333, alpha: 0.6 });
        flash.x = pos.x;
        flash.y = pos.y;
        animLayer.addChild(flash);
        combatFlashGraphics.push(flash);
      }

      phase = 'combat-flash';
      phaseStartTime = performance.now();
    }

    /** Schedule next frame or clean up if done. */
    function nextFrame() {
      if (phase === 'done') { cleanup(); } else { requestAnimationFrame(animate); }
    }

    function animate() {
      const now = performance.now();
      const elapsed = now - phaseStartTime;

      switch (phase) {
        case 'lerp': {
          const t = Math.min(elapsed / stepDuration, 1);
          for (const [armyId, target] of lerpTargets) {
            const g = armyGraphics.get(armyId);
            if (!g) continue;
            g.x = target.fromX + (target.toX - target.fromX) * t;
            g.y = target.fromY + (target.toY - target.fromY) * t;
          }

          if (t >= 1) {
            // Finalize positions
            for (const [armyId, target] of lerpTargets) {
              armyPositions.set(armyId, { x: target.toX, y: target.toY });
            }
            showCombatFlash(currentTick);
          } else {
            requestAnimationFrame(animate);
          }
          break;
        }

        case 'combat-flash': {
          const t = Math.min(elapsed / combatFlashDuration, 1);
          // Fade out flash
          for (const flash of combatFlashGraphics) {
            flash.alpha = 1 - t;
            flash.scale.set(1 + t * 0.5);
          }

          if (t >= 1) {
            for (const flash of combatFlashGraphics) {
              animLayer.removeChild(flash);
              flash.destroy();
            }
            combatFlashGraphics = [];
            phase = 'pause';
            phaseStartTime = performance.now();
            requestAnimationFrame(animate);
          } else {
            requestAnimationFrame(animate);
          }
          break;
        }

        case 'pause': {
          if (elapsed >= tickPause) {
            currentTick++;
            setupTick(currentTick);
            // setupTick may set phase to 'done' — re-check after call
            nextFrame();
          } else {
            requestAnimationFrame(animate);
          }
          break;
        }

        case 'done': {
          cleanup();
          break;
        }
      }
    }

    function cleanup() {
      // Remove all animation graphics
      for (const [, g] of armyGraphics) {
        animLayer.removeChild(g);
        g.destroy();
      }
      for (const flash of combatFlashGraphics) {
        animLayer.removeChild(flash);
        flash.destroy();
      }
      worldContainer.removeChild(animLayer);
      animLayer.destroy();
      resolve();
    }

    // Start animation
    setupTick(0);
    requestAnimationFrame(animate);
  });
}
