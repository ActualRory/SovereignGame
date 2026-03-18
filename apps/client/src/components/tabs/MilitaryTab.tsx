import { useState } from 'react';
import { useStore } from '../../store/index.js';
import { UNITS, type UnitType } from '@kingdoms/shared';

export function MilitaryTab() {
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

  // Count total units across all armies
  const totalUnits = myArmies.reduce((sum: number, a: any) =>
    sum + (a.units?.length ?? a.unitCount ?? 0), 0
  );

  return (
    <div className="military-tab">
      <h2>Military</h2>

      {/* Overview */}
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

      {/* Armies */}
      <h3 style={{ marginTop: 20 }}>Armies</h3>
      {myArmies.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No armies</p>
      )}
      {myArmies.map((a: any) => (
        <ArmyCard key={a.id} army={a} pendingOrders={pendingOrders} onCancelMovement={removeMovement} />
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
            return (
              <div key={m.armyId} className="settlement-card" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{(army as any)?.name ?? '?'} → ({m.path[m.path.length - 1]?.q}, {m.path[m.path.length - 1]?.r})</span>
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

function ArmyCard({ army, pendingOrders, onCancelMovement }: {
  army: any;
  pendingOrders: any;
  onCancelMovement: (armyId: string) => void;
}) {
  const units = army.units as any[] | undefined;
  const hasPendingMove = pendingOrders.movements.some((m: any) => m.armyId === army.id);

  return (
    <div className="settlement-card" style={{ marginTop: 8 }}>
      <div className="settlement-header">
        <strong>{army.name}</strong>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          ({army.hexQ}, {army.hexR})
        </span>
      </div>
      <div className="settlement-stats">
        <span>{units?.length ?? army.unitCount ?? 0} units</span>
        <span>Supply: {army.supplyBank}</span>
        {hasPendingMove && <span style={{ color: 'var(--accent-blue)' }}>Moving</span>}
      </div>
      {units && units.length > 0 && (
        <div className="settlement-resources" style={{ marginTop: 6 }}>
          {units.map((u: any) => (
            <span key={u.id} className="resource-tag">
              {formatName(u.type)} {u.strengthPct < 100 ? `(${u.strengthPct}%)` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RecruitPanel({ settlement, armies, storage, onRecruit }: {
  settlement: any;
  armies: any[];
  storage: Record<string, number>;
  onRecruit: (settlementId: string, armyId: string, unitType: string) => void;
}) {
  const [selectedType, setSelectedType] = useState<string>('spearmen');
  const [selectedArmy, setSelectedArmy] = useState<string>(armies[0]?.id ?? '');

  // Show only unit types whose equipment is available
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
