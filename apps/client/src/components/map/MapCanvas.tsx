import { useRef, useEffect } from 'react';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { useStore } from '../../store/index.js';
import {
  hexToPixel, hexCorners, roundHex, pixelToHex, hexEdgeMidpoints,
  TERRAIN_COLORS, TERRAIN_COLORS_SELECTED, HEX_SIZE,
} from './hex-layout.js';

/**
 * PixiJS hex map renderer.
 * Renders terrain-colored hexagons with fog of war, rivers,
 * settlement markers, army icons. Supports pan/zoom/click.
 */
export function MapCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const selectedHex = useStore(s => s.selectedHex);
  const setSelectedHex = useStore(s => s.setSelectedHex);

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

      const world = new Container();
      app.stage.addChild(world);
      worldRef.current = world;

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

    world.removeChildren();

    const corners = hexCorners();
    const edgeMidpoints = hexEdgeMidpoints();

    // Build lookup maps for settlements and armies
    const settlementByHex = new Map<string, any>();
    for (const s of settlements) {
      const key = `${(s as any).hexQ},${(s as any).hexR}`;
      settlementByHex.set(key, s);
    }

    const armiesByHex = new Map<string, any[]>();
    for (const a of armies) {
      const key = `${(a as any).hexQ},${(a as any).hexR}`;
      const list = armiesByHex.get(key) ?? [];
      list.push(a);
      armiesByHex.set(key, list);
    }

    // Player color lookup
    const playerColors = new Map<string, string>();
    for (const p of players) {
      playerColors.set((p as any).id, (p as any).color);
    }

    for (const hex of hexes) {
      const h = hex as any;
      const pos = hexToPixel(h.q, h.r);
      const fogState = h.fogState ?? 'full_vision';

      const g = new Graphics();

      // Determine color
      const isSelected = selectedHex && selectedHex.q === h.q && selectedHex.r === h.r;
      const colorMap = isSelected ? TERRAIN_COLORS_SELECTED : TERRAIN_COLORS;
      let fillColor = colorMap[h.terrain] ?? 0xCCCCCC;

      // Draw hex polygon
      g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
      g.fill({ color: fillColor, alpha: fogState === 'soft_fog' ? 0.5 : 1.0 });
      g.stroke({ color: 0x8b7355, width: 1 });

      // Soft fog overlay (dim)
      if (fogState === 'soft_fog') {
        g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
        g.fill({ color: 0x000000, alpha: 0.25 });
      }

      // Owner border
      if (h.ownerId) {
        const ownerColor = playerColors.get(h.ownerId);
        const borderColor = ownerColor ? parseInt(ownerColor.replace('#', ''), 16) : 0x2c1810;
        g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
        g.stroke({ color: borderColor, width: 2, alpha: 0.7 });
      }

      // River edges
      if (h.riverEdges?.length > 0) {
        const dirIndex: Record<string, number> = { ne: 0, e: 1, se: 2, sw: 3, w: 4, nw: 5 };
        for (const edge of h.riverEdges as string[]) {
          const idx = dirIndex[edge];
          if (idx === undefined) continue;
          const c1 = corners[idx];
          const c2 = corners[(idx + 1) % 6];
          g.moveTo(c1.x + pos.x, c1.y + pos.y);
          g.lineTo(c2.x + pos.x, c2.y + pos.y);
          g.stroke({ color: 0x4488CC, width: 3 });
        }
      }

      // Selection highlight
      if (isSelected) {
        g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
        g.stroke({ color: 0xFFD700, width: 3 });
      }

      world.addChild(g);

      // Settlement marker
      const hexKey = `${h.q},${h.r}`;
      const settlement = settlementByHex.get(hexKey);
      if (settlement) {
        const sg = new Graphics();
        const tierSize: Record<string, number> = {
          hamlet: 6, village: 8, town: 10, city: 13, metropolis: 16,
        };
        const size = tierSize[settlement.tier] ?? 8;
        sg.rect(pos.x - size / 2, pos.y - size / 2 - 4, size, size);
        sg.fill({ color: settlement.isCapital ? 0xB8860B : 0x8B4513 });
        sg.stroke({ color: 0x2c1810, width: 1 });
        world.addChild(sg);
      }

      // Army markers
      const hexArmies = armiesByHex.get(hexKey);
      if (hexArmies) {
        for (let i = 0; i < hexArmies.length; i++) {
          const army = hexArmies[i];
          const ag = new Graphics();
          const ax = pos.x + (i * 10) - 5;
          const ay = pos.y + 8;
          const ownerColor = playerColors.get(army.ownerId);
          const color = ownerColor ? parseInt(ownerColor.replace('#', ''), 16) : 0x666666;

          // Small shield shape
          ag.circle(ax, ay, 5);
          ag.fill({ color });
          ag.stroke({ color: 0x2c1810, width: 1 });
          world.addChild(ag);
        }
      }
    }

    // If no hexes from server, render a demo map
    if (hexes.length === 0) {
      renderDemoMap(world, corners);
    }
  }, [hexes, settlements, armies, players, selectedHex]);

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
