import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';

export function DiplomacyTab() {
  const { slug } = useParams<{ slug: string }>();
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const letters = useStore(s => s.letters);
  const relations = useStore(s => s.diplomacyRelations);

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

      {/* Writing Desk */}
      <WritingDesk
        slug={slug!}
        myId={player.id as string}
        players={players}
        otherPlayers={otherPlayers}
        letters={letters}
      />
    </div>
  );
}

/* ─── Writing Desk ─── */

function WritingDesk({ slug, myId, players, otherPlayers, letters }: {
  slug: string;
  myId: string;
  players: Record<string, unknown>[];
  otherPlayers: Record<string, unknown>[];
  letters: Record<string, unknown>[];
}) {
  const setGameState = useStore(s => s.setGameState);
  const [deskTab, setDeskTab] = useState<'compose' | 'inbox' | 'outbox'>('compose');

  // A letter being edited (recalled from outbox back to the desk)
  const [draftRecipient, setDraftRecipient] = useState<string>((otherPlayers[0] as any)?.id ?? '');
  const [draftBody, setDraftBody] = useState('');
  const [sending, setSending] = useState(false);

  const received = letters.filter((l: any) => l.recipientId === myId && l.isDelivered);
  const sent = letters.filter((l: any) => l.senderId === myId);
  const unreadCount = received.filter((l: any) => !l.isRead).length;
  const inTransitCount = sent.filter((l: any) => !l.isDelivered).length;

  async function sendLetter() {
    if (!draftRecipient || !draftBody.trim()) return;
    setSending(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      const res = await fetch(`/api/games/${slug}/letters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ recipientId: draftRecipient, bodyText: draftBody, attachments: [] }),
      });
      if (res.ok) {
        const data = await res.json();
        // Add to local state so it shows up in outbox immediately
        setGameState({ letters: [...letters, data.letter] });
        setDraftBody('');
        setDeskTab('outbox');
      }
    } finally { setSending(false); }
  }

  async function recallLetter(letterId: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    const res = await fetch(`/api/games/${slug}/letters/${letterId}`, {
      method: 'DELETE',
      headers: { 'x-session-token': sessionToken ?? '' },
    });
    if (res.ok) {
      const data = await res.json();
      const recalled = data.letter;
      // Remove from letter list, put content back on the desk
      setGameState({ letters: letters.filter((l: any) => l.id !== letterId) });
      setDraftRecipient(recalled.recipientId);
      setDraftBody(recalled.bodyText);
      setDeskTab('compose');
    }
  }

  async function markRead(letterId: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/letters/${letterId}/read`, {
      method: 'POST',
      headers: { 'x-session-token': sessionToken ?? '' },
    });
    // Optimistic
    setGameState({
      letters: letters.map((l: any) => l.id === letterId ? { ...l, isRead: true } : l),
    });
  }

  return (
    <div className="writing-desk" style={{ marginTop: 24 }}>
      <h3 className="writing-desk-title">Writing Desk</h3>

      {/* Desk tabs */}
      <div className="desk-tabs">
        <button
          className={`desk-tab ${deskTab === 'compose' ? 'active' : ''}`}
          onClick={() => setDeskTab('compose')}
        >
          Compose
        </button>
        <button
          className={`desk-tab ${deskTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setDeskTab('inbox')}
        >
          Inbox {unreadCount > 0 && <span className="desk-badge">{unreadCount}</span>}
        </button>
        <button
          className={`desk-tab ${deskTab === 'outbox' ? 'active' : ''}`}
          onClick={() => setDeskTab('outbox')}
        >
          Outbox {inTransitCount > 0 && <span className="desk-badge">{inTransitCount}</span>}
        </button>
      </div>

      {/* Compose */}
      {deskTab === 'compose' && (
        <div className="letter-paper">
          <div className="letter-header-line">
            <span className="letter-label">To the esteemed ruler of</span>
            <select
              className="letter-select"
              value={draftRecipient}
              onChange={e => setDraftRecipient(e.target.value)}
            >
              {otherPlayers.map((p: any) => (
                <option key={p.id} value={p.id}>{p.countryName}</option>
              ))}
            </select>
          </div>

          <textarea
            className="letter-body"
            value={draftBody}
            onChange={e => setDraftBody(e.target.value)}
            placeholder="Your Majesty, I write to you regarding..."
            rows={6}
          />

          <div className="letter-footer">
            <span className="letter-signature">
              Sealed and sent from your writing desk
            </span>
            <button
              className="btn btn-primary letter-send-btn"
              onClick={sendLetter}
              disabled={sending || !draftBody.trim()}
            >
              {sending ? 'Sealing...' : 'Seal & Send'}
            </button>
          </div>
        </div>
      )}

      {/* Inbox */}
      {deskTab === 'inbox' && (
        <div className="letter-stack">
          {received.length === 0 ? (
            <p className="desk-empty">No letters received yet. The desk is empty.</p>
          ) : (
            received.slice().reverse().map((l: any) => {
              const sender = players.find((p: any) => p.id === l.senderId) as any;
              return (
                <div
                  key={l.id}
                  className={`letter-paper letter-received ${l.isRead ? 'letter-read' : 'letter-unread'}`}
                  onClick={() => !l.isRead && markRead(l.id)}
                >
                  <div className="letter-header-line">
                    <span className="letter-from">
                      From {sender?.countryName ?? 'Unknown'}
                    </span>
                    <span className={`letter-status ${l.isRead ? '' : 'letter-status-new'}`}>
                      {l.isRead ? 'Read' : 'Sealed'}
                    </span>
                  </div>
                  <p className="letter-text">{l.bodyText}</p>
                  <div className="letter-meta">
                    Sent turn {l.sentTurn} &middot; Arrived turn {l.deliveryTurn}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Outbox */}
      {deskTab === 'outbox' && (
        <div className="letter-stack">
          {sent.length === 0 ? (
            <p className="desk-empty">No letters sent yet. Take up your quill!</p>
          ) : (
            sent.slice().reverse().map((l: any) => {
              const recipient = players.find((p: any) => p.id === l.recipientId) as any;
              const canRecall = !l.isDelivered;
              return (
                <div key={l.id} className={`letter-paper letter-sent ${l.isDelivered ? 'letter-delivered' : 'letter-in-transit'}`}>
                  <div className="letter-header-line">
                    <span className="letter-from">
                      To {recipient?.countryName ?? 'Unknown'}
                    </span>
                    <span className={`letter-status ${l.isDelivered ? 'letter-status-delivered' : 'letter-status-transit'}`}>
                      {l.isDelivered ? 'Delivered' : 'In Transit'}
                    </span>
                  </div>
                  <p className="letter-text">{l.bodyText}</p>
                  <div className="letter-meta">
                    Sent turn {l.sentTurn}
                    {!l.isDelivered && <> &middot; Arrives turn {l.deliveryTurn}</>}
                  </div>
                  {canRecall && (
                    <button
                      className="btn btn-secondary letter-recall-btn"
                      onClick={() => recallLetter(l.id)}
                    >
                      Recall to desk
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Diplomacy Actions ─── */

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
