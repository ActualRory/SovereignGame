# Kingdoms — Game Design Document
*Browser-based multiplayer strategy game*

---

## 1. Overview

A turn-based multiplayer browser strategy game for a lobby of friends. Players each rule a nation on a shared hex map, managing economy, military, and diplomacy. Inspired by the Rulers RPG tabletop system, Sid Meier's Civilisation, Victoria 2, EU4, and a Napoleonic-fantasy aesthetic.

Each game is a persistent lobby with a unique URL. Games run continuously until a winner emerges or the group decides to end. They often offer over real life days, weeks, and months. Communication takes actual time to travel.

---

## 2. Turn Structure

### Game Modes
| Mode | Minor Turn Duration | Advances When |
|---|---|---|
| **Anytime** | No timer | All players submit |
| **Blitz** | 5 minutes | Timer expires or all submit |
| **Standard** | 24 hours | Timer expires or all submit |

**Early Submit Toggle:** If all players submit before the timer expires, the next turn begins immediately — but inherits the remaining time. Example: 1 hour left on a Standard turn → next turn runs for 25 hours.

**Unsubmitted players (Blitz/Standard):** Actions are discarded at cutoff. A warning is shown 1 hour before deadline.

### Turn Scale
- **Minor Turn** = half a season (e.g. Early Spring, Late Spring)
- **Major Turn** = 8 Minor Turns = 1 in-game year
- **Calendar display:** "Early Spring (Turn 1)", "Late Spring (Turn 2)" ... "Late Winter (Turn 8)"

### Action Types
Every action is one of:
- **Instant** — resolves immediately on submission
- **Minor Turn** — resolves at end of current Minor Turn
- **Major Turn** — resolves at end of current Major Turn

---

## 3. UI & Aesthetic

### Visual Style
- Parchment colour palette, fantasy iconography
- Clean and readable — no heavy animations
- Serif fonts, subtle textures, functional with flavour

### Layout
- **Map** is the persistent base layer — always visible
- **Seven tabs** sit in a permanent bottom bar: Country, Map, Economy, Trade, Tech, Military, Diplomacy
- Tabs open as overlays on top of the map
- **Hover (delay):** tooltip on any hex — terrain, resources, settlement tier, unit count
- **Click:** side panel — full hex detail, context-sensitive
- **Right-click:** context menu — available actions for that hex

---

## 4. Country Tab

Displays a national overview.

### Customisation
- Ruler name
- Country name
- Subtitle/description
- Flag — heraldry builder (field colour + charge + tincture) or image upload

### Displays
- Capital name
- Population (headline figure)
- Species composition (Humans only in V1)
- Religion (placeholder, not implemented V1)
- Government type (all players begin as **Ruler** — government types deferred to V2)
- Formal relations with other nations (War / Alliance / Vassal / Neutral)
- Alliance names

---

## 5. Map

### Generation
- Static hand-crafted map for V1
- Random generation deferred to V2

### Hex System
Hex-based. Clickable, draggable, zoomable.

### Fog of War
| State | Condition | Visible |
|---|---|---|
| **Undiscovered** | Never seen | Nothing |
| **Soft Fog** | Previously seen, or 1 tile beyond vision range | Terrain, resources, settlement tier |
| **Full Vision** | Within range of your unit/settlement | Everything |

**Base vision range:**
- Units: 2 hexes full vision, 3rd hex soft fog
- Settlements: 3 hexes full vision, 4th hex soft fog
- Cartography tech: +1 vision range
- Optics tech: +1 vision range for all armies

- **Diplomatic actions:** *Share Maps* (transfers soft fog discoveries), *Share Intelligence* (transfers live vision temporarily)
- **Lobby config:** "Pre-explored" toggle — all hexes start at soft fog

### Terrain Types
| Terrain | Movement Cost | Supply | Defence Bonus | Resources |
|---|---|---|---|---|
| Plains | 1 | High | 0 | Grain, Cattle, Wool, Cotton, Wild Horses |
| Hills | 2 | Medium | +1 | Iron Ore, Stone, Gold Ore |
| Mountains | 3 | Low | +2 | Stone, Iron Ore, Gold Ore, Gryphons |
| Forest | 2 | Medium | +1 | Wood, Fruit |
| Coast | 1 | Medium | 0 | Fish (requires Port) |
| Marsh/Swamp | 3 | Low | +1 | None |
| Desert | 3 | Very Low | 0 | None (V1) |

