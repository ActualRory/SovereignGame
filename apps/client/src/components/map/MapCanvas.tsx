import { useRef, useEffect } from 'react';
import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { useStore } from '../../store/index.js';
import {
  hexToPixel, hexCorners, roundHex, pixelToHex, HEX_SIZE,
  TERRAIN_COLORS, HEX_GRID_COLOR, HEX_GRID_ALPHA, DIR_EDGE_INDEX,
} from './hex-layout.js';
import { findPath, hexKey, hexNeighbor, ALL_DIRECTIONS, TERRAIN, RIVER_CROSSING_COST, hasRiverBetween, canEnterHex, type HexCoord, type TerrainType, type HexDirection, type DiplomacyRelation } from '@kingdoms/shared';
import { generateParchmentTexture, type HexData } from './parchment-generator.js';
import { generateTerrainTextures, terrainVariant, terrainRotation, clearTerrainTextures } from './terrain-symbols.js';
import { wobblyLine, hexSeed } from './wobbly-line.js';
import { drawSettlement, drawArmy, drawMoveTargetIndicator } from './map-icons.js';
import { applyNoiseOverlay } from './noise-overlay.js';
import { animateMovement } from './movement-animator.js';

/**
 * PixiJS hex map renderer — cartographic / old-map style.
 * Renders a procedural parchment background with terrain symbol stamps,
 * wobbly hand-drawn rivers and borders, and cartographic icons.
 */
