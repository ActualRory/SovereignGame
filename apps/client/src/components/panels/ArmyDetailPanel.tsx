import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  WEAPONS, SHIELDS, ARMOUR_TYPES, MOUNT_TYPES,
  HORSE_BREEDS, GRYPHON_BREEDS, RANGED_WEAPONS,
  computeUnitStats, MEN_PER_COMPANY, MEN_PER_SQUADRON,
  STATE_DICE_MULTIPLIER,
  type UnitTemplate, type TroopCounts,
  type WeaponType, type ShieldType, type ArmourType, type MountType,
} from '@kingdoms/shared';
import { Tooltip } from '../shared/Tooltip.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function totalTroops(t: TroopCounts): number {
  return t.rookie + t.capable + t.veteran;
}

/** Stat key, display label, tooltip description. Shared across stat displays. */
const STAT_DISPLAY: Array<[string, string, string]> = [
  ['fire', 'Fire', 'Ranged attack power. More dice in the fire phase.'],
  ['shock', 'Shock', 'Melee attack power. More dice in the shock phase.'],
  ['defence', 'Def', 'Reduces incoming damage and improves survivability.'],
  ['morale', 'Mor', 'Morale threshold (d20). Units that fail break and rout.'],
  ['armour', 'Arm', 'Raises the to-hit threshold enemies need to wound this unit.'],
  ['ap', 'AP', 'Armour Piercing. Lowers the target\u2019s effective armour.'],
  ['hitsOn', 'THAC0', 'To Hit Armour Class 0. Base d20 threshold to land a hit \u2014 lower is better. Modified by armour and AP.'],
];

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  full: { label: 'Full Strength', color: 'var(--accent-green)' },
  depleted: { label: 'Depleted', color: 'var(--accent-gold)' },
  broken: { label: 'Broken', color: 'var(--accent-red)' },
  destroyed: { label: 'Destroyed', color: 'var(--text-muted)' },
};

function getEquipmentLabel(
  slotType: WeaponType | ShieldType | ArmourType | MountType | null,
): string {
  if (!slotType) return '—';
  return fmt(slotType);
}

function getUnitTypeSymbol(tmpl: UnitTemplate | null): { symbol: string; label: string } {
  if (!tmpl) return { symbol: '?', label: 'Unknown' };
  if (tmpl.isIrregular) return { symbol: '~', label: 'Irregular' };
  if (tmpl.isMounted) return { symbol: '⫽', label: 'Cavalry' };
  if (tmpl.primary && RANGED_WEAPONS.has(tmpl.primary as WeaponType))
    return { symbol: '●', label: 'Ranged' };
  return { symbol: '✕', label: 'Infantry' };
}

// ─── ArmyDetailPanel ──────────────────────────────────────────────────────

/**
 * Right-side panel showing full army details with TO&E breakdown.
 * Opened via right-click → Examine on an army.
 */