### Rivers
- Rivers are **hex edges**, not terrain types
- Crossing a river costs extra movement and grants the defender a bonus
- **Bridge** building negates both penalties

### Hex Ownership
- Empty hexes are claimed by moving an army in and **holding for 1 Major Turn**
- Neutral hexes can be enabled in lobby settings — small Hamlets/Villages with garrison-only armies that never expand

### Settling
- The hex must already be owned
- No two settlements may be adjacent
- Costs resources (tier-specific) + 1 Major Turn construction time
- Places a Hamlet

### Supply
- Each terrain type has a base supply value; settlements add a bonus within a radius
- Armies carry a **supply bank** that depletes in low-supply or enemy territory
- Advanced Military Logistics (tech) allows armies to carry military goods for replenishment

### Frontline Width by Terrain
| Terrain | Base Width |
|---|---|
| Plains | 10 |
| Hills | 6 |
| Forest | 5 |
| Mountains | 4 |
| Coast/River crossing | 4 |

General's Command rating adds +1 width per 2 points. **Maneuver Warfare** (Late era tech) increases base width by +2 everywhere.

### Naval
- Full open-ocean movement
- Fleets manage their own supply bank
- Ports required for coastal trade and fleet construction

---

## 6. Population System

### Pop Type
- Single type: **Population**, with a species tag
- V1: Humans only. Species system exists for future expansion.

### Settlement Tiers & Pop Caps
| Tier | Building Slots | Notes |
|---|---|---|
| Hamlet | 2 | Placeable by player |
| Village | 4 | — |
| Town | 6 | — |
| City | 8 | — |
| Metropolis | 10 | Urban type |

- Settlements store resources; only settlements have storage capacity
- Storage cap scales with settlement tier

### Upgrading
- When pop cap is hit, player can invest to upgrade the settlement
- Cost: Gold + tier-specific resources (Timber early tiers, Stone later tiers)
- Time: 1 Major Turn construction project

### Output
- Building output scales with population up to building capacity (linear)
- Seasonal variation applies: Farms ×1.5 at harvest, ×0.5 in winter; Fish steady year-round

### Growth
- Driven by food surplus in the hex
- Capped per season — food cannot rush population growth beyond the seasonal maximum

### Needs
- Food only (V1)

### Combat Effects on Pops
| Event | Pop Loss |
|---|---|
| Capture | 25% |
| Raze | ~50%, settlement drops a tier |

---

## 7. Economy Tab

### Layout
- Default view: **National overview** — aggregate totals at top, drill into settlements below
- Toggle view: **Resource-centric** — organised by resource type across the nation

### Resources
All resources are physical goods stored in settlements.

**Food chain:**
- Grain (Plains) → Farm → Food
- Cattle (Plains) → Farm → Food (slow, steady)
- Fruit (Forest) → Farm → Food (small, seasonal)
- Fish (Coast) → Fishery → Food (steady)

**Construction chain:**
- Stone (Mountains/Hills) → Quarry → Brick
- Wood (Forest) → Sawmill → Timber

**Military chain:**
- Iron Ore (Mountains/Hills) → Mine → Iron → Foundry → Steel
- Iron/Steel → Blacksmith → Spears, Swords, Halberds
- Timber → Bowyer → Bows
- Iron + Tech → Gunsmith → Rifles
- Sulphur → Alchemist → Gunpowder
- Wool/Cotton (Plains) → Tailor → Uniforms
- Wild Horses → Stables → Horses
- Gryphons (Mountains) → Griffin Lodge → Griffins

**Currency:**
- Gold Ore → Mine → Gold Ingots → Bank → Gold (gp)

**Luxury resources** (generate gold when traded, happiness when held — V2):
Tea, Coffee, Tobacco, Opium

### Gold (Currency)
- Separate pool from physical resources
- Upkeep (armies, buildings) auto-deducted each Minor Turn
- **Deficit:** −1% Stability per Minor Turn
- **Negative gold + low Stability:** military units begin to desert

### Taxation
Configured in the Economy tab.

| Rate | Stability Effect |
|---|---|
| Low | +0.5% per Minor Turn |
| Fair | −0.5% per Minor Turn |
| Cruel | −1% per Minor Turn |

### Storage
- Settlements only (armies carry small military goods with Advanced Military Logistics tech)
- Hard cap per settlement tier
- Perishables (Food) spoil if significantly over cap

