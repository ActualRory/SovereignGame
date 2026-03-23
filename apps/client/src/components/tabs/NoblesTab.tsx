import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  RANK_DISPLAY_NAMES, TRAIT_DISPLAY_NAMES, PROMOTION_REQUIREMENTS,
  CUNNING_COST_REDUCTION_PER_POINT, NOBLE_HIRE_COST, getNextRank,
  getRankIndex, ARMY_IC_MIN_RANK, ARMY_2IC_MIN_RANK,
  type Noble, type NobleFamily, type NobleTraitKey, type NobleRank,
  type NobleAssignmentType,
} from '@kingdoms/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function rankName(rank: NobleRank): string {
  return RANK_DISPLAY_NAMES[rank] ?? fmt(rank);
}

const TRAIT_KEYS: NobleTraitKey[] = [
  'infantry_commander', 'cavalry_commander', 'naval_commander',
  'administrator', 'fire', 'shock', 'maneuver',
];

function statColor(val: number): string {
  if (val >= 8) return 'var(--accent-green)';
  if (val >= 5) return 'var(--text-primary)';
  if (val >= 3) return 'var(--accent-gold)';
  return 'var(--accent-red)';
}

/** Check if a noble meets the minimum rank for an assignment type. */
function meetsRankRequirement(noble: Noble, assignmentType: NobleAssignmentType): boolean {
  const nobleRankIdx = getRankIndex(noble.rank);
  switch (assignmentType) {
    case 'army_ic': return nobleRankIdx >= getRankIndex(ARMY_IC_MIN_RANK);
    case 'army_2ic': return nobleRankIdx >= getRankIndex(ARMY_2IC_MIN_RANK);
    case 'governor': return true; // any rank can govern
    default: return true;
  }
}

// ─── NoblesTab ────────────────────────────────────────────────────────────