export function MapCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const hexBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const hasCenteredRef = useRef(false);

  // Layer refs for split static/dynamic rendering
  const staticLayersRef = useRef<Container | null>(null);
  const dynamicLayersRef = useRef<Container | null>(null);

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
  const movementLog = useStore(s => s.movementLog);
  const isAnimatingMovement = useStore(s => s.isAnimatingMovement);
  const setIsAnimatingMovement = useStore(s => s.setIsAnimatingMovement);
  const turnJustResolved = useStore(s => s.turnJustResolved);
  const setTurnJustResolved = useStore(s => s.setTurnJustResolved);

  const selectedHexRef = useRef(selectedHex);
  selectedHexRef.current = selectedHex;
  const setSelectedHexRef = useRef(setSelectedHex);
  setSelectedHexRef.current = setSelectedHex;
  const selectedArmyIdRef = useRef(selectedArmyId);
  selectedArmyIdRef.current = selectedArmyId;
  const isSelectingMoveTargetRef = useRef(isSelectingMoveTarget);
  isSelectingMoveTargetRef.current = isSelectingMoveTarget;

  // ── Initialize PixiJS application ──
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const container = canvasRef.current;
    let destroyed = false;

    (async () => {
      const app = new Application();
      await app.init({
        resizeTo: container,
        background: 0x2C2418,
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

      // Apply paper grain noise overlay
      applyNoiseOverlay('.game-map-area');

      // ── Pan & Zoom ──
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let worldStart = { x: 0, y: 0 };

      function clampWorld(nx: number, ny: number, scale: number): { x: number; y: number } {
        const bounds = hexBoundsRef.current;
        if (!bounds) return { x: nx, y: ny };
        const w = container.clientWidth;
        const h = container.clientHeight;
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
            const state = useStore.getState();
            state.setMapContextMenu({
              x: e.clientX,
              y: e.clientY,
              hex,
            });
          } else {
            if (isSelectingMoveTargetRef.current) {
              handleMoveTarget(hex);
            } else {
              setSelectedHexRef.current(hex);
              autoSelectArmy(hex);
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

        // Build relations array for border access checks
        const relations = (state.diplomacyRelations ?? []) as unknown as DiplomacyRelation[];

        const hexData = new Map<string, { terrain: TerrainType; passable: boolean }>();
        const riverEdges = new Map<string, HexDirection[]>();
        for (const h of state.hexes) {
          const hx = h as any;
          const key = hexKey({ q: hx.q, r: hx.r });
          const terrainPassable = hx.terrain !== 'coast';
          // Block hexes owned by foreign players without war/openBorders
          const borderPassable = canEnterHex(hx.ownerId ?? null, playerId, relations);
          hexData.set(key, {
            terrain: hx.terrain as TerrainType,
            passable: terrainPassable && borderPassable,
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
      clearTerrainTextures();
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
        worldRef.current = null;
        staticLayersRef.current = null;
        dynamicLayersRef.current = null;
      }
    };
  }, []);

  // ── Update hex bounds ──
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

  // ── Center on capital ──
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

  // ── Pan to hex ──
  useEffect(() => {
    if (!panToHex || !worldRef.current || !appRef.current) return;
    const world = worldRef.current;
    const app = appRef.current;
    const pos = hexToPixel(panToHex.q, panToHex.r);
    world.x = app.screen.width / 2 - pos.x * world.scale.x;
    world.y = app.screen.height / 2 - pos.y * world.scale.y;
    setPanToHex(null);
    setActiveTab(null);
  }, [panToHex, setPanToHex, setActiveTab]);

  // ═══════════════════════════════════════════════════════════
  // STATIC LAYERS: parchment, terrain symbols, rivers, borders, fog, icons
  // Redrawn when game data changes (not on selection changes)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const world = worldRef.current;
    const app = appRef.current;
    if (!world || !app) return;

    // Remove old static layers
    if (staticLayersRef.current) {
      world.removeChild(staticLayersRef.current);
      staticLayersRef.current.destroy({ children: true });
    }

    const staticRoot = new Container();
    staticLayersRef.current = staticRoot;
    // Insert static layers below dynamic layers
    if (dynamicLayersRef.current) {
      const dynIdx = world.getChildIndex(dynamicLayersRef.current);
      world.addChildAt(staticRoot, dynIdx);
    } else {
      world.addChild(staticRoot);
    }

    if (hexes.length === 0) {
      renderDemoMap(staticRoot);
      return;
    }

    const corners = hexCorners();
    const bounds = hexBoundsRef.current;

    // ── Layer 0: Parchment background ──
    const parchmentLayer = new Container();
    staticRoot.addChild(parchmentLayer);

    if (bounds) {
      const hexData: HexData[] = hexes.map((h: any) => ({
        q: h.q, r: h.r, terrain: h.terrain,
      }));
      const { texture, originX, originY } = generateParchmentTexture(hexData, bounds);
      const parchmentSprite = new Sprite(texture);
      parchmentSprite.x = originX;
      parchmentSprite.y = originY;
      parchmentLayer.addChild(parchmentSprite);
    }

    // ── Layer 1: Hex grid outlines (very faint) ──
    // Only draw edges where the two hexes have different owners (or unowned),
    // so the interior of a country reads as one clean territory.
    const gridLayer = new Graphics();
    staticRoot.addChild(gridLayer);

    // Build owner lookup early (also used by border layer below)
    const ownerMap = new Map<string, string>();
    for (const hex of hexes) {
      const h = hex as any;
      if (h.ownerId) {
        ownerMap.set(hexKey({ q: h.q, r: h.r }), h.ownerId);
      }
    }

    for (const hex of hexes) {
      const h = hex as any;
      const pos = hexToPixel(h.q, h.r);
      const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));
      const myOwner = ownerMap.get(hexKey({ q: h.q, r: h.r }));

      for (let di = 0; di < ALL_DIRECTIONS.length; di++) {
        const neighbor = hexNeighbor({ q: h.q, r: h.r }, ALL_DIRECTIONS[di]);
        const neighborOwner = ownerMap.get(hexKey(neighbor));
        // Skip this edge if both hexes share the same owner
        if (myOwner && myOwner === neighborOwner) continue;

        const c1 = offsetCorners[(di + 5) % 6];
        const c2 = offsetCorners[di];
        gridLayer.moveTo(c1.x, c1.y);
        gridLayer.lineTo(c2.x, c2.y);
        gridLayer.stroke({ color: HEX_GRID_COLOR, width: 0.7, alpha: HEX_GRID_ALPHA });
      }
    }

    // ── Layer 2: Terrain symbol stamps ──
    const terrainLayer = new Container();
    staticRoot.addChild(terrainLayer);

    const terrainTextures = generateTerrainTextures(app.renderer);

    for (const hex of hexes) {
      const h = hex as any;
      const fogState = h.fogState ?? 'full_vision';
      if (fogState === 'undiscovered') continue; // no symbols for undiscovered

      const variants = terrainTextures[h.terrain];
      if (!variants || variants.length === 0) continue;

      const vi = terrainVariant(h.q, h.r);
      const tex = variants[vi % variants.length];
      const pos = hexToPixel(h.q, h.r);

      const stamp = new Sprite(tex);
      stamp.anchor.set(0.5);
      stamp.x = pos.x;
      stamp.y = pos.y;
      stamp.rotation = terrainRotation(h.q, h.r);
      stamp.alpha = fogState === 'soft_fog' ? 0.35 : 0.85;
      terrainLayer.addChild(stamp);
    }

    // ── Layer 3: Rivers (wobbly hand-drawn) ──
    const riverGraphics = new Graphics();
    staticRoot.addChild(riverGraphics);

    for (const hex of hexes) {
      const h = hex as any;
      if (!h.riverEdges?.length) continue;

      const pos = hexToPixel(h.q, h.r);
      const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));

      for (const edge of h.riverEdges as string[]) {
        const idx = DIR_EDGE_INDEX[edge];
        if (idx === undefined) continue;
        const c1 = offsetCorners[(idx + 5) % 6];
        const c2 = offsetCorners[idx];
        const seed = hexSeed(h.q, h.r, idx);

        // Primary river stroke
        wobblyLine(riverGraphics, c1, c2, seed, 2.5);
        riverGraphics.stroke({ color: 0x5A8AAA, width: 4, alpha: 0.8 });

        // Highlight stroke (lighter, thinner)
        wobblyLine(riverGraphics, c1, c2, seed + 1, 1.5);
        riverGraphics.stroke({ color: 0x7AB0CC, width: 1.5, alpha: 0.5 });
      }
    }

    // ── Layer 4: Political borders (wobbly, edge-based) ──
    const borderGraphics = new Graphics();
    staticRoot.addChild(borderGraphics);

    const playerColors = new Map<string, number>();
    for (const p of players) {
      const color = (p as any).color;
      playerColors.set((p as any).id, typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color);
    }

    for (const hex of hexes) {
      const h = hex as any;
      if (!h.ownerId) continue;

      const pos = hexToPixel(h.q, h.r);
      const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));
      const borderColor = playerColors.get(h.ownerId) ?? 0x3d3225;

      // Determine which edges are borders
      const isBorderEdge: boolean[] = [];
      for (let di = 0; di < ALL_DIRECTIONS.length; di++) {
        const neighbor = hexNeighbor({ q: h.q, r: h.r }, ALL_DIRECTIONS[di]);
        const neighborOwner = ownerMap.get(hexKey(neighbor));
        isBorderEdge.push(neighborOwner !== h.ownerId);
      }

      // Draw each border edge individually
      for (let di = 0; di < 6; di++) {
        if (!isBorderEdge[di]) continue;
        const c1 = offsetCorners[(di + 5) % 6];
        const c2 = offsetCorners[di];
        const seed = hexSeed(h.q, h.r, di + 100);
        wobblyLine(borderGraphics, c1, c2, seed, 2);
        borderGraphics.stroke({ color: borderColor, width: 2.5, alpha: 0.7 });
      }

      // Fill corner gaps: where two adjacent border edges meet, draw a small
      // filled circle at the shared corner so there's no visible seam.
      for (let di = 0; di < 6; di++) {
        if (isBorderEdge[di] && isBorderEdge[(di + 1) % 6]) {
          const corner = offsetCorners[di];
          borderGraphics.circle(corner.x, corner.y, 1.4);
          borderGraphics.fill({ color: borderColor, alpha: 0.7 });
        }
      }
    }

    // ── Layer 5: Fog of war overlay (sepia washes) ──
    const fogGraphics = new Graphics();
    staticRoot.addChild(fogGraphics);

    for (const hex of hexes) {
      const h = hex as any;
      const fogState = h.fogState ?? 'full_vision';
      if (fogState === 'full_vision') continue;

      const pos = hexToPixel(h.q, h.r);
      const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));

      if (fogState === 'soft_fog') {
        // Sepia wash instead of black overlay
        fogGraphics.poly(offsetCorners);
        fogGraphics.fill({ color: 0xA08C6E, alpha: 0.45 });
      }
    }

    // ── Layer 6: Settlement and army icons ──
    const iconGraphics = new Graphics();
    staticRoot.addChild(iconGraphics);

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

    for (const hex of hexes) {
      const h = hex as any;
      const fogState = h.fogState ?? 'full_vision';
      const pos = hexToPixel(h.q, h.r);
      const hexK = `${h.q},${h.r}`;

      // Settlements
      const settlement = settlementByHex.get(hexK);
      if (settlement) {
        drawSettlement(iconGraphics, pos.x, pos.y, settlement.tier, settlement.isCapital);
      }

      // Armies (skip in fog, skip during animation)
      if (fogState === 'full_vision' && !isAnimatingMovement) {
        const hexArmies = armiesByHex.get(hexK);
        if (hexArmies) {
          const hasSettlement = settlementByHex.has(hexK);
          for (let i = 0; i < hexArmies.length; i++) {
            const army = hexArmies[i];
            // Push armies further down and right when sharing hex with a settlement
            const ax = pos.x + (i * 14) - 5 + (hasSettlement ? 10 : 0);
            const ay = pos.y + (hasSettlement ? 18 : 10);
            const color = playerColors.get(army.ownerId) ?? 0x666666;
            drawArmy(iconGraphics, ax, ay, color, false);
          }
        }
      }

      // Claim progress arc
      if (h.claimStartedTurn != null && h.claimingPlayerId && fogState === 'full_vision') {
        const currentTurn = (useStore.getState() as any).game?.currentTurn ?? 0;
        const isEnemyHex = h.ownerId != null && h.ownerId !== h.claimingPlayerId;
        const duration = isEnemyHex ? 4 : 2;
        const progress = Math.min(1, (currentTurn - h.claimStartedTurn) / duration);
        const claimColor = playerColors.get(h.claimingPlayerId) ?? 0xCCAA44;
        const r = 8;
        const cx = pos.x, cy = pos.y - 20;
        iconGraphics.circle(cx, cy, r);
        iconGraphics.stroke({ color: 0x333333, width: 3, alpha: 0.3 });
        // Progress arc as polyline segments
        const startAngle = -Math.PI / 2;
        const sweep = progress * Math.PI * 2;
        const segments = Math.max(8, Math.ceil(sweep * 12));
        for (let i = 0; i <= segments; i++) {
          const a = startAngle + (i / segments) * sweep;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (i === 0) iconGraphics.moveTo(px, py);
          else iconGraphics.lineTo(px, py);
        }
        iconGraphics.stroke({ color: claimColor, width: 2.5, alpha: 0.9 });
      }

      // Conversion progress overlay
      if (h.conversionStartedTurn != null && h.conversionType && fogState === 'full_vision') {
        const currentTurn = (useStore.getState() as any).game?.currentTurn ?? 0;
        const progress = Math.min(1, (currentTurn - h.conversionStartedTurn) / 4);
        const r = 7;
        const cx = pos.x + 16, cy = pos.y - 18;
        iconGraphics.circle(cx, cy, r);
        iconGraphics.stroke({ color: 0x333333, width: 3, alpha: 0.3 });
        const startAngle = -Math.PI / 2;
        const sweep = progress * Math.PI * 2;
        const segments = Math.max(8, Math.ceil(sweep * 12));
        for (let i = 0; i <= segments; i++) {
          const a = startAngle + (i / segments) * sweep;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (i === 0) iconGraphics.moveTo(px, py);
          else iconGraphics.lineTo(px, py);
        }
        iconGraphics.stroke({ color: 0x7A8A3A, width: 2.5, alpha: 0.9 });
      }
    }

    // ── Pending order overlays ──
    const pendingOrders = useStore.getState().pendingOrders;

    // Ghost settlement icons for pending founding
    for (const ns of pendingOrders.newSettlements) {
      const pos = hexToPixel(ns.hexQ, ns.hexR);
      iconGraphics.circle(pos.x, pos.y, 10);
      iconGraphics.stroke({ color: 0xCCAA44, width: 1.5, alpha: 0.5 });
      iconGraphics.fill({ color: 0xCCAA44, alpha: 0.15 });
    }

    // Claim order markers
    for (const cl of pendingOrders.claimHexes) {
      const pos = hexToPixel(cl.hexQ, cl.hexR);
      // Small flag icon
      iconGraphics.moveTo(pos.x - 4, pos.y - 14);
      iconGraphics.lineTo(pos.x - 4, pos.y - 26);
      iconGraphics.stroke({ color: 0xCCAA44, width: 1.5, alpha: 0.7 });
      iconGraphics.rect(pos.x - 4, pos.y - 26, 10, 6);
      iconGraphics.fill({ color: 0xCCAA44, alpha: 0.5 });
    }

    // Farmland conversion markers
    for (const fc of pendingOrders.farmlandConversions) {
      const pos = hexToPixel(fc.hexQ, fc.hexR);
      iconGraphics.circle(pos.x + 16, pos.y - 18, 7);
      iconGraphics.fill({ color: 0x7A8A3A, alpha: 0.2 });
      iconGraphics.stroke({ color: 0x7A8A3A, width: 1.5, alpha: 0.5 });
    }
  }, [hexes, settlements, armies, players, isAnimatingMovement]);

  // ═══════════════════════════════════════════════════════════
  // MOVEMENT REPLAY ANIMATION
  // Only triggered when turnJustResolved flag is set (from socket event),
  // NOT on initial page load or refresh.
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !movementLog || !turnJustResolved) return;

    // Clear the flag immediately so it doesn't re-trigger
    setTurnJustResolved(false);

    const log = movementLog as any;
    if (!log.ticks || log.ticks.length === 0) return;

    // Build player color map
    const playerColors = new Map<string, number>();
    for (const p of players) {
      const pp = p as any;
      playerColors.set(pp.id, parseInt((pp.color ?? '#666666').replace('#', ''), 16));
    }

    setIsAnimatingMovement(true);

    animateMovement(world, log, playerColors).then(() => {
      setIsAnimatingMovement(false);
    });
  }, [movementLog, turnJustResolved, players, setIsAnimatingMovement, setTurnJustResolved]);

  // ═══════════════════════════════════════════════════════════
  // DYNAMIC LAYERS: selection highlight, movement paths, army highlights
  // Redrawn on selection / order changes (cheap)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    // Remove old dynamic layers
    if (dynamicLayersRef.current) {
      world.removeChild(dynamicLayersRef.current);
      dynamicLayersRef.current.destroy({ children: true });
    }

    const dynamicRoot = new Container();
    dynamicLayersRef.current = dynamicRoot;
    world.addChild(dynamicRoot); // always on top

    if (hexes.length === 0) return;

    const corners = hexCorners();
    const dg = new Graphics();
    dynamicRoot.addChild(dg);

    const playerColors = new Map<string, number>();
    for (const p of players) {
      const color = (p as any).color;
      playerColors.set((p as any).id, typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color);
    }

    // Selection highlight
    if (selectedHex) {
      const pos = hexToPixel(selectedHex.q, selectedHex.r);
      const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));
      dg.poly(offsetCorners);
      dg.stroke({ color: 0xFFD700, width: 3, alpha: 0.9 });
      // Subtle fill highlight
      dg.poly(offsetCorners);
      dg.fill({ color: 0xFFD700, alpha: 0.08 });
    }

    // Build hex data lookups for cost calculation
    const hexDataMap = new Map<string, { terrain: TerrainType }>();
    const riverEdgeMap = new Map<string, HexDirection[]>();
    for (const hex of hexes) {
      const h = hex as any;
      const key = hexKey({ q: h.q, r: h.r });
      hexDataMap.set(key, { terrain: h.terrain as TerrainType });
      if (h.riverEdges?.length > 0) {
        riverEdgeMap.set(key, h.riverEdges as HexDirection[]);
      }
    }

    const costLabelStyle = new TextStyle({
      fontFamily: 'Kingthings Exeter',
      fontSize: 13,
      fill: 0x2C1810,
      fontWeight: 'bold',
    });

    // Movement paths
    for (const movement of pendingOrders.movements) {
      const army = armies.find((a: any) => a.id === movement.armyId) as any;
      if (!army) continue;

      const pathColor = playerColors.get(army.ownerId) ?? 0xFFFFFF;
      const startPos = hexToPixel(army.hexQ, army.hexR);

      // Draw path line
      dg.moveTo(startPos.x, startPos.y);
      for (const step of movement.path) {
        const stepPos = hexToPixel(step.q, step.r);
        dg.lineTo(stepPos.x, stepPos.y);
      }
      dg.stroke({ color: pathColor, width: 2.5, alpha: 0.7 });

      // Per-step cost labels along the path
      let runningCost = 0;
      const fullPath: HexCoord[] = [{ q: army.hexQ, r: army.hexR }, ...movement.path];
      for (let i = 1; i < fullPath.length; i++) {
        const prev = fullPath[i - 1];
        const curr = fullPath[i];
        const key = hexKey(curr);
        const data = hexDataMap.get(key);
        let stepCost = data ? TERRAIN[data.terrain].movementCost : 1;
        if (hasRiverBetween(prev, curr, riverEdgeMap)) {
          stepCost += RIVER_CROSSING_COST;
        }
        runningCost += stepCost;

        const currPos = hexToPixel(curr.q, curr.r);
        const prevPos = hexToPixel(prev.q, prev.r);

        // Position label offset from the midpoint of the segment
        const midX = (prevPos.x + currPos.x) / 2;
        const midY = (prevPos.y + currPos.y) / 2;
        // Offset perpendicular to the segment direction
        const segDx = currPos.x - prevPos.x;
        const segDy = currPos.y - prevPos.y;
        const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
        const perpX = segLen > 0 ? -segDy / segLen * 10 : 0;
        const perpY = segLen > 0 ? segDx / segLen * 10 : 0;

        const label = new Text({ text: `${runningCost}`, style: costLabelStyle });
        label.anchor.set(0.5);
        label.x = midX + perpX;
        label.y = midY + perpY;
        dynamicRoot.addChild(label);

        // Small pip on the path at each waypoint
        dg.circle(currPos.x, currPos.y, 3);
        dg.fill({ color: pathColor, alpha: 0.5 });
      }

      // Destination marker with total cost
      if (movement.path.length > 0) {
        const dest = movement.path[movement.path.length - 1];
        const destPos = hexToPixel(dest.q, dest.r);
        dg.circle(destPos.x, destPos.y, 6);
        dg.stroke({ color: pathColor, width: 2 });
        dg.fill({ color: pathColor, alpha: 0.25 });
      }
    }

    // Selected army highlight
    if (selectedArmyId) {
      const selArmy = armies.find((a: any) => a.id === selectedArmyId) as any;
      if (selArmy) {
        const pos = hexToPixel(selArmy.hexQ, selArmy.hexR);
        const armiesByHex = armies.filter((a: any) => a.hexQ === selArmy.hexQ && a.hexR === selArmy.hexR);
        const idx = armiesByHex.findIndex((a: any) => a.id === selectedArmyId);
        const ax = pos.x + (idx * 14) - 5;
        const ay = pos.y + 10;
        dg.circle(ax, ay - 2, 12);
        dg.stroke({ color: 0xFFD700, width: 2, alpha: 0.8 });
      }
    }

    // Move-target selection indicator
    if (isSelectingMoveTarget && selectedArmyId) {
      const selArmy = armies.find((a: any) => a.id === selectedArmyId) as any;
      if (selArmy) {
        const pos = hexToPixel(selArmy.hexQ, selArmy.hexR);
        const armiesByHex = armies.filter((a: any) => a.hexQ === selArmy.hexQ && a.hexR === selArmy.hexR);
        const idx = armiesByHex.findIndex((a: any) => a.id === selectedArmyId);
        const ax = pos.x + (idx * 14) - 5;
        const ay = pos.y + 10;
        drawMoveTargetIndicator(dg, ax, ay);
      }
    }
  }, [hexes, armies, players, selectedHex, selectedArmyId, pendingOrders, isSelectingMoveTarget]);

  return <div ref={canvasRef} style={{ width: '100%', height: '100%', cursor: isSelectingMoveTarget ? 'crosshair' : 'default' }} />;
}

