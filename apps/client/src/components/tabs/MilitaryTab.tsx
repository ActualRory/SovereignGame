import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { UNITS, VETERANCY_BONUS, type UnitType } from '@kingdoms/shared';

const UNIT_DESCRIPTIONS: Record<string, string> = {
  irregulars: 'Untrained levies mustered in times of need. Cheap and expendable, they hold the line until better men arrive.',
  spearmen: 'Disciplined infantry armed with long spears. The backbone of any early army, reliable in both attack and defence.',
  archers: 'Skilled bowmen who rain death from behind the frontline. Devastating at range but vulnerable in melee.',
  cavalry: 'Mounted warriors who strike fast and hard. Excellent for flanking manoeuvres and running down broken foes.',
  swordsmen: 'Well-trained soldiers bearing forged steel blades. Superior shock troops that can break through shield walls.',
  crossbowmen: 'Crossbow-armed marksmen whose bolts pierce armour with ease. Slower to reload but lethal against heavy infantry.',
  men_at_arms: 'Professional soldiers clad in plate armour and wielding halberds. The finest heavy infantry gold can buy.',
  knights: 'Noble warriors on armoured destriers. The thunder of their charge breaks armies and decides battles.',
  griffin_riders: 'Daring warriors mounted on trained griffins. They strike from above, sowing chaos among enemy ranks.',
  griffin_knights: 'Elite aerial cavalry in full plate, mounted on war griffins. The most feared unit on any battlefield.',
  hussars: 'Light cavalry in resplendent uniforms, armed with sabres. Masters of the lightning raid and pursuit.',
  riflemen: 'Disciplined soldiers armed with rifled muskets. Their accurate fire tears through formations at unprecedented range.',
  dragoons: 'Mounted infantry who ride to the fight then dismount to fire. Versatile troops combining mobility with firepower.',
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  full: { label: 'Full Strength', color: 'var(--accent-green)' },
  depleted: { label: 'Depleted', color: 'var(--accent-gold)' },
  broken: { label: 'Broken', color: 'var(--accent-red)' },
  destroyed: { label: 'Destroyed', color: 'var(--text-muted)' },
};

const VET_LABELS: Record<string, { label: string; color: string }> = {
  fresh: { label: 'Fresh', color: 'var(--text-muted)' },
  regular: { label: 'Regular', color: 'var(--text-secondary)' },
  veteran: { label: 'Veteran', color: 'var(--accent-blue)' },
  elite: { label: 'Elite', color: 'var(--accent-gold)' },
  legend: { label: 'Legend', color: 'var(--accent-red)' },
};

export function MilitaryTab() {
  const { slug } = useParams<{ slug: string }>();
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const armies = useStore(s => s.armies);
  const settlements = useStore(s => s.settlements);
  const pendingOrders = useStore(s => s.pendingOrders);
  const addRecruitment = useStore(s => s.addRecruitment);
  const removeRecruitment = useStore(s => s.removeRecruitment);
  const removeMovement = useStore(s => s.removeMovement);

  if (!player) {
    return <div><h2>Military</h2><p>Loading...</p></div>;
  }

  const myArmies = armies.filter((a: any) => a.ownerId === player.id);
  const mySettlements = settlements.filter((s: any) => s.ownerId === player.id);

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
          <span className="stat-label">Total Units</span>
          <span className="stat-detail">{totalUnits}</span>
        </div>
      </div>

      <h3 style={{ marginTop: 20 }}>Armies</h3>
      {myArmies.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No armies raised. Your realm stands undefended.</p>
      )}
      {myArmies.map((a: any) => (
        <ArmyCard
          key={a.id}
          slug={slug!}
          army={a}
          pendingOrders={pendingOrders}
          onCancelMovement={removeMovement}
        />
      ))}

      {/* Pending Recruitments */}
      {pendingOrders.recruitments.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Queued Recruitments</h3>
          {pendingOrders.recruitments.map((r, i) => {
            const settlement = mySettlements.find((s: any) => s.id === r.settlementId);
            return (
              <div key={i} className="settlement-card" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{formatName(r.unitType)} at {(settlement as any)?.name ?? '?'}</span>
                <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => removeRecruitment(i)}>Cancel</button>
              </div>
            );
          })}
        </>
      )}

      {/* Recruitment Panel */}
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
            storage={(s.storage ?? {}) as Record<string, number>}
            onRecruit={addRecruitment}
          />
        );
      })}

      {/* Pending Movements */}
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
    </div>
  );
}

/* ─── Army Card (expandable) ─── */

