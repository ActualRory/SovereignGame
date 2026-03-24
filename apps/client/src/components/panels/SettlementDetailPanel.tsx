import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  BUILDINGS, COST_TIERS, SETTLEMENT_TIERS, RESEARCH_POINTS, getNextTier,
  meetsTierRequirement, calculateTaxIncome, calculateFoodConsumption,
  WEAPONS, SHIELDS, ARMOUR_TYPES,
  RANK_DISPLAY_NAMES,
  type BuildingType, type CostTier, type SettlementTier, type BuildingCategory,
  type Noble, type WeaponType, type ShieldType, type ArmourType,
  type TaxRate,
} from '@kingdoms/shared';
import { Tooltip } from '../shared/Tooltip.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

// ─── Settlement View (Full-Screen) ────────────────────────────────────────

export function SettlementDetailPanel() {
  const { slug } = useParams<{ slug: string }>();
  const selectedSettlementId = useStore(s => s.selectedSettlementId);
  const setSelectedSettlementId = useStore(s => s.setSelectedSettlementId);
  const settlements = useStore(s => s.settlements);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const nobles = useStore(s => s.nobles) as Noble[];
  const hexes = useStore(s => s.hexes) as Array<Record<string, unknown>>;
  const pendingOrders = useStore(s => s.pendingOrders);
  const setPendingOrders = useStore(s => s.setPendingOrders);
  const setGameState = useStore(s => s.setGameState);
  const techProgress = useStore(s => s.techProgress) as Array<{ tech: string; isResearched: boolean }>;
  const researchedTechs = new Set(techProgress.filter(t => t.isResearched).map(t => t.tech));

  const settlement = selectedSettlementId
    ? settlements.find((s: any) => s.id === selectedSettlementId) as any
    : null;

  const [showBuildModal, setShowBuildModal] = useState(false);

  if (!settlement || !slug || !player) return null;

  const isOwn = settlement.ownerId === player.id;
  if (!isOwn) {
    // For enemy settlements, show a minimal panel
    return <EnemySettlementPanel settlement={settlement} onClose={() => setSelectedSettlementId(null)} />;
  }

  const tierDef = SETTLEMENT_TIERS[settlement.tier as SettlementTier];
  const buildings = (settlement.buildings ?? []) as any[];
  const completedBuildings = buildings.filter((b: any) => !b.isConstructing);
  const constructing = buildings.filter((b: any) => b.isConstructing);
  const storage = (settlement.storage ?? {}) as Record<string, number>;

  // Governor
  const governor = nobles.find(
    n => n.assignmentType === 'governor' && n.assignedEntityId === settlement.id && n.isAlive,
  );

  // Wealth calculations
  const taxRate = (player.taxRate as TaxRate) ?? 'low';
  const taxIncome = calculateTaxIncome(settlement.population ?? 0, taxRate);
  let buildingUpkeep = 0;
  for (const b of completedBuildings) {
    const def = BUILDINGS[b.type as BuildingType];
    if (def) buildingUpkeep += COST_TIERS[def.costTier].maintenance;
  }
  const foodConsumption = calculateFoodConsumption(settlement.population ?? 0);
  let foodProduction = 0;
  for (const b of completedBuildings) {
    const def = BUILDINGS[b.type as BuildingType];
    if (def?.output?.food) foodProduction += def.output.food;
  }
  const storageUsed = Object.values(storage).reduce((sum, v) => sum + v, 0);

  // Slots
  const usedSlots = buildings.filter((b: any) => {
    const def = BUILDINGS[b.type as BuildingType];
    return def?.usesSlot !== false;
  }).length;
  const pendingConstructions = pendingOrders.constructions.filter(
    (c: any) => c.settlementId === settlement.id,
  );
  const pendingSlotsUsed = pendingConstructions.filter((c: any) => {
    const def = BUILDINGS[c.buildingType as BuildingType];
    return def?.usesSlot !== false;
  }).length;

  // Manpower
  const population = settlement.population ?? 0;
  const draftedRecruits = settlement.draftedRecruits ?? 0;
  const maxDraftable = Math.floor(population * 0.20);
  const pendingDraft = pendingOrders.draftRecruits
    .filter((d: any) => d.settlementId === settlement.id)
    .reduce((s: number, d: any) => s + d.amount, 0);
  const pendingDismiss = pendingOrders.dismissRecruits
    .filter((d: any) => d.settlementId === settlement.id)
    .reduce((s: number, d: any) => s + d.amount, 0);

  // Mounts
  const mountsInStorage = {
    horses: storage.horses ?? 0,
    griffins: storage.griffins ?? 0,
    demigryphs: storage.demigryphs ?? 0,
  };
  const draftedMounts = {
    horses: settlement.draftedHorses ?? 0,
    griffins: settlement.draftedGryphons ?? 0,
    demigryphs: settlement.draftedDemigryphs ?? 0,
  };

  // Storage categorization
  const weaponEntries = Object.entries(storage).filter(([k, v]) => v > 0 && WEAPONS[k as WeaponType]);
  const shieldEntries = Object.entries(storage).filter(([k, v]) => v > 0 && SHIELDS[k as ShieldType]);
  const armourEntries = Object.entries(storage).filter(([k, v]) => v > 0 && ARMOUR_TYPES[k as ArmourType]);
  const mountKeys = new Set(['horses', 'griffins', 'demigryphs']);
  const weaponKeys = new Set(Object.keys(WEAPONS));
  const shieldKeys = new Set(Object.keys(SHIELDS));
  const armourKeys = new Set(Object.keys(ARMOUR_TYPES));
  const materialEntries = Object.entries(storage).filter(
    ([k, v]) => v > 0 && !weaponKeys.has(k) && !shieldKeys.has(k) && !armourKeys.has(k) && !mountKeys.has(k),
  );

  // Hex terrain (for construction validation)
  const hex = hexes.find((h: any) => h.q === settlement.hexQ && h.r === settlement.hexR) as any;
  const hexTerrain = hex?.terrain as string | undefined;

  const popPct = Math.min(100, Math.round(((population) / (settlement.popCap || 1)) * 100));

  return (
    <div className="settlement-view">
      {/* Header */}
      <div className="sv-header">
        <div>
          <SettlementName
            slug={slug}
            settlement={settlement}
            settlements={settlements}
            setGameState={setGameState}
          />
          <div className="sv-header-info">
            <span className="sv-tier-badge">{settlement.tier}</span>
            <span>
              Pop {population.toLocaleString()}/{(settlement.popCap ?? 0).toLocaleString()}
              <span className="sv-pop-bar">
                <span className="sv-pop-bar-fill" style={{ width: `${popPct}%` }} />
              </span>
            </span>
            {settlement.isCapital && <span className="capital-badge">Capital</span>}
          </div>
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '6px 14px', fontSize: 13 }}
          onClick={() => setSelectedSettlementId(null)}
        >
          Close
        </button>
      </div>

      {/* Two-column grid */}
      <div className="sv-grid">
        {/* ── Governor ── */}
        <div className="sv-section">
          <div className="sv-section-label">Governor</div>
          {governor ? (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-gold)', fontSize: 14 }}>
                {RANK_DISPLAY_NAMES[governor.rank] ?? fmt(governor.rank)} {governor.name}
              </div>
              <div className="sv-noble-stats">
                <span>M:{governor.martial}</span>
                <span>I:{governor.intelligence}</span>
                <span>C:{governor.cunning}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Administrator
                <span className="sv-trait-dots">
                  {[0, 1, 2, 3, 4].map(i => (
                    <span key={i} className={`sv-trait-dot ${i < (governor.traits?.administrator ?? 0) ? 'filled' : ''}`} />
                  ))}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>
              No Governor Assigned
            </div>
          )}
        </div>

        {/* ── Wealth ── */}
        <div className="sv-section">
          <div className="sv-section-label">Wealth</div>
          <div className="sv-stat-row">
            <span>Tax Income</span>
            <Tooltip content={<span style={{ fontSize: 11 }}>Tax rate: {taxRate} ({taxRate === 'low' ? '0.5x' : taxRate === 'fair' ? '1.0x' : '1.5x'})</span>}>
              <span className="sv-stat-value" style={{ cursor: 'help' }}>+{taxIncome} gp/turn</span>
            </Tooltip>
          </div>
          <div className="sv-stat-row">
            <span>Building Upkeep</span>
            <span className="sv-stat-value" style={{ color: buildingUpkeep > 0 ? 'var(--accent-red)' : undefined }}>
              -{buildingUpkeep} gp/turn
            </span>
          </div>
          <div className="sv-stat-row">
            <span>Food Stored</span>
            <span className="sv-stat-value">{storage.food ?? 0}</span>
          </div>
          <div className="sv-stat-row">
            <span>Food Balance</span>
            <Tooltip content={
              <div style={{ fontSize: 11 }}>
                <div>Production: +{foodProduction}/turn</div>
                <div>Consumption: -{foodConsumption}/turn</div>
                {foodProduction - foodConsumption < 0 && (storage.food ?? 0) > 0 && (
                  <div style={{ marginTop: 4, color: 'var(--accent-gold)' }}>
                    ~{Math.ceil((storage.food ?? 0) / (foodConsumption - foodProduction))} turns until famine
                  </div>
                )}
              </div>
            }>
              <span className="sv-stat-value" style={{
                color: foodProduction - foodConsumption >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                cursor: 'help',
              }}>
                {foodProduction - foodConsumption >= 0 ? '+' : ''}{foodProduction - foodConsumption}/turn
              </span>
            </Tooltip>
          </div>
          <div className="sv-stat-row">
            <span>Storage</span>
            <span className="sv-stat-value">{storageUsed} / {tierDef?.storageCap ?? '?'}</span>
          </div>
        </div>

        {/* ── Buildings ── */}
        <div className="sv-section sv-full-width">
          <div className="sv-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Buildings</span>
            <span style={{ fontSize: 12, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              Slots: {usedSlots}{pendingSlotsUsed > 0 ? `+${pendingSlotsUsed}` : ''} / {tierDef?.buildingSlots ?? '?'}
            </span>
          </div>
          <div className="settlement-resources" style={{ marginBottom: constructing.length > 0 || pendingConstructions.length > 0 ? 8 : 0 }}>
            {completedBuildings.map((b: any, i: number) => {
              const bDef = BUILDINGS[b.type as BuildingType];
              const costInfo = bDef ? COST_TIERS[bDef.costTier as CostTier] : null;
              const rp = RESEARCH_POINTS[b.type as BuildingType];
              return (
                <Tooltip key={i} content={
                  bDef && costInfo ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{fmt(b.type)}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Maintenance</span><span>{costInfo.maintenance} gp/turn</span>
                        {rp && <><span style={{ color: 'var(--text-muted)' }}>Research</span><span>{rp}/turn</span></>}
                      </div>
                      {bDef.effect && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bDef.effect}</div>}
                    </div>
                  ) : <span>{fmt(b.type)}</span>
                }>
                  <span className="resource-tag" style={{ cursor: 'help' }}>
                    {fmt(b.type)}
                  </span>
                </Tooltip>
              );
            })}
            {completedBuildings.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No buildings yet</span>
            )}
          </div>
          {constructing.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Under Construction </span>
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {constructing.map((b: any, i: number) => {
                  const bDef = BUILDINGS[b.type as BuildingType];
                  const totalTime = bDef ? COST_TIERS[bDef.costTier as CostTier].buildTime : 1;
                  const progress = totalTime > 0 ? 1 - (b.turnsRemaining / totalTime) : 1;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--accent-gold)', minWidth: 80 }}>{fmt(b.type)}</span>
                      <div style={{ flex: 1, background: 'var(--bg-dark)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent-gold)', borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 24, textAlign: 'right' }}>{b.turnsRemaining}t</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {pendingConstructions.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Queued This Turn </span>
              <div className="settlement-resources" style={{ marginTop: 4 }}>
                {pendingConstructions.map((c: any, i: number) => {
                  const cDef = BUILDINGS[c.buildingType as BuildingType];
                  const buildTime = cDef ? COST_TIERS[cDef.costTier as CostTier].buildTime : 1;
                  return (
                    <span key={i} className="resource-tag" style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green)' }}>
                      {fmt(c.buildingType)} ({buildTime}t)
                      <button
                        onClick={() => {
                          const idx = pendingOrders.constructions.indexOf(c);
                          setPendingOrders({
                            constructions: pendingOrders.constructions.filter((_: any, j: number) => j !== idx),
                          });
                        }}
                        style={{
                          marginLeft: 4, background: 'none', border: 'none', color: 'var(--accent-red)',
                          cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 600,
                        }}
                      >
                        x
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <button
            className="btn btn-primary"
            style={{ padding: '4px 12px', fontSize: 12, marginTop: 4 }}
            onClick={() => setShowBuildModal(true)}
          >
            + Build
          </button>
        </div>

        {/* ── Manpower ── */}
        <div className="sv-section">
          <div className="sv-section-label">Manpower</div>
          <div className="sv-stat-row">
            <span>Population</span>
            <span className="sv-stat-value">{population.toLocaleString()}</span>
          </div>
          <div className="sv-stat-row">
            <span>Drafted Recruits</span>
            <span className="sv-stat-value">
              {draftedRecruits}
              {pendingDraft > 0 && <span style={{ color: 'var(--accent-green)', fontSize: 11, marginLeft: 4 }}>+{pendingDraft}</span>}
              {pendingDismiss > 0 && <span style={{ color: 'var(--accent-red)', fontSize: 11, marginLeft: 4 }}>-{pendingDismiss}</span>}
            </span>
          </div>
          <div className="sv-stat-row">
            <span>Max Draftable</span>
            <span className="sv-stat-value">{maxDraftable}</span>
          </div>
          <DraftRecruitsControls
            settlementId={settlement.id}
            maxDraftable={maxDraftable}
            currentDrafted={draftedRecruits}
            pendingDraft={pendingDraft}
            pendingDismiss={pendingDismiss}
            pendingOrders={pendingOrders}
            setPendingOrders={setPendingOrders}
          />
        </div>

        {/* ── Mounts ── */}
        <div className="sv-section">
          <div className="sv-section-label">Mounts</div>
          {mountsInStorage.horses === 0 && mountsInStorage.griffins === 0 && mountsInStorage.demigryphs === 0
            && draftedMounts.horses === 0 && draftedMounts.griffins === 0 && draftedMounts.demigryphs === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No mounts available</div>
          ) : (
            <>
              {(mountsInStorage.horses > 0 || draftedMounts.horses > 0) && (
                <MountRow
                  label="Horses"
                  mountType="horse"
                  storageKey="horses"
                  inStorage={mountsInStorage.horses}
                  drafted={draftedMounts.horses}
                  settlementId={settlement.id}
                  pendingOrders={pendingOrders}
                  setPendingOrders={setPendingOrders}
                />
              )}
              {(mountsInStorage.griffins > 0 || draftedMounts.griffins > 0) && (
                <MountRow
                  label="Gryphons"
                  mountType="gryphon"
                  storageKey="griffins"
                  inStorage={mountsInStorage.griffins}
                  drafted={draftedMounts.griffins}
                  settlementId={settlement.id}
                  pendingOrders={pendingOrders}
                  setPendingOrders={setPendingOrders}
                />
              )}
              {(mountsInStorage.demigryphs > 0 || draftedMounts.demigryphs > 0) && (
                <MountRow
                  label="Demigryphs"
                  mountType="demigryph"
                  storageKey="demigryphs"
                  inStorage={mountsInStorage.demigryphs}
                  drafted={draftedMounts.demigryphs}
                  settlementId={settlement.id}
                  pendingOrders={pendingOrders}
                  setPendingOrders={setPendingOrders}
                />
              )}
            </>
          )}
        </div>

        {/* ── Stockpile ── */}
        <div className="sv-section sv-full-width">
          <div className="sv-section-label">Stockpile</div>
          {weaponEntries.length === 0 && shieldEntries.length === 0 && armourEntries.length === 0 && materialEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Storage is empty</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weaponEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Weapons</div>
                  <div className="settlement-resources">
                    {weaponEntries.map(([k, v]) => (
                      <span key={k} className="resource-tag">{fmt(k)}: {v}</span>
                    ))}
                  </div>
                </div>
              )}
              {shieldEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Shields</div>
                  <div className="settlement-resources">
                    {shieldEntries.map(([k, v]) => (
                      <span key={k} className="resource-tag">{fmt(k)}: {v}</span>
                    ))}
                  </div>
                </div>
              )}
              {armourEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Armour</div>
                  <div className="settlement-resources">
                    {armourEntries.map(([k, v]) => (
                      <span key={k} className="resource-tag">{fmt(k)}: {v}</span>
                    ))}
                  </div>
                </div>
              )}
              {materialEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Materials</div>
                  <div className="settlement-resources">
                    {materialEntries.map(([k, v]) => (
                      <span key={k} className="resource-tag">{fmt(k)}: {v}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Construction Modal ── */}
      {showBuildModal && (
        <ConstructionModal
          settlement={settlement}
          buildings={buildings}
          storage={storage}
          usedSlots={usedSlots + pendingSlotsUsed}
          maxSlots={tierDef?.buildingSlots ?? 0}
          playerGold={(player.gold as number) ?? 0}
          researchedTechs={researchedTechs}
          hexTerrain={hexTerrain}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
          onClose={() => setShowBuildModal(false)}
        />
      )}
    </div>
  );
}

// ─── Enemy Settlement (minimal) ───────────────────────────────────────────

function EnemySettlementPanel({ settlement, onClose }: { settlement: any; onClose: () => void }) {
  return (
    <div className="side-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{settlement.name}</h3>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-box">
          <span className="stat-label">Tier</span>
          <span className="stat-detail" style={{ textTransform: 'capitalize' }}>{settlement.tier}</span>
        </div>
      </div>
      {settlement.isCapital && (
        <div style={{ marginTop: 8 }}>
          <span className="capital-badge">Capital</span>
        </div>
      )}
    </div>
  );
}

// ─── Settlement Name (inline rename) ──────────────────────────────────────

function SettlementName({
  slug, settlement, settlements, setGameState,
}: {
  slug: string;
  settlement: any;
  settlements: any[];
  setGameState: (s: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(settlement.name ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === settlement.name) {
      setEditing(false);
      setDraft(settlement.name);
      return;
    }
    setSaving(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/settlement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ settlementId: settlement.id, name: trimmed }),
      });
      setGameState({
        settlements: settlements.map((s: any) => s.id === settlement.id ? { ...s, name: trimmed } : s),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text" value={draft} maxLength={40} autoFocus
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setEditing(false); setDraft(settlement.name); }
          }}
          style={{ fontSize: 20, fontWeight: 600, padding: '2px 6px', minWidth: 200 }}
        />
        <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={save} disabled={saving}>
          {saving ? '...' : 'Save'}
        </button>
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setEditing(false); setDraft(settlement.name); }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <h2
      style={{ cursor: 'pointer' }}
      title="Click to rename"
      onClick={() => { setDraft(settlement.name); setEditing(true); }}
    >
      {settlement.name}
    </h2>
  );
}