### Construction Queue
- Initiated via right-click on map or from the settlement detail panel
- Economy tab shows and manages the full national construction queue

### Building List

**Cost Tiers**
| Tier | Gold Cost | Maintenance/Turn | Build Time |
|---|---|---|---|
| Basic | 500g | 100g | 1 Minor Turn |
| Standard | 1,500g | 300g | 1 Minor Turn |
| Advanced | 3,000g | 600g | 2 Minor Turns |
| Major | 6,000g | 1,200g | 1 Major Turn |
| Monumental | 12,000g | 2,500g | 1 Major Turn+ |

**Gate rules:**
- Resource extraction buildings (Farm, Mine, Quarry, Sawmill, Fishery, Stables, Griffin Lodge): buildable at any settlement tier, output scales with population
- All other buildings: hard-gated by settlement tier
- Wall reconstruction required after settlement upgrade

**Resource Extraction**
| Building | Tier | Min Settlement | Materials | Terrain |
|---|---|---|---|---|
| Farm | Basic | Hamlet | Timber | Plains/Forest |
| Fishery | Basic | Hamlet | Timber | Coast |
| Sawmill | Basic | Hamlet | Timber | Forest |
| Quarry | Basic | Hamlet | Timber | Mountains/Hills |
| Mine | Standard | Hamlet | Timber | Mountains/Hills |
| Stables | Standard | Hamlet | Timber | Plains |
| Griffin Lodge | Advanced | Hamlet | Timber + Stone | Mountains |

**Processing**
| Building | Tier | Min Settlement | Materials | Notes |
|---|---|---|---|---|
| Blacksmith | Standard | Village | Stone + Timber | Produces Spears, Swords, Halberds |
| Bowyer | Basic | Village | Timber | Produces Bows, Crossbows |
| Armourer | Advanced | Town | Stone + Iron | Produces Armour |
| Foundry | Advanced | Town | Stone + Iron | Produces Steel (requires Foundry tech) |
| Gunsmith | Advanced | City | Stone + Steel | Produces Rifles (requires Firearms tech) |
| Tailor | Standard | Town | Timber | Produces Uniforms |
| Alchemist | Advanced | Town | Stone + Timber | Produces Gunpowder (requires Alchemy tech) |
| Bank | Advanced | Town | Stone + Brick | Converts Gold Ingots → Gold (gp) |

**Civic**
| Building | Tier | Min Settlement | Materials | Effect |
|---|---|---|---|---|
| Library | Basic | Village | Timber | Research points (low) |
| Academy | Advanced | Town | Stone + Timber | Research points (medium) |
| College | Major | City | Stone + Brick | Research points (high) |
| University | Major | Metropolis | Stone + Brick | Research points (highest) |
| Port | Advanced | City (coastal) | Timber + Stone | Sea trade + ship construction |

**Military**
| Building | Tier | Min Settlement | Materials | Effect |
|---|---|---|---|---|
| Barracks | Standard | Village | Timber | Doubles supply limit; troops stationed here |
| Drafting Centre | Standard | Town | Timber | Recruitment without General/Ruler present |
| Military Academy | Major | City | Stone + Brick | Enables General/Admiral hiring |
| Staff College | Major | Metropolis | Stone + Brick | Shifts General avg rating 2/5 → 3/5 |

**Fortifications**
| Building | Tier | Min Settlement | Materials | Notes |
|---|---|---|---|---|
| Wooden Walls | Basic | Hamlet | Timber | Basic defence bonus |
| Stone Walls | Advanced | Town | Stone + Brick | Stronger defence (requires Masonry tech) |
| Watchtower (Wood) | Basic | Hamlet | Timber | No building slot |
| Watchtower (Stone) | Standard | Village | Stone | No building slot |
| Fort | Advanced | Town | Timber + Brick | Standalone field fortification |
| Castle | Monumental | City | Stone + Brick | Standalone major fortification |
| Bridge | Standard | Hamlet | Timber or Stone | Placed on river edge; negates crossing penalty |

---

## 8. Trade Tab

### Trade Tiers
| Tier | How | Effect |
|---|---|---|
| **Open Trade** | Diplomacy action | Unlocks Trade tab interaction + full settlement/wealth visibility |
| **Trade Route** | Trade tab proposal + acceptance | Specific goods exchange, Port required for sea routes |
| **Economic Union** | Formal diplomatic agreement | Full economic visibility + deeper benefits TBD |

