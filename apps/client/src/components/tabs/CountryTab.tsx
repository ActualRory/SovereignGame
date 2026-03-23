import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { getTurnLabel, getYear, getStabilityBand, BAND_CONSEQUENCES, BAND_COLORS } from '@kingdoms/shared';

const CHARGES = ['', 'lion', 'eagle', 'dragon', 'crown', 'sword', 'tower', 'stag', 'wolf', 'rose', 'anchor'];
const CHARGE_SYMBOLS: Record<string, string> = {
  '': '',
  lion: '\u{1F981}',
  eagle: '\u{1F985}',
  dragon: '\u{1F409}',
  crown: '\u{1F451}',
  sword: '\u{2694}',
  tower: '\u{1F3F0}',
  stag: '\u{1F98C}',
  wolf: '\u{1F43A}',
  rose: '\u{1F339}',
  anchor: '\u{2693}',
};

export function CountryTab() {
  const { slug } = useParams<{ slug: string }>();
  const game = useStore(s => s.game) as Record<string, unknown> | null;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const settlements = useStore(s => s.settlements);
  const diplomacyRelations = useStore(s => s.diplomacyRelations);

  if (!game || !player) {
    return <div><h2>Country</h2><p>Loading...</p></div>;
  }

  const currentTurn = (game.currentTurn as number) ?? 1;
  const turnLabel = getTurnLabel(currentTurn);
  const year = getYear(currentTurn);

  const mySettlements = settlements.filter(
    (s: any) => s.ownerId === player.id
  );
  const totalPop = mySettlements.reduce(
    (sum: number, s: any) => sum + (s.population ?? 0), 0
  );

  const stability = (player as any).stability ?? 100;
  const band = getStabilityBand(stability);
  const bandColor = BAND_COLORS[band];
  const consequences = BAND_CONSEQUENCES[band];

  const otherPlayers = players.filter((p: any) => p.id !== player.id);

  return (
    <div className="country-tab">
      <div className="country-header" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <FlagPreview flagData={(player as any).flagData} color={(player as any).color} />
        <div style={{ flex: 1 }}>
          <EditableName
            slug={slug!}
            player={player}
            field="countryName"
            label=""
            value={player.countryName as string}
            renderDisplay={(v) => <h2 style={{ cursor: 'pointer' }} title="Click to rename">{v}</h2>}
          />
          <EditableName
            slug={slug!}
            player={player}
            field="rulerName"
            label="Ruled by "
            value={player.rulerName as string}
            renderDisplay={(v) => (
              <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', cursor: 'pointer' }} title="Click to rename">
                Ruled by {v}
              </p>
            )}
          />
        </div>
      </div>

      <div className="country-stats">
        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Year {year}</span>
            <span className="stat-detail">{turnLabel}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Population</span>
            <span className="stat-detail">{totalPop.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gold</span>
            <span className="stat-detail">{((player as any).gold ?? 0).toLocaleString()} gp</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Tax Rate</span>
            <span className="stat-detail" style={{ textTransform: 'capitalize' }}>
              {(player as any).taxRate ?? 'low'}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Settlements</span>
            <span className="stat-detail">{mySettlements.length}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Stability</span>
            <span className="stat-detail" style={{ color: bandColor }}>{stability}%</span>
          </div>
        </div>
      </div>

      {/* Stability detail */}
      <div className="settlement-card" style={{ marginTop: 12 }}>
        <div className="settlement-header">
          <strong>Stability</strong>
          <span className="stability-band-label" style={{ color: bandColor }}>
            {band.charAt(0).toUpperCase() + band.slice(1)}
          </span>
        </div>
        <div className="stability-bar">
          <div
            className="stability-bar-fill"
            style={{ width: `${stability}%`, background: bandColor }}
          />
        </div>
        {consequences.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            {consequences.map((c, i) => (
              <div key={i} style={{ marginTop: 2 }}>&#x2022; {c}</div>
            ))}
          </div>
        )}
      </div>

      {/* Flag Builder */}
      <FlagBuilder slug={slug!} player={player} />

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>Other Nations</h3>
      <ul className="nation-list">
        {otherPlayers.map((p: any) => {
          const rel = diplomacyRelations.find((r: any) =>
            (r.playerAId === player.id && r.playerBId === p.id) ||
            (r.playerBId === player.id && r.playerAId === p.id)
          ) as any;
          const relType = rel?.relationType ?? 'neutral';

          return (
            <li key={p.id} className="nation-item">
              <span className="player-color" style={{ background: p.color }} />
              <span className="nation-name">{p.countryName}</span>
              <span className="nation-status" style={{
                color: relType === 'war' ? 'var(--accent-red)'
                  : relType === 'neutral' ? 'var(--text-muted)'
                  : 'var(--accent-green)',
              }}>
                {formatRelation(relType)}
              </span>
              {p.isEliminated && (
                <span style={{ fontSize: 11, color: 'var(--accent-red)', marginLeft: 4 }}>
                  (Eliminated)
                </span>
              )}
            </li>
          );
        })}
        {otherPlayers.length === 0 && (
          <li className="nation-item" style={{ color: 'var(--text-muted)' }}>
            No other nations discovered
          </li>
        )}
      </ul>
    </div>
  );
}

