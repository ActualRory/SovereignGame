import { useStore } from '../../store/index.js';
import { TECH_TREE, ERA_THRESHOLDS, getTechsForEra, type TechId, type TechEra } from '@kingdoms/shared';

const ERA_LABELS: Record<TechEra, string> = { early: 'Early Era', middle: 'Middle Era', late: 'Late Era' };
const ERA_COLORS: Record<TechEra, string> = { early: 'var(--accent-green)', middle: 'var(--accent-blue)', late: 'var(--accent-red)' };

export function TechTab() {
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const techProgress = useStore(s => s.techProgress);
  const pendingOrders = useStore(s => s.pendingOrders);
  const setPendingOrders = useStore(s => s.setPendingOrders);

  if (!player) return <div><h2>Technology</h2><p>Loading...</p></div>;

  const researched = new Set<string>();
  const progressMap = new Map<string, { points: number; isResearched: boolean }>();
  for (const tp of techProgress) {
    const t = tp as any;
    progressMap.set(t.tech, { points: t.researchPoints, isResearched: t.isResearched });
    if (t.isResearched) researched.add(t.tech);
  }

  const currentResearch = pendingOrders.techResearch ?? (player.currentResearch as string | null);

  // Count researched per era for unlock checks
  const researchedByEra: Record<TechEra, number> = { early: 0, middle: 0, late: 0 };
  for (const techId of researched) {
    const def = TECH_TREE[techId as TechId];
    if (def) researchedByEra[def.era]++;
  }

  const middleUnlocked = researchedByEra.early >= ERA_THRESHOLDS.early.required;
  const lateUnlocked = middleUnlocked && researchedByEra.middle >= ERA_THRESHOLDS.middle.required;

  function canResearch(techId: TechId): boolean {
    if (researched.has(techId)) return false;
    const def = TECH_TREE[techId];
    if (!def) return false;
    // Era check
    if (def.era === 'middle' && !middleUnlocked) return false;
    if (def.era === 'late' && !lateUnlocked) return false;
    // Prerequisites
    return def.prerequisites.every(p => researched.has(p));
  }

  function selectTech(techId: TechId) {
    if (!canResearch(techId)) return;
    setPendingOrders({ techResearch: currentResearch === techId ? null : techId });
  }

  return (
    <div className="tech-tab">
      <h2>Technology</h2>

      {/* Current research */}
      {currentResearch && (
        <div className="settlement-card" style={{ marginTop: 8 }}>
          <div className="settlement-header">
            <strong>Researching: {TECH_TREE[currentResearch as TechId]?.name ?? currentResearch}</strong>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {progressMap.get(currentResearch)?.points ?? 0} / {TECH_TREE[currentResearch as TechId]?.researchCost ?? '?'} pts
            </span>
          </div>
          <div style={{ marginTop: 4, height: 6, background: 'var(--border-color)', borderRadius: 3 }}>
            <div style={{
              height: '100%', borderRadius: 3, background: 'var(--accent-blue)',
              width: `${Math.min(100, ((progressMap.get(currentResearch)?.points ?? 0) / (TECH_TREE[currentResearch as TechId]?.researchCost ?? 1)) * 100)}%`,
            }} />
          </div>
        </div>
      )}

      {/* Tech tree by era */}
      {(['early', 'middle', 'late'] as TechEra[]).map(era => {
        const isLocked = (era === 'middle' && !middleUnlocked) || (era === 'late' && !lateUnlocked);
        const techs = getTechsForEra(era);
        const threshold = ERA_THRESHOLDS[era];

        return (
          <div key={era} style={{ marginTop: 20 }}>
            <h3 style={{ color: ERA_COLORS[era], display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {ERA_LABELS[era]}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 'normal' }}>
                {researchedByEra[era]}/{threshold.total} researched
                {era !== 'late' && ` (${threshold.required} needed for next era)`}
              </span>
            </h3>
            {isLocked && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                Locked — research more {era === 'middle' ? 'Early' : 'Middle'} era techs
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
              {techs.map(techId => {
                const def = TECH_TREE[techId];
                const isResearched = researched.has(techId);
                const isActive = currentResearch === techId;
                const available = canResearch(techId);
                const progress = progressMap.get(techId);

                return (
                  <div
                    key={techId}
                    className="settlement-card"
                    onClick={() => available && selectTech(techId)}
                    style={{
                      marginTop: 0, cursor: available ? 'pointer' : 'default',
                      opacity: isLocked ? 0.4 : isResearched ? 0.7 : 1,
                      borderColor: isActive ? 'var(--accent-blue)' : isResearched ? 'var(--accent-green)' : 'var(--border-color)',
                      borderWidth: isActive ? 2 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 14 }}>{def.name}</strong>
                      {isResearched && <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>Researched</span>}
                      {isActive && <span style={{ fontSize: 11, color: 'var(--accent-blue)' }}>Active</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{def.unlocks}</div>
                    {def.prerequisites.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Requires: {def.prerequisites.map(p => TECH_TREE[p]?.name ?? p).join(', ')}
                      </div>
                    )}
                    {!isResearched && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Cost: {def.researchCost} pts
                        {progress && progress.points > 0 && ` (${progress.points} done)`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