### What Can Be Traded
- Anything in your stockpile, including military goods
- **Military goods transfers are flagged** — visible to any nation that has Open Trade with either party AND has researched **Non-Proliferation** tech

### Trade Agreements
- **One-time transfers** and **standing agreements** are both available
- Travel time calculated once at agreement start (1 Minor Turn per hex distance), then forgotten
- Standing agreements run until cancelled

### Cancellation
| Type | Penalty |
|---|---|
| Mutual cancellation | None |
| Unilateral cancellation | Stability hit for cancelling party |
| War declared | All trade instantly voided |

### Quality System
Deferred to V2.

---

## 9. Tech Tab

### Structure
Era-based. Must unlock enough techs in one era to advance to the next.

### Eras
| Era | Theme |
|---|---|
| **Early** | Fantasy Medieval |
| **Middle** | High Medieval / Renaissance |
| **Late** | Fantasy Napoleonic |
| **End Game** | TBD |

### Research Points
- Generated by research buildings (Library, Academy, College, University) per Minor Turn
- Multiple Society buildings stack across settlements
- National research cap per era, raised by advancing to the next era

### Era Unlock Threshold
- **3 of 6** Early techs unlocks Middle era
- **3 of 7** Middle techs unlocks Late era

### Early Era
| Tech | Unlocks | Prereq |
|---|---|---|
| Masonry | Stone Walls, Stone Watchtower, Fort | — |
| Agriculture | Farm output bonus | — |
| Navigation | Port | — |
| Siege Engineering | Required to perform Siege Assaults (without it, only attrition sieges are possible) | — |
| Military Organisation | Barracks, Drafting Centre | — |
| Banking | Bank | — |

### Middle Era
| Tech | Unlocks | Prereq |
|---|---|---|
| Foundry | Foundry building → Steel | Masonry |
| Alchemy | Alchemist → Gunpowder | — |
| Advanced Fortifications | Castle | Masonry |
| Military Academy | Military Academy building | Military Organisation |
| Economics | +10% trade wealth | Banking |
| Cartography | +1 vision range | Navigation |
| Deep Mining | Convert a Hill hex to Stone or Iron production (if producing neither) | Masonry |

### Late Era
| Tech | Unlocks | Prereq |
|---|---|---|
| Firearms | Gunsmith → Rifles | Foundry + Alchemy |
| Non-Proliferation | Flags military goods transfers | Firearms |
| Advanced Military Logistics | Armies carry replenishment supplies | Military Academy |
| Maneuver Warfare | +2 frontline width everywhere | Military Academy |
| Staff College | Staff College building | Military Academy |
| Modern Doctrine | +1 all combat rolls | Maneuver Warfare |
| Optics | +1 vision range all armies | Cartography |
| Civil Administration | Raises national research cap | Economics |
| Urban Planning | Reduces settlement upgrade cost | — |
| Medicine | Increases pop growth rate | Agriculture |

---

## 10. Military Tab

### UI
- Org-chart layout: **Army → Units**
- **Reserve pool** for unassigned units
- Bottom bar showing military resources: Recruits, equipment stockpiles, etc.

### Generals & Admirals
- Organisational commanders with a **Command rating (1–10)**
- Gain XP in battle; level up over time
- Average rating: **2/5** (improves to **3/5** with Staff College researched and built)
- Hired once **Military Academy** is researched and built
- In the absence of a General/Admiral, the **Ruler** fills the role

### Unit Naming
- All units and ships can be given a name and optional subtitle
- e.g. "The Iron Guard / Unbroken Since Edenmoor"

### Recruitment
- Requires the relevant buildings and equipment in the settlement
- Requires a **General or the Ruler** to be present in the settlement — unless a **Drafting Centre** is built there
- Takes **1 Minor Turn** regardless of unit type
- Consumes equipment from stockpile
- **Era labels are flavour only** — any unit is recruitable if you have the equipment, regardless of tech era. A player without Firearms tech can still recruit Riflemen if they obtain Rifles via trade or capture.

### Equipment Sources
| Equipment | Building | Input |
|---|---|---|
| Spears | Blacksmith | Iron |
| Swords | Blacksmith | Iron |
| Halberds | Blacksmith | Steel |
| Bows | Bowyer | Timber |
| Crossbows | Bowyer | Timber |
| Rifles | Gunsmith | Iron + Gunpowder |
| Armour | Armourer | Steel |
| Uniforms | Tailor | Wool or Cotton |
| Horses | Stables | — (Wild Horses resource) |
| Griffins | Griffin Lodge | — (Gryphon resource) |