export function NoblesTab() {
  const { slug } = useParams<{ slug: string }>();
  const nobles = useStore(s => s.nobles) as Noble[];
  const nobleFamilies = useStore(s => s.nobleFamilies) as NobleFamily[];
  const armies = useStore(s => s.armies) as any[];
  const settlements = useStore(s => s.settlements) as any[];
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const pendingOrders = useStore(s => s.pendingOrders);
  const setPendingOrders = useStore(s => s.setPendingOrders);

  const [selectedNobleId, setSelectedNobleId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'roster' | 'assign' | 'prisoners'>('roster');
  const [draggedNobleId, setDraggedNobleId] = useState<string | null>(null);

  const playerId = (player as any)?.id as string | undefined;
  const myNobles = nobles.filter(n => n.ownerId === playerId && n.isAlive && !n.captorPlayerId);
  const prisoners = nobles.filter(n => n.captorPlayerId === playerId && n.isAlive);
  const myPrisoners = nobles.filter(n => n.ownerId === playerId && n.captorPlayerId && n.isAlive);

  // Group nobles by family
  const familyMap = new Map<string | null, Noble[]>();
  for (const n of myNobles) {
    const key = n.familyId;
    if (!familyMap.has(key)) familyMap.set(key, []);
    familyMap.get(key)!.push(n);
  }

  const selectedNoble = nobles.find(n => n.id === selectedNobleId) ?? null;
  const draggedNoble = draggedNobleId ? nobles.find(n => n.id === draggedNobleId) ?? null : null;

  function addNobleOrder(order: Record<string, unknown>) {
    setPendingOrders({
      nobleOrders: [...pendingOrders.nobleOrders, order],
    });
  }

  // Check if a hire order is already pending
  const pendingHires = pendingOrders.nobleOrders.filter((o: any) => o.type === 'hire_noble');

  // ─── DnD handlers ──────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setDraggedNobleId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedNobleId(null);
    const { active, over } = event;
    if (!over) return;

    const nobleId = active.id as string;
    const noble = nobles.find(n => n.id === nobleId);
    if (!noble) return;

    // Parse drop target: "army_ic:armyId", "army_2ic:armyId", "governor:settlementId", "unassign"
    const dropId = over.id as string;

    if (dropId === 'noble-pool') {
      // Dropped back on pool = unassign
      if (noble.assignmentType !== 'unassigned') {
        addNobleOrder({ type: 'unassign_noble', nobleId });
      }
      return;
    }

    const [assignType, entityId] = dropId.split(':') as [string, string];
    if (!entityId) return;

    const assignmentType = assignType as NobleAssignmentType;
    if (!meetsRankRequirement(noble, assignmentType)) return;

    addNobleOrder({
      type: 'assign_noble',
      nobleId,
      assignmentType,
      entityId,
    });
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="tab-content nobles-tab">
        <h2>Nobles</h2>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['roster', 'assign', 'prisoners'] as const).map(tab => (
            <button
              key={tab}
              className={`btn ${subTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab(tab)}
            >
              {tab === 'roster' ? `Roster (${myNobles.length})` :
               tab === 'assign' ? 'Assign' :
               `Prisoners (${prisoners.length + myPrisoners.length})`}
            </button>
          ))}
        </div>

        {/* ─── Roster Sub-tab ─── */}
        {subTab === 'roster' && (
          <div className="nobles-roster">
            <div style={{ marginBottom: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => addNobleOrder({ type: 'hire_noble', branch: 'army' })}
                title={`Hire a new noble (${NOBLE_HIRE_COST}g)`}
              >
                Hire Noble ({NOBLE_HIRE_COST}g)
              </button>
              {pendingHires.length > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--accent-gold)', fontSize: 13 }}>
                  {pendingHires.length} pending hire{pendingHires.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {myNobles.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No nobles in your court. Build an Estate to generate nobles, or hire one directly.
              </p>
            ) : (
              Array.from(familyMap.entries()).map(([familyId, members]) => {
                const family = familyId ? nobleFamilies.find(f => f.id === familyId) : null;
                return (
                  <div key={familyId ?? 'unaffiliated'} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                      {family ? `House ${family.surname}` : 'Unaffiliated'}
                      {family && <span style={{ marginLeft: 8, fontSize: 11 }}>Rep: {family.reputation}</span>}
                    </div>
                    {members.map(noble => (
                      <NobleCard
                        key={noble.id}
                        noble={noble}
                        isSelected={selectedNobleId === noble.id}
                        onClick={() => setSelectedNobleId(selectedNobleId === noble.id ? null : noble.id)}
                        armies={armies}
                        settlements={settlements}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ─── Assign Sub-tab (DnD) ─── */}
        {subTab === 'assign' && (
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Left: Noble pool (draggable source + unassign drop target) */}
            <div style={{ flex: '0 0 280px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Noble Pool — drag to assign
              </div>
              <NoblePoolDropTarget>
                {myNobles.filter(n => n.assignmentType === 'unassigned').length === 0 ? (
                  <div style={{ padding: 12, color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
                    All nobles assigned. Drag here to unassign.
                  </div>
                ) : (
                  myNobles.filter(n => n.assignmentType === 'unassigned').map(noble => (
                    <DraggableNobleCard key={noble.id} noble={noble} armies={armies} settlements={settlements} />
                  ))
                )}
                {/* Also show assigned nobles (greyed out, still draggable for reassignment) */}
                {myNobles.filter(n => n.assignmentType !== 'unassigned').length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, marginBottom: 4, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                      Currently Assigned
                    </div>
                    {myNobles.filter(n => n.assignmentType !== 'unassigned').map(noble => (
                      <DraggableNobleCard key={noble.id} noble={noble} armies={armies} settlements={settlements} assigned />
                    ))}
                  </>
                )}
              </NoblePoolDropTarget>
            </div>

            {/* Right: Assignment slots */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Armies */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Armies
              </div>
              {armies.filter((a: any) => a.ownerId === playerId).map((army: any) => {
                const ic = myNobles.find(n => n.assignmentType === 'army_ic' && n.assignedEntityId === army.id);
                const secondIc = myNobles.find(n => n.assignmentType === 'army_2ic' && n.assignedEntityId === army.id);
                return (
                  <div key={army.id} style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{army.name}</div>
                    <AssignmentSlot
                      dropId={`army_ic:${army.id}`}
                      label="Commander (IC)"
                      currentNoble={ic}
                      draggedNoble={draggedNoble}
                      assignmentType="army_ic"
                    />
                    <AssignmentSlot
                      dropId={`army_2ic:${army.id}`}
                      label="Second-in-Command (2IC)"
                      currentNoble={secondIc}
                      draggedNoble={draggedNoble}
                      assignmentType="army_2ic"
                    />
                  </div>
                );
              })}

              {/* Settlements (Governor) */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, marginTop: 16 }}>
                Settlements
              </div>
              {settlements.filter((s: any) => s.ownerId === playerId).map((settlement: any) => {
                const governor = myNobles.find(n => n.assignmentType === 'governor' && n.assignedEntityId === settlement.id);
                return (
                  <div key={settlement.id} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{settlement.name}</div>
                    <AssignmentSlot
                      dropId={`governor:${settlement.id}`}
                      label="Governor"
                      currentNoble={governor}
                      draggedNoble={draggedNoble}
                      assignmentType="governor"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Prisoners Sub-tab ─── */}
        {subTab === 'prisoners' && (
          <div>
            {prisoners.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Captured Enemies</h3>
                {prisoners.map(noble => (
                  <NobleCard
                    key={noble.id}
                    noble={noble}
                    isSelected={selectedNobleId === noble.id}
                    onClick={() => setSelectedNobleId(selectedNobleId === noble.id ? null : noble.id)}
                    armies={armies}
                    settlements={settlements}
                    isPrisoner
                  />
                ))}
              </>
            )}
            {myPrisoners.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 16, marginBottom: 8 }}>Your Captured Nobles</h3>
                {myPrisoners.map(noble => (
                  <NobleCard
                    key={noble.id}
                    noble={noble}
                    isSelected={selectedNobleId === noble.id}
                    onClick={() => setSelectedNobleId(selectedNobleId === noble.id ? null : noble.id)}
                    armies={armies}
                    settlements={settlements}
                    isCaptured
                  />
                ))}
              </>
            )}
            {prisoners.length === 0 && myPrisoners.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No prisoners.</p>
            )}
          </div>
        )}

        {/* Detail Panel */}
        {selectedNoble && (
          <NobleDetailPanel
            noble={selectedNoble}
            families={nobleFamilies}
            armies={armies}
            settlements={settlements}
            pendingOrders={pendingOrders}
            addNobleOrder={addNobleOrder}
            onClose={() => setSelectedNobleId(null)}
          />
        )}
      </div>

      {/* Drag overlay — floating noble card that follows cursor */}
      <DragOverlay>
        {draggedNoble && (
          <div style={{
            padding: '6px 10px', background: 'var(--bg-panel)', border: '2px solid var(--accent-gold)',
            borderRadius: 4, opacity: 0.9, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <span style={{ color: 'var(--accent-gold)' }}>{rankName(draggedNoble.rank)}</span>{' '}
            {draggedNoble.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── DnD: Noble Pool Drop Target ─────────────────────────────────────────

function NoblePoolDropTarget({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'noble-pool' });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 80, padding: 4, borderRadius: 4,
        border: `2px dashed ${isOver ? 'var(--accent-gold)' : 'transparent'}`,
        background: isOver ? 'rgba(255,215,0,0.05)' : 'transparent',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {children}
    </div>
  );
}

// ─── DnD: Draggable Noble Card ───────────────────────────────────────────

function DraggableNobleCard({ noble, armies, settlements, assigned }: {
  noble: Noble; armies: any[]; settlements: any[]; assigned?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: noble.id,
  });
  const assignmentLabel = getAssignmentLabel(noble, armies, settlements);

  const style: React.CSSProperties = {
    padding: '6px 10px',
    marginBottom: 3,
    background: assigned ? 'var(--bg-surface)' : 'var(--bg-inset)',
    border: `1px solid var(--border-color)`,
    borderRadius: 4,
    cursor: 'grab',
    opacity: isDragging ? 0.4 : assigned ? 0.7 : 1,
    fontSize: 13,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>{rankName(noble.rank)}</span>{' '}
      <span>{noble.name}</span>
      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        M:{noble.martial} I:{noble.intelligence} C:{noble.cunning}
      </span>
      {assigned && (
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-blue)' }}>
          [{assignmentLabel}]
        </span>
      )}
    </div>
  );
}

// ─── DnD: Assignment Slot (Droppable) ────────────────────────────────────

function AssignmentSlot({ dropId, label, currentNoble, draggedNoble, assignmentType }: {
  dropId: string;
  label: string;
  currentNoble: Noble | undefined;
  draggedNoble: Noble | null;
  assignmentType: NobleAssignmentType;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  // Visual feedback: valid/invalid drop
  const isValidDrop = draggedNoble ? meetsRankRequirement(draggedNoble, assignmentType) : true;
  const borderColor = isOver
    ? (isValidDrop ? 'var(--accent-green)' : 'var(--accent-red)')
    : 'var(--border-color)';

  return (
    <div
      ref={setNodeRef}
      style={{
        padding: '6px 8px',
        marginBottom: 4,
        border: `1px dashed ${borderColor}`,
        borderRadius: 4,
        background: isOver ? (isValidDrop ? 'rgba(100,200,100,0.08)' : 'rgba(200,100,100,0.08)') : 'transparent',
        transition: 'border-color 0.15s, background 0.15s',
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 90 }}>{label}:</span>
      {currentNoble ? (
        <span style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--accent-gold)' }}>{rankName(currentNoble.rank)}</span>{' '}
          {currentNoble.name}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Empty — drag a noble here
        </span>
      )}
      {isOver && !isValidDrop && (
        <span style={{ fontSize: 11, color: 'var(--accent-red)', marginLeft: 'auto' }}>
          Rank too low
        </span>
      )}
    </div>
  );
}

// ─── Noble Card (non-draggable, for roster/prisoner views) ───────────────

function NobleCard({ noble, isSelected, onClick, armies, settlements, isPrisoner, isCaptured }: {
  noble: Noble;
  isSelected: boolean;
  onClick: () => void;
  armies: any[];
  settlements: any[];
  isPrisoner?: boolean;
  isCaptured?: boolean;
}) {
  const assignmentLabel = getAssignmentLabel(noble, armies, settlements);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 12px',
        marginBottom: 4,
        background: isSelected ? 'var(--bg-selected)' : 'var(--bg-inset)',
        border: `1px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-color)'}`,
        borderRadius: 4,
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>
          {rankName(noble.rank)}
        </span>{' '}
        <span style={{ color: 'var(--text-primary)' }}>{noble.name}</span>
        {noble.title && (
          <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>
            "{noble.title}"
          </span>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Age {noble.age} · {noble.branch === 'army' ? 'Army' : 'Navy'} · {assignmentLabel}
          {isPrisoner && <span style={{ color: 'var(--accent-red)', marginLeft: 6 }}>PRISONER</span>}
          {isCaptured && <span style={{ color: 'var(--accent-red)', marginLeft: 6 }}>CAPTURED</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
        <span style={{ color: statColor(noble.martial) }} title="Martial">M:{noble.martial}</span>
        <span style={{ color: statColor(noble.intelligence) }} title="Intelligence">I:{noble.intelligence}</span>
        <span style={{ color: statColor(noble.cunning) }} title="Cunning">C:{noble.cunning}</span>
      </div>
    </div>
  );
}

function getAssignmentLabel(noble: Noble, armies: any[], settlements: any[]): string {
  if (noble.captorPlayerId) return 'Captured';
  switch (noble.assignmentType) {
    case 'unassigned': return 'Unassigned';
    case 'army_ic': {
      const army = armies.find((a: any) => a.id === noble.assignedEntityId);
      return `IC: ${army?.name ?? 'Army'}`;
    }
    case 'army_2ic': {
      const army = armies.find((a: any) => a.id === noble.assignedEntityId);
      return `2IC: ${army?.name ?? 'Army'}`;
    }
    case 'unit_ic': return 'Unit IC';
    case 'unit_2ic': return 'Unit 2IC';
    case 'governor': {
      const settlement = settlements.find((s: any) => s.id === noble.assignedEntityId);
      return `Gov: ${settlement?.name ?? 'Settlement'}`;
    }
    default: return fmt(noble.assignmentType);
  }
}

// ─── Noble Detail Panel ──────────────────────────────────────────────────

function NobleDetailPanel({ noble, families, armies, settlements, pendingOrders, addNobleOrder, onClose }: {
  noble: Noble;
  families: NobleFamily[];
  armies: any[];
  settlements: any[];
  pendingOrders: any;
  addNobleOrder: (order: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const family = noble.familyId ? families.find(f => f.id === noble.familyId) : null;
  const nextRank = getNextRank(noble.rank, noble.branch);
  const promoReqs = PROMOTION_REQUIREMENTS[noble.rank];
  const assignmentLabel = getAssignmentLabel(noble, armies, settlements);

  const canPromote = nextRank && promoReqs &&
    noble.xp >= promoReqs.minXp &&
    noble.turnsInRank >= promoReqs.minTurnsInRank;

  const promoCost = promoReqs
    ? Math.round(promoReqs.baseGoldCost * (1 - noble.cunning * CUNNING_COST_REDUCTION_PER_POINT))
    : 0;

  const hasPromoPending = pendingOrders.nobleOrders.some(
    (o: any) => o.type === 'promote_noble' && o.nobleId === noble.id
  );

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 360, height: '100vh',
      background: 'var(--bg-panel)', borderLeft: '2px solid var(--border-color)',
      padding: 20, overflowY: 'auto', zIndex: 200,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{noble.name}</h3>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} onClick={onClose}>
          Close
        </button>
      </div>

      {noble.title && (
        <div style={{ fontSize: 13, color: 'var(--accent-gold)', fontStyle: 'italic', marginBottom: 8 }}>
          "{noble.title}"
        </div>
      )}

      {/* Identity */}
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        <div>{rankName(noble.rank)} · {noble.branch === 'army' ? 'Army' : 'Navy'}</div>
        <div>Age {noble.age} · {assignmentLabel}</div>
        {family && <div>House {family.surname} (Rep: {family.reputation})</div>}
      </div>

      {/* Stats */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Stats
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <StatBar label="Martial" value={noble.martial} />
          <StatBar label="Intelligence" value={noble.intelligence} />
          <StatBar label="Cunning" value={noble.cunning} />
        </div>
      </div>

      {/* Traits */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Traits
        </div>
        {TRAIT_KEYS.map(key => {
          const rank = noble.traits[key];
          if (rank === 0) return null;
          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
              <span>{TRAIT_DISPLAY_NAMES[key]}</span>
              <span style={{ color: 'var(--accent-gold)' }}>
                {'★'.repeat(rank)}{'☆'.repeat(5 - rank)}
              </span>
            </div>
          );
        })}
        {TRAIT_KEYS.every(k => noble.traits[k] === 0) && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No traits yet.</div>
        )}
      </div>

      {/* Progression */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Progression
        </div>
        <div style={{ fontSize: 13 }}>
          <div>XP: {noble.xp}</div>
          <div>Turns in rank: {noble.turnsInRank}</div>
        </div>
      </div>

      {/* Promotion */}
      {nextRank && promoReqs && (
        <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--bg-inset)', borderRadius: 4, border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Promote to {rankName(nextRank)}
          </div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: noble.xp >= promoReqs.minXp ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              XP: {noble.xp}/{promoReqs.minXp}
            </span>
            {' · '}
            <span style={{ color: noble.turnsInRank >= promoReqs.minTurnsInRank ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              Time: {noble.turnsInRank}/{promoReqs.minTurnsInRank} turns
            </span>
            {' · '}
            <span>Cost: {promoCost}g</span>
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '4px 12px' }}
            disabled={!canPromote || hasPromoPending}
            onClick={() => addNobleOrder({ type: 'promote_noble', nobleId: noble.id })}
          >
            {hasPromoPending ? 'Promotion Pending' : 'Promote'}
          </button>
        </div>
      )}

      {/* Assignment */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Assignment
        </div>
        <div style={{ fontSize: 13 }}>{assignmentLabel}</div>
        {noble.assignmentType !== 'unassigned' && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '3px 10px', marginTop: 6 }}
            onClick={() => addNobleOrder({ type: 'unassign_noble', nobleId: noble.id })}
          >
            Unassign
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={() => {
            const newName = prompt('Rename noble:', noble.name);
            if (newName && newName !== noble.name) {
              addNobleOrder({ type: 'rename_noble', nobleId: noble.id, name: newName });
            }
          }}
        >
          Rename
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={() => {
            const newTitle = prompt('Set title (e.g. "Duke of Ashenvale"):', noble.title ?? '');
            if (newTitle !== null) {
              addNobleOrder({ type: 'set_title', nobleId: noble.id, title: newTitle || null });
            }
          }}
        >
          Set Title
        </button>
      </div>
    </div>
  );
}

// ─── Stat Bar ─────────────────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: statColor(value) }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