/** Demo hex grid for testing when no server data is loaded. */
function renderDemoMap(parent: Container) {
  const corners = hexCorners();
  const terrains = ['plains', 'hills', 'forest', 'mountains', 'coast', 'marsh', 'desert'];
  const radius = 8;

  // Generate parchment for demo
  const demoHexes: HexData[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) > radius) continue;
      const terrain = terrains[Math.abs((q * 7 + r * 13) % terrains.length)];
      demoHexes.push({ q, r, terrain });
    }
  }

  // Compute bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const h of demoHexes) {
    const pos = hexToPixel(h.q, h.r);
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  }
  const pad = HEX_SIZE * 3;
  const bounds = { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };

  // Parchment
  const { texture, originX, originY } = generateParchmentTexture(demoHexes, bounds);
  const parchmentSprite = new Sprite(texture);
  parchmentSprite.x = originX;
  parchmentSprite.y = originY;
  parent.addChild(parchmentSprite);

  // Grid outlines
  const gridG = new Graphics();
  parent.addChild(gridG);
  for (const h of demoHexes) {
    const pos = hexToPixel(h.q, h.r);
    const offsetCorners = corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y }));
    gridG.poly(offsetCorners);
    gridG.stroke({ color: HEX_GRID_COLOR, width: 0.7, alpha: HEX_GRID_ALPHA });
  }

  // Terrain symbols (use TERRAIN_COLORS as fallback if textures not ready)
  const app = (parent.parent as any)?._appRef?.current;
  if (app?.renderer) {
    const terrainTextures = generateTerrainTextures(app.renderer);
    const terrainContainer = new Container();
    parent.addChild(terrainContainer);

    for (const h of demoHexes) {
      const variants = terrainTextures[h.terrain];
      if (!variants?.length) continue;
      const vi = terrainVariant(h.q, h.r);
      const tex = variants[vi % variants.length];
      const pos = hexToPixel(h.q, h.r);
      const stamp = new Sprite(tex);
      stamp.anchor.set(0.5);
      stamp.x = pos.x;
      stamp.y = pos.y;
      stamp.rotation = terrainRotation(h.q, h.r);
      stamp.alpha = 0.85;
      terrainContainer.addChild(stamp);
    }
  } else {
    // Fallback: flat colored hexes if renderer not available
    const g = new Graphics();
    parent.addChild(g);
    for (const h of demoHexes) {
      const pos = hexToPixel(h.q, h.r);
      const fillColor = TERRAIN_COLORS[h.terrain] ?? 0xCCCCCC;
      g.poly(corners.map(c => ({ x: c.x + pos.x, y: c.y + pos.y })));
      g.fill({ color: fillColor, alpha: 0.3 });
    }
  }
}