### Unit Roster

| Unit | Era | Fire | Shock | Defence | Morale | Armour | AP | Hits On | Default Position |
|---|---|---|---|---|---|---|---|---|---|
| Irregulars | Early | 1 | 3 | 2 | 2 | 0 | 0 | 14+ | Frontline |
| Spearmen | Early | 2 | 5 | 4 | 4 | 0 | 0 | 13+ | Frontline |
| Archers | Early | 6 | 1 | 2 | 3 | 0 | 0 | 13+ | Backline |
| Cavalry | Early | 1 | 6 | 3 | 5 | 0 | 0 | 12+ | Flank |
| Swordsmen | Middle | 2 | 6 | 5 | 4 | 0 | 0 | 11+ | Frontline |
| Crossbowmen | Middle | 7 | 1 | 3 | 4 | 0 | 2 | 12+ | Backline |
| Men-at-Arms | Middle | 2 | 6 | 7 | 5 | 4 | 0 | 10+ | Frontline |
| Knights | Middle | 2 | 9 | 5 | 7 | 4 | 0 | 9+ | Flank |
| Griffin Riders | Middle | 4 | 7 | 5 | 7 | 0 | 0 | 9+ | Flank |
| Griffin Knights | Middle | 3 | 9 | 7 | 8 | 3 | 0 | 8+ | Flank |
| Hussars | Late | 3 | 7 | 6 | 7 | 0 | 0 | 10+ | Flank |
| Riflemen | Late | 9 | 2 | 4 | 5 | 0 | 5 | 10+ | Backline |
| Dragoons | Late | 6 | 5 | 6 | 6 | 0 | 3 | 10+ | Flank/Backline |

*All Late era units require Uniforms to recruit.*
*Only Heavy units (Men-at-Arms, Knights, Griffin Knights) have Armour.*

**Equipment per unit:**
| Unit | Equipment Required |
|---|---|
| Irregulars | None |
| Spearmen | Spears |
| Archers | Bows |
| Cavalry | Spears + Horses |
| Swordsmen | Swords |
| Crossbowmen | Crossbows |
| Men-at-Arms | Armour + Halberds |
| Knights | Spears + Swords + Horses + Armour |
| Griffin Riders | Griffins + Swords or Spears |
| Griffin Knights | Griffins + Armour + Halberds |
| Hussars | Swords + Horses + Uniforms |
| Riflemen | Rifles + Uniforms |
| Dragoons | Rifles + Horses + Uniforms |

### Combat System

#### EU4-Inspired Structure
- Armies have a **Frontline** and a **Backline**
- Frontline width is terrain-dependent (see Map section)
- Each combat round has two phases: **Fire** then **Shock**
- Both sides resolve each phase simultaneously
- **Flanking:** if your frontline is wider, edge units wrap and attack the enemy backline

#### Combat Round Sequence (Field Battle)
1. **Fire Phase** — ranged units (Archers, Crossbowmen, Riflemen) + backline fire
2. **Shock Phase** — frontline melee units clash
3. **Morale checks** — losing units roll Morale

#### Siege Assault
- Defenders fire first (Fire phase), then attackers fire
- Attackers then resolve Shock

#### Dice Mechanic
- Units roll their **Fire** or **Shock** stat as a number of d20s
- Each die that meets or beats the unit's **Hits On** value = 1 success
- General's Command rating adds a flat bonus to each die roll
- Terrain and positional bonuses also add to die rolls (not extra dice)
- Net successes dealt to the enemy → reduced by **Armour** (heavy units only) → remainder applied to Wound Track
- **AP** (Armour Piercing) ignores that many points of Armour

#### Unit States
| State | Strength | Effect |
|---|---|---|
| Full | 100–60% | Full dice |
| Depleted | 60–40% | Reduced dice |
| Broken | 40–0% | Minimal dice |
| Destroyed | 0% | Removed from play |

#### Replenishment
- Requires **Recruits** resource + relevant equipment
- Recruits are drafted manually — costs gold, slightly reduces population in the settlement. Requires a General, Ruler, or Drafting Centre present.
- Manual order required, takes time, must be in friendly territory
- Veterancy loss on replenishment:
  - Depleted → Full: −1 vet level
  - Broken → Full: −2 vet levels

