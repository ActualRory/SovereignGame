# Sovereigns — Development Guide

## Aesthetic Goal
Diegetic and cozy. Parchment textures, warm tones, tactile UI. Think a map table, not a dashboard.

## Project
Browser-based multiplayer turn-based strategy game for 4-8 friends (EU4/Victoria 2/Civ inspired).
- Full design spec: `design_document.md`
- Implementation plan: `.claude/plans/drifting-riding-rain.md`

## Tech Stack
- **Monorepo**: pnpm workspaces + Turborepo
- **Shared** (`packages/shared`): types, constants, pure logic — hex math, combat, pathfinding, visibility, supply, economy, stability
- **Server** (`apps/server`): Node.js + Express, Socket.IO, Drizzle ORM + PostgreSQL, BullMQ + Redis
- **Client** (`apps/client`): React 18 + Vite, PixiJS 8 (hex map), Zustand, Socket.IO client

## Running
```bash
docker run -d --name kingdoms-pg -p 5432:5432 -e POSTGRES_PASSWORD=kingdoms -e POSTGRES_DB=kingdoms postgres:16
docker run -d --name kingdoms-redis -p 6379:6379 redis:7

pnpm install && cp .env.example .env
cd apps/server && npx drizzle-kit push && npx tsx src/db/seed.ts && cd ../..
pnpm dev  # server :3000, client :5173
```

## Key Architecture
| Concern | Location |
|---|---|
| Turn resolution (17 steps) | `apps/server/src/game/turn-resolver.ts` |
| Fog of war (security boundary) | `apps/server/src/game/fog-filter.ts` |
| Combat engine (seeded PRNG, deterministic) | `packages/shared/src/logic/combat-engine.ts` |
| Stability engine | `packages/shared/src/logic/stability.ts` |
| Hex grid (flat-top, axial q/r, layered PixiJS) | `apps/client/src/map/` |
| Pending orders (Zustand → TurnBar → JSONB) | `apps/client/src/store/slices/orders.ts` |

## Turn Resolution Order
1. Tax rate changes
2. Resource production + research points
3. Gold income & upkeep
4. Construction progress
5. Research selection + progress
6. Settlement upgrades/founding, recruitment, general hiring, army creation
7. Trade resolution (standing + one-time)
8. Letter delivery
9. Movement (simultaneous, terrain MP cost)
10. Combat (collision → field battle)
11. Siege assault + capture/raze
12. Hex claiming
13. Population growth
14. Supply consumption + attrition
15. Stability calculation
16. Late Winter d20 roll (turn 8 of each year)
17. Elimination + victory check

## File Conventions
- **Shared logic**: pure functions, no DB/side effects — `packages/shared/src/logic/`
- **Constants**: units, ships, buildings, tech, terrain, combat, stability — `packages/shared/src/constants/`
- **Types**: `packages/shared/src/types/`
- **Client components**: `tabs/` (tab content), `panels/` (overlays), `shared/` (reusable UI), `map/` (PixiJS), `layout/` (page structure)
- **Client state**: Zustand slices in `store/slices/` — game, ui, orders

## Current Status
Phases 1–7 complete. All core systems implemented: economy, fog of war, military, combat, tech, diplomacy, trade, stability, notifications, polish.

**Phase 8 (not started):** hand-craft V1 map, end-to-end playtesting, deploy (VPS + PM2 + SSL).