// ─── Draft Recruits Controls ──────────────────────────────────────────────

function DraftRecruitsControls({ settlementId, maxDraftable, currentDrafted, pendingDraft, pendingDismiss, pendingOrders, setPendingOrders }: {
  settlementId: string;
  maxDraftable: number;
  currentDrafted: number;
  pendingDraft: number;
  pendingDismiss: number;
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
}) {
  const [draftAmount, setDraftAmount] = useState('');
  const [dismissAmount, setDismissAmount] = useState('');

  const availableToDraft = Math.max(0, maxDraftable - pendingDraft);
  const availableToDismiss = Math.max(0, currentDrafted - pendingDismiss);

  function handleDraft() {
    const amount = Math.min(parseInt(draftAmount) || 0, availableToDraft);
    if (amount <= 0) return;
    const existing = pendingOrders.draftRecruits.filter((d: any) => d.settlementId !== settlementId);
    const current = pendingOrders.draftRecruits.find((d: any) => d.settlementId === settlementId);
    const newAmount = (current?.amount ?? 0) + amount;
    setPendingOrders({ draftRecruits: [...existing, { settlementId, amount: newAmount }] });
    setDraftAmount('');
  }

  function handleDismiss() {
    const amount = Math.min(parseInt(dismissAmount) || 0, availableToDismiss);
    if (amount <= 0) return;
    const existing = pendingOrders.dismissRecruits.filter((d: any) => d.settlementId !== settlementId);
    const current = pendingOrders.dismissRecruits.find((d: any) => d.settlementId === settlementId);
    const newAmount = (current?.amount ?? 0) + amount;
    setPendingOrders({ dismissRecruits: [...existing, { settlementId, amount: newAmount }] });
    setDismissAmount('');
  }

  return (
    <div style={{ marginTop: 8 }}>
      {availableToDraft > 0 && (
        <div className="draft-controls">
          <input
            type="number" min={0} max={availableToDraft}
            placeholder={`max ${availableToDraft}`}
            value={draftAmount}
            onChange={e => setDraftAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleDraft(); }}
          />
          <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleDraft}>
            Draft
          </button>
        </div>
      )}
      {availableToDismiss > 0 && (
        <div className="draft-controls">
          <input
            type="number" min={0} max={availableToDismiss}
            placeholder={`max ${availableToDismiss}`}
            value={dismissAmount}
            onChange={e => setDismissAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleDismiss(); }}
          />
          <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mount Row ────────────────────────────────────────────────────────────

function MountRow({ label, mountType, storageKey, inStorage, drafted, settlementId, pendingOrders, setPendingOrders }: {
  label: string;
  mountType: 'horse' | 'gryphon' | 'demigryph';
  storageKey: string;
  inStorage: number;
  drafted: number;
  settlementId: string;
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
}) {
  const [draftAmt, setDraftAmt] = useState('');
  const [dismissAmt, setDismissAmt] = useState('');

  const pendingDraftMounts = pendingOrders.draftMounts
    .filter((d: any) => d.settlementId === settlementId && d.mountType === mountType)
    .reduce((s: number, d: any) => s + d.amount, 0);
  const pendingDismissMounts = pendingOrders.dismissMounts
    .filter((d: any) => d.settlementId === settlementId && d.mountType === mountType)
    .reduce((s: number, d: any) => s + d.amount, 0);

  function handleDraft() {
    const amount = Math.min(parseInt(draftAmt) || 0, inStorage - pendingDraftMounts);
    if (amount <= 0) return;
    setPendingOrders({
      draftMounts: [...pendingOrders.draftMounts, { settlementId, mountType, amount }],
    });
    setDraftAmt('');
  }

  function handleDismiss() {
    const amount = Math.min(parseInt(dismissAmt) || 0, drafted - pendingDismissMounts);
    if (amount <= 0) return;
    setPendingOrders({
      dismissMounts: [...pendingOrders.dismissMounts, { settlementId, mountType, amount }],
    });
    setDismissAmt('');
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="sv-stat-row">
        <span>{label} in Storage</span>
        <span className="sv-stat-value">
          {inStorage}
          {pendingDraftMounts > 0 && <span style={{ color: 'var(--accent-green)', fontSize: 11, marginLeft: 4 }}>-{pendingDraftMounts}</span>}
        </span>
      </div>
      <div className="sv-stat-row">
        <span>{label} Drafted</span>
        <span className="sv-stat-value">
          {drafted}
          {pendingDraftMounts > 0 && <span style={{ color: 'var(--accent-green)', fontSize: 11, marginLeft: 4 }}>+{pendingDraftMounts}</span>}
          {pendingDismissMounts > 0 && <span style={{ color: 'var(--accent-red)', fontSize: 11, marginLeft: 4 }}>-{pendingDismissMounts}</span>}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {inStorage - pendingDraftMounts > 0 && (
          <div className="draft-controls" style={{ marginTop: 4 }}>
            <input type="number" min={0} max={inStorage - pendingDraftMounts}
              placeholder={`max ${inStorage - pendingDraftMounts}`}
              value={draftAmt} onChange={e => setDraftAmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDraft(); }}
            />
            <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleDraft}>Draft</button>
          </div>
        )}
        {drafted - pendingDismissMounts > 0 && (
          <div className="draft-controls" style={{ marginTop: 4 }}>
            <input type="number" min={0} max={drafted - pendingDismissMounts}
              placeholder={`max ${drafted - pendingDismissMounts}`}
              value={dismissAmt} onChange={e => setDismissAmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleDismiss(); }}
            />
            <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleDismiss}>Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Construction Modal ───────────────────────────────────────────────────

const BUILD_CATEGORIES: BuildingCategory[] = ['extraction', 'processing', 'civic', 'military', 'fortification'];

function ConstructionModal({ settlement, buildings, storage, usedSlots, maxSlots, playerGold, researchedTechs, hexTerrain, pendingOrders, setPendingOrders, onClose }: {
  settlement: any;
  buildings: any[];
  storage: Record<string, number>;
  usedSlots: number;
  maxSlots: number;
  playerGold: number;
  researchedTechs: Set<string>;
  hexTerrain: string | undefined;
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
  onClose: () => void;
}) {
  const [searchFilter, setSearchFilter] = useState('');
  const builtTypes = new Set(buildings.map((b: any) => b.type));

  function queueBuild(buildingType: string) {
    setPendingOrders({
      constructions: [...pendingOrders.constructions, { settlementId: settlement.id, buildingType }],
    });
  }

  function cancelBuild(buildingType: string) {
    const idx = pendingOrders.constructions.findIndex(
      (c: any) => c.settlementId === settlement.id && c.buildingType === buildingType,
    );
    if (idx >= 0) {
      setPendingOrders({
        constructions: pendingOrders.constructions.filter((_: any, i: number) => i !== idx),
      });
    }
  }

  const filterLower = searchFilter.toLowerCase();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-dark)',
        borderRadius: 8, padding: 24, width: 560, maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Build at {settlement.name}</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Slots: {usedSlots}/{maxSlots}
          </span>
        </div>

        <input
          type="text"
          className="hex-name-input"
          placeholder="Search buildings..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          style={{ marginBottom: 12, width: '100%' }}
        />

        {BUILD_CATEGORIES.map(cat => {
          const categoryBuildings = (Object.entries(BUILDINGS) as [string, any][])
            .filter(([type, def]) => def.category === cat && (!filterLower || fmt(type).toLowerCase().includes(filterLower)));
          if (categoryBuildings.length === 0) return null;

          return (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px',
                color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-heading)',
              }}>
                {fmt(cat)}
              </div>
              {categoryBuildings.map(([type, def]) => {
                const cost = COST_TIERS[def.costTier as CostTier];
                const isBuilt = builtTypes.has(type);
                const isPending = pendingOrders.constructions.some(
                  (c: any) => c.settlementId === settlement.id && c.buildingType === type,
                );
                const tierOk = meetsTierRequirement(settlement.tier as SettlementTier, def.minSettlement);
                const techOk = !def.techRequired || researchedTechs.has(def.techRequired);
                const slotsOk = def.usesSlot === false || usedSlots < maxSlots;
                const goldOk = playerGold >= cost.goldCost;
                const materialsOk = def.materials.every((m: string) => (storage[m] ?? 0) >= 1);
                const terrainOk = !def.terrain || (hexTerrain && def.terrain.includes(hexTerrain));
                const canBuild = !isBuilt && !isPending && tierOk && techOk && slotsOk && goldOk && materialsOk && terrainOk;

                // Categorized reason
                let reason = '';
                let reasonType: 'locked' | 'unavailable' | 'unaffordable' | '' = '';
                if (isBuilt) { reason = 'Already built'; reasonType = 'unavailable'; }
                else if (!techOk) { reason = `Requires ${fmt(def.techRequired)}`; reasonType = 'locked'; }
                else if (!tierOk) { reason = `Requires ${fmt(def.minSettlement)}`; reasonType = 'unavailable'; }
                else if (!slotsOk) { reason = 'No building slots'; reasonType = 'unavailable'; }
                else if (!terrainOk) { reason = `Requires ${def.terrain!.map((t: string) => fmt(t)).join(' or ')}`; reasonType = 'unavailable'; }
                else if (!goldOk) { reason = `Need ${cost.goldCost}g (have ${playerGold})`; reasonType = 'unaffordable'; }
                else if (!materialsOk) {
                  const missing = def.materials.filter((m: string) => (storage[m] ?? 0) < 1);
                  reason = `Missing: ${missing.map((m: string) => fmt(m)).join(', ')}`;
                  reasonType = 'unaffordable';
                }

                const disabled = !canBuild && !isPending;
                const reasonColor = reasonType === 'locked' ? 'var(--text-muted)' : reasonType === 'unavailable' ? 'var(--text-muted)' : 'var(--accent-red)';
                const rp = RESEARCH_POINTS[type as BuildingType];

                // Build output info
                const outputEntries = def.output ? Object.entries(def.output) : [];

                return (
                  <div
                    key={type}
                    className={`building-row ${disabled ? 'building-disabled' : ''} ${isPending ? 'building-pending' : ''}`}
                    onClick={() => {
                      if (canBuild) queueBuild(type);
                    }}
                  >
                    <div className="building-row-info">
                      <div className="building-row-name">
                        {fmt(type)}
                        {reasonType === 'locked' && !isBuilt && (
                          <Tooltip content={<span>Requires: {fmt(def.techRequired)}</span>}>
                            <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--text-muted)', cursor: 'help', textTransform: 'uppercase', letterSpacing: '0.5px' }}>locked</span>
                          </Tooltip>
                        )}
                      </div>
                      {def.effect && <div className="building-row-effect">{def.effect}</div>}
                      {/* Output / wealth / research */}
                      {(outputEntries.length > 0 || def.taxWealth || rp) && (
                        <div style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 1 }}>
                          {outputEntries.map(([r, n]) => <span key={r} style={{ marginRight: 8 }}>+{n as number} {fmt(r)}/turn</span>)}
                          {def.taxWealth && <span style={{ marginRight: 8 }}>+{def.taxWealth} wealth/turn</span>}
                          {rp && <span>+{rp} research/turn</span>}
                        </div>
                      )}
                      <div className="building-row-meta">
                        {def.materials.map((m: string) => (
                          <span key={m} style={{ color: (storage[m] ?? 0) >= 1 ? 'var(--text-muted)' : 'var(--accent-red)' }}>
                            {fmt(m)}
                          </span>
                        ))}
                        {def.terrain && def.terrain.map((t: string) => (
                          <span key={t} style={{ color: hexTerrain === t ? 'var(--text-muted)' : 'var(--accent-red)' }}>
                            {fmt(t)}
                          </span>
                        ))}
                        <span>{cost.buildTime} {cost.buildTime === 1 ? 'turn' : 'turns'}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{cost.maintenance} gp/turn</span>
                        {reason && <span style={{ color: reasonColor, fontStyle: 'italic' }}>{reason}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className="building-row-cost">{cost.goldCost} gp</span>
                      {isPending && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 6px', fontSize: 11 }}
                          onClick={e => { e.stopPropagation(); cancelBuild(type); }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