export function ArmyDetailPanel() {
  const detailPanelArmyId = useStore(s => s.detailPanelArmyId);
  const setDetailPanelArmyId = useStore(s => s.setDetailPanelArmyId);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const unitTemplates = useStore(s => s.unitTemplates) as UnitTemplate[];
  const nobles = useStore(s => s.nobles) as any[] | undefined;
  const selectedArmyId = useStore(s => s.selectedArmyId);
  const setSelectedArmyId = useStore(s => s.setSelectedArmyId);
  const setIsSelectingMoveTarget = useStore(s => s.setIsSelectingMoveTarget);

  if (!detailPanelArmyId) return null;

  const army = armies.find((a: any) => a.id === detailPanelArmyId) as any;
  if (!army) return null;

  const playerId = player?.id as string | undefined;
  const isOwn = army.ownerId === playerId;
  const armyOwner = players.find((p: any) => p.id === army.ownerId) as any;
  const commander = nobles?.find((n: any) => n.id === army.commanderNobleId);
  const units = ((army.units ?? []) as any[]).filter((u: any) => u.state !== 'destroyed');
  const isSelected = selectedArmyId === army.id;

  // Army-level totals
  const armyTotalMen = units.reduce((sum: number, u: any) => {
    const tc: TroopCounts = u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 };
    return sum + totalTroops(tc);
  }, 0);
  const armyMaxMen = units.reduce((sum: number, u: any) => {
    const tmpl = unitTemplates.find(t => t.id === u.templateId);
    if (!tmpl) return sum + 100;
    return sum + (tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY);
  }, 0);

  return (
    <div className="side-panel">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{army.name}</h3>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: 13 }}
          onClick={() => setDetailPanelArmyId(null)}
        >
          Close
        </button>
      </div>

      {army.subtitle && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
          "{army.subtitle}"
        </div>
      )}

      {/* Owner */}
      {armyOwner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13 }}>
          <span className="player-color" style={{ background: armyOwner.color }} />
          <span style={{ color: 'var(--text-secondary)' }}>{armyOwner.countryName}</span>
        </div>
      )}

      {/* Army summary */}
      <div className="army-examine-summary">
        <div className="army-examine-stat">
          <span className="army-examine-stat-value">{units.length}</span>
          <span className="army-examine-stat-label">Units</span>
        </div>
        <div className="army-examine-stat">
          <span className="army-examine-stat-value">{armyTotalMen.toLocaleString()}</span>
          <span className="army-examine-stat-label">/ {armyMaxMen.toLocaleString()} Men</span>
        </div>
        <div className="army-examine-stat">
          <span className="army-examine-stat-value">{army.supplyBank}</span>
          <span className="army-examine-stat-label">Supply</span>
        </div>
      </div>

      {/* Commander */}
      {commander ? (
        <div className="army-examine-general">
          <span style={{ color: 'var(--accent-gold)' }}>{fmt(commander.rank)} {commander.name}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>M:{commander.martial} I:{commander.intelligence} C:{commander.cunning}</span>
        </div>
      ) : (
        <div className="army-examine-general" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No commander assigned
        </div>
      )}

      {/* Location */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Location: ({army.hexQ}, {army.hexR})
      </div>

      {/* Quick actions for own army */}
      {isOwn && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {!isSelected && (
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => setSelectedArmyId(army.id)}>
              Select
            </button>
          )}
          {isSelected && (
            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => { setIsSelectingMoveTarget(true); setDetailPanelArmyId(null); }}>
              Issue Move Order
            </button>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-color)', marginBottom: 12 }} />

      {/* Unit roster */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
        Unit Roster
      </div>

      {units.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>No active units.</p>
      )}

      {units.map((u: any) => (
        <ArmyPanelUnitCard key={u.id} unit={u} templates={unitTemplates} nobles={nobles} />
      ))}
    </div>
  );
}

// ─── Unit Card (within army panel) ────────────────────────────────────────

