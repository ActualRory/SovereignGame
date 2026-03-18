# Sovereigns — Development Guide

## Project Overview

Browser-based multiplayer turn-based strategy game for 4-8 friends, inspired by EU4/Victoria 2/Civ.
Full design spec at `design_document.md`. Implementation plan at `.claude/plans/drifting-riding-rain.md`.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Shared**: `packages/shared` — types, constants, pure logic (hex math, combat engine, pathfinding, visibility, supply, economy, stability)
- **Server**: `apps/server` — Node.js + Express, Socket.IO, Drizzle ORM + PostgreSQL, BullMQ + Redis
- **Client**: `apps/client` — React 18 + Vite, PixiJS 8 (hex map), Zustand (state), Socket.IO client

## Running the Project

```bash
# Prerequisites: PostgreSQL, Redis (via Rancher Desktop / Docker)
docker run -d --name kingdoms-pg -p 5432:5432 -e POSTGRES_PASSWORD=kingdoms -e POSTGRES_DB=kingdoms postgres:16
docker run -d --name kingdoms-redis -p 6379:6379 redis:7

# Setup
pnpm install
cp .env.example .env
cd apps/server && npx drizzle-kit push && npx tsx src/db/seed.ts && cd ../..

# Dev
pnpm dev  # runs both server (:3000) and client (:5173)
```

## Key Architecture

- **Turn resolution**: 17-step server-side sequence in `apps/server/src/game/turn-resolver.ts`
- **Fog of war**: Server-side filter (`fog-filter.ts`) on every outbound message — security boundary
- **Combat engine**: Pure function in `packages/shared/src/logic/combat-engine.ts` — seeded PRNG (mulberry32), deterministic replay
- **Stability engine**: Pure functions in `packages/shared/src/logic/stability.ts` — per-turn calculation, Late Winter d20 roll
- **Hex grid**: Flat-top hexagons, axial (q,r) coordinates, layered PixiJS rendering (terrain → borders → rivers → icons)
- **Pending orders**: Client-side Zustand slice (`store/slices/orders.ts`) → submitted via TurnBar → stored as JSONB → consumed by turn-resolver
- **Notifications**: Socket.IO events → client Zustand store → NotificationBell + EventLogPanel

## Implementation Progress

### Phase 1: Foundation — COMPLETE
- Monorepo setup, DB schema, lobby system, basic hex map rendering
- Socket.IO rooms, pan/zoom/click, map seed script

### Phase 2: Turn System + Economy — COMPLETE
- BullMQ turn timers (anytime/blitz/standard modes)
- Turn order submission + 17-step resolution loop
- Resource production chains, gold/tax/upkeep, construction, research, population growth
- Economy tab, Country tab, bottom bar with 7 tabs

### Phase 3: Map Mechanics + Fog of War — COMPLETE
- Fog of war: 3 states (undiscovered/soft_fog/full_vision), server-side filtering
- Hex ownership (hold 1 Major Turn to claim)
- Settlement founding + upgrades (Hamlet → Metropolis)
- Supply system (terrain base + settlement radius + army banks + attrition)
- Rivers, pathfinding (A*), Map tab, HexDetailPanel

### Phase 4: Military — Units + Movement — COMPLETE
- 13 land unit types with full stats
- Recruitment (barracks + equipment + 200gp)
- Generals/Admirals (command rating, 1000gp hire)
- Army creation, right-click movement with A* pathfinding
- Movement path rendering on map
- Pending orders wired into TurnBar submission
- Military tab (army cards, unit lists, queued orders)

### Phase 5: Combat + Sieges + Naval — COMPLETE
- Combat engine: fire/shock phases, d20 dice pools, frontline/backline, flanking
- Seeded PRNG (mulberry32) for deterministic replay
- Collision detection during movement → automatic field battles
- Siege assault (defender fires first, walls +2 defence)
- Settlement capture (25% pop loss, ownership transfer)
- Unit states (Full/Depleted/Broken/Destroyed), dice multipliers
- Veterancy system (Fresh→Legend, XP thresholds, Hits On bonus)
- Morale checks (broken units flee on failure)
- Naval combat (2 fire phases, hull-based state tracking)
- Combat log viewer (expandable round-by-round detail with dice rolls)
- Loser retreat mechanics

