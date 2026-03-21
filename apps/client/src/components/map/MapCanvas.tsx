import { useRef, useEffect } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { useStore } from '../../store/index.js';
import {
  hexToPixel, hexCorners, roundHex, pixelToHex, HEX_SIZE,
  TERRAIN_COLORS, TERRAIN_COLORS_SELECTED,
} from './hex-layout.js';
import { findPath, hexKey, type HexCoord, type TerrainType, type HexDirection } from '@kingdoms/shared';

/**
 * PixiJS hex map renderer.
 * Renders terrain-colored hexagons with fog of war, rivers,
 * settlement markers, army icons. Supports pan/zoom/click.
 *
 * Right-click opens a context menu. Left-click selects hex / picks move target.
 */
export function MapCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const hexBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const hasCenteredRef = useRef(false);

  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player);
  const selectedHex = useStore(s => s.selectedHex);
  const selectedArmyId = useStore(s => s.selectedArmyId);
  const pendingOrders = useStore(s => s.pendingOrders);
  const setSelectedHex = useStore(s => s.setSelectedHex);
  const setSelectedArmyId = useStore(s => s.setSelectedArmyId);
  const isSelectingMoveTarget = useStore(s => s.isSelectingMoveTarget);
  const panToHex = useStore(s => s.panToHex);
  const setPanToHex = useStore(s => s.setPanToHex);
  const setActiveTab = useStore(s => s.setActiveTab);

  const selectedHexRef = useRef(selectedHex);
  selectedHexRef.current = selectedHex;
  const setSelectedHexRef = useRef(setSelectedHex);
  setSelectedHexRef.current = setSelectedHex;
  const selectedArmyIdRef = useRef(selectedArmyId);
  selectedArmyIdRef.current = selectedArmyId;
  const isSelectingMoveTargetRef = useRef(isSelectingMoveTarget);
  isSelectingMoveTargetRef.current = isSelectingMoveTarget;

  // Initialize PixiJS application
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const container = canvasRef.current;
    let destroyed = false;

    (async () => {
      const app = new Application();
      await app.init({
        resizeTo: container,
        background: 0x1a1410,
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

      // Start at container center; initial centering on capital happens via the
      // settlements effect below once data arrives.
      world.x = container.clientWidth / 2;
      world.y = container.clientHeight / 2;

      // ── Pan & Zoom ──
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let worldStart = { x: 0, y: 0 };

      function clampWorld(nx: number, ny: number, scale: number): { x: number; y: number } {
        const bounds = hexBoundsRef.current;
        if (!bounds) return { x: nx, y: ny };
        const w = container.clientWidth;
        const h = container.clientHeight;
        // Ensure at least some of the map is always visible
        const cx = Math.max(-bounds.maxX * scale, Math.min(w - bounds.minX * scale, nx));
        const cy = Math.max(-bounds.maxY * scale, Math.min(h - bounds.minY * scale, ny));
        return { x: cx, y: cy };
      }

      app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        worldStart = { x: world.x, y: world.y };
      });

      app.canvas.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isDragging) return;
        const nx = worldStart.x + (e.clientX - dragStart.x);
        const ny = worldStart.y + (e.clientY - dragStart.y);
        const clamped = clampWorld(nx, ny, world.scale.x);
        world.x = clamped.x;
        world.y = clamped.y;
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

          if (e.button === 2) {
            // Right-click: open context menu
            const state = useStore.getState();
            state.setMapContextMenu({
              x: e.clientX,
              y: e.clientY,
              hex,
            });
          } else {
            // Left-click
            if (isSelectingMoveTargetRef.current) {
              // We're in "select move target" mode
              handleMoveTarget(hex);
            } else {
              // Normal: select hex and auto-select army
              setSelectedHexRef.current(hex);
              autoSelectArmy(hex);
              // If detail panel is open, update it to show the newly clicked hex
              const state2 = useStore.getState();
              if (state2.detailPanelHex) {
                state2.setDetailPanelHex(hex);
              }
            }
          }
        }

        isDragging = false;
      });

      app.canvas.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault();
      });

      function autoSelectArmy(hex: { q: number; r: number }) {
        const state = useStore.getState();
        const playerId = (state.player as any)?.id;
        if (!playerId) return;
        const myArmiesHere = state.armies.filter(
          (a: any) => a.ownerId === playerId && a.hexQ === hex.q && a.hexR === hex.r
        );
        if (myArmiesHere.length === 1) {
          state.setSelectedArmyId((myArmiesHere[0] as any).id);
        } else if (myArmiesHere.length === 0) {
          state.setSelectedArmyId(null);
        } else {
          const currentId = selectedArmyIdRef.current;
          const stillHere = myArmiesHere.some((a: any) => a.id === currentId);
          if (!stillHere) {
            state.setSelectedArmyId((myArmiesHere[0] as any).id);
          }
        }
      }

      function handleMoveTarget(targetHex: { q: number; r: number }) {
        const state = useStore.getState();
        const armyId = selectedArmyIdRef.current;
        if (!armyId) { state.setIsSelectingMoveTarget(false); return; }

        const army = state.armies.find((a: any) => a.id === armyId) as any;
        if (!army) { state.setIsSelectingMoveTarget(false); return; }

        const playerId = (state.player as any)?.id;
        if (army.ownerId !== playerId) { state.setIsSelectingMoveTarget(false); return; }

        const start: HexCoord = { q: army.hexQ, r: army.hexR };
        const goal: HexCoord = { q: targetHex.q, r: targetHex.r };

        if (start.q === goal.q && start.r === goal.r) {
          state.setIsSelectingMoveTarget(false);
          return;
        }

        // Build hex data map for pathfinding
        const hexData = new Map<string, { terrain: TerrainType; passable: boolean }>();
        const riverEdges = new Map<string, HexDirection[]>();
        for (const h of state.hexes) {
          const hx = h as any;
          const key = hexKey({ q: hx.q, r: hx.r });
          hexData.set(key, {
            terrain: hx.terrain as TerrainType,
            passable: hx.terrain !== 'coast',
          });
          if (hx.riverEdges?.length > 0) {
            riverEdges.set(key, hx.riverEdges as HexDirection[]);
          }
        }

        const result = findPath(start, goal, hexData, riverEdges);
        if (result) {
          state.addMovement(armyId, result.path.slice(1));
        }

        state.setIsSelectingMoveTarget(false);
        state.setSelectedHex(targetHex);
      }

      app.canvas.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(3, Math.max(0.3, world.scale.x * factor));

        const rect = app.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const worldBefore = { x: (cx - world.x) / world.scale.x, y: (cy - world.y) / world.scale.y };
        world.scale.set(newScale);
        const clamped = clampWorld(cx - worldBefore.x * newScale, cy - worldBefore.y * newScale, newScale);
        world.x = clamped.x;
        world.y = clamped.y;
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

  // Update hex bounds whenever the hex grid changes
  useEffect(() => {
    if (hexes.length === 0) { hexBoundsRef.current = null; return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const hex of hexes) {
      const h = hex as any;
      const pos = hexToPixel(h.q, h.r);
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    }
    const pad = HEX_SIZE * 3;
    hexBoundsRef.current = { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [hexes]);

  // Center on the player's capital once, as soon as both the canvas and settlements are ready
  useEffect(() => {
    if (hasCenteredRef.current) return;
    if (!worldRef.current || !appRef.current) return;
    const myPlayer = player as any;
    if (!myPlayer?.id) return;
    const capital = (settlements as any[]).find(s => s.ownerId === myPlayer.id && s.isCapital)
      ?? (settlements as any[]).find(s => s.ownerId === myPlayer.id);
    if (!capital) return;

    const world = worldRef.current;
    const app = appRef.current;
    const pos = hexToPixel(capital.hexQ, capital.hexR);
    world.x = app.screen.width / 2 - pos.x * world.scale.x;
    world.y = app.screen.height / 2 - pos.y * world.scale.y;
    hasCenteredRef.current = true;
  }, [settlements, player]);

  // Pan to a hex when requested (e.g. from Atlas tab click-to-jump)
  useEffect(() => {
    if (!panToHex || !worldRef.current || !appRef.current) return;
    const world = worldRef.current;
    const app = appRef.current;
    const pos = hexToPixel(panToHex.q, panToHex.r);
    world.x = app.screen.width / 2 - pos.x * world.scale.x;
    world.y = app.screen.height / 2 - pos.y * world.scale.y;
    setPanToHex(null);
    // Close the tab overlay so the map is visible
    setActiveTab(null);
  }, [panToHex, setPanToHex, setActiveTab]);

  // Draw hexes whenever data or selection changes
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    world.removeChildren();

    const corners = hexCorners();

    const terrainLayer = new Container();
    const borderLayer = new Container();
    const riverLayer = new Container();
    const iconLayer = new Container();
    world.addChild(terrainLayer, borderLayer, riverLayer, iconLayer);

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

    const playerColors = new Map<string, string>();
    for (const p of players) {
      playerColors.set((p as any).id, (p as any).color);
    }

    for (const hex of hexes) {
      const h = hex as any;
      const pos = hexToPixel(h.q, h.r);
      const fogState = h.fogState ?? 'full_vision';
      const isSelected = selectedHex && selectedHex.q === h.q && selectedHex.r === h.r;
      const colorMap = isSelected ? TERRAIN_COLORS_SELECTED : TERRAIN_COLORS;
      const fillColor = colorMap[h.terrain] ?? 0xCCCCCC;
      const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));

      // Layer 1: Terrain fill
      const tg = new Graphics();
      tg.poly(offsetCorners);
      tg.fill({ color: fillColor, alpha: fogState === 'soft_fog' ? 0.5 : 1.0 });
      tg.stroke({ color: 0x3d3225, width: 1 });

      if (fogState === 'soft_fog') {
        tg.poly(offsetCorners);
        tg.fill({ color: 0x000000, alpha: 0.4 });
      }
      terrainLayer.addChild(tg);

      // Layer 2: Owner borders
      if (h.ownerId) {
        const bg = new Graphics();
        const ownerColor = playerColors.get(h.ownerId);
        const borderColor = ownerColor ? parseInt(ownerColor.replace('#', ''), 16) : 0x3d3225;
        bg.poly(offsetCorners);
        bg.stroke({ color: borderColor, width: 2.5, alpha: 0.8 });
        borderLayer.addChild(bg);
      }

      // Selection highlight
      if (isSelected) {
        const sg = new Graphics();
        sg.poly(offsetCorners);
        sg.stroke({ color: 0xFFD700, width: 3 });
        borderLayer.addChild(sg);
      }

      // Layer 3: River edges
      if (h.riverEdges?.length > 0) {
        const rg = new Graphics();
        const dirIndex: Record<string, number> = { ne: 0, e: 1, se: 2, sw: 3, w: 4, nw: 5 };
        for (const edge of h.riverEdges as string[]) {
          const idx = dirIndex[edge];
          if (idx === undefined) continue;
          const c1 = offsetCorners[idx];
          const c2 = offsetCorners[(idx + 1) % 6];
          rg.moveTo(c1.x, c1.y);
          rg.lineTo(c2.x, c2.y);
          rg.stroke({ color: 0x4488CC, width: 3.5 });
        }
        riverLayer.addChild(rg);
      }

      // Layer 4: Settlement + army icons
      const hexK = `${h.q},${h.r}`;
      const settlement = settlementByHex.get(hexK);
      if (settlement) {
        const ig = new Graphics();
        const tierSize: Record<string, number> = {
          hamlet: 6, village: 8, town: 10, city: 13, metropolis: 16,
        };
        const size = tierSize[settlement.tier] ?? 8;
        ig.rect(pos.x - size / 2, pos.y - size / 2 - 4, size, size);
        ig.fill({ color: settlement.isCapital ? 0xd4a017 : 0xA0673A });
        ig.stroke({ color: 0x1a1410, width: 1 });
        iconLayer.addChild(ig);
      }

      const hexArmies = armiesByHex.get(hexK);
      if (hexArmies) {
        for (let i = 0; i < hexArmies.length; i++) {
          const army = hexArmies[i];
          const ag = new Graphics();
          const ax = pos.x + (i * 10) - 5;
          const ay = pos.y + 8;
          const ownerColor = playerColors.get(army.ownerId);
          const color = ownerColor ? parseInt(ownerColor.replace('#', ''), 16) : 0x666666;
          ag.circle(ax, ay, 5);
          ag.fill({ color });
          ag.stroke({ color: 0x1a1410, width: 1 });
          iconLayer.addChild(ag);
        }
      }
    }

    // Movement paths
    for (const movement of pendingOrders.movements) {
      const army = armies.find((a: any) => a.id === movement.armyId) as any;
      if (!army) continue;

      const pg = new Graphics();
      const ownerColor = playerColors.get(army.ownerId);
      const pathColor = ownerColor ? parseInt(ownerColor.replace('#', ''), 16) : 0xFFFFFF;

      const startPos = hexToPixel(army.hexQ, army.hexR);
      pg.moveTo(startPos.x, startPos.y);

      for (const step of movement.path) {
        const stepPos = hexToPixel(step.q, step.r);
        pg.lineTo(stepPos.x, stepPos.y);
      }
      pg.stroke({ color: pathColor, width: 3, alpha: 0.8 });

      if (movement.path.length > 0) {
        const dest = movement.path[movement.path.length - 1];
        const destPos = hexToPixel(dest.q, dest.r);
        pg.circle(destPos.x, destPos.y, 6);
        pg.stroke({ color: pathColor, width: 2 });
        pg.fill({ color: pathColor, alpha: 0.3 });
      }

      iconLayer.addChild(pg);
    }

    // Selected army highlight
    if (selectedArmyId) {
      const selArmy = armies.find((a: any) => a.id === selectedArmyId) as any;
      if (selArmy) {
        const sg = new Graphics();
        const pos = hexToPixel(selArmy.hexQ, selArmy.hexR);
        sg.circle(pos.x, pos.y + 8, 8);
        sg.stroke({ color: 0xFFD700, width: 2 });
        iconLayer.addChild(sg);
      }
    }

    // Move-target selection cursor (pulsing crosshair indicator on selected hex if in move-select mode)
    if (isSelectingMoveTarget && selectedArmyId) {
      // Highlight the army being moved more prominently
      const selArmy = armies.find((a: any) => a.id === selectedArmyId) as any;
      if (selArmy) {
        const mg = new Graphics();
        const pos = hexToPixel(selArmy.hexQ, selArmy.hexR);
        mg.circle(pos.x, pos.y + 8, 12);
        mg.stroke({ color: 0xFF4444, width: 2, alpha: 0.6 });
        iconLayer.addChild(mg);
      }
    }

    if (hexes.length === 0) {
      renderDemoMap(terrainLayer, corners);
    }
  }, [hexes, settlements, armies, players, selectedHex, selectedArmyId, pendingOrders, isSelectingMoveTarget]);

  return <div ref={canvasRef} style={{ width: '100%', height: '100%', cursor: isSelectingMoveTarget ? 'crosshair' : 'default' }} />;
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