function ArmyPanelUnitCard({ unit, templates, nobles }: {
  unit: any;
  templates: UnitTemplate[];
  nobles: any[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const tmpl = templates.find(t => t.id === unit.templateId);
  const typeInfo = getUnitTypeSymbol(tmpl ?? null);
  const tc: TroopCounts = unit.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 };
  const total = totalTroops(tc);
  const maxTroops = tmpl
    ? (tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY)
    : 100;
  const pct = maxTroops > 0 ? Math.round((total / maxTroops) * 100) : 0;
  const stateInfo = STATE_LABELS[unit.state] ?? STATE_LABELS.full;
  const diceMultiplier = STATE_DICE_MULTIPLIER[unit.state] ?? 1;
  const stats = tmpl ? computeUnitStats(tmpl) : null;
  const displayName = unit.name || tmpl?.name || 'Unknown Unit';
  const officer = nobles?.find((n: any) => n.assignmentType === 'unit_ic' && n.assignedEntityId === unit.id);

  const held = unit.heldEquipment ?? { primary: 0, secondary: 0, sidearm: 0, armour: 0, mounts: 0 };

  // Build equipment rows
  const equipRows: Array<{ label: string; held: number; required: number; icon: string }> = [];
  if (tmpl && !tmpl.isIrregular) {
    if (tmpl.primary) {
      equipRows.push({ label: getEquipmentLabel(tmpl.primary), held: held.primary, required: maxTroops, icon: '⚔' });
    }
    if ((tmpl as any).secondary) {
      equipRows.push({
        label: getEquipmentLabel((tmpl as any).secondary),
        held: held.secondary, required: maxTroops,
        icon: (SHIELDS as any)[(tmpl as any).secondary] ? '🛡' : '⚔',
      });
    }
    if (tmpl.sidearm) {
      equipRows.push({ label: getEquipmentLabel(tmpl.sidearm), held: held.sidearm, required: maxTroops, icon: '🗡' });
    }
    if (tmpl.armour) {
      equipRows.push({ label: fmt(tmpl.armour), held: held.armour, required: maxTroops, icon: '🛡' });
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
    <div className="army-examine-unit">
      {/* Unit header — always visible */}
      <div className="army-examine-unit-header" onClick={() => setExpanded(!expanded)}>
        <span className="army-examine-unit-symbol" style={{ color: stateInfo.color }}>{typeInfo.symbol}</span>
        <div className="army-examine-unit-identity">
          <span className="army-examine-unit-name">{displayName}</span>
          {unit.name && tmpl && <span className="army-examine-unit-type">{tmpl.name}</span>}
        </div>
        <div className="army-examine-unit-strength">
          <span style={{ color: stateInfo.color }}>{total}/{maxTroops}</span>
          <Tooltip content={
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{stateInfo.label} ({pct}%)</div>
              <div>Rookie: {tc.rookie} · Capable: {tc.capable} · Veteran: {tc.veteran}</div>
            </div>
          }>
            <div className="army-examine-unit-bar">
              <div className="army-examine-unit-bar-fill" style={{ width: `${pct}%`, background: stateInfo.color }} />
            </div>
          </Tooltip>
        </div>
        <span className="army-examine-unit-chevron">{expanded ? '▾' : '▸'}</span>
      </div>

      {/* Expanded TO&E */}
      {expanded && (
        <div className="army-examine-unit-detail">
          {unit.subtitle && (
            <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: 8 }}>
              "{unit.subtitle}"
            </div>
          )}

          {/* Troop tiers */}
          <div className="army-examine-tiers">
            <div className="army-examine-tier-row">
              <span className="army-examine-tier-label" style={{ color: 'var(--text-muted)' }}>Rookie</span>
              <div className="army-examine-tier-track">
                <div className="army-examine-tier-fill" style={{ width: `${(tc.rookie / maxTroops) * 100}%`, background: 'var(--text-muted)' }} />
              </div>
              <span className="army-examine-tier-count">{tc.rookie}</span>
            </div>
            <div className="army-examine-tier-row">
              <span className="army-examine-tier-label" style={{ color: 'var(--accent-blue)' }}>Capable</span>
              <div className="army-examine-tier-track">
                <div className="army-examine-tier-fill" style={{ width: `${(tc.capable / maxTroops) * 100}%`, background: 'var(--accent-blue)' }} />
              </div>
              <span className="army-examine-tier-count">{tc.capable}</span>
            </div>
            <div className="army-examine-tier-row">
              <span className="army-examine-tier-label" style={{ color: 'var(--accent-gold)' }}>Veteran</span>
              <div className="army-examine-tier-track">
                <div className="army-examine-tier-fill" style={{ width: `${(tc.veteran / maxTroops) * 100}%`, background: 'var(--accent-gold)' }} />
              </div>
              <span className="army-examine-tier-count">{tc.veteran}</span>
            </div>
          </div>

          {/* Equipment */}
          {equipRows.length > 0 && (
            <div className="army-examine-equip-section">
              <div className="army-examine-equip-header">
                <span />
                <span />
                <span className="army-examine-equip-col">Held</span>
                <span className="army-examine-equip-col">Req.</span>
              </div>
              {equipRows.map((row, i) => {
                const shortage = row.required - row.held;
                return (
                  <div key={i} className="army-examine-equip-row">
                    <span className="army-examine-equip-icon">{row.icon}</span>
                    <span className="army-examine-equip-name">{row.label}</span>
                    <span className={`army-examine-equip-count ${shortage > 0 ? 'army-examine-equip-shortage' : ''}`}>{row.held}</span>
                    <span className="army-examine-equip-count">{row.required}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="army-examine-stats">
              {STAT_DISPLAY.map(([key, label, tip]) => (
                <Tooltip key={key} content={<span style={{ fontSize: 11 }}>{tip}</span>}>
                  <div className="army-examine-stat-cell" style={{ cursor: 'help' }}>
                    <div className="army-examine-stat-cell-label">{label}</div>
                    <div className="army-examine-stat-cell-value">{key === 'hitsOn' ? `${(stats as any)[key]}+` : (stats as any)[key]}</div>
                  </div>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Status line */}
          <div className="army-examine-status">
            <span>Dice: x{diceMultiplier}</span>
            <span>{fmt(unit.position ?? 'frontline')}</span>
            <span>XP: {unit.xp ?? 0}</span>
            {officer && (
              <span style={{ color: 'var(--accent-gold)' }}>
                {fmt(officer.rank ?? 'major')}. {officer.name}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