#### Veterancy
| Level | Hits On Bonus |
|---|---|
| Fresh | +0 |
| Regular | +1 |
| Veteran | +2 |
| Elite | +3 |
| Legend | +4 |

- XP gained by: surviving combat, winning engagements, defeating higher-vet units
- Visible to any player who can see the unit

### Ship Roster

Hull replaces Armour for ships — functions as a **hit point pool** rather than damage reduction.

**Ship States:** Intact → Damaged (50% Hull) → Crippled (25% Hull) → Sunk (0%)

| Ship | Era | Fire | Shock | Defence | Morale | Hull | AP | Hits On | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Sloop | Early | 3 | 1 | 2 | 3 | 6 | 0 | 13+ | Fast scout |
| Brig | Early | 5 | 1 | 3 | 4 | 8 | 0 | 13+ | Light warship |
| Frigate | Middle | 8 | 2 | 5 | 6 | 12 | 1 | 10+ | Fast, versatile |
| Transport | Middle | 1 | 0 | 2 | 3 | 10 | 0 | 14+ | Carries troops/supplies |
| Third Rate | Late | 10 | 3 | 6 | 7 | 16 | 2 | 9+ | Workhorse warship |
| Second Rate | Late | 11 | 3 | 7 | 7 | 18 | 2 | 8+ | Heavy warship |
| First Rate | Late | 12 | 3 | 7 | 8 | 20 | 3 | 7+ | Flagship class |

#### Naval Combat
- Two **Fire phases** resolved simultaneously
- **Boarding (Shock)** is rare — only initiatable by specific ship types or circumstances
- Most ships are destroyed; few are captured
- Veterancy applies identically to ships

### Army Movement
- Right-click destination to set path
- Projected route shown with estimated turns to arrive
- Waypoints supported

---

## 11. Diplomacy Tab

### UI
- Left panel: nation list with relationship status (War / Allied / Vassal / Neutral)
- Right panel: integrated letter composer

### The Letter System
- Draft a letter to any player
- Parchment aesthetic, sealed with your nation's flag
- Delivery time: **1 Minor Turn per hex** between nations
- Letters can contain free-form text + formal attachments

### Formal Attachments
| Category | Attachments |
|---|---|
| **War & Peace** | Declaration of War, Peace Treaty, White Peace, Unconditional Surrender |
| **Agreements** | Alliance (see tiers), Non-Aggression Pact |
| **Economic** | Open Trade, Close Trade, Trade Route proposal, Economic Union, Tribute Demand, Offer Subsidy, Loan |
| **Territorial** | Land Cession, Vassal Offer |
| **Intelligence** | Share Maps, Share Intelligence |

### Alliance Tiers

**Tier 1 — Non-Aggression Pact**
- Cannot declare war on each other
- Configurable: duration (permanent or X Major Turns), auto-renewal

**Tier 2 — Alliance**
- Cannot declare war on each other
- Mutual defence optional by default
- Configurable terms: Mutual Defence (auto war entry), Open Borders, Open Trade, Share Maps, Joint War Goals

**Tier 3 — Military Union**
- Full mutual defence (mandatory)
- All Tier 2 terms included
- Configurable extras: Economic Union, Shared Research, Unified Command

All alliances have a player-given formal name. Either party can dissolve with 1 Minor Turn notice, triggering a Stability hit.

### Unconditional Surrender
Victor opens a structured **Peace Demand screen**:

| Category | Examples |
|---|---|
| Reparations | Gold lump sum, gold per Major Turn for X turns |
| Territory | Hex cession, release of occupied settlements |
| Diplomatic | Vassal status, break existing alliances, NAP with victor |
| Military | Disarm (army size cap for X turns), destroy fortifications |
| Economic | Forced Open Trade, tribute payments |

- No point budget — victor demands whatever they choose
- Victor may attach a free-form letter alongside demands
- **Clemency option:** victor may choose to make modest demands, which reduces Stability loss in the loser's nation
- Loser must accept all terms (unconditional)

### Vassal
| Rule | Effect |
|---|---|
| Cannot declare war on overlord | — |
| Cannot declare war without overlord approval | — |
| Vassal attacked | Overlord automatically enters the war |
| Overlord enters a war | Vassal is co-belligerent |
| Economic visibility | Overlord has full economic visibility of vassal |

