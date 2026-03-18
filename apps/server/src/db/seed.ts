/**
 * Seed script — inserts a test map into the database.
 * Run with: npx tsx src/db/seed.ts
 */

import '../config.js'; // loads dotenv
import { db, schema } from './index.js';
import { eq } from 'drizzle-orm';

const MAP_NAME = 'Test Continent';

// Radius-6 hex map — 127 hexes, balanced 4 starting positions
function generateTestMap() {
  const radius = 6;
  const hexes: Array<{
    q: number; r: number; terrain: string; resources: string[]; riverEdges: string[];
  }> = [];

  // Terrain assignment based on distance from center + noise
  function pickTerrain(q: number, r: number): string {
    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
    const hash = Math.abs((q * 31 + r * 17 + q * r * 7) % 100);

    // Outer ring: coast
    if (dist === radius) return 'coast';
    // Near outer: mix
    if (dist >= radius - 1) return hash < 40 ? 'coast' : hash < 70 ? 'plains' : 'forest';
    // Mountains in center cluster
    if (dist <= 1 && hash < 30) return 'mountains';
    if (dist <= 2 && hash < 15) return 'mountains';
    // Hills band
    if (dist === 3 && hash < 40) return 'hills';
    // Forest patches
    if (hash < 20) return 'forest';
    // Marsh rare
    if (hash >= 90 && dist > 2) return 'marsh';
    return 'plains';
  }

  function pickResources(terrain: string, q: number, r: number): string[] {
    const hash = Math.abs((q * 53 + r * 23) % 100);
    const resources: string[] = [];

    switch (terrain) {
      case 'plains':
        if (hash < 30) resources.push('grain');
        if (hash >= 30 && hash < 50) resources.push('cattle');
        if (hash >= 80) resources.push('wild_horses');
        break;
      case 'hills':
        if (hash < 40) resources.push('iron_ore');
        if (hash >= 40 && hash < 60) resources.push('stone');
        if (hash >= 80) resources.push('gold_ore');
        break;
      case 'mountains':
        if (hash < 50) resources.push('stone');
        if (hash >= 50) resources.push('iron_ore');
        break;
      case 'forest':
        resources.push('wood');
        if (hash < 30) resources.push('fruit');
        break;
      case 'coast':
        if (hash < 60) resources.push('fish');
        break;
      case 'marsh':
        break;
    }
    return resources;
  }

  // River edges: a few rivers crossing the map
  const riverHexes: Record<string, string[]> = {
    '0,-3': ['se'],
    '0,-2': ['se'],
    '0,-1': ['se'],
    '1,-1': ['sw'],
    '1,0': ['sw'],
    '1,1': ['sw'],
    '-3,1': ['e'],
    '-2,1': ['e'],
    '-1,1': ['e'],
  };

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) > radius) continue;

      const terrain = pickTerrain(q, r);
      const resources = pickResources(terrain, q, r);
      const key = `${q},${r}`;
      const edges = riverHexes[key] ?? [];

      hexes.push({ q, r, terrain, resources, riverEdges: edges });
    }
  }

  // 4 player starts at compass points, each with 3 claimed hexes
  const playerStarts = [
    {
      slotIndex: 0, q: -4, r: 1,
      claimedHexes: [{ q: -4, r: 1 }, { q: -4, r: 2 }, { q: -3, r: 0 }],
    },
    {
      slotIndex: 1, q: 4, r: -1,
      claimedHexes: [{ q: 4, r: -1 }, { q: 4, r: -2 }, { q: 3, r: 0 }],
    },
    {
      slotIndex: 2, q: -1, r: -3,
      claimedHexes: [{ q: -1, r: -3 }, { q: 0, r: -4 }, { q: -2, r: -2 }],
    },
    {
      slotIndex: 3, q: 1, r: 3,
      claimedHexes: [{ q: 1, r: 3 }, { q: 0, r: 4 }, { q: 2, r: 2 }],
    },
  ];

  // Ensure starting hexes are always plains
  for (const start of playerStarts) {
    for (const claimed of start.claimedHexes) {
      const hex = hexes.find(h => h.q === claimed.q && h.r === claimed.r);
      if (hex && hex.terrain !== 'plains') {
        hex.terrain = 'plains';
        hex.resources = ['grain'];
      }
    }
  }

  return { hexes, playerStarts };
}

async function seed() {
  console.log('Seeding test map...');

  // Check if map already exists
  const [existing] = await db.select().from(schema.maps).where(eq(schema.maps.name, MAP_NAME));
  if (existing) {
    console.log(`Map "${MAP_NAME}" already exists (id: ${existing.id}). Skipping.`);
    process.exit(0);
  }

  const { hexes, playerStarts } = generateTestMap();

  const [map] = await db.insert(schema.maps).values({
    name: MAP_NAME,
    hexData: hexes as any,
    playerStarts: playerStarts as any,
  }).returning();

  console.log(`Created map "${MAP_NAME}" (id: ${map.id}) with ${hexes.length} hexes and ${playerStarts.length} starting positions.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
