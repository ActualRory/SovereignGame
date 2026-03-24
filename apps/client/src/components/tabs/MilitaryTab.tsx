import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  STATE_DICE_MULTIPLIER, SHIPS, BUILDINGS,
  WEAPONS, SHIELDS, ARMOUR_TYPES, MOUNT_TYPES,
  HORSE_BREEDS, GRYPHON_BREEDS, RANGED_WEAPONS,
  computeUnitStats, MEN_PER_COMPANY, MEN_PER_SQUADRON,
  canGoInSecondary, canGoInSidearm, secondarySlotAllowed,
  calculateFoodConsumption,
  type ShipType, type UnitTemplate, type WeaponDesign, type TroopCounts,
  type WeaponType, type ShieldType, type ArmourType, type MountType, type MountBreed,
  type WeaponDef, type ShieldDef,
  type BuildingType,
} from '@kingdoms/shared';
import { Tooltip } from '../shared/Tooltip.js';
import type { RecruitFromTemplateOrder, CreateTemplateOrder, UpdateTemplateOrder } from '../../store/slices/orders.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function totalTroops(t: TroopCounts): number {
  return t.rookie + t.capable + t.veteran;
}

function troopStrengthPct(t: TroopCounts, maxTroops: number): number {
  return maxTroops > 0 ? Math.round((totalTroops(t) / maxTroops) * 100) : 0;
}

// ─── State labels ──────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  full: { label: 'Full Strength', color: 'var(--accent-green)' },
  depleted: { label: 'Depleted', color: 'var(--accent-gold)' },
  broken: { label: 'Broken', color: 'var(--accent-red)' },
  destroyed: { label: 'Destroyed', color: 'var(--text-muted)' },
};

// ─── MilitaryTab ───────────────────────────────────────────────────────────

export function MilitaryTab() {
  const { slug } = useParams<{ slug: string }>();
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const armies = useStore(s => s.armies);
  const settlements = useStore(s => s.settlements);
  const unitTemplates = useStore(s => s.unitTemplates) as UnitTemplate[];
  const weaponDesigns = useStore(s => s.weaponDesigns) as WeaponDesign[];
  const equipmentOrders = useStore(s => s.equipmentOrders) as any[];
  const pendingOrders = useStore(s => s.pendingOrders);
  const addRecruitment = useStore(s => s.addRecruitment);
  const removeRecruitment = useStore(s => s.removeRecruitment);
  const removeMovement = useStore(s => s.removeMovement);
  const setPendingOrders = useStore(s => s.setPendingOrders);

  const techProgress = useStore(s => s.techProgress) as Array<{ tech: string; isResearched: boolean }>;
  const researchedTechs = new Set(techProgress.filter(t => t.isResearched).map(t => t.tech));

  const setSelectedSettlementId = useStore(s => s.setSelectedSettlementId);

  const [activeTab, setActiveTab] = useState<'armies' | 'stockpile' | 'orbat' | 'designer' | 'weapons' | 'production'>('armies');

  if (!player) return <div><h2>Military</h2><p>Loading...</p></div>;

  const myArmies = armies.filter((a: any) => a.ownerId === player.id);
  const mySettlements = settlements.filter((s: any) => s.ownerId === player.id);
  const myTemplates = unitTemplates.filter(t => t.playerId === player.id);
  const myDesigns = weaponDesigns.filter((d: any) => d.playerId === player.id);
  const myOrders = equipmentOrders.filter((o: any) => o.playerId === player.id);

  const totalUnits = myArmies.reduce((sum: number, a: any) =>
    sum + (a.units?.filter((u: any) => u.state !== 'destroyed').length ?? a.unitCount ?? 0), 0
  );

  return (
    <div className="military-tab">
      <h2>Military</h2>

      <div className="stat-grid">
        <div className="stat-box">
          <span className="stat-label">Armies</span>
          <span className="stat-detail">{myArmies.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Units</span>
          <span className="stat-detail">{totalUnits}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Templates</span>
          <span className="stat-detail">{myTemplates.length}</span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginTop: 16, marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 4 }}>
        {(['armies', 'stockpile', 'orbat', 'designer', 'weapons', 'production'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? 'var(--bg-surface-hover)' : 'transparent',
              border: activeTab === tab ? '1px solid var(--border-dark)' : '1px solid transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {{ armies: 'Armies', stockpile: 'Stockpile', orbat: 'ORBAT', designer: 'Unit Designer', weapons: 'Weapon Designer', production: 'Production' }[tab]}
          </button>
        ))}
      </div>

      {/* Armies Tab */}
      {activeTab === 'armies' && (
        <>
          {myArmies.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No armies raised. Your realm stands undefended.</p>
          )}
          {myArmies.map((a: any) => (
            <ArmyCard
              key={a.id}
              slug={slug!}
              army={a}
              templates={myTemplates}
              weaponDesigns={myDesigns}
              pendingOrders={pendingOrders}
              onCancelMovement={removeMovement}
            />
          ))}

          {pendingOrders.recruitments.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Queued Recruitments</h3>
              {pendingOrders.recruitments.map((r, i) => {
                const settlement = mySettlements.find((s: any) => s.id === r.settlementId);
                const tmpl = myTemplates.find(t => t.id === r.templateId);
                return (
                  <div key={i} className="settlement-card" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{tmpl?.name ?? '?'} at {(settlement as any)?.name ?? '?'}</span>
                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => removeRecruitment(i)}>Cancel</button>
                  </div>
                );
              })}
            </>
          )}

          <h3 style={{ marginTop: 20 }}>Recruit</h3>
          {mySettlements.map((s: any) => {
            const armiesHere = myArmies.filter((a: any) => a.hexQ === s.hexQ && a.hexR === s.hexR);
            if (armiesHere.length === 0) return null;
            const hasBarracks = s.buildings?.some((b: any) => b.type === 'barracks' && !b.isConstructing);
            if (!hasBarracks) {
              return (
                <div key={s.id} className="settlement-card" style={{ marginTop: 8 }}>
                  <strong>{s.name}</strong>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                    Requires a completed Barracks to recruit here.
                  </p>
                </div>
              );
            }
            return (
              <RecruitPanel
                key={s.id}
                settlement={s}
                armies={armiesHere}
                templates={myTemplates}
                weaponDesigns={myDesigns}
                pendingOrders={pendingOrders}
                playerGold={(player?.gold as number) ?? 0}
                onRecruit={addRecruitment}
              />
            );
          })}

          {pendingOrders.movements.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Queued Movements</h3>
              {pendingOrders.movements.map((m) => {
                const army = myArmies.find((a: any) => a.id === m.armyId);
                const dest = m.path[m.path.length - 1];
                return (
                  <div key={m.armyId} className="settlement-card" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{(army as any)?.name ?? '?'} → ({dest?.q}, {dest?.r})</span>
                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => removeMovement(m.armyId)}>Cancel</button>
                  </div>
                );
              })}
            </>
          )}

          <NavalCodex />
        </>
      )}

      {/* ORBAT Tab */}
      {activeTab === 'orbat' && (
        <OrbatTab
          armies={myArmies}
          templates={myTemplates}
          weaponDesigns={myDesigns}
        />
      )}

      {/* Unit Designer Tab */}
      {activeTab === 'designer' && (
        <UnitDesignerTab
          templates={myTemplates}
          weaponDesigns={myDesigns}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
          playerId={player.id as string}
          researchedTechs={researchedTechs}
        />
      )}

      {/* Weapon Designer Tab */}
      {activeTab === 'weapons' && (
        <WeaponDesignerTab
          designs={myDesigns}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
          player={player}
          researchedTechs={researchedTechs}
        />
      )}

      {/* Production Tab */}
      {activeTab === 'production' && (
        <ProductionTab
          settlements={mySettlements}
          equipmentOrders={myOrders}
          weaponDesigns={myDesigns}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
        />
      )}

      {/* Stockpile Tab */}
      {activeTab === 'stockpile' && (
        <StockpileTab
          settlements={mySettlements}
          pendingOrders={pendingOrders}
          onSettlementClick={(id: string) => setSelectedSettlementId(id)}
        />
      )}
    </div>
  );
}

// ─── Unit Designer Tab ─────────────────────────────────────────────────────

const ALL_WEAPON_OPTS = ['', ...Object.keys(WEAPONS)] as Array<WeaponType | ''>;
const ALL_SHIELD_OPTS = Object.keys(SHIELDS) as ShieldType[];
const ARMOUR_OPTS: Array<ArmourType | ''> = ['', 'gambeson', 'mail', 'plate', 'breastplate'];
const MOUNT_OPTS: Array<MountType | ''> = ['', 'horse', 'gryphon', 'demigryph'];

const BLANK_TEMPLATE: CreateTemplateOrder = {
  name: '',
  isIrregular: false,
  isMounted: false,
  companiesOrSquadrons: 3,
  primary: null,
  secondary: null,
  sidearm: null,
  armour: null,
  mount: null,
  primaryDesignId: null,
  secondaryDesignId: null,
  sidearmDesignId: null,
};

