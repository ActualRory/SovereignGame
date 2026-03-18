# Kingdoms Game — Development Guide

## Project Overview

Browser-based multiplayer turn-based strategy game for 4-8 friends, inspired by EU4/Victoria 2/Civ.
Full design spec at `design_document.md`. Implementation plan at `.claude/plans/drifting-riding-rain.md`.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Shared**: `packages/shared` — types, constants, pure logic (hex math, combat engine, pathfinding, visibility, supply, economy)
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
- **Hex grid**: Flat-top hexagons, axial (q,r) coordinates, layered PixiJS rendering (terrain → borders → rivers → icons)
- **Pending orders**: Client-side Zustand slice (`store/slices/orders.ts`) → submitted via TurnBar → stored as JSONB → consumed by turn-resolver

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

### Phase 6: Tech + Diplomacy + Trade — NOT STARTED
- Tech tree (3 eras, prerequisites, research points from buildings)
- Letter system (compose, send, delivery delay)
- Alliances (NAP → Alliance → Military Union)
- Trade (Open Trade → Trade Route → Economic Union)
- Diplomacy tab, Trade tab, Tech tab

### Phase 7: Stability + Notifications + Polish — NOT STARTED
- Stability system (0-100%, 5 bands, consequences)
- Late Winter d20 roll + outcome table
- Notification bell + event log
- Turn replay, flag heraldry builder
- Right-click context menus, elimination/spectator
- Parchment aesthetic pass

### Phase 8: Map Design + Playtest + Deploy — NOT STARTED
- Hand-craft V1 hex map (balanced 4-8 starts)
- End-to-end playtesting
- Deploy: VPS + PM2 + domain + SSL

## Turn Resolution Steps (in order)

1. Tax rate changes
2. Resource production
3. Gold income & upkeep
4. Construction progress
5. Research progress
6. Settlement upgrades + founding, Recruitment, General hiring, Army creation
9. Movement (all armies advance simultaneously, spending MP by terrain cost)
10. Combat (collision detection → field battles via combat engine)
11. Siege assault + capture/raze
12. Hex claiming
13. Population growth
14. Supply consumption + attrition
15. Stability calculation
16. Late Winter d20 roll (not yet implemented)
17. Elimination + victory check (not yet implemented)

## File Conventions

- All shared logic is pure functions (no DB, no side effects) in `packages/shared/src/logic/`
- Constants tables (units, ships, buildings, tech, terrain, combat) in `packages/shared/src/constants/`
- Type definitions in `packages/shared/src/types/`
- Client components: `tabs/` for tab content, `panels/` for overlays, `map/` for PixiJS, `layout/` for page structure
- Client state: Zustand slices in `store/slices/` (game, ui, orders)
