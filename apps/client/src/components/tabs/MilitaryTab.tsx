import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  STATE_DICE_MULTIPLIER, SHIPS, BUILDINGS,
  PRIMARY_WEAPONS, SIDEARM_WEAPONS, ARMOUR_TYPES, MOUNT_TYPES,
  computeUnitStats, MEN_PER_COMPANY, MEN_PER_SQUADRON,
  type ShipType, type UnitTemplate, type WeaponDesign, type TroopCounts,
  type PrimaryWeapon, type SidearmWeapon, type ArmourType, type MountType,
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

  const [activeTab, setActiveTab] = useState<'armies' | 'designer' | 'weapons' | 'production'>('armies');

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
        {(['armies', 'designer', 'weapons', 'production'] as const).map(tab => (
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
            {tab === 'armies' ? 'Armies' : tab === 'designer' ? 'Unit Designer' : tab === 'weapons' ? 'Weapon Designer' : 'Production'}
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
            if (!hasBarracks) return null;
            return (
              <RecruitPanel
                key={s.id}
                settlement={s}
                armies={armiesHere}
                templates={myTemplates}
                weaponDesigns={myDesigns}
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

      {/* Unit Designer Tab */}
      {activeTab === 'designer' && (
        <UnitDesignerTab
          templates={myTemplates}
          weaponDesigns={myDesigns}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
          playerId={player.id as string}
        />
      )}

      {/* Weapon Designer Tab */}
      {activeTab === 'weapons' && (
        <WeaponDesignerTab
          designs={myDesigns}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
          player={player}
        />
      )}

      {/* Production Tab */}
      {activeTab === 'production' && (
        <ProductionTab
          settlements={mySettlements}
          equipmentOrders={myOrders}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
        />
      )}
    </div>
  );
}

// ─── Unit Designer Tab ─────────────────────────────────────────────────────

const PRIMARY_OPTS: Array<PrimaryWeapon | ''> = ['', 'greataxe', 'greatsword', 'polearm', 'longbow', 'musket', 'rifle'];
const SIDEARM_OPTS: Array<SidearmWeapon | ''> = ['', 'shortsword', 'longsword', 'sabre', 'handgun'];
const ARMOUR_OPTS: Array<ArmourType | ''> = ['', 'gambeson', 'mail', 'plate', 'breastplate'];
const MOUNT_OPTS: Array<MountType | ''> = ['', 'horse', 'gryphon', 'demigryph'];

const BLANK_TEMPLATE: CreateTemplateOrder = {
  name: '',
  isIrregular: false,
  isMounted: false,
  companiesOrSquadrons: 3,
  primary: null,
  sidearm: null,
  armour: null,
  mount: null,
};

function UnitDesignerTab({ templates, weaponDesigns, pendingOrders, setPendingOrders, playerId }: {
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
  playerId: string;
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
      sidearm: pending?.changes.sidearm ?? tmpl.sidearm,
      armour: pending?.changes.armour ?? tmpl.armour,
      mount: pending?.changes.mount ?? tmpl.mount,
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
        { ...editing, id: '__preview', gameId: '', playerId, weaponDesignId: null, createdAt: '', updatedAt: '' } as UnitTemplate,
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
                  {[tmpl.primary, tmpl.sidearm, tmpl.armour, tmpl.mount].filter(Boolean).map(e => fmt(e!)).join(', ') || 'No equipment'}
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
          { ...tmpl, id: `__new_${i}`, gameId: '', playerId, weaponDesignId: null, createdAt: '', updatedAt: '' } as UnitTemplate,
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Primary Weapon</div>
                  <select className="input" style={{ width: '100%', padding: '6px 8px' }}
                    value={editing.primary ?? ''}
                    onChange={e => setEditing({ ...editing, primary: (e.target.value as PrimaryWeapon) || null })}>
                    {PRIMARY_OPTS.map(o => <option key={o} value={o}>{o ? fmt(o) : '— None —'}</option>)}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Sidearm</div>
                  <select className="input" style={{ width: '100%', padding: '6px 8px' }}
                    value={editing.sidearm ?? ''}
                    onChange={e => setEditing({ ...editing, sidearm: (e.target.value as SidearmWeapon) || null })}>
                    {SIDEARM_OPTS.map(o => <option key={o} value={o}>{o ? fmt(o) : '— None —'}</option>)}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Armour</div>
                  <select className="input" style={{ width: '100%', padding: '6px 8px' }}
                    value={editing.armour ?? ''}
                    onChange={e => setEditing({ ...editing, armour: (e.target.value as ArmourType) || null })}>
                    {ARMOUR_OPTS.map(o => <option key={o} value={o}>{o ? fmt(o) : '— None —'}</option>)}
                  </select>
                </label>
                {editing.isMounted && (
                  <label>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mount</div>
                    <select className="input" style={{ width: '100%', padding: '6px 8px' }}
                      value={editing.mount ?? ''}
                      onChange={e => setEditing({ ...editing, mount: (e.target.value as MountType) || null })}>
                      {MOUNT_OPTS.map(o => <option key={o} value={o}>{o ? fmt(o) : '— None —'}</option>)}
                    </select>
                  </label>
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

// ─── Stat preview bar ──────────────────────────────────────────────────────

function StatsPreview({ stats }: { stats: { fire: number; shock: number; defence: number; morale: number; armour: number; ap: number; hitsOn: number } }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
      {[['Fire', stats.fire], ['Shock', stats.shock], ['Def', stats.defence], ['Morale', stats.morale], ['Armour', stats.armour], ['AP', stats.ap], ['Hits', `${stats.hitsOn}+`]].map(([label, val]) => (
        <div key={label as string} style={{ textAlign: 'center', minWidth: 36 }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Weapon Designer Tab ───────────────────────────────────────────────────

const STAT_KEYS = ['fire', 'shock', 'defence', 'morale', 'ap', 'armour'] as const;
type StatKey = typeof STAT_KEYS[number];

function WeaponDesignerTab({ designs, pendingOrders, setPendingOrders, player }: {
  designs: WeaponDesign[];
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
  player: Record<string, unknown>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newDesign, setNewDesign] = useState({
    baseWeapon: 'polearm' as PrimaryWeapon | SidearmWeapon,
    name: '',
    statModifiers: {} as Partial<Record<StatKey, number>>,
    costModifier: 0,
  });
  const pending = pendingOrders.createWeaponDesigns ?? [];
  const pendingRetire = pendingOrders.retireWeaponDesigns ?? [];

  const COST = 500;
  const gold = (player.gold as number) ?? 0;

  function addDesign() {
    if (!newDesign.name.trim()) return;
    setPendingOrders({ createWeaponDesigns: [...pending, newDesign] });
    setShowCreate(false);
    setNewDesign({ baseWeapon: 'polearm', name: '', statModifiers: {}, costModifier: 0 });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Weapon Designs</h3>
        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }}
          onClick={() => setShowCreate(true)} disabled={gold < COST}>
          + New Design (500g)
        </button>
      </div>

      {gold < COST && (
        <p style={{ fontSize: 12, color: 'var(--accent-red)', marginBottom: 8 }}>Requires {COST}g — insufficient funds.</p>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Designs take 2 turns to develop before becoming active. Cost: 500g each.
      </p>

      {designs.length === 0 && pending.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No weapon designs yet.</p>
      )}

      {designs.map((d: any) => {
        const isRetiring = pendingRetire.includes(d.id);
        const statusColor = d.status === 'ready' ? 'var(--accent-green)' : d.status === 'developing' ? 'var(--accent-gold)' : 'var(--text-muted)';
        return (
          <div key={d.id} className="settlement-card" style={{ marginTop: 8, opacity: isRetiring ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{d.name}</strong>
                <span style={{ marginLeft: 6, fontSize: 11, color: statusColor }}>
                  {d.status === 'developing' ? `Developing (${d.turnsRemaining} turns)` : fmt(d.status)}
                </span>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Base: {fmt(d.baseWeapon)}
                  {d.costModifier !== 0 && ` · Cost ${d.costModifier > 0 ? '+' : ''}${Math.round(d.costModifier * 100)}%`}
                </div>
                {d.statModifiers && Object.keys(d.statModifiers).length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {Object.entries(d.statModifiers as Record<string, number>).map(([k, v]) => (
                      `${fmt(k)} ${v > 0 ? '+' : ''}${v}`
                    )).join(', ')}
                  </div>
                )}
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
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-green)', border: '1px solid', borderRadius: 3, padding: '1px 4px' }}>NEW (−500g)</span>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Base: {fmt(d.baseWeapon)}</div>
            </div>
            <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={() => setPendingOrders({ createWeaponDesigns: pending.filter((_: any, j: number) => j !== i) })}>Remove</button>
          </div>
        </div>
      ))}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-dark)', borderRadius: 8, padding: 24, width: 440 }}>
            <h3 style={{ marginBottom: 16 }}>New Weapon Design</h3>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Design Name</div>
              <input className="input" style={{ width: '100%', padding: '6px 8px' }}
                value={newDesign.name} onChange={e => setNewDesign({ ...newDesign, name: e.target.value })}
                placeholder="e.g. Light Rifle" />
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Base Weapon</div>
              <select className="input" style={{ width: '100%', padding: '6px 8px' }}
                value={newDesign.baseWeapon}
                onChange={e => setNewDesign({ ...newDesign, baseWeapon: e.target.value as PrimaryWeapon | SidearmWeapon })}>
                <optgroup label="Primaries">
                  {(['greataxe', 'greatsword', 'polearm', 'longbow', 'musket', 'rifle'] as PrimaryWeapon[]).map(w => (
                    <option key={w} value={w}>{fmt(w)}</option>
                  ))}
                </optgroup>
                <optgroup label="Sidearms">
                  {(['shortsword', 'longsword', 'sabre', 'handgun'] as SidearmWeapon[]).map(w => (
                    <option key={w} value={w}>{fmt(w)}</option>
                  ))}
                </optgroup>
              </select>
            </label>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Stat Modifiers (tradeoffs, each ±3 max)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {STAT_KEYS.map(k => (
                  <label key={k} style={{ fontSize: 12 }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>{fmt(k)}</div>
                    <input type="number" className="input" style={{ width: '100%', padding: '4px 6px' }}
                      min={-3} max={3} step={1}
                      value={newDesign.statModifiers[k] ?? 0}
                      onChange={e => setNewDesign({ ...newDesign, statModifiers: { ...newDesign.statModifiers, [k]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Production Cost Modifier: {newDesign.costModifier > 0 ? '+' : ''}{Math.round(newDesign.costModifier * 100)}%
              </div>
              <input type="range" style={{ width: '100%' }} min={-30} max={30} step={5}
                value={Math.round(newDesign.costModifier * 100)}
                onChange={e => setNewDesign({ ...newDesign, costModifier: Number(e.target.value) / 100 })} />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addDesign} disabled={!newDesign.name.trim()}>
                Queue Design (−500g)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Production Tab ────────────────────────────────────────────────────────

function ProductionTab({ settlements, equipmentOrders, pendingOrders, setPendingOrders }: {
  settlements: any[];
  equipmentOrders: any[];
  pendingOrders: any;
  setPendingOrders: (p: any) => void;
}) {
  const pendingNew: any[] = pendingOrders.placeEquipmentOrders ?? [];
  const pendingCancel: string[] = pendingOrders.cancelEquipmentOrders ?? [];

  const [placing, setPlacing] = useState<{ settlementId: string; equipmentType: string; quantity: number } | null>(null);

  const EQUIPMENT_OPTS = [
    ...Object.keys(PRIMARY_WEAPONS),
    ...Object.keys(SIDEARM_WEAPONS),
    ...Object.keys(ARMOUR_TYPES),
  ];

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
              const capacity = EQUIPMENT_OPTS.slice(0, 6).includes(o.equipmentType) ? armsCount : armourCount;
              const remaining = capacity > 0 ? Math.ceil((o.quantityOrdered - o.quantityFulfilled) / capacity) : '?';
              return (
                <div key={o.id} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 4, opacity: isCancelling ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>{fmt(o.equipmentType)} ×{o.quantityOrdered}</span>
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
                  <span style={{ fontSize: 13 }}>{fmt(o.equipmentType)} ×{o.quantity} <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>NEW</span></span>
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
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-dark)', borderRadius: 8, padding: 24, width: 360 }}>
            <h3 style={{ marginBottom: 16 }}>Place Equipment Order</h3>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Equipment Type</div>
              <select className="input" style={{ width: '100%', padding: '6px 8px' }}
                value={placing.equipmentType}
                onChange={e => setPlacing({ ...placing, equipmentType: e.target.value })}>
                <optgroup label="Weapons (Arms Workshop)">
                  {Object.keys(PRIMARY_WEAPONS).map(w => <option key={w} value={w}>{fmt(w)}</option>)}
                  {Object.keys(SIDEARM_WEAPONS).map(w => <option key={w} value={w}>{fmt(w)}</option>)}
                </optgroup>
                <optgroup label="Armour (Armour Workshop)">
                  {Object.keys(ARMOUR_TYPES).map(a => <option key={a} value={a}>{fmt(a)}</option>)}
                </optgroup>
              </select>
            </label>

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
  const generals = useStore(s => (s as any).generals) as any[] | undefined;

  const units = (army.units as any[] | undefined) ?? [];
  const activeUnits = units.filter((u: any) => u.state !== 'destroyed');
  const hasPendingMove = pendingOrders.movements.some((m: any) => m.armyId === army.id);
  const general = generals?.find((g: any) => g.id === army.generalId);

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
          {!army.generalId && <span className="army-card-badge army-badge-warning">No General</span>}
          <span className="army-card-coord">({army.hexQ}, {army.hexR})</span>
        </div>
      </div>

      {expanded && (
        <div className="army-unit-roster">
          {general ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, padding: '6px 8px', background: 'var(--bg-inset)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
              <span style={{ color: 'var(--accent-gold)' }}>General {general.name}</span>
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Command: {general.commandRating}</span>
              <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>XP: {general.xp ?? 0}</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
              No general assigned — no command bonus in battle.
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
        <div className="unit-detail-panel">
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

          {/* Troop breakdown */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Troop Tiers</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--text-muted)' }}>Rookie: {troopCounts.rookie}</span>
                <span style={{ color: 'var(--accent-blue)' }}>Capable: {troopCounts.capable}</span>
                <span style={{ color: 'var(--accent-gold)' }}>Veteran: {troopCounts.veteran}</span>
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>XP</div>
              <div>{unit.xp ?? 0}</div>
            </div>
          </div>

          {/* Template info */}
          {tmpl && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Template: {tmpl.name} · {tmpl.companiesOrSquadrons} {tmpl.isMounted ? 'squadrons' : 'companies'}
              {[tmpl.primary, tmpl.sidearm, tmpl.armour, tmpl.mount].filter(Boolean).length > 0 && (
                <> · {[tmpl.primary, tmpl.sidearm, tmpl.armour, tmpl.mount].filter(Boolean).map(e => fmt(e!)).join(', ')}</>
              )}
            </div>
          )}

          {/* Computed stats */}
          {stats && <StatsPreview stats={stats} />}

          {/* Status line */}
          <div className="unit-status-line" style={{ marginTop: 8 }}>
            <span style={{ color: stateInfo.color }}>{stateInfo.label} ({pct}%)</span>
            <span>Dice: x{diceMultiplier}</span>
            <span>Position: {fmt(unit.position ?? 'frontline')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recruit Panel ─────────────────────────────────────────────────────────

function RecruitPanel({ settlement, armies, templates, weaponDesigns, onRecruit }: {
  settlement: any;
  armies: any[];
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
  onRecruit: (order: RecruitFromTemplateOrder) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>(templates[0]?.id ?? '');
  const [selectedArmy, setSelectedArmy] = useState<string>(armies[0]?.id ?? '');

  const storage = (settlement.storage ?? {}) as Record<string, number>;
  const availableTemplates = templates.filter(tmpl => {
    if (tmpl.isIrregular) return true;
    if (tmpl.primary && (storage[tmpl.primary] ?? 0) < 1) return false;
    if (tmpl.sidearm && (storage[tmpl.sidearm] ?? 0) < 1) return false;
    if (tmpl.armour && (storage[tmpl.armour] ?? 0) < 1) return false;
    return true;
  });

  const selected = templates.find(t => t.id === selectedTemplate);
  const selectedStats = selected ? computeUnitStats(selected, weaponDesigns) : null;

  if (templates.length === 0) {
    return (
      <div className="settlement-card" style={{ marginTop: 8 }}>
        <strong>{settlement.name}</strong>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          No unit templates. Create a template in the Unit Designer tab.
        </p>
      </div>
    );
  }

  if (availableTemplates.length === 0) {
    return (
      <div className="settlement-card" style={{ marginTop: 8 }}>
        <strong>{settlement.name}</strong>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          No equipment in storage for any template.
        </p>
      </div>
    );
  }

  return (
    <div className="settlement-card" style={{ marginTop: 8 }}>
      <strong>{settlement.name}</strong>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tooltip content={selectedStats ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{selected?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              {selected?.companiesOrSquadrons} {selected?.isMounted ? 'squadrons' : 'companies'}
              {' · '}{selected ? (selected.isMounted ? selected.companiesOrSquadrons * MEN_PER_SQUADRON : selected.companiesOrSquadrons * MEN_PER_COMPANY) : 0} troops max
            </div>
            <StatsPreview stats={selectedStats} />
          </div>
        ) : <span>Select a template</span>}>
          <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
            className="input" style={{ flex: 1, minWidth: 140, padding: '4px 8px' }}>
            {availableTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Tooltip>
        <select value={selectedArmy} onChange={e => setSelectedArmy(e.target.value)}
          className="input" style={{ flex: 1, minWidth: 120, padding: '4px 8px' }}>
          {armies.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }}
          onClick={() => {
            if (selectedArmy && selectedTemplate) {
              onRecruit({ settlementId: settlement.id, armyId: selectedArmy, templateId: selectedTemplate });
            }
          }}>
          Recruit
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        Cost: 200g + equipment from storage
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
                      {[['Fire', stats.fire], ['Shock', stats.shock], ['Def', stats.defence], ['Morale', stats.morale], ['Hull', stats.hull], ['AP', stats.ap], ['Hits', `${stats.hitsOn}+`]].map(([l, v]) => (
                        <div key={l as string} className="codex-stat">
                          <span className="codex-stat-label">{l}</span>
                          <span className="codex-stat-value">{v}</span>
                        </div>
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