function EditableName({
  slug,
  player,
  field,
  label,
  value,
  renderDisplay,
}: {
  slug: string;
  player: Record<string, unknown>;
  field: 'countryName' | 'rulerName';
  label: string;
  value: string;
  renderDisplay: (v: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/player/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ [field]: trimmed }),
      });
      useStore.getState().setGameState({
        player: { ...player, [field]: trimmed },
        players: useStore.getState().players.map((p: any) =>
          p.id === (player as any).id ? { ...p, [field]: trimmed } : p
        ),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {label && <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>{label}</span>}
        <input
          type="text"
          value={draft}
          maxLength={40}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setEditing(false); setDraft(value); }
          }}
          style={{ fontSize: 'inherit', padding: '2px 6px', flex: 1, minWidth: 0 }}
        />
        <button
          className="btn btn-primary"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={save}
          disabled={saving}
        >
          {saving ? '...' : 'Save'}
        </button>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => { setEditing(false); setDraft(value); }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return <div onClick={() => { setDraft(value); setEditing(true); }}>{renderDisplay(value)}</div>;
}

function FlagPreview({ flagData, color }: { flagData: any; color: string }) {
  const fieldColor = flagData?.fieldColor ?? color ?? '#888888';
  const charge = flagData?.charge ?? '';
  const chargeSymbol = CHARGE_SYMBOLS[charge] ?? '';

  return (
    <div className="flag-preview" style={{ background: fieldColor }}>
      {chargeSymbol && <span>{chargeSymbol}</span>}
    </div>
  );
}

function FlagBuilder({ slug, player }: { slug: string; player: Record<string, unknown> }) {
  const flagData = (player as any).flagData ?? {};
  const [fieldColor, setFieldColor] = useState(flagData.fieldColor ?? (player as any).color ?? '#888888');
  const [charge, setCharge] = useState(flagData.charge ?? '');
  const [nationColor, setNationColor] = useState((player as any).color ?? '#888888');
  const [saving, setSaving] = useState(false);

  async function saveFlag() {
    setSaving(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/player/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ flagData: { fieldColor, charge }, color: nationColor }),
      });
      // Optimistic update
      const state = useStore.getState();
      state.setGameState({
        player: { ...player, flagData: { fieldColor, charge }, color: nationColor },
        players: state.players.map((p: any) =>
          p.id === (player as any).id ? { ...p, color: nationColor } : p
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settlement-card" style={{ marginTop: 16 }}>
      <strong style={{ fontSize: 14 }}>Flag & Nation Color</strong>
      <div className="flag-builder">
        <FlagPreview flagData={{ fieldColor, charge }} color={fieldColor} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label>
            Flag Field:
            <input type="color" value={fieldColor} onChange={e => setFieldColor(e.target.value)} />
          </label>
          <label>
            Charge:
            <select value={charge} onChange={e => setCharge(e.target.value)}>
              {CHARGES.map(c => (
                <option key={c} value={c}>{c ? c.charAt(0).toUpperCase() + c.slice(1) : 'None'}</option>
              ))}
            </select>
          </label>
          <label>
            Nation Color:
            <input type="color" value={nationColor} onChange={e => setNationColor(e.target.value)} />
          </label>
        </div>
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '4px 12px', alignSelf: 'flex-end' }}
          onClick={saveFlag}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function formatRelation(type: string): string {
  const map: Record<string, string> = {
    neutral: 'Neutral',
    nap: 'NAP',
    alliance: 'Alliance',
    military_union: 'Military Union',
    war: 'At War',
    vassal: 'Vassal',
  };
  return map[type] ?? type;
}