*Additional vassal tiers (Tributary, Subject State) deferred to V2.*

### Elimination
- Realm death (all settlements captured) = player becomes a **spectator**
- Player keeps 10% of treasury on elimination (flavour only)

---

## 12. Starting Conditions

Each player begins with:

| Element | Value |
|---|---|
| Settlement | 1 Town (capital) |
| Population | Half of Town pop cap |
| Territory | Small surrounding hex cluster |
| Starting gold | 5,000g |
| Buildings | Farm, Library, Barracks, Blacksmith (4 of 6 slots used) |
| Starting units | 2× Spearmen |
| Government title | Ruler |
| Stability | 100% |

---

## 13. Victory Conditions


Last nation standing wins. A player is eliminated when all their settlements are captured (realm death). Eliminated players become spectators.

---

## 14. Stability

### Overview
Stability is a national percentage (0–100%). High is good; low risks crisis events. Displayed on the Country tab.

### Bands & Consequences
| Band | Range | Ongoing Effects |
|---|---|---|
| **Stable** | 75–100% | None |
| **Uneasy** | 50–75% | Tax efficiency reduced, pop growth slowed |
| **Unstable** | 25–50% | + Desertion possible, Riots possible |
| **Crisis** | 10–25% | + Rebellion possible, General/Noble defection possible |
| **Collapse** | 0–10% | + Settlement defection possible, mass desertion |

### Stability Sources

**Per Minor Turn**
| Source | Change |
|---|---|
| Tax: Low | +0.5% |
| Tax: Fair | −0.5% |
| Tax: Cruel | −1% |
| Gold deficit | −1% |
| Food shortage | −1% |
| Passive recovery (causes resolved) | +0.5% |

**One-time events**
| Source | Change |
|---|---|
| War declared | −5% |
| Peace declared | +5% |
| Settlement captured by enemy | −5% |
| Settlement razed | −15% |
| Alliance broken | −15% |
| NAP broken | −10% |

### Late Winter Seasonal Roll
Each Late Winter (Turn 8), roll 1d20. Low rolls are worst; threshold for bad effects shifts as Stability deteriorates.

| Roll | Stable | Uneasy | Unstable | Crisis | Collapse |
|---|---|---|---|---|---|
| 1–2 | Minor unrest* | Riots | Desertion | Rebellion | Mass Desertion + Rebellion |
| 3–4 | Nothing | Minor unrest* | Riots | Noble Defection | Rebellion |
| 5–6 | Nothing | Nothing | Minor unrest* | Desertion | Noble Defection |
| 7–10 | Nothing | Nothing | Nothing | Riots | Desertion |
| 11–19 | Nothing | Nothing | Nothing | Nothing | Riots |
| 20 | +10% Stability | +10% Stability | +10% Stability | +10% Stability | +10% Stability |

*Minor unrest = flavour text only, placeholder for future implementation*

### Recovery
- Slow passive recovery each Minor Turn when causes of instability are resolved (+0.5%)
- Active actions (Edicts — TBD) can boost recovery faster

---

## 15. Notifications & Event Log

### In-Game Only (V1)
- Notification bell for key events: letter received, war declared, turn ending soon, settlement captured, etc.
- **Event log** — a full record of what happened each turn
- **Turn replay** — watch simultaneous turn events play out sequentially, including full battle playback

---

## 16. Lobby Settings

Configured by the host at game creation:

| Setting | Options |
|---|---|
| Game Mode | Anytime / Blitz / Standard |
| Early Submit | On / Off |
| Pre-explored Map | On / Off (all hexes start at soft fog) |
| Neutral Settlements | On / Off (spawns garrison-only hamlets/villages) |

---

## 17. V2 / Deferred Features

- Random map generation
- Religion system
- Population demographics beyond headcount
- Naval detail expansion
- Additional vassal tiers (Tributary, Subject State)
- Player-as-noble after elimination
- Trade quality system (monopolies, product grades)
- Theatre and Coliseum buildings (stability/happiness effects TBD)
- Luxury resources (Tea, Coffee, Tobacco, Opium)
- Late-game resources (Coal, Oil, Rubber)
- End Game tech era
- Email notifications
- Intelligence gathering before viewing nation relations
- Cannon unit (requires artillery overhaul)
- Advanced alliance mechanics
- Government types system (Monarch, Elected Monarch, Council, Ecclesiastical, Consortium, Magistrate, Warlord)