function ArmyCard({ slug, army, pendingOrders, onCancelMovement }: {
  slug: string;
  army: any;
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

  const units = (army.units as any[] | undefined) ?? [];
  const activeUnits = units.filter((u: any) => u.state !== 'destroyed');
  const hasPendingMove = pendingOrders.movements.some((m: any) => m.armyId === army.id);
  const hasGeneral = !!army.generalId;

  async function saveArmyField(field: 'name' | 'subtitle', value: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/army/${army.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ [field]: value }),
    });
    // Optimistic update
    setGameState({
      armies: armies.map((a: any) => a.id === army.id ? { ...a, [field]: value } : a),
    });
  }

  return (
    <div className="army-card">
      {/* Army Header — click to expand */}
      <div className="army-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="army-card-title-row">
          <span className="army-expand-icon">{expanded ? '▾' : '▸'}</span>
          <div className="army-card-titles">
            {editingName ? (
              <input
                className="army-name-input"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={() => { setEditingName(false); saveArmyField('name', nameValue); }}
                onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveArmyField('name', nameValue); } }}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <strong
                className="army-card-name"
                onDoubleClick={e => { e.stopPropagation(); setEditingName(true); setNameValue(army.name); }}
                title="Double-click to rename"
              >
                {army.name}
              </strong>
            )}
            {editingSubtitle ? (
              <input
                className="army-subtitle-input"
                value={subtitleValue}
                onChange={e => setSubtitleValue(e.target.value)}
                onBlur={() => { setEditingSubtitle(false); saveArmyField('subtitle', subtitleValue); }}
                onKeyDown={e => { if (e.key === 'Enter') { setEditingSubtitle(false); saveArmyField('subtitle', subtitleValue); } }}
                onClick={e => e.stopPropagation()}
                placeholder="Add a motto or subtitle..."
                autoFocus
              />
            ) : army.subtitle ? (
              <span
                className="army-card-subtitle"
                onDoubleClick={e => { e.stopPropagation(); setEditingSubtitle(true); setSubtitleValue(army.subtitle ?? ''); }}
                title="Double-click to edit"
              >
                {army.subtitle}
              </span>
            ) : (
              <span
                className="army-card-subtitle army-card-subtitle-empty"
                onDoubleClick={e => { e.stopPropagation(); setEditingSubtitle(true); setSubtitleValue(''); }}
                title="Double-click to add a motto"
              >
                Add a motto...
              </span>
            )}
          </div>
        </div>
        <div className="army-card-meta">
          <span className="army-card-count">{activeUnits.length} units</span>
          {hasPendingMove && <span className="army-card-badge army-badge-moving">Moving</span>}
          {!hasGeneral && <span className="army-card-badge army-badge-warning">No General</span>}
          <span className="army-card-coord">({army.hexQ}, {army.hexR})</span>
        </div>
      </div>

      {/* Expanded unit roster */}
      {expanded && (
        <div className="army-unit-roster">
          {activeUnits.length === 0 && (
            <p className="army-empty-roster">This army has no active units.</p>
          )}
          {activeUnits.map((u: any) => (
            <UnitRow key={u.id} unit={u} slug={slug} armyId={army.id} />
          ))}
          <div className="army-supply-bar">
            <span>Supply: {army.supplyBank}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Unit Row (within army) ─── */

function UnitRow({ unit, slug, armyId }: { unit: any; slug: string; armyId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [nameValue, setNameValue] = useState(unit.name ?? '');
  const [subtitleValue, setSubtitleValue] = useState(unit.subtitle ?? '');
  const setGameState = useStore(s => s.setGameState);
  const armies = useStore(s => s.armies);

  const stats = UNITS[unit.type as UnitType];
  const stateInfo = STATE_LABELS[unit.state] ?? STATE_LABELS.full;
  const vetInfo = VET_LABELS[unit.veterancy] ?? VET_LABELS.fresh;
  const vetBonus = VETERANCY_BONUS[unit.veterancy] ?? 0;
  const description = UNIT_DESCRIPTIONS[unit.type] ?? '';
  const displayName = unit.name || formatName(unit.type);

  async function saveUnitField(field: 'name' | 'subtitle', value: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/unit/${unit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ [field]: value }),
    });
    // Optimistic update
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
            <input
              className="unit-name-input"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={() => { setEditingName(false); saveUnitField('name', nameValue); }}
              onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); saveUnitField('name', nameValue); } }}
              onClick={e => e.stopPropagation()}
              placeholder={formatName(unit.type)}
              autoFocus
            />
          ) : (
            <span
              className="unit-row-name"
              onDoubleClick={e => { e.stopPropagation(); setEditingName(true); setNameValue(unit.name ?? ''); }}
              title="Double-click to rename"
            >
              {displayName}
            </span>
          )}
          {unit.name && (
            <span className="unit-row-type">{formatName(unit.type)}</span>
          )}
        </div>
        <div className="unit-row-badges">
          <span className="unit-strength-bar" title={`${unit.strengthPct}% strength`}>
            <span className="unit-strength-fill" style={{ width: `${unit.strengthPct}%`, background: stateInfo.color }} />
          </span>
          <span className="unit-vet-badge" style={{ color: vetInfo.color }}>{vetInfo.label}</span>
        </div>
      </div>

      {expanded && (
        <div className="unit-detail-panel">
          {/* Subtitle / motto */}
          <div className="unit-subtitle-row">
            {editingSubtitle ? (
              <input
                className="unit-subtitle-input"
                value={subtitleValue}
                onChange={e => setSubtitleValue(e.target.value)}
                onBlur={() => { setEditingSubtitle(false); saveUnitField('subtitle', subtitleValue); }}
                onKeyDown={e => { if (e.key === 'Enter') { setEditingSubtitle(false); saveUnitField('subtitle', subtitleValue); } }}
                placeholder='e.g. "Unbroken Since Edenmoor"'
                autoFocus
              />
            ) : (
              <span
                className={`unit-subtitle-text ${unit.subtitle ? '' : 'unit-subtitle-empty'}`}
                onDoubleClick={() => { setEditingSubtitle(true); setSubtitleValue(unit.subtitle ?? ''); }}
                title="Double-click to add a subtitle"
              >
                {unit.subtitle || 'Add a battle cry or motto...'}
              </span>
            )}
          </div>

          {/* Description */}
          {description && (
            <p className="unit-description">{description}</p>
          )}

          {/* Stats */}
          {stats && (
            <div className="unit-stats-grid">
              <div className="unit-stat"><span className="unit-stat-label">Fire</span><span className="unit-stat-value">{stats.fire}</span></div>
              <div className="unit-stat"><span className="unit-stat-label">Shock</span><span className="unit-stat-value">{stats.shock}</span></div>
              <div className="unit-stat"><span className="unit-stat-label">Defence</span><span className="unit-stat-value">{stats.defence}</span></div>
              <div className="unit-stat"><span className="unit-stat-label">Morale</span><span className="unit-stat-value">{stats.morale}</span></div>
              <div className="unit-stat"><span className="unit-stat-label">Armour</span><span className="unit-stat-value">{stats.armour}</span></div>
              <div className="unit-stat"><span className="unit-stat-label">AP</span><span className="unit-stat-value">{stats.ap}</span></div>
              <div className="unit-stat"><span className="unit-stat-label">Hits On</span><span className="unit-stat-value">{stats.hitsOn - vetBonus}+</span></div>
              <div className="unit-stat"><span className="unit-stat-label">Position</span><span className="unit-stat-value" style={{ textTransform: 'capitalize' }}>{unit.position}</span></div>
            </div>
          )}

          {/* Status line */}
          <div className="unit-status-line">
            <span style={{ color: stateInfo.color }}>{stateInfo.label} ({unit.strengthPct}%)</span>
            <span>XP: {unit.xp}</span>
            <span>Era: {stats?.era ? formatName(stats.era) : '?'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Recruit Panel ─── */

function RecruitPanel({ settlement, armies, storage, onRecruit }: {
  settlement: any;
  armies: any[];
  storage: Record<string, number>;
  onRecruit: (settlementId: string, armyId: string, unitType: string) => void;
}) {
  const [selectedType, setSelectedType] = useState<string>('spearmen');
  const [selectedArmy, setSelectedArmy] = useState<string>(armies[0]?.id ?? '');

  const availableTypes = (Object.entries(UNITS) as [string, any][]).filter(([, def]) => {
    return def.equipment.every((e: string) => (storage[e] ?? 0) >= 1);
  });

  if (availableTypes.length === 0) {
    return (
      <div className="settlement-card" style={{ marginTop: 8 }}>
        <strong>{settlement.name}</strong>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          No equipment available for recruitment
        </p>
      </div>
    );
  }

  return (
    <div className="settlement-card" style={{ marginTop: 8 }}>
      <strong>{settlement.name}</strong>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="input"
          style={{ flex: 1, minWidth: 120, padding: '4px 8px' }}
        >
          {availableTypes.map(([type]) => (
            <option key={type} value={type}>{formatName(type)}</option>
          ))}
        </select>
        <select
          value={selectedArmy}
          onChange={(e) => setSelectedArmy(e.target.value)}
          className="input"
          style={{ flex: 1, minWidth: 120, padding: '4px 8px' }}
        >
          {armies.map((a: any) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          style={{ padding: '4px 12px', fontSize: 13 }}
          onClick={() => {
            if (selectedArmy && selectedType) {
              onRecruit(settlement.id, selectedArmy, selectedType);
            }
          }}
        >
          Recruit
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        Cost: 200gp + equipment
      </div>
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