### Phase 6: Tech + Diplomacy + Trade — COMPLETE
- Tech tree UI: 3 eras (23 techs), era unlock thresholds, prerequisite checking, research selection
- Research selection via orders → turn-resolver sets currentResearch + creates progress rows
- Letter system: compose/send via REST API, delivery delay (1 turn per hex between capitals)
- Letter delivery in turn-resolver (step 8), inbox/sent views in Diplomacy tab
- Diplomacy: NAP/Alliance/War proposals, dissolve relations, white peace offers
- Trade: propose resource exchanges (one-time or standing), cancel agreements
- Trade resolution in turn-resolver (step 7): standing agreements execute each turn, one-time auto-remove
- Server API: `/api/games/:slug/letters`, `/api/games/:slug/diplomacy/propose`, letter read marking
- Tech tab, Diplomacy tab, Trade tab all fully implemented

### Phase 7: Stability + Notifications + Polish — COMPLETE
- Stability engine: per-turn calculation with tax/food/gold/recovery sources
- 5 stability bands (Stable/Uneasy/Unstable/Crisis/Collapse) with escalating consequences
- Band consequences: desertion chance at Unstable+, UI display with colored bars
- Late Winter d20 roll: full outcome table (riots, desertion, rebellion, noble defection, mass desertion, stability bonus)
- Event effects: pop loss (riots), unit strength loss (desertion/mass desertion), general removal (noble defection), settlement pop loss (rebellion)
- Step 17: Elimination check (realm death when all settlements lost) + victory check (last standing)
- Notification bell with unread badge, dropdown list, type-based badges
- Event log panel with colored dots per event type
- Game over overlay with victory/defeat screen and final standings
- Spectator mode: eliminated players see "Spectating" banner, can't submit turns
- Flag heraldry builder: field color picker + charge symbol selector (10 charges)
- CountryTab: stability bar + band label + consequences list, diplomacy status per nation
- HexDetailPanel: click-to-select armies with gold highlight
- Context menu component (reusable)
- Parchment aesthetic polish: custom scrollbars, selection colors, button transitions, card hover effects, panel slide animations, fade-in overlays

### Phase 8: Map Design + Playtest + Deploy — NOT STARTED
- Hand-craft V1 hex map (balanced 4-8 starts)
- End-to-end playtesting
- Deploy: VPS + PM2 + domain + SSL

## Turn Resolution Steps (in order)

1. Tax rate changes
2. Resource production (+ research point generation)
3. Gold income & upkeep
4. Construction progress
5. Research selection + progress
6. Settlement upgrades + founding, Recruitment, General hiring, Army creation
7. Trade resolution (standing + one-time transfers)
8. Letter delivery (mark delivered when deliveryTurn <= currentTurn)
9. Movement (all armies advance simultaneously, spending MP by terrain cost)
10. Combat (collision detection → field battles via combat engine)
11. Siege assault + capture/raze
12. Hex claiming
13. Population growth
14. Supply consumption + attrition
15. Stability calculation (tax/food/gold factors + band consequences)
16. Late Winter d20 roll (turn 8 of each year — seasonal events)
17. Elimination + victory check (realm death → spectator, last standing wins)

## File Conventions

- All shared logic is pure functions (no DB, no side effects) in `packages/shared/src/logic/`
- Constants tables (units, ships, buildings, tech, terrain, combat, stability) in `packages/shared/src/constants/`
- Type definitions in `packages/shared/src/types/`
- Client components: `tabs/` for tab content, `panels/` for overlays/notifications, `shared/` for reusable UI, `map/` for PixiJS, `layout/` for page structure
- Client state: Zustand slices in `store/slices/` (game, ui, orders)