function UnitDesignerTab({ templates, weaponDesigns, pendingOrders, setPendingOrders, playerId, researchedTechs }: {
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
  playerId: string;
  researchedTechs: Set<string>;
}) {
  const [editing, setEditing] = useState<CreateTemplateOrder | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Pending creates/updates/deletes
  const pendingCreate: CreateTemplateOrder[] = pendingOrders.createTemplates ?? [];
  const pendingUpdate: UpdateTemplateOrder[] = pendingOrders.updateTemplates ?? [];
  const pendingDelete: string[] = pendingOrders.deleteTemplates ?? [];

  function openCreate() {
    setEditing({ ...BLANK_TEMPLATE });
    setEditingId(null);
    setShowCreate(true);
  }

  function openEdit(tmpl: UnitTemplate) {
    const pending = pendingUpdate.find(u => u.templateId === tmpl.id);
    setEditing({
      name: pending?.changes.name ?? tmpl.name,
      isIrregular: pending?.changes.isIrregular ?? tmpl.isIrregular,
      isMounted: pending?.changes.isMounted ?? tmpl.isMounted,
      companiesOrSquadrons: pending?.changes.companiesOrSquadrons ?? tmpl.companiesOrSquadrons,
      primary: pending?.changes.primary ?? tmpl.primary,
      secondary: pending?.changes.secondary ?? (tmpl as any).secondary ?? null,
      sidearm: pending?.changes.sidearm ?? tmpl.sidearm,
      armour: pending?.changes.armour ?? tmpl.armour,
      mount: pending?.changes.mount ?? tmpl.mount,
      primaryDesignId: pending?.changes.primaryDesignId ?? (tmpl as any).primaryDesignId ?? null,
      secondaryDesignId: pending?.changes.secondaryDesignId ?? (tmpl as any).secondaryDesignId ?? null,
      sidearmDesignId: pending?.changes.sidearmDesignId ?? (tmpl as any).sidearmDesignId ?? null,
    });
    setEditingId(tmpl.id);
    setShowCreate(true);
  }

  function saveTemplate() {
    if (!editing || !editing.name.trim()) return;
    if (editingId) {
      const existing = pendingUpdate.filter(u => u.templateId !== editingId);
      setPendingOrders({ updateTemplates: [...existing, { templateId: editingId, changes: editing }] });
    } else {
      setPendingOrders({ createTemplates: [...pendingCreate, editing] });
    }
    setShowCreate(false);
  }

  function deleteTemplate(id: string) {
    setPendingOrders({ deleteTemplates: [...pendingDelete, id] });
  }

  function undoDelete(id: string) {
    setPendingOrders({ deleteTemplates: pendingDelete.filter(d => d !== id) });
  }

  const previewStats = editing
    ? computeUnitStats(
        { ...editing, id: '__preview', gameId: '', playerId, createdAt: '', updatedAt: '' } as unknown as UnitTemplate,
        weaponDesigns
      )
    : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Unit Templates</h3>
        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={openCreate}>
          + New Template
        </button>
      </div>

      {templates.length === 0 && pendingCreate.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No templates. Create one to start recruiting units.</p>
      )}

      {/* Committed templates */}
      {templates.map(tmpl => {
        const isDeleted = pendingDelete.includes(tmpl.id);
        const hasUpdate = pendingUpdate.some(u => u.templateId === tmpl.id);
        const stats = computeUnitStats(tmpl, weaponDesigns);
        const maxTroops = tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;

        return (
          <div key={tmpl.id} className="settlement-card" style={{
            marginTop: 8, opacity: isDeleted ? 0.5 : 1,
            borderColor: hasUpdate ? 'var(--accent-gold)' : undefined,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{tmpl.name}</strong>
                {hasUpdate && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', borderRadius: 3, padding: '1px 4px' }}>PENDING UPDATE</span>}
                {isDeleted && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderRadius: 3, padding: '1px 4px' }}>QUEUED FOR DELETION</span>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tmpl.isIrregular ? 'Irregular' : tmpl.isMounted ? 'Mounted' : 'Infantry'}
                  {' · '}{tmpl.companiesOrSquadrons} {tmpl.isMounted ? 'squadrons' : 'companies'}
                  {' · '}{maxTroops} max troops
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {[tmpl.primary, (tmpl as any).secondary, tmpl.sidearm, tmpl.armour, tmpl.mount].filter(Boolean).map(e => fmt(e!)).join(', ') || 'No equipment'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!isDeleted && (
                  <>
                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => openEdit(tmpl)}>Edit</button>
                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--accent-red)' }} onClick={() => deleteTemplate(tmpl.id)}>Delete</button>
                  </>
                )}
                {isDeleted && (
                  <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => undoDelete(tmpl.id)}>Undo</button>
                )}
              </div>
            </div>
            <StatsPreview stats={stats} />
          </div>
        );
      })}

      {/* Pending new templates (not yet committed) */}
      {pendingCreate.map((tmpl, i) => {
        const stats = computeUnitStats(
          { ...tmpl, id: `__new_${i}`, gameId: '', playerId, createdAt: '', updatedAt: '' } as unknown as UnitTemplate,
          weaponDesigns
        );
        const maxTroops = tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
        return (
          <div key={`new-${i}`} className="settlement-card" style={{ marginTop: 8, borderColor: 'var(--accent-green)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{tmpl.name}</strong>
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-green)', border: '1px solid var(--accent-green)', borderRadius: 3, padding: '1px 4px' }}>NEW</span>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tmpl.isIrregular ? 'Irregular' : tmpl.isMounted ? 'Mounted' : 'Infantry'}
                  {' · '}{tmpl.companiesOrSquadrons} {tmpl.isMounted ? 'squadrons' : 'companies'}
                  {' · '}{maxTroops} max troops
                </div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => {
                setPendingOrders({ createTemplates: pendingCreate.filter((_, j) => j !== i) });
              }}>Remove</button>
            </div>
            <StatsPreview stats={stats} />
          </div>
        );
      })}

      {/* Create / Edit modal */}
      {showCreate && editing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-dark)',
            borderRadius: 8, padding: 24, width: 480, maxHeight: '85vh', overflowY: 'auto',
          }}>
            <h3 style={{ marginBottom: 16 }}>{editingId ? 'Edit Template' : 'New Template'}</h3>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Name</div>
              <input
                className="input"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Heavy Infantry"
                style={{ width: '100%', padding: '6px 8px' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.isIrregular} onChange={e => setEditing({ ...editing, isIrregular: e.target.checked, primary: null, sidearm: null, armour: null, mount: null })} />
                Irregular (no equipment)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.isMounted} onChange={e => setEditing({ ...editing, isMounted: e.target.checked })} disabled={editing.isIrregular} />
                Mounted
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {editing.isMounted ? 'Squadrons' : 'Companies'} (× {editing.isMounted ? MEN_PER_SQUADRON : MEN_PER_COMPANY} troops)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([1, 2, 3, 4, 5] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setEditing({ ...editing, companiesOrSquadrons: n })}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 14, fontWeight: 600,
                      background: editing.companiesOrSquadrons === n ? 'var(--accent-gold)' : 'var(--bg-inset)',
                      color: editing.companiesOrSquadrons === n ? 'var(--bg-parchment-dark)' : 'var(--text-primary)',
                      border: '1px solid var(--border-dark)', borderRadius: 4, cursor: 'pointer',
                    }}
                  >{n}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Max troops: {editing.companiesOrSquadrons * (editing.isMounted ? MEN_PER_SQUADRON : MEN_PER_COMPANY)}
              </div>
            </label>

            {!editing.isIrregular && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                <EquipmentPicker
                  label="Primary (100%)"
                  options={ALL_WEAPON_OPTS}
                  getDef={(o) => o ? WEAPONS[o as WeaponType] : null}
                  value={editing.primary ?? ''}
                  researchedTechs={researchedTechs}
                  onChange={v => {
                    const newPrimary = (v as WeaponType) || null;
                    // If new primary is 2H, clear secondary
                    const clearSecondary = newPrimary && !secondarySlotAllowed(newPrimary);
                    setEditing({
                      ...editing,
                      primary: newPrimary,
                      secondary: clearSecondary ? null : editing.secondary,
                      secondaryDesignId: clearSecondary ? null : (editing as any).secondaryDesignId,
                    });
                  }}
                />
                {secondarySlotAllowed(editing.primary) && (
                  <EquipmentPicker
                    label="Secondary (50%) — 1H/versatile weapon or shield"
                    options={[
                      '',
                      ...Object.keys(WEAPONS).filter(w => canGoInSecondary(w as WeaponType)),
                      ...ALL_SHIELD_OPTS,
                    ]}
                    getDef={(o) => {
                      if (!o) return null;
                      return (WEAPONS[o as WeaponType] as WeaponDef | undefined) ?? (SHIELDS[o as ShieldType] as ShieldDef | undefined) ?? null;
                    }}
                    value={(editing as any).secondary ?? ''}
                    researchedTechs={researchedTechs}
                    onChange={v => setEditing({ ...editing, secondary: (v as WeaponType | ShieldType) || null } as any)}
                  />
                )}
                <EquipmentPicker
                  label="Sidearm (25%) — 1H weapon"
                  options={['', ...Object.keys(WEAPONS).filter(w => canGoInSidearm(w as WeaponType))]}
                  getDef={(o) => o ? WEAPONS[o as WeaponType] : null}
                  value={editing.sidearm ?? ''}
                  researchedTechs={researchedTechs}
                  onChange={v => setEditing({ ...editing, sidearm: (v as WeaponType) || null })}
                />
                <EquipmentPicker
                  label="Armour"
                  options={ARMOUR_OPTS}
                  getDef={(o) => o ? ARMOUR_TYPES[o as ArmourType] : null}
                  value={editing.armour ?? ''}
                  researchedTechs={researchedTechs}
                  onChange={v => setEditing({ ...editing, armour: (v as ArmourType) || null })}
                />
                {editing.isMounted && (
                  <EquipmentPicker
                    label="Mount"
                    options={MOUNT_OPTS}
                    getDef={() => null}
                    value={editing.mount ?? ''}
                    researchedTechs={researchedTechs}
                    onChange={v => setEditing({ ...editing, mount: (v as MountType) || null })}
                  />
                )}
              </div>
            )}

            {/* Stat preview */}
            {previewStats && (
              <div style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '10px 12px', marginBottom: 16, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Derived Stats</div>
                <StatsPreview stats={previewStats} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTemplate} disabled={!editing.name.trim()}>
                {editingId ? 'Queue Update' : 'Queue Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Equipment Picker ──────────────────────────────────────────────────────

function EquipmentPicker({ label, options, getDef, value, onChange, researchedTechs }: {
  label: string;
  options: string[];
  getDef: (o: string) => { techRequired?: string | null; name: string } | null;
  value: string;
  onChange: (v: string) => void;
  researchedTechs: Set<string>;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const def = getDef(o);
          const techReq = def?.techRequired ?? null;
          const locked = !!techReq && !researchedTechs.has(techReq);
          const selected = value === o;
          return (
            <button
              key={o}
              disabled={locked}
              onClick={() => onChange(locked ? value : o)}
              title={locked ? `Requires: ${fmt(techReq!)}` : undefined}
              style={{
                padding: '5px 10px', fontSize: 12, borderRadius: 4, cursor: locked ? 'not-allowed' : 'pointer',
                border: selected ? '1px solid var(--accent-gold)' : '1px solid var(--border-dark)',
                background: selected ? 'var(--accent-gold)' : 'var(--bg-inset)',
                color: selected ? 'var(--bg-parchment-dark)' : locked ? 'var(--text-muted)' : 'var(--text-primary)',
                opacity: locked ? 0.45 : 1,
                fontFamily: 'var(--font-body)',
              }}
            >
              {o ? fmt(o) : '— None —'}
              {locked && ' 🔒'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stat preview bar ──────────────────────────────────────────────────────

function fmtStat(v: number | string): string {
  if (typeof v === 'string') return v;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

/** Stat key, display label, tooltip description. */
const STAT_DISPLAY: Array<[string, string, string]> = [
  ['fire', 'Fire', 'Ranged attack power. More dice in the fire phase.'],
  ['shock', 'Shock', 'Melee attack power. More dice in the shock phase.'],
  ['defence', 'Def', 'Reduces incoming damage and improves survivability.'],
  ['morale', 'Morale', 'Morale threshold (d20). Units that fail break and rout.'],
  ['armour', 'Armour', 'Raises the to-hit threshold enemies need to wound this unit.'],
  ['ap', 'AP', 'Armour Piercing. Lowers the target\u2019s effective armour.'],
  ['hitsOn', 'THAC0', 'To Hit Armour Class 0. Base d20 threshold to land a hit \u2014 lower is better. Modified by armour and AP.'],
];

function StatsPreview({ stats }: { stats: { fire: number; shock: number; defence: number; morale: number; armour: number; ap: number; hitsOn: number } }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
      {STAT_DISPLAY.map(([key, label, tip]) => (
        <Tooltip key={key} content={<span style={{ fontSize: 11 }}>{tip}</span>}>
          <div style={{ textAlign: 'center', minWidth: 36, cursor: 'help' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 2, borderBottom: '1px dotted var(--text-muted)' }}>{label}</div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{key === 'hitsOn' ? `${(stats as any)[key]}+` : fmtStat((stats as any)[key])}</div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

// ─── Weapon Designer Tab ───────────────────────────────────────────────────

const STAT_KEYS = ['fire', 'shock', 'defence', 'morale', 'ap'] as const;
type StatKey = typeof STAT_KEYS[number];

const ALL_DESIGNABLE: Array<{ key: WeaponType | ShieldType; group: string }> = [
  ...(Object.keys(WEAPONS) as WeaponType[]).map(k => ({ key: k, group: 'Weapon' })),
  ...(Object.keys(SHIELDS) as ShieldType[]).map(k => ({ key: k, group: 'Shield' })),
];

function WeaponDesignerTab({ designs, pendingOrders, setPendingOrders, player, researchedTechs }: {
  designs: WeaponDesign[];
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
  player: Record<string, unknown>;
  researchedTechs: Set<string>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newDesign, setNewDesign] = useState({
    baseWeapon: 'polearm' as WeaponType | ShieldType,
    name: '',
    statModifiers: {} as Partial<Record<StatKey, number>>,
  });
  const pending = pendingOrders.createWeaponDesigns ?? [];
  const pendingRetire = pendingOrders.retireWeaponDesigns ?? [];

  const gold = (player.gold as number) ?? 0;

  const baseDef: WeaponDef | ShieldDef | undefined =
    WEAPONS[newDesign.baseWeapon as WeaponType] ?? SHIELDS[newDesign.baseWeapon as ShieldType];
  const budget = baseDef?.designBudget ?? 3;
  // Only allow editing stats the weapon/shield actually uses
  const activeStatKeys = STAT_KEYS.filter(k => ((baseDef?.statBonus as any)?.[k] ?? 0) !== 0);
  const budgetUsed = activeStatKeys.reduce((sum, k) => sum + Math.max(0, newDesign.statModifiers[k] ?? 0), 0);
  const balance = activeStatKeys.reduce((sum, k) => sum + (newDesign.statModifiers[k] ?? 0), 0);
  // Cost scales with weapon production cost + points spent
  const designCost = Math.round((baseDef?.productionCost ?? 2) * 50 + budgetUsed * 75);
  const canSubmit = newDesign.name.trim().length > 0 && balance === 0 && budgetUsed <= budget && gold >= designCost;

  function setMod(k: StatKey, delta: number) {
    const cur = newDesign.statModifiers[k] ?? 0;
    const next = cur + delta;
    // Don't allow going beyond budget on positive side
    if (delta > 0 && budgetUsed >= budget) return;
    setNewDesign({ ...newDesign, statModifiers: { ...newDesign.statModifiers, [k]: next } });
  }

  function openCreate() {
    setNewDesign({ baseWeapon: 'polearm', name: '', statModifiers: {} });
    setShowCreate(true);
  }

  function addDesign() {
    if (!canSubmit) return;
    const mods: Partial<Record<StatKey, number>> = {};
    for (const k of activeStatKeys) {
      const v = newDesign.statModifiers[k] ?? 0;
      if (v !== 0) mods[k] = v;
    }
    setPendingOrders({ createWeaponDesigns: [...pending, { ...newDesign, statModifiers: mods, goldCost: designCost }] });
    setShowCreate(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Weapon Designs</h3>
        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={openCreate}>
          + New Design
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Designs take 2 turns to develop. Cost scales with the weapon's production cost and the number of stat points shifted.
      </p>

      {designs.length === 0 && pending.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No weapon designs yet.</p>
      )}

      {designs.map((d: any) => {
        const isRetiring = pendingRetire.includes(d.id);
        const statusColor = d.status === 'ready' ? 'var(--accent-green)' : d.status === 'developing' ? 'var(--accent-gold)' : 'var(--text-muted)';
        const mods = d.statModifiers as Record<string, number> | undefined;
        const modStr = mods && Object.keys(mods).length > 0
          ? Object.entries(mods).map(([k, v]) => `${fmt(k)} ${v > 0 ? '+' : ''}${v}`).join(', ')
          : 'No stat changes';
        return (
          <div key={d.id} className="settlement-card" style={{ marginTop: 8, opacity: isRetiring ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{d.name}</strong>
                <span style={{ marginLeft: 6, fontSize: 11, color: statusColor }}>
                  {d.status === 'developing' ? `Developing (${d.turnsRemaining} turns)` : fmt(d.status)}
                </span>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {fmt(d.baseWeapon)} variant · {modStr}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!isRetiring
                  ? <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--accent-red)' }}
                      onClick={() => setPendingOrders({ retireWeaponDesigns: [...pendingRetire, d.id] })}>Retire</button>
                  : <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => setPendingOrders({ retireWeaponDesigns: pendingRetire.filter((x: string) => x !== d.id) })}>Undo</button>
                }
              </div>
            </div>
          </div>
        );
      })}

      {pending.map((d: any, i: number) => (
        <div key={`new-${i}`} className="settlement-card" style={{ marginTop: 8, borderColor: 'var(--accent-green)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{d.name}</strong>
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-green)', border: '1px solid', borderRadius: 3, padding: '1px 4px' }}>NEW (−{d.goldCost ?? '?'}g)</span>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmt(d.baseWeapon)} variant</div>
            </div>
            <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={() => setPendingOrders({ createWeaponDesigns: pending.filter((_: any, j: number) => j !== i) })}>Remove</button>
          </div>
        </div>
      ))}

      {/* Create modal */}
      {showCreate && baseDef && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-dark)', borderRadius: 8, padding: 24, width: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 16 }}>New Weapon Design</h3>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Design Name</div>
              <input className="input" style={{ width: '100%', padding: '6px 8px' }}
                value={newDesign.name} onChange={e => setNewDesign({ ...newDesign, name: e.target.value })}
                placeholder="e.g. Light Rifle" />
            </label>

            {/* Base weapon picker */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Base Weapon</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_DESIGNABLE.map(({ key, group }) => {
                  const def = WEAPONS[key as WeaponType] ?? SHIELDS[key as ShieldType];
                  const techReq = def?.techRequired;
                  const locked = !!techReq && !researchedTechs.has(techReq);
                  const selected = newDesign.baseWeapon === key;
                  return (
                    <button key={key} disabled={locked}
                      onClick={() => !locked && setNewDesign({ ...newDesign, baseWeapon: key, statModifiers: {} })}
                      title={locked ? `Requires: ${fmt(techReq!)}` : `${group}: ${def?.name}`}
                      style={{
                        padding: '5px 10px', fontSize: 12, borderRadius: 4,
                        cursor: locked ? 'not-allowed' : 'pointer',
                        border: selected ? '1px solid var(--accent-gold)' : '1px solid var(--border-dark)',
                        background: selected ? 'var(--accent-gold)' : 'var(--bg-inset)',
                        color: selected ? 'var(--bg-parchment-dark)' : locked ? 'var(--text-muted)' : 'var(--text-primary)',
                        opacity: locked ? 0.45 : 1,
                        fontFamily: 'var(--font-body)',
                      }}>
                      {fmt(key)}{locked ? ' 🔒' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Base stats */}
            <div style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '10px 12px', marginBottom: 12, border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Base Stats — {baseDef.name}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                {Object.entries(baseDef.statBonus).map(([k, v]) => v !== 0 && (
                  <span key={k}><span style={{ color: 'var(--text-muted)' }}>{fmt(k)}:</span> <strong>{v}</strong></span>
                ))}
              </div>
            </div>

            {/* Budget tracker */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Budget: {budgetUsed}/{budget} points used</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: balance === 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                Balance: {balance > 0 ? `+${balance}` : balance} {balance === 0 ? '✓' : '(must reach 0)'}
              </span>
            </div>

            {/* Stat modifier grid */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Shift stats. Each +1 costs a budget point; take a −1 somewhere to offset.
              </div>
              {activeStatKeys.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No stats to modify for this weapon.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {activeStatKeys.map(k => {
                    const base = (baseDef.statBonus as any)[k] ?? 0;
                    const mod = newDesign.statModifiers[k] ?? 0;
                    const canIncrease = budgetUsed < budget;
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-inset)', borderRadius: 4, padding: '6px 8px' }}>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{fmt(k)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 24, textAlign: 'right' }}>{base}</span>
                        <button onClick={() => setMod(k, -1)} style={{ width: 24, height: 24, border: '1px solid var(--border-dark)', borderRadius: 3, background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>−</button>
                        <span style={{ minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: 600,
                          color: mod > 0 ? 'var(--accent-green)' : mod < 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                          {mod > 0 ? `+${mod}` : mod}
                        </span>
                        <button onClick={() => setMod(k, 1)} disabled={!canIncrease} style={{ width: 24, height: 24, border: '1px solid var(--border-dark)', borderRadius: 3, background: 'var(--bg-surface)', cursor: canIncrease ? 'pointer' : 'not-allowed', fontSize: 14, lineHeight: 1, opacity: canIncrease ? 1 : 0.4 }}>+</button>
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 24, textAlign: 'right', color: mod !== 0 ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>={base + mod}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cost summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Base ({baseDef.productionCost} × 50) + {budgetUsed} pts × 75
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: gold >= designCost ? 'var(--text-primary)' : 'var(--accent-red)' }}>
                {designCost}g {gold < designCost ? '— insufficient funds' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addDesign} disabled={!canSubmit}>
                Queue Design (−{designCost}g)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Production Tab ────────────────────────────────────────────────────────

function ProductionTab({ settlements, equipmentOrders, weaponDesigns, pendingOrders, setPendingOrders }: {
  settlements: any[];
  equipmentOrders: any[];
  weaponDesigns: WeaponDesign[];
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
}) {
  const pendingNew: any[] = pendingOrders.placeEquipmentOrders ?? [];
  const pendingCancel: string[] = pendingOrders.cancelEquipmentOrders ?? [];

  const readyDesigns = weaponDesigns.filter((d: any) => d.status === 'ready');

  const [placing, setPlacing] = useState<{ settlementId: string; equipmentType: string; quantity: number; designId?: string; designName?: string } | null>(null);

  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>Equipment Production</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Arms Workshops produce weapons; Armour Workshops produce armour. Each building = 1 unit of progress per turn toward your order.
      </p>

      {settlements.map((s: any) => {
        const armsCount = s.buildings?.filter((b: any) => b.type === 'arms_workshop' && !b.isConstructing).length ?? 0;
        const armourCount = s.buildings?.filter((b: any) => b.type === 'armour_workshop' && !b.isConstructing).length ?? 0;
        if (armsCount === 0 && armourCount === 0) return null;

        const activeOrders = equipmentOrders.filter((o: any) => o.settlementId === s.id && o.status === 'active');

        return (
          <div key={s.id} className="settlement-card" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>{s.name}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {armsCount > 0 && `${armsCount} Arms Wksp`}
                {armsCount > 0 && armourCount > 0 && ' · '}
                {armourCount > 0 && `${armourCount} Armour Wksp`}
              </div>
            </div>

            {/* Active orders */}
            {activeOrders.map((o: any) => {
              const isCancelling = pendingCancel.includes(o.id);
              const progress = o.quantityOrdered > 0 ? (o.quantityFulfilled / o.quantityOrdered) * 100 : 0;
              const isWeapon = !!(WEAPONS as any)[o.equipmentType] || !!(SHIELDS as any)[o.equipmentType];
              const capacity = isWeapon ? armsCount : armourCount;
              const remaining = capacity > 0 ? Math.ceil((o.quantityOrdered - o.quantityFulfilled) / capacity) : '?';
              const linkedDesign = o.designId ? readyDesigns.find((d: any) => d.id === o.designId) : null;
              const orderLabel = linkedDesign ? linkedDesign.name : fmt(o.equipmentType);
              return (
                <div key={o.id} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 4, opacity: isCancelling ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>{orderLabel} ×{o.quantityOrdered}
                      {linkedDesign && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>({fmt(o.equipmentType)})</span>}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>~{remaining} turns</span>
                      {!isCancelling
                        ? <button className="btn btn-secondary" style={{ padding: '1px 6px', fontSize: 11 }}
                            onClick={() => setPendingOrders({ cancelEquipmentOrders: [...pendingCancel, o.id] })}>Cancel</button>
                        : <button className="btn btn-secondary" style={{ padding: '1px 6px', fontSize: 11 }}
                            onClick={() => setPendingOrders({ cancelEquipmentOrders: pendingCancel.filter((x: string) => x !== o.id) })}>Undo</button>
                      }
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-gold)', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{o.quantityFulfilled}/{o.quantityOrdered} fulfilled</div>
                </div>
              );
            })}

            {/* Pending new orders for this settlement */}
            {pendingNew.filter((o: any) => o.settlementId === s.id).map((o: any, i: number) => (
              <div key={`new-${i}`} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 4, border: '1px solid var(--accent-green)', opacity: 0.9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>
                    {o.designName ?? fmt(o.equipmentType)} ×{o.quantity}
                    {o.designName && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>({fmt(o.equipmentType)})</span>}
                    {' '}<span style={{ fontSize: 11, color: 'var(--accent-green)' }}>NEW</span>
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '1px 6px', fontSize: 11 }}
                    onClick={() => setPendingOrders({ placeEquipmentOrders: pendingNew.filter((_: any, j: number) => j !== i) })}>Remove</button>
                </div>
              </div>
            ))}

            {/* Place order button */}
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, width: '100%', marginTop: 4 }}
              onClick={() => setPlacing({ settlementId: s.id, equipmentType: 'polearm', quantity: 100 })}>
              + Place Order
            </button>
          </div>
        );
      })}

      {settlements.every((s: any) => {
        const armsCount = s.buildings?.filter((b: any) => b.type === 'arms_workshop' && !b.isConstructing).length ?? 0;
        const armourCount = s.buildings?.filter((b: any) => b.type === 'armour_workshop' && !b.isConstructing).length ?? 0;
        return armsCount === 0 && armourCount === 0;
      }) && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No Arms or Armour Workshops. Build one to begin producing equipment.</p>
      )}

      {/* Place order modal */}
      {placing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-dark)', borderRadius: 8, padding: 24, width: 400, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 16 }}>Place Equipment Order</h3>

            {/* Weapon designs section */}
            {readyDesigns.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Weapon Designs (Arms Workshop)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {readyDesigns.map((d: any) => {
                    const selected = placing.designId === d.id;
                    return (
                      <button key={d.id}
                        onClick={() => setPlacing({ ...placing, equipmentType: d.baseWeapon, designId: d.id, designName: d.name })}
                        style={{
                          textAlign: 'left', padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
                          border: selected ? '1px solid var(--accent-gold)' : '1px solid var(--border-dark)',
                          background: selected ? 'var(--bg-surface-hover)' : 'var(--bg-inset)',
                          fontFamily: 'var(--font-body)',
                        }}>
                        <span style={{ fontSize: 13, color: selected ? 'var(--accent-gold)' : 'var(--text-primary)' }}>{d.name}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{fmt(d.baseWeapon)} variant</span>
                        {d.statModifiers && Object.keys(d.statModifiers).length > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                            {Object.entries(d.statModifiers as Record<string, number>).map(([k, v]) => `${fmt(k)} ${v > 0 ? '+' : ''}${v}`).join(', ')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Generic weapons (no design) */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Generic Weapons (no design)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...Object.keys(WEAPONS), ...Object.keys(SHIELDS)].map(w => {
                  const selected = placing.equipmentType === w && !placing.designId;
                  return (
                    <button key={w}
                      onClick={() => setPlacing({ ...placing, equipmentType: w, designId: undefined, designName: undefined })}
                      style={{
                        padding: '5px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                        border: selected ? '1px solid var(--accent-gold)' : '1px solid var(--border-dark)',
                        background: selected ? 'var(--accent-gold)' : 'var(--bg-inset)',
                        color: selected ? 'var(--bg-parchment-dark)' : 'var(--text-primary)',
                        fontFamily: 'var(--font-body)',
                      }}>{fmt(w)}</button>
                  );
                })}
              </div>
            </div>

            {/* Armour */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Armour (Armour Workshop)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.keys(ARMOUR_TYPES).map(a => {
                  const selected = placing.equipmentType === a && !placing.designId;
                  return (
                    <button key={a}
                      onClick={() => setPlacing({ ...placing, equipmentType: a, designId: undefined, designName: undefined })}
                      style={{
                        padding: '5px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                        border: selected ? '1px solid var(--accent-gold)' : '1px solid var(--border-dark)',
                        background: selected ? 'var(--accent-gold)' : 'var(--bg-inset)',
                        color: selected ? 'var(--bg-parchment-dark)' : 'var(--text-primary)',
                        fontFamily: 'var(--font-body)',
                      }}>{fmt(a)}</button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Quantity</div>
              <input type="number" className="input" style={{ width: '100%', padding: '6px 8px' }}
                min={1} max={1000} value={placing.quantity}
                onChange={e => setPlacing({ ...placing, quantity: Math.max(1, Number(e.target.value)) })} />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPlacing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                setPendingOrders({ placeEquipmentOrders: [...pendingNew, placing] });
                setPlacing(null);
              }}>Queue Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Army Card ─────────────────────────────────────────────────────────────

function ArmyCard({ slug, army, templates, weaponDesigns, pendingOrders, onCancelMovement }: {
  slug: string;
  army: any;
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
  pendingOrders: any;
  onCancelMovement: (armyId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [nameValue, setNameValue] = useState(army.name);
  const [subtitleValue, setSubtitleValue] = useState(army.subtitle ?? '');
  const setGameState = useStore(s => s.setGameState);
  const armies = useStore(s => s.armies);
  const nobles = useStore(s => s.nobles) as any[] | undefined;

  const units = (army.units as any[] | undefined) ?? [];
  const activeUnits = units.filter((u: any) => u.state !== 'destroyed');
  const hasPendingMove = pendingOrders.movements.some((m: any) => m.armyId === army.id);
  const commander = nobles?.find((n: any) => n.id === army.commanderNobleId);

  async function saveArmyField(field: 'name' | 'subtitle', value: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/army/${army.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ [field]: value }),
    });
    setGameState({ armies: armies.map((a: any) => a.id === army.id ? { ...a, [field]: value } : a) });
  }

  return (
    <div className="army-card">
      <div className="army-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="army-card-title-row">
          <span className="army-expand-icon">{expanded ? '▾' : '▸'}</span>
          <div className="army-card-titles">
            {editingName ? (
              <input className="army-name-input" value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={() => { setEditingName(false); saveArmyField('name', nameValue); }}
                onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveArmyField('name', nameValue); } }}
                onClick={e => e.stopPropagation()} autoFocus />
            ) : (
              <strong className="army-card-name"
                onDoubleClick={e => { e.stopPropagation(); setEditingName(true); setNameValue(army.name); }}
                title="Double-click to rename">{army.name}</strong>
            )}
            {editingSubtitle ? (
              <input className="army-subtitle-input" value={subtitleValue}
                onChange={e => setSubtitleValue(e.target.value)}
                onBlur={() => { setEditingSubtitle(false); saveArmyField('subtitle', subtitleValue); }}
                onKeyDown={e => { if (e.key === 'Enter') { setEditingSubtitle(false); saveArmyField('subtitle', subtitleValue); } }}
                onClick={e => e.stopPropagation()} placeholder="Add a motto or subtitle..." autoFocus />
            ) : army.subtitle ? (
              <span className="army-card-subtitle"
                onDoubleClick={e => { e.stopPropagation(); setEditingSubtitle(true); setSubtitleValue(army.subtitle ?? ''); }}
                title="Double-click to edit">{army.subtitle}</span>
            ) : (
              <span className="army-card-subtitle army-card-subtitle-empty"
                onDoubleClick={e => { e.stopPropagation(); setEditingSubtitle(true); setSubtitleValue(''); }}
                title="Double-click to add a motto">Add a motto...</span>
            )}
          </div>
        </div>
        <div className="army-card-meta">
          <span className="army-card-count">{activeUnits.length} units</span>
          {hasPendingMove && <span className="army-card-badge army-badge-moving">Moving</span>}
          {!army.commanderNobleId && <span className="army-card-badge army-badge-warning">No Commander</span>}
          <span className="army-card-coord">({army.hexQ}, {army.hexR})</span>
        </div>
      </div>

      {expanded && (
        <div className="army-unit-roster">
          {commander ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, padding: '6px 8px', background: 'var(--bg-inset)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--accent-gold)' }}>{fmt(commander.rank)} {commander.name}</span>
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>M:{commander.martial} I:{commander.intelligence} C:{commander.cunning}</span>
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>XP: {commander.xp ?? 0}</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
              No commander assigned — no command bonus in battle.
            </div>
          )}
          {activeUnits.length === 0 && <p className="army-empty-roster">This army has no active units.</p>}
          {activeUnits.map((u: any) => (
            <UnitRow key={u.id} unit={u} slug={slug} armyId={army.id} templates={templates} weaponDesigns={weaponDesigns} />
          ))}
          <div className="army-supply-bar">
            <span>Supply: {army.supplyBank}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unit Row ──────────────────────────────────────────────────────────────

function UnitRow({ unit, slug, armyId, templates, weaponDesigns }: {
  unit: any; slug: string; armyId: string;
  templates: UnitTemplate[]; weaponDesigns: WeaponDesign[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [nameValue, setNameValue] = useState(unit.name ?? '');
  const [subtitleValue, setSubtitleValue] = useState(unit.subtitle ?? '');
  const setGameState = useStore(s => s.setGameState);
  const armies = useStore(s => s.armies);

  const tmpl = templates.find(t => t.id === unit.templateId);
  const troopCounts: TroopCounts = unit.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 };
  const maxTroops = tmpl
    ? (tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY)
    : 100;
  const total = totalTroops(troopCounts);
  const pct = troopStrengthPct(troopCounts, maxTroops);
  const stateInfo = STATE_LABELS[unit.state] ?? STATE_LABELS.full;
  const diceMultiplier = STATE_DICE_MULTIPLIER[unit.state] ?? 1;
  const displayName = unit.name || tmpl?.name || 'Unknown Unit';
  const stats = tmpl ? computeUnitStats(tmpl, weaponDesigns) : null;

  async function saveUnitField(field: 'name' | 'subtitle', value: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/unit/${unit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ [field]: value }),
    });
    setGameState({
      armies: armies.map((a: any) =>
        a.id === armyId
          ? { ...a, units: (a.units ?? []).map((u: any) => u.id === unit.id ? { ...u, [field]: value } : u) }
          : a
      ),
    });
  }

  return (
    <div className="unit-row">
      <div className="unit-row-header" onClick={() => setExpanded(!expanded)}>
        <span className="unit-expand-icon">{expanded ? '▾' : '▸'}</span>
        <div className="unit-row-identity">
          {editingName ? (
            <input className="unit-name-input" value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={() => { setEditingName(false); saveUnitField('name', nameValue); }}
              onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveUnitField('name', nameValue); } }}
              onClick={e => e.stopPropagation()} placeholder={tmpl?.name ?? 'Unit'} autoFocus />
          ) : (
            <span className="unit-row-name"
              onDoubleClick={e => { e.stopPropagation(); setEditingName(true); setNameValue(unit.name ?? ''); }}
              title="Double-click to rename">{displayName}</span>
          )}
          {unit.name && tmpl && <span className="unit-row-type">{tmpl.name}</span>}
          {unit.isOutdated && (
            <span style={{ fontSize: 10, color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>OUTDATED</span>
          )}
        </div>
        <div className="unit-row-badges">
          <Tooltip content={
            <div>
              <div className="tooltip-label">Troops</div>
              <div>{total}/{maxTroops} — <span style={{ color: stateInfo.color }}>{stateInfo.label}</span></div>
              <div className="tooltip-divider" />
              <div className="tooltip-label">Tier Breakdown</div>
              <div>Rookie: {troopCounts.rookie}</div>
              <div>Capable: {troopCounts.capable}</div>
              <div>Veteran: {troopCounts.veteran}</div>
              <div className="tooltip-divider" />
              <div className="tooltip-label">Dice Multiplier</div>
              <div className="tooltip-value">x{diceMultiplier}</div>
            </div>
          }>
            <span className="unit-strength-bar" title={`${pct}% strength`}>
              <span className="unit-strength-fill" style={{ width: `${pct}%`, background: stateInfo.color }} />
            </span>
          </Tooltip>
          {/* Troop tier mini-bar */}
          {total > 0 && (
            <Tooltip content={
              <div>
                <div className="tooltip-label">Troop Experience</div>
                <div>Rookie: {troopCounts.rookie} ({Math.round(troopCounts.rookie / total * 100)}%)</div>
                <div>Capable: {troopCounts.capable} ({Math.round(troopCounts.capable / total * 100)}%)</div>
                <div>Veteran: {troopCounts.veteran} ({Math.round(troopCounts.veteran / total * 100)}%)</div>
              </div>
            }>
              <div style={{ display: 'flex', height: 8, width: 60, borderRadius: 3, overflow: 'hidden', cursor: 'default' }}>
                <div style={{ width: `${troopCounts.rookie / total * 100}%`, background: 'var(--text-muted)' }} />
                <div style={{ width: `${troopCounts.capable / total * 100}%`, background: 'var(--accent-blue)' }} />
                <div style={{ width: `${troopCounts.veteran / total * 100}%`, background: 'var(--accent-gold)' }} />
              </div>
            </Tooltip>
          )}
        </div>
      </div>

      {expanded && (
        <UnitTOE
          unit={unit}
          tmpl={tmpl ?? null}
          weaponDesigns={weaponDesigns}
          stats={stats}
          troopCounts={troopCounts}
          maxTroops={maxTroops}
          total={total}
          pct={pct}
          stateInfo={stateInfo}
          diceMultiplier={diceMultiplier}
          editingSubtitle={editingSubtitle}
          subtitleValue={subtitleValue}
          setEditingSubtitle={setEditingSubtitle}
          setSubtitleValue={setSubtitleValue}
          saveUnitField={saveUnitField}
        />
      )}
    </div>
  );
}

// ─── Stockpile Tab ────────────────────────────────────────────────────────

const WEAPON_KEYS = new Set(Object.keys(WEAPONS));
const SHIELD_KEYS = new Set(Object.keys(SHIELDS));
const ARMOUR_KEYS = new Set(Object.keys(ARMOUR_TYPES));
const MOUNT_STORAGE_KEYS = new Set(['horses', 'griffins', 'demigryphs']);

function StockpileTab({ settlements, pendingOrders, onSettlementClick }: {
  settlements: any[];
  pendingOrders: any;
  onSettlementClick: (id: string) => void;
}) {
  // Aggregate across all settlements
  const totals = {
    population: 0,
    popCap: 0,
    draftedRecruits: 0,
    maxDraftable: 0,
    draftedHorses: 0,
    draftedGryphons: 0,
    draftedDemigryphs: 0,
    totalFoodStored: 0,
    totalFoodProduction: 0,
    totalFoodConsumption: 0,
  };
  const aggregateStorage: Record<string, number> = {};
  const perSettlement: Record<string, Record<string, number>> = {};

  for (const s of settlements) {
    totals.population += s.population ?? 0;
    totals.popCap += s.popCap ?? 0;
    totals.draftedRecruits += s.draftedRecruits ?? 0;
    totals.maxDraftable += Math.floor((s.popCap ?? 0) * 0.2);
    totals.draftedHorses += s.draftedHorses ?? 0;
    totals.draftedGryphons += s.draftedGryphons ?? 0;
    totals.draftedDemigryphs += s.draftedDemigryphs ?? 0;

    const storage = (s.storage ?? {}) as Record<string, number>;
    perSettlement[s.id] = storage;
    totals.totalFoodStored += storage.food ?? 0;
    totals.totalFoodConsumption += calculateFoodConsumption(s.population ?? 0);

    // Estimate food production from completed farms/fisheries
    const buildings = (s.buildings ?? []) as any[];
    const popScale = (s.popCap ?? 0) > 0 ? Math.min(1, (s.population ?? 0) / s.popCap) : 0;
    for (const b of buildings) {
      if (b.isConstructing) continue;
      const def = BUILDINGS[b.type as BuildingType];
      if (def?.output?.food) {
        totals.totalFoodProduction += Math.floor(def.output.food * popScale);
      }
    }

    for (const [key, val] of Object.entries(storage)) {
      if (val > 0) aggregateStorage[key] = (aggregateStorage[key] ?? 0) + val;
    }
  }

  // Pending draft deltas
  const pendingDraftDelta = (pendingOrders.draftRecruits ?? []).reduce((s: number, o: any) => s + o.amount, 0)
    - (pendingOrders.dismissRecruits ?? []).reduce((s: number, o: any) => s + o.amount, 0);

  // Categorize storage (mounts excluded — shown in Mounts section above)
  const weapons: [string, number][] = [];
  const shields: [string, number][] = [];
  const armour: [string, number][] = [];
  const materials: [string, number][] = [];

  for (const [key, val] of Object.entries(aggregateStorage)) {
    if (WEAPON_KEYS.has(key)) weapons.push([key, val]);
    else if (SHIELD_KEYS.has(key)) shields.push([key, val]);
    else if (ARMOUR_KEYS.has(key)) armour.push([key, val]);
    else if (!MOUNT_STORAGE_KEYS.has(key)) materials.push([key, val]);
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── Manpower ── */}
      <h3>Manpower</h3>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <span className="stat-label">Total Population</span>
          <span className="stat-detail">{totals.population.toLocaleString()}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Total Drafted</span>
          <span className="stat-detail">
            {totals.draftedRecruits.toLocaleString()}
            {pendingDraftDelta !== 0 && (
              <span style={{ color: pendingDraftDelta > 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 11, marginLeft: 4 }}>
                {pendingDraftDelta > 0 ? '+' : ''}{pendingDraftDelta}
              </span>
            )}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Max Draftable</span>
          <span className="stat-detail">{totals.maxDraftable.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Food ── */}
      <h3>Food Supply</h3>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <span className="stat-label">Food Stored</span>
          <span className="stat-detail">{totals.totalFoodStored.toLocaleString()}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Production</span>
          <span className="stat-detail" style={{ color: 'var(--accent-green)' }}>+{totals.totalFoodProduction}/turn</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Consumption</span>
          <span className="stat-detail" style={{ color: 'var(--accent-red)' }}>-{totals.totalFoodConsumption}/turn</span>
        </div>
        <Tooltip content={
          totals.totalFoodProduction - totals.totalFoodConsumption < 0 && totals.totalFoodStored > 0
            ? <span>~{Math.ceil(totals.totalFoodStored / (totals.totalFoodConsumption - totals.totalFoodProduction))} turns of reserves remain</span>
            : totals.totalFoodProduction - totals.totalFoodConsumption >= 0
              ? <span>Food supply is stable</span>
              : <span>Famine is active — build farms!</span>
        }>
          <div className="stat-box" style={{ cursor: 'help' }}>
            <span className="stat-label">Net Balance</span>
            <span className="stat-detail" style={{
              color: totals.totalFoodProduction - totals.totalFoodConsumption >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {totals.totalFoodProduction - totals.totalFoodConsumption >= 0 ? '+' : ''}
              {totals.totalFoodProduction - totals.totalFoodConsumption}/turn
            </span>
          </div>
        </Tooltip>
      </div>

      {/* ── Mounts ── */}
      {(totals.draftedHorses > 0 || totals.draftedGryphons > 0 || totals.draftedDemigryphs > 0 ||
        (aggregateStorage.horses ?? 0) > 0 || (aggregateStorage.griffins ?? 0) > 0 || (aggregateStorage.demigryphs ?? 0) > 0) && (
        <>
          <h3>Mounts</h3>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {[
              { label: 'Horses', storage: aggregateStorage.horses ?? 0, drafted: totals.draftedHorses },
              { label: 'Gryphons', storage: aggregateStorage.griffins ?? 0, drafted: totals.draftedGryphons },
              { label: 'Demigryphs', storage: aggregateStorage.demigryphs ?? 0, drafted: totals.draftedDemigryphs },
            ].filter(m => m.storage > 0 || m.drafted > 0).map(m => (
              <div className="stat-box" key={m.label}>
                <span className="stat-label">{m.label}</span>
                <span className="stat-detail">{m.storage} in storage · {m.drafted} drafted</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Weapons ── */}
      {weapons.length > 0 && (
        <>
          <h3>Weapons</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {weapons.sort((a, b) => b[1] - a[1]).map(([key, val]) => (
              <Tooltip key={key} content={
                <div style={{ fontSize: 12 }}>
                  {settlements.filter(s => (perSettlement[s.id]?.[key] ?? 0) > 0).map(s => (
                    <div key={s.id}>{s.name}: {perSettlement[s.id][key]}</div>
                  ))}
                </div>
              }>
                <span className="resource-tag">{fmt(key)} <strong>{val.toLocaleString()}</strong></span>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {/* ── Shields ── */}
      {shields.length > 0 && (
        <>
          <h3>Shields</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {shields.sort((a, b) => b[1] - a[1]).map(([key, val]) => (
              <Tooltip key={key} content={
                <div style={{ fontSize: 12 }}>
                  {settlements.filter(s => (perSettlement[s.id]?.[key] ?? 0) > 0).map(s => (
                    <div key={s.id}>{s.name}: {perSettlement[s.id][key]}</div>
                  ))}
                </div>
              }>
                <span className="resource-tag">{fmt(key)} <strong>{val.toLocaleString()}</strong></span>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {/* ── Armour ── */}
      {armour.length > 0 && (
        <>
          <h3>Armour</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {armour.sort((a, b) => b[1] - a[1]).map(([key, val]) => (
              <Tooltip key={key} content={
                <div style={{ fontSize: 12 }}>
                  {settlements.filter(s => (perSettlement[s.id]?.[key] ?? 0) > 0).map(s => (
                    <div key={s.id}>{s.name}: {perSettlement[s.id][key]}</div>
                  ))}
                </div>
              }>
                <span className="resource-tag">{fmt(key)} <strong>{val.toLocaleString()}</strong></span>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {/* ── Raw Materials ── */}
      {materials.length > 0 && (
        <>
          <h3>Materials</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {materials.sort((a, b) => b[1] - a[1]).map(([key, val]) => (
              <Tooltip key={key} content={
                <div style={{ fontSize: 12 }}>
                  {settlements.filter(s => (perSettlement[s.id]?.[key] ?? 0) > 0).map(s => (
                    <div key={s.id}>{s.name}: {perSettlement[s.id][key]}</div>
                  ))}
                </div>
              }>
                <span className="resource-tag">{fmt(key)} <strong>{val.toLocaleString()}</strong></span>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {/* ── Per-Settlement Breakdown ── */}
      <h3>By Settlement</h3>
      {settlements.map((s: any) => {
        const storage = (s.storage ?? {}) as Record<string, number>;
        const itemCount = Object.values(storage).reduce((a, b) => a + b, 0);
        return (
          <div key={s.id} className="settlement-card" style={{ marginTop: 4, cursor: 'pointer' }}
            onClick={() => onSettlementClick(s.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{s.name}</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6, textTransform: 'capitalize' }}>{s.tier}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Pop {s.population?.toLocaleString()} · Drafted {s.draftedRecruits ?? 0} · {itemCount.toLocaleString()} items
              </span>
            </div>
          </div>
        );
      })}

      {settlements.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No settlements under your control.</p>
      )}
    </div>
  );
}

// ─── Recruit Panel (Enhanced) ──────────────────────────────────────────────

interface Deficit { label: string; required: number; available: number; isMet: boolean; }

function computeRequirements(tmpl: UnitTemplate, settlement: any, pendingOrders: any, playerGold: number): Deficit[] {
  const troops = tmpl.isMounted
    ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON
    : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
  const storage = (settlement.storage ?? {}) as Record<string, number>;
  const deficits: Deficit[] = [];

  if (!tmpl.isIrregular) {
    // Drafted recruits (including pending drafts/dismissals for this settlement)
    const pendingDraft = (pendingOrders.draftRecruits ?? [])
      .filter((o: any) => o.settlementId === settlement.id)
      .reduce((s: number, o: any) => s + o.amount, 0);
    const pendingDismiss = (pendingOrders.dismissRecruits ?? [])
      .filter((o: any) => o.settlementId === settlement.id)
      .reduce((s: number, o: any) => s + o.amount, 0);
    const availableRecruits = (settlement.draftedRecruits ?? 0) + pendingDraft - pendingDismiss;
    deficits.push({ label: 'Drafted Recruits', required: troops, available: Math.max(0, availableRecruits), isMet: availableRecruits >= troops });

    // Primary weapon
    if (tmpl.primary) {
      const avail = storage[tmpl.primary] ?? 0;
      deficits.push({ label: fmt(tmpl.primary), required: troops, available: avail, isMet: avail >= troops });
    }
    // Secondary weapon
    if (tmpl.secondary) {
      const avail = storage[tmpl.secondary] ?? 0;
      deficits.push({ label: fmt(tmpl.secondary), required: troops, available: avail, isMet: avail >= troops });
    }
    // Sidearm
    if (tmpl.sidearm) {
      const avail = storage[tmpl.sidearm] ?? 0;
      deficits.push({ label: fmt(tmpl.sidearm), required: troops, available: avail, isMet: avail >= troops });
    }
    // Armour
    if (tmpl.armour) {
      const avail = storage[tmpl.armour] ?? 0;
      deficits.push({ label: fmt(tmpl.armour), required: troops, available: avail, isMet: avail >= troops });
    }
    // Mounts
    if (tmpl.isMounted && tmpl.mount) {
      const mountStorageKey = tmpl.mount === 'horse' ? 'draftedHorses' : tmpl.mount === 'gryphon' ? 'draftedGryphons' : 'draftedDemigryphs';
      const avail = settlement[mountStorageKey] ?? 0;
      deficits.push({ label: fmt(tmpl.mount) + 's', required: troops, available: avail, isMet: avail >= troops });
    }
  }

  // Gold cost: 200 base + 50 per company/squadron
  const goldCost = 200 + tmpl.companiesOrSquadrons * 50;
  deficits.push({ label: 'Gold', required: goldCost, available: playerGold, isMet: playerGold >= goldCost });

  return deficits;
}

function RecruitPanel({ settlement, armies, templates, weaponDesigns, pendingOrders, playerGold, onRecruit }: {
  settlement: any;
  armies: any[];
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
  pendingOrders: any;
  playerGold: number;
  onRecruit: (order: RecruitFromTemplateOrder) => void;
}) {
  const [selectedArmy, setSelectedArmy] = useState<string>(armies[0]?.id ?? '');
  const [confirmModal, setConfirmModal] = useState<{ templateId: string; armyId: string; deficits: Deficit[] } | null>(null);

  if (templates.length === 0) {
    return (
      <div className="settlement-card" style={{ marginTop: 8 }}>
        <strong>{settlement.name}</strong>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          No unit templates. Create one in the Unit Designer tab.
        </p>
      </div>
    );
  }

  return (
    <div className="settlement-card" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{settlement.name}</strong>
        <select value={selectedArmy} onChange={e => setSelectedArmy(e.target.value)}
          className="input" style={{ minWidth: 120, padding: '4px 8px', fontSize: 12 }}>
          {armies.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {templates.map(tmpl => {
        const stats = computeUnitStats(tmpl, weaponDesigns);
        const troops = tmpl.isMounted
          ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON
          : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
        const deficits = computeRequirements(tmpl, settlement, pendingOrders, playerGold);
        const allMet = deficits.every(d => d.isMet);
        const unitType = tmpl.isIrregular ? 'Irregular' : tmpl.isMounted ? 'Cavalry' : 'Infantry';

        return (
          <div key={tmpl.id} style={{
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 6,
            background: 'var(--bg-surface)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Tooltip content={<StatsPreview stats={stats} />}>
                <span style={{ fontWeight: 600, fontSize: 14, cursor: 'help' }}>{tmpl.name}</span>
              </Tooltip>
              <button
                className={`btn ${allMet ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => {
                  if (!selectedArmy) return;
                  if (allMet) {
                    onRecruit({ settlementId: settlement.id, armyId: selectedArmy, templateId: tmpl.id });
                  } else {
                    setConfirmModal({ templateId: tmpl.id, armyId: selectedArmy, deficits: deficits.filter(d => !d.isMet) });
                  }
                }}
              >
                Recruit
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              {unitType} · {tmpl.companiesOrSquadrons} {tmpl.isMounted ? 'sqn' : 'cos'} · {troops} troops
            </div>

            {/* Requirements checklist */}
            {!tmpl.isIrregular && (
              <div className="requirement-grid">
                {deficits.map((d, i) => (
                  <React.Fragment key={i}>
                    <span style={{ color: d.isMet ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 13 }}>
                      {d.isMet ? '✓' : '✗'}
                    </span>
                    <span style={{ fontSize: 12 }}>{d.label}</span>
                    <span style={{ fontSize: 12, color: d.isMet ? 'var(--text-muted)' : 'var(--accent-red)', textAlign: 'right' }}>
                      {d.available.toLocaleString()}{d.label === 'Gold' ? 'g' : ''} / {d.required.toLocaleString()}{d.label === 'Gold' ? 'g' : ''}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            {tmpl.isIrregular && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Irregular — no equipment needed · Cost: {200 + tmpl.companiesOrSquadrons * 50}g
              </div>
            )}
          </div>
        );
      })}

      {/* Confirmation modal */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmModal(null)}>
          <div style={{
            background: 'var(--bg-dark)', border: '1px solid var(--border-dark)',
            borderRadius: 8, padding: 24, maxWidth: 380, width: '90%',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12, color: 'var(--accent-gold)' }}>Insufficient Resources</h3>
            <p style={{ fontSize: 13, marginBottom: 12 }}>This settlement currently lacks:</p>
            {confirmModal.deficits.map((d, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 4, color: 'var(--accent-red)' }}>
                • {d.label}: need {d.required.toLocaleString()}{d.label === 'Gold' ? 'g' : ''}, have {d.available.toLocaleString()}{d.label === 'Gold' ? 'g' : ''}
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, marginBottom: 16 }}>
              The order will be queued but the server will skip this recruitment if still unmet at turn resolution.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                onRecruit({ settlementId: settlement.id, armyId: confirmModal.armyId, templateId: confirmModal.templateId });
                setConfirmModal(null);
              }}>Recruit Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Unit TO&E Detail ──────────────────────────────────────────────────────

/** Get display name for a weapon/shield/armour slot, including weapon design name if applicable. */
function getEquipmentLabel(
  slotType: WeaponType | ShieldType | ArmourType | MountType | null,
  designId: string | null | undefined,
  weaponDesigns: WeaponDesign[],
): string {
  if (!slotType) return '—';
  const design = designId ? weaponDesigns.find(d => d.id === designId) : null;
  if (design) return `${design.name} (${fmt(slotType)})`;
  return fmt(slotType);
}

/** Get NATO-style unit type symbol based on template equipment. */
function getUnitTypeSymbol(tmpl: UnitTemplate | null): { symbol: string; label: string } {
  if (!tmpl) return { symbol: '?', label: 'Unknown' };
  if (tmpl.isIrregular) return { symbol: '~', label: 'Irregular' };
  if (tmpl.isMounted) return { symbol: '⫽', label: 'Cavalry' };
  if (tmpl.primary && RANGED_WEAPONS.has(tmpl.primary as WeaponType))
    return { symbol: '●', label: 'Ranged' };
  return { symbol: '✕', label: 'Infantry' };
}

function UnitTOE({ unit, tmpl, weaponDesigns, stats, troopCounts, maxTroops, total, pct, stateInfo, diceMultiplier, editingSubtitle, subtitleValue, setEditingSubtitle, setSubtitleValue, saveUnitField }: {
  unit: any;
  tmpl: UnitTemplate | null;
  weaponDesigns: WeaponDesign[];
  stats: ReturnType<typeof computeUnitStats> | null;
  troopCounts: TroopCounts;
  maxTroops: number;
  total: number;
  pct: number;
  stateInfo: { label: string; color: string };
  diceMultiplier: number;
  editingSubtitle: boolean;
  subtitleValue: string;
  setEditingSubtitle: (v: boolean) => void;
  setSubtitleValue: (v: string) => void;
  saveUnitField: (field: 'name' | 'subtitle', value: string) => void;
}) {
  const nobles = useStore(s => s.nobles) as any[] | undefined;
  const held: { primary: number; secondary: number; sidearm: number; armour: number; mounts: number } =
    unit.heldEquipment ?? { primary: 0, secondary: 0, sidearm: 0, armour: 0, mounts: 0 };

  // Find officer assigned to this unit
  const officer = nobles?.find((n: any) => n.assignmentType === 'unit_ic' && n.assignedEntityId === unit.id);

  // Build equipment rows: [label, held, required, slot icon]
  const equipRows: Array<{ label: string; held: number; required: number; icon: string }> = [];
  if (tmpl && !tmpl.isIrregular) {
    if (tmpl.primary) {
      equipRows.push({
        label: getEquipmentLabel(tmpl.primary, tmpl.primaryDesignId, weaponDesigns),
        held: held.primary, required: maxTroops, icon: '⚔',
      });
    }
    if ((tmpl as any).secondary) {
      equipRows.push({
        label: getEquipmentLabel((tmpl as any).secondary, (tmpl as any).secondaryDesignId, weaponDesigns),
        held: held.secondary, required: maxTroops, icon: (SHIELDS as any)[(tmpl as any).secondary] ? '🛡' : '⚔',
      });
    }
    if (tmpl.sidearm) {
      equipRows.push({
        label: getEquipmentLabel(tmpl.sidearm, tmpl.sidearmDesignId, weaponDesigns),
        held: held.sidearm, required: maxTroops, icon: '🗡',
      });
    }
    if (tmpl.armour) {
      equipRows.push({
        label: fmt(tmpl.armour),
        held: held.armour, required: maxTroops, icon: '🛡',
      });
    }
    if (tmpl.mount && tmpl.isMounted) {
      const breedName = unit.mountBreed
        ? ((HORSE_BREEDS as any)[unit.mountBreed]?.name ?? (GRYPHON_BREEDS as any)[unit.mountBreed]?.name ?? fmt(unit.mountBreed))
        : null;
      equipRows.push({
        label: breedName ? `${fmt(tmpl.mount)} (${breedName})` : fmt(tmpl.mount),
        held: held.mounts, required: maxTroops, icon: '🐎',
      });
    }
  }

  return (
    <div className="unit-detail-panel">
      {/* Subtitle */}
      <div className="unit-subtitle-row">
        {editingSubtitle ? (
          <input className="unit-subtitle-input" value={subtitleValue}
            onChange={e => setSubtitleValue(e.target.value)}
            onBlur={() => { setEditingSubtitle(false); saveUnitField('subtitle', subtitleValue); }}
            onKeyDown={e => { if (e.key === 'Enter') { setEditingSubtitle(false); saveUnitField('subtitle', subtitleValue); } }}
            placeholder='"Unbroken Since Edenmoor"' autoFocus />
        ) : (
          <span className={`unit-subtitle-text ${unit.subtitle ? '' : 'unit-subtitle-empty'}`}
            onDoubleClick={() => { setEditingSubtitle(true); setSubtitleValue(unit.subtitle ?? ''); }}
            title="Double-click to add a subtitle">
            {unit.subtitle || 'Add a battle cry or motto...'}
          </span>
        )}
      </div>

      {/* ── Strength ── */}
      <div className="toe-section">
        <div className="toe-section-label">Strength</div>
        <div className="toe-strength-row">
          <span className="toe-strength-numbers" style={{ color: stateInfo.color }}>
            {total} / {maxTroops}
          </span>
          <span className="toe-strength-pct" style={{ color: stateInfo.color }}>
            {stateInfo.label} ({pct}%)
          </span>
        </div>
        {/* Troop tier bars */}
        {total > 0 && (
          <div className="toe-tier-bars">
            <div className="toe-tier-row">
              <span className="toe-tier-label" style={{ color: 'var(--text-muted)' }}>Rookie</span>
              <div className="toe-tier-bar-track">
                <div className="toe-tier-bar-fill" style={{ width: `${(troopCounts.rookie / maxTroops) * 100}%`, background: 'var(--text-muted)' }} />
              </div>
              <span className="toe-tier-count">{troopCounts.rookie}</span>
            </div>
            <div className="toe-tier-row">
              <span className="toe-tier-label" style={{ color: 'var(--accent-blue)' }}>Capable</span>
              <div className="toe-tier-bar-track">
                <div className="toe-tier-bar-fill" style={{ width: `${(troopCounts.capable / maxTroops) * 100}%`, background: 'var(--accent-blue)' }} />
              </div>
              <span className="toe-tier-count">{troopCounts.capable}</span>
            </div>
            <div className="toe-tier-row">
              <span className="toe-tier-label" style={{ color: 'var(--accent-gold)' }}>Veteran</span>
              <div className="toe-tier-bar-track">
                <div className="toe-tier-bar-fill" style={{ width: `${(troopCounts.veteran / maxTroops) * 100}%`, background: 'var(--accent-gold)' }} />
              </div>
              <span className="toe-tier-count">{troopCounts.veteran}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Equipment ── */}
      {equipRows.length > 0 && (
        <div className="toe-section">
          <div className="toe-section-label">Equipment</div>
          <div className="toe-equip-header">
            <span />
            <span />
            <span className="toe-equip-col-label">Held</span>
            <span className="toe-equip-col-label">Req.</span>
          </div>
          {equipRows.map((row, i) => {
            const shortage = row.required - row.held;
            return (
              <div key={i} className="toe-equip-row">
                <span className="toe-equip-icon">{row.icon}</span>
                <span className="toe-equip-name">{row.label}</span>
                <span className={`toe-equip-count ${shortage > 0 ? 'toe-equip-shortage' : ''}`}>{row.held}</span>
                <span className="toe-equip-count">{row.required}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Stats ── */}
      {stats && (
        <div className="toe-section">
          <div className="toe-section-label">Combat Stats</div>
          <StatsPreview stats={stats} />
        </div>
      )}

      {/* ── Status line ── */}
      <div className="toe-status-row">
        <span>Dice: x{diceMultiplier}</span>
        <span>Position: {fmt(unit.position ?? 'frontline')}</span>
        <span>XP: {unit.xp ?? 0}</span>
        {officer && (
          <span style={{ color: 'var(--accent-gold)' }}>
            {fmt(officer.rank)} {officer.name} (M:{officer.martial})
          </span>
        )}
      </div>

      {/* Template reference */}
      {tmpl && (
        <div className="toe-template-ref">
          Template: {tmpl.name} · {tmpl.companiesOrSquadrons} {tmpl.isMounted ? 'squadrons' : 'companies'}
          {unit.isOutdated && <span className="toe-outdated-badge">OUTDATED</span>}
        </div>
      )}
    </div>
  );
}

// ─── ORBAT Tab ─────────────────────────────────────────────────────────────

function OrbatTab({ armies, templates, weaponDesigns }: {
  armies: any[];
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
}) {
  const nobles = useStore(s => s.nobles) as any[] | undefined;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  const toggleUnit = (id: string) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (armies.length === 0) {
    return (
      <div className="orbat-empty">
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No armies raised. Your order of battle stands empty.</p>
      </div>
    );
  }

  // Calculate nation-level totals
  const nationTotalMen = armies.reduce((sum: number, a: any) => {
    const units = (a.units ?? []) as any[];
    return sum + units.filter((u: any) => u.state !== 'destroyed').reduce((us: number, u: any) => {
      const tc: TroopCounts = u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 };
      return us + tc.rookie + tc.capable + tc.veteran;
    }, 0);
  }, 0);

  const nationTotalUnits = armies.reduce((sum: number, a: any) =>
    sum + ((a.units ?? []) as any[]).filter((u: any) => u.state !== 'destroyed').length, 0);

  return (
    <div className="orbat-container">
      {/* Nation root node */}
      <div className="orbat-nation-node">
        <div className="orbat-node-box orbat-node-nation">
          <div className="orbat-node-name">Armed Forces</div>
          <div className="orbat-node-meta">{armies.length} armies · {nationTotalUnits} units · {nationTotalMen.toLocaleString()} men</div>
        </div>
      </div>

      {/* Army connector line */}
      <div className="orbat-connector-vertical" />

      {/* Army level */}
      <div className="orbat-army-row">
        {armies.map((army: any, armyIdx: number) => {
          const units = ((army.units ?? []) as any[]).filter((u: any) => u.state !== 'destroyed');
          const commander = nobles?.find((n: any) => n.id === army.commanderNobleId);
          const armyTotal = units.reduce((sum: number, u: any) => {
            const tc: TroopCounts = u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 };
            return sum + tc.rookie + tc.capable + tc.veteran;
          }, 0);

          return (
            <div key={army.id} className="orbat-army-branch">
              {/* Army node */}
              <div className="orbat-node-box orbat-node-army">
                <div className="orbat-army-symbol">
                  {army.isNaval ? '⚓' : '⚔'}
                </div>
                <div className="orbat-node-name">{army.name}</div>
                {commander && (
                  <div className="orbat-node-general">
                    {fmt(commander.rank)} {commander.name}
                  </div>
                )}
                <div className="orbat-node-meta">
                  {units.length} units · {armyTotal.toLocaleString()} men
                </div>
                <div className="orbat-node-location">({army.hexQ}, {army.hexR})</div>
              </div>

              {/* Unit connector */}
              {units.length > 0 && <div className="orbat-connector-vertical orbat-connector-short" />}

              {/* Unit level */}
              {units.length > 0 && (
                <div className="orbat-unit-row">
                  {units.map((u: any) => {
                    const tmpl = templates.find(t => t.id === u.templateId);
                    const typeInfo = getUnitTypeSymbol(tmpl ?? null);
                    const tc: TroopCounts = u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 };
                    const uTotal = tc.rookie + tc.capable + tc.veteran;
                    const maxTroops = tmpl
                      ? (tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY)
                      : 100;
                    const uPct = maxTroops > 0 ? Math.round((uTotal / maxTroops) * 100) : 0;
                    const unitStateInfo = STATE_LABELS[u.state] ?? STATE_LABELS.full;
                    const isExpanded = expandedUnits.has(u.id);
                    const stats = tmpl ? computeUnitStats(tmpl, weaponDesigns) : null;
                    const displayName = u.name || tmpl?.name || 'Unit';

                    return (
                      <div key={u.id} className="orbat-unit-branch">
                        <div
                          className={`orbat-node-box orbat-node-unit ${isExpanded ? 'orbat-node-expanded' : ''}`}
                          onClick={() => toggleUnit(u.id)}
                          title="Click to expand TO&E"
                        >
                          <div className="orbat-unit-symbol" style={{ color: unitStateInfo.color }}>
                            {typeInfo.symbol}
                          </div>
                          <div className="orbat-unit-name">{displayName}</div>
                          <div className="orbat-unit-strength" style={{ color: unitStateInfo.color }}>
                            {uTotal}/{maxTroops}
                          </div>
                        </div>

                        {/* Expanded TO&E inline */}
                        {isExpanded && tmpl && (
                          <div className="orbat-unit-toe">
                            <div className="orbat-toe-type">{typeInfo.label} · {tmpl.companiesOrSquadrons} {tmpl.isMounted ? 'sqn' : 'coy'}</div>
                            <div className="orbat-toe-tiers">
                              <span style={{ color: 'var(--text-muted)' }}>R:{tc.rookie}</span>
                              <span style={{ color: 'var(--accent-blue)' }}>C:{tc.capable}</span>
                              <span style={{ color: 'var(--accent-gold)' }}>V:{tc.veteran}</span>
                            </div>
                            {!tmpl.isIrregular && (
                              <div className="orbat-toe-equip">
                                {tmpl.primary && <div>{getEquipmentLabel(tmpl.primary, tmpl.primaryDesignId, weaponDesigns)}</div>}
                                {(tmpl as any).secondary && <div>{getEquipmentLabel((tmpl as any).secondary, (tmpl as any).secondaryDesignId, weaponDesigns)}</div>}
                                {tmpl.sidearm && <div>{getEquipmentLabel(tmpl.sidearm, tmpl.sidearmDesignId, weaponDesigns)}</div>}
                                {tmpl.armour && <div>{fmt(tmpl.armour)}</div>}
                                {tmpl.mount && <div>{fmt(tmpl.mount)}{u.mountBreed ? ` (${fmt(u.mountBreed)})` : ''}</div>}
                              </div>
                            )}
                            {stats && (
                              <div className="orbat-toe-stats">
                                {(['fire', 'shock', 'defence', 'morale', 'armour', 'ap'] as const).map(k => (
                                  <span key={k}>{k[0].toUpperCase()}: {(stats as any)[k]}</span>
                                ))}
                              </div>
                            )}
                            <div className="orbat-toe-status">
                              <span style={{ color: unitStateInfo.color }}>{unitStateInfo.label} ({uPct}%)</span>
                              <span>{fmt(u.position ?? 'frontline')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Naval Codex ───────────────────────────────────────────────────────────

function NavalCodex() {
  const [open, setOpen] = useState(false);
  const eras = ['early', 'middle', 'late'] as const;

  return (
    <div className="codex-section" style={{ marginTop: 20 }}>
      <button className="codex-header" onClick={() => setOpen(!open)}>
        <span>Naval Codex</span>
        <span className={`codex-toggle ${open ? 'open' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="codex-body">
          {eras.map(era => {
            const ships = (Object.entries(SHIPS) as [string, any][]).filter(([, s]) => s.era === era);
            if (ships.length === 0) return null;
            return (
              <div key={era} className="codex-category">
                <div className="codex-category-title">{fmt(era)} Era</div>
                {ships.map(([type, stats]) => (
                  <div key={type} className="codex-entry">
                    <div className="codex-entry-name">{fmt(type)}</div>
                    <div className="codex-entry-stats">
                      {[['Fire', stats.fire, 'Ranged attack power'], ['Shock', stats.shock, 'Melee attack power'], ['Def', stats.defence, 'Damage reduction'], ['Morale', stats.morale, 'Morale threshold (d20)'], ['Hull', stats.hull, 'Hit points'], ['AP', stats.ap, 'Armour Piercing'], ['THAC0', `${stats.hitsOn}+`, 'Base to-hit threshold (lower is better)']].map(([l, v, tip]) => (
                        <Tooltip key={l as string} content={<span style={{ fontSize: 11 }}>{tip}</span>}>
                          <div className="codex-stat" style={{ cursor: 'help' }}>
                            <span className="codex-stat-label" style={{ borderBottom: '1px dotted var(--text-muted)' }}>{l}</span>
                            <span className="codex-stat-value">{v}</span>
                          </div>
                        </Tooltip>
                      ))}
                    </div>
                    <div className="codex-entry-detail">{stats.notes}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
