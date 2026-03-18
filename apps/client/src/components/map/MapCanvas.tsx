import { useRef, useEffect, useCallback } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { useStore } from '../../store/index.js';
import {
  hexToPixel, hexCorners, roundHex, pixelToHex,
  TERRAIN_COLORS, TERRAIN_COLORS_SELECTED, HEX_SIZE,
} from './hex-layout.js';

/**
 * PixiJS hex map renderer.
 * Renders terrain-colored hexagons, supports pan/zoom/click.
 * Tab overlays sit on top in React DOM.
 */
export function MapCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const hexes = useStore(s => s.hexes);
  const selectedHex = useStore(s => s.selectedHex);
  const setSelectedHex = useStore(s => s.setSelectedHex);

  // Store callbacks in refs so we can use them in the PixiJS event loop
  const selectedHexRef = useRef(selectedHex);
  selectedHexRef.current = selectedHex;
  const setSelectedHexRef = useRef(setSelectedHex);
  setSelectedHexRef.current = setSelectedHex;

  // Initialize PixiJS application
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const container = canvasRef.current;
    let destroyed = false;

    (async () => {
      const app = new Application();
      await app.init({
        resizeTo: container,
        background: 0xd6c5a0,
        antialias: true,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);
      appRef.current = app;

      // World container (holds all hexes, can be panned/zoomed)
      const world = new Container();
      app.stage.addChild(world);
      worldRef.current = world;

      // Center the world initially
      world.x = container.clientWidth / 2;
      world.y = container.clientHeight / 2;

      // ── Pan & Zoom ──
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let worldStart = { x: 0, y: 0 };

      app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        worldStart = { x: world.x, y: world.y };
      });

      app.canvas.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isDragging) return;
        world.x = worldStart.x + (e.clientX - dragStart.x);
        world.y = worldStart.y + (e.clientY - dragStart.y);
      });

      app.canvas.addEventListener('pointerup', (e: PointerEvent) => {
        const dx = Math.abs(e.clientX - dragStart.x);
        const dy = Math.abs(e.clientY - dragStart.y);

        // If barely moved, treat as click
        if (dx < 5 && dy < 5) {
          const rect = app.canvas.getBoundingClientRect();
          const worldX = (e.clientX - rect.left - world.x) / world.scale.x;
          const worldY = (e.clientY - rect.top - world.y) / world.scale.y;
          const frac = pixelToHex(worldX, worldY);
          const hex = roundHex(frac.q, frac.r);
          setSelectedHexRef.current(hex);
        }

        isDragging = false;
      });

      app.canvas.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(3, Math.max(0.3, world.scale.x * factor));

        // Zoom towards cursor
        const rect = app.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const worldBefore = { x: (cx - world.x) / world.scale.x, y: (cy - world.y) / world.scale.y };
        world.scale.set(newScale);
        world.x = cx - worldBefore.x * newScale;
        world.y = cy - worldBefore.y * newScale;
      }, { passive: false });
    })();

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
        worldRef.current = null;
      }
    };
  }, []);

  // Draw hexes whenever data or selection changes
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    // Clear existing hex graphics
    world.removeChildren();

    const corners = hexCorners();

    for (const hex of hexes) {
      const h = hex as { q: number; r: number; terrain: string; ownerId?: string | null };
      const pos = hexToPixel(h.q, h.r);

      const g = new Graphics();

      // Determine color
      const isSelected = selectedHex && selectedHex.q === h.q && selectedHex.r === h.r;
      const colorMap = isSelected ? TERRAIN_COLORS_SELECTED : TERRAIN_COLORS;
      const fillColor = colorMap[h.terrain] ?? 0xCCCCCC;

      // Draw hex polygon
      g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
      g.fill({ color: fillColor });
      g.stroke({ color: 0x8b7355, width: 1 });

      // Owner border
      if (h.ownerId) {
        g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
        g.stroke({ color: 0x2c1810, width: 2 });
      }

      // Selection highlight
      if (isSelected) {
        g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
        g.stroke({ color: 0xFFD700, width: 3 });
      }

      world.addChild(g);
    }

    // If no hexes from server, render a demo map
    if (hexes.length === 0) {
      renderDemoMap(world, corners);
    }
  }, [hexes, selectedHex]);

  return <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

/** Render a demo hex grid for testing before a real map is loaded. */
function renderDemoMap(
  world: Container,
  corners: { x: number; y: number }[]
) {
  const terrains = ['plains', 'hills', 'forest', 'mountains', 'coast', 'marsh', 'desert'];
  const radius = 8;

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) > radius) continue;

      const pos = hexToPixel(q, r);
      const terrain = terrains[Math.abs((q * 7 + r * 13) % terrains.length)];
      const fillColor = TERRAIN_COLORS[terrain] ?? 0xCCCCCC;

      const g = new Graphics();
      g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
      g.fill({ color: fillColor });
      g.stroke({ color: 0x8b7355, width: 1 });

      world.addChild(g);
    }
  }
}
