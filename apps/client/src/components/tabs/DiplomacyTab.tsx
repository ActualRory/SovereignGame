import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';

export function DiplomacyTab() {
  const { slug } = useParams<{ slug: string }>();
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const letters = useStore(s => s.letters);
  const relations = useStore(s => s.diplomacyRelations);
  const fetchState = null; // we'll refresh via socket

  if (!player) return <div><h2>Diplomacy</h2><p>Loading...</p></div>;

  const otherPlayers = players.filter((p: any) => p.id !== player.id && !p.isEliminated);

  return (
    <div className="diplomacy-tab">
      <h2>Diplomacy</h2>

      {/* Relations Overview */}
      <h3 style={{ marginTop: 16 }}>Relations</h3>
      {otherPlayers.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No other nations</p>}
      {otherPlayers.map((p: any) => {
        const rel = relations.find((r: any) =>
          (r.playerAId === player.id && r.playerBId === p.id) ||
          (r.playerBId === player.id && r.playerAId === p.id)
        ) as any;
        const relType = rel?.relationType ?? 'neutral';

        return (
          <div key={p.id} className="settlement-card" style={{ marginTop: 8 }}>
            <div className="settlement-header">
              <strong>
                <span className="player-color" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: p.color, marginRight: 6, verticalAlign: 'middle' }} />
                {p.countryName}
              </strong>
              <span style={{ fontSize: 12, color: relType === 'war' ? 'var(--accent-red)' : relType === 'neutral' ? 'var(--text-muted)' : 'var(--accent-green)' }}>
                {formatRelation(relType)}
              </span>
            </div>
            {rel?.allianceName && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rel.allianceName}</div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <DiplomacyAction slug={slug!} playerId={player.id as string} targetId={p.id} currentRelation={relType} relationId={rel?.id} />
            </div>
          </div>
        );
      })}

      {/* Letters */}
      <h3 style={{ marginTop: 20 }}>Letters</h3>
      <LetterComposer slug={slug!} senderId={player.id as string} otherPlayers={otherPlayers} />
      <LetterList letters={letters} players={players} myId={player.id as string} slug={slug!} />
    </div>
  );
}

function DiplomacyAction({ slug, playerId, targetId, currentRelation, relationId }: {
  slug: string; playerId: string; targetId: string; currentRelation: string; relationId?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function propose(relationType: string, terms?: any) {
    setLoading(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/diplomacy/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ targetPlayerId: targetId, relationType, terms }),
      });
    } finally { setLoading(false); }
  }

  async function dissolve() {
    if (!relationId) return;
    setLoading(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/diplomacy/${relationId}`, {
        method: 'DELETE',
        headers: { 'x-session-token': sessionToken ?? '' },
      });
    } finally { setLoading(false); }
  }

  if (loading) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>...</span>;

  return (
    <>
      {currentRelation === 'neutral' && (
        <>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => propose('nap')}>Propose NAP</button>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => propose('alliance', { name: 'Alliance', mutualDefence: false })}>Propose Alliance</button>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--accent-red)' }}
            onClick={() => propose('war')}>Declare War</button>
        </>
      )}
      {(currentRelation === 'nap' || currentRelation === 'alliance' || currentRelation === 'military_union') && (
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={dissolve}>Dissolve</button>
      )}
      {currentRelation === 'war' && (
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => propose('neutral')}>Offer White Peace</button>
      )}
    </>
  );
}

function LetterComposer({ slug, senderId, otherPlayers }: {
  slug: string; senderId: string; otherPlayers: Record<string, unknown>[];
}) {
  const [recipientId, setRecipientId] = useState<string>((otherPlayers[0] as any)?.id ?? '');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);

  async function sendLetter() {
    if (!recipientId || !bodyText.trim()) return;
    setSending(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/letters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ recipientId, bodyText, attachments: [] }),
      });
      setBodyText('');
    } finally { setSending(false); }
  }

  return (
    <div className="settlement-card" style={{ marginTop: 8 }}>
      <strong style={{ fontSize: 13 }}>Compose Letter</strong>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12 }}>To:</span>
        <select className="input" value={recipientId} onChange={e => setRecipientId(e.target.value)}
          style={{ flex: 1, padding: '3px 6px', fontSize: 12 }}>
          {otherPlayers.map((p: any) => (
            <option key={p.id} value={p.id}>{p.countryName}</option>
          ))}
        </select>
      </div>
      <textarea
        className="input"
        value={bodyText}
        onChange={e => setBodyText(e.target.value)}
        placeholder="Write your message..."
        style={{ width: '100%', marginTop: 6, padding: 6, fontSize: 13, minHeight: 60, resize: 'vertical', fontFamily: 'var(--font-body)' }}
      />
      <button className="btn btn-primary" style={{ marginTop: 4, fontSize: 12, padding: '3px 12px' }}
        onClick={sendLetter} disabled={sending || !bodyText.trim()}>
        {sending ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
}

function LetterList({ letters, players, myId, slug }: {
  letters: Record<string, unknown>[]; players: Record<string, unknown>[]; myId: string; slug: string;
}) {
  const received = letters.filter((l: any) => l.recipientId === myId && l.isDelivered);
  const sent = letters.filter((l: any) => l.senderId === myId);

  async function markRead(letterId: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/letters/${letterId}/read`, {
      method: 'POST',
      headers: { 'x-session-token': sessionToken ?? '' },
    });
  }

  return (
    <>
      {received.length > 0 && (
        <>
          <h4 style={{ marginTop: 12, fontSize: 14 }}>Inbox</h4>
          {received.map((l: any) => {
            const sender = players.find((p: any) => p.id === l.senderId) as any;
            return (
              <div key={l.id} className="settlement-card" style={{ marginTop: 4, opacity: l.isRead ? 0.7 : 1 }}
                onClick={() => !l.isRead && markRead(l.id)}>
                <div className="settlement-header">
                  <strong style={{ fontSize: 13 }}>From {sender?.countryName ?? '?'}</strong>
                  <span style={{ fontSize: 11, color: l.isRead ? 'var(--text-muted)' : 'var(--accent-gold)' }}>
                    {l.isRead ? 'Read' : 'New'}
                  </span>
                </div>
                <p style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{l.bodyText}</p>
              </div>
            );
          })}
        </>
      )}
      {sent.length > 0 && (
        <>
          <h4 style={{ marginTop: 12, fontSize: 14 }}>Sent</h4>
          {sent.map((l: any) => {
            const recipient = players.find((p: any) => p.id === l.recipientId) as any;
            return (
              <div key={l.id} className="settlement-card" style={{ marginTop: 4, opacity: 0.7 }}>
                <div className="settlement-header">
                  <strong style={{ fontSize: 13 }}>To {recipient?.countryName ?? '?'}</strong>
                  <span style={{ fontSize: 11, color: l.isDelivered ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {l.isDelivered ? 'Delivered' : 'In transit'}
                  </span>
                </div>
                <p style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{l.bodyText}</p>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

function formatRelation(type: string): string {
  const map: Record<string, string> = {
    neutral: 'Neutral',
    nap: 'Non-Aggression Pact',
    alliance: 'Alliance',
    military_union: 'Military Union',
    war: 'At War',
    vassal: 'Vassal',
  };
  return map[type] ?? type;
}
