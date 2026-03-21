import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import type { AttachmentType, LetterAttachment } from '@kingdoms/shared';

const UNILATERAL: AttachmentType[] = ['declaration_of_war', 'close_trade'];

const ATTACHMENT_LABELS: Record<AttachmentType, string> = {
  declaration_of_war: 'Declaration of War',
  peace_treaty: 'Peace Treaty',
  white_peace: 'White Peace',
  unconditional_surrender: 'Unconditional Surrender',
  alliance_proposal: 'Alliance Proposal',
  nap_proposal: 'Non-Aggression Pact',
  open_trade: 'Open Trade',
  close_trade: 'Close Trade',
  trade_route_proposal: 'Trade Route',
  economic_union: 'Economic Union',
  tribute_demand: 'Tribute Demand',
  offer_subsidy: 'Offer Subsidy',
  loan: 'Loan',
  land_cession: 'Land Cession',
  vassal_offer: 'Vassal Offer',
  share_maps: 'Share Maps',
  share_intelligence: 'Share Intelligence',
};

const ATTACHMENT_CATEGORIES: { label: string; types: AttachmentType[] }[] = [
  { label: 'War & Peace', types: ['declaration_of_war', 'peace_treaty', 'white_peace'] },
  { label: 'Agreements', types: ['nap_proposal', 'alliance_proposal'] },
  { label: 'Economic', types: ['open_trade', 'close_trade', 'trade_route_proposal'] },
  { label: 'Intelligence', types: ['share_maps', 'share_intelligence'] },
  { label: 'Other', types: ['vassal_offer'] },
];

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

      {/* Compact Relations Overview */}
      <div className="relations-ribbon">
        {otherPlayers.map((p: any) => {
          const rel = relations.find((r: any) =>
            (r.playerAId === player.id && r.playerBId === p.id) ||
            (r.playerBId === player.id && r.playerAId === p.id)
          ) as any;
          const relType = rel?.relationType ?? 'neutral';

          return (
            <div key={p.id} className="relation-chip" data-relation={relType}>
              <span className="player-color" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.color }} />
              <span className="relation-chip-name">{p.countryName}</span>
              <span className="relation-chip-status">{formatRelation(relType)}</span>
              {rel?.allianceName && <span className="relation-chip-alliance">{rel.allianceName}</span>}
            </div>
          );
        })}
        {otherPlayers.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No other nations</span>}
      </div>

      {/* Writing Desk — the main event */}
      <WritingDesk
        slug={slug!}
        myId={player.id as string}
        players={players}
        otherPlayers={otherPlayers}
        letters={letters}
        relations={relations}
      />
    </div>
  );
}

/* ─── Writing Desk ─── */

function WritingDesk({ slug, myId, players, otherPlayers, letters, relations }: {
  slug: string;
  myId: string;
  players: Record<string, unknown>[];
  otherPlayers: Record<string, unknown>[];
  letters: Record<string, unknown>[];
  relations: Record<string, unknown>[];
}) {
  const setGameState = useStore(s => s.setGameState);
  const [deskTab, setDeskTab] = useState<'compose' | 'inbox' | 'outbox'>('compose');

  const [draftRecipient, setDraftRecipient] = useState<string>((otherPlayers[0] as any)?.id ?? '');
  const [draftBody, setDraftBody] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<LetterAttachment[]>([]);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [sending, setSending] = useState(false);

  const received = letters.filter((l: any) => l.recipientId === myId && l.isDelivered);
  const sent = letters.filter((l: any) => l.senderId === myId);
  const unreadCount = received.filter((l: any) => !l.isRead).length;
  const inTransitCount = sent.filter((l: any) => !l.isDelivered).length;

  // Get relation with current draft recipient
  const recipientRelation = relations.find((r: any) =>
    (r.playerAId === myId && r.playerBId === draftRecipient) ||
    (r.playerBId === myId && r.playerAId === draftRecipient)
  ) as any;
  const currentRelType = recipientRelation?.relationType ?? 'neutral';

  function addAttachment(type: AttachmentType) {
    if (draftAttachments.some(a => a.type === type)) return;
    setDraftAttachments([...draftAttachments, { type }]);
    setShowAttachmentPicker(false);
  }

  function removeAttachment(index: number) {
    setDraftAttachments(draftAttachments.filter((_, i) => i !== index));
  }

  function updateAttachmentDetails(index: number, details: Record<string, unknown>) {
    setDraftAttachments(draftAttachments.map((a, i) =>
      i === index ? { ...a, details } : a
    ));
  }

  async function sendLetter() {
    if (!draftRecipient || (!draftBody.trim() && draftAttachments.length === 0)) return;
    setSending(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      const res = await fetch(`/api/games/${slug}/letters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({
          recipientId: draftRecipient,
          bodyText: draftBody || '(No message)',
          attachments: draftAttachments,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGameState({ letters: [...letters, data.letter] });
        setDraftBody('');
        setDraftAttachments([]);
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
      setGameState({ letters: letters.filter((l: any) => l.id !== letterId) });
      setDraftRecipient(recalled.recipientId);
      setDraftBody(recalled.bodyText);
      setDraftAttachments((recalled.attachments ?? []) as LetterAttachment[]);
      setDeskTab('compose');
    }
  }

  async function markRead(letterId: string) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/letters/${letterId}/read`, {
      method: 'POST',
      headers: { 'x-session-token': sessionToken ?? '' },
    });
    setGameState({
      letters: letters.map((l: any) => l.id === letterId ? { ...l, isRead: true } : l),
    });
  }

  async function respondToLetter(letterId: string, accept: boolean) {
    const sessionToken = localStorage.getItem(`session:${slug}`);
    const res = await fetch(`/api/games/${slug}/letters/${letterId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ accept }),
    });
    if (res.ok) {
      setGameState({
        letters: letters.map((l: any) =>
          l.id === letterId ? { ...l, response: accept ? 'accepted' : 'rejected', isRead: true } : l
        ),
      });
      // Refresh game state to get updated relations/trades
      window.location.reload();
    }
  }

  // Filter available attachment types based on current relation
  function getAvailableTypes(): AttachmentType[] {
    const alreadyAttached = new Set(draftAttachments.map(a => a.type));
    const available: AttachmentType[] = [];

    for (const cat of ATTACHMENT_CATEGORIES) {
      for (const type of cat.types) {
        if (alreadyAttached.has(type)) continue;

        // Contextual filtering
        if (type === 'declaration_of_war' && currentRelType === 'war') continue;
        if (type === 'peace_treaty' && currentRelType !== 'war') continue;
        if (type === 'white_peace' && currentRelType !== 'war') continue;
        if (type === 'close_trade' && currentRelType === 'war') continue;
        if (type === 'nap_proposal' && (currentRelType === 'nap' || currentRelType === 'alliance' || currentRelType === 'military_union')) continue;
        if (type === 'alliance_proposal' && (currentRelType === 'alliance' || currentRelType === 'military_union')) continue;

        available.push(type);
      }
    }
    return available;
  }

  return (
    <div className="writing-desk" style={{ marginTop: 16 }}>
      <h3 className="writing-desk-title">Writing Desk</h3>

      {/* Desk tabs */}
      <div className="desk-tabs">
        <button className={`desk-tab ${deskTab === 'compose' ? 'active' : ''}`} onClick={() => setDeskTab('compose')}>
          Compose
        </button>
        <button className={`desk-tab ${deskTab === 'inbox' ? 'active' : ''}`} onClick={() => setDeskTab('inbox')}>
          Inbox {unreadCount > 0 && <span className="desk-badge">{unreadCount}</span>}
        </button>
        <button className={`desk-tab ${deskTab === 'outbox' ? 'active' : ''}`} onClick={() => setDeskTab('outbox')}>
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
              onChange={e => { setDraftRecipient(e.target.value); setDraftAttachments([]); }}
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

          {/* Attached items */}
          {draftAttachments.length > 0 && (
            <div className="attachment-list">
              {draftAttachments.map((att, i) => (
                <div key={i} className="attachment-item">
                  <div className="attachment-item-header">
                    <span className="attachment-seal" />
                    <span className="attachment-type-label">{ATTACHMENT_LABELS[att.type]}</span>
                    <button className="attachment-remove" onClick={() => removeAttachment(i)} title="Remove">&times;</button>
                  </div>
                  <AttachmentDetailEditor
                    attachment={att}
                    onChange={(details) => updateAttachmentDetails(i, details)}
                    players={players}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Attachment picker */}
          <div className="attachment-bar">
            <button
              className="btn btn-secondary attachment-add-btn"
              onClick={() => setShowAttachmentPicker(!showAttachmentPicker)}
            >
              {showAttachmentPicker ? 'Cancel' : 'Attach Seal'}
            </button>

            {showAttachmentPicker && (
              <div className="attachment-picker">
                {ATTACHMENT_CATEGORIES.map(cat => {
                  const available = cat.types.filter(t => getAvailableTypes().includes(t));
                  if (available.length === 0) return null;
                  return (
                    <div key={cat.label} className="attachment-category">
                      <div className="attachment-category-label">{cat.label}</div>
                      {available.map(type => (
                        <button
                          key={type}
                          className={`btn btn-secondary attachment-option ${UNILATERAL.includes(type) ? 'attachment-option-unilateral' : ''}`}
                          onClick={() => addAttachment(type)}
                        >
                          {ATTACHMENT_LABELS[type]}
                          {UNILATERAL.includes(type) && <span className="attachment-badge-immediate">Immediate</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="letter-footer">
            <span className="letter-signature">
              Sealed and sent from your writing desk
            </span>
            <button
              className="btn btn-primary letter-send-btn"
              onClick={sendLetter}
              disabled={sending || (!draftBody.trim() && draftAttachments.length === 0)}
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
              const attachments = (l.attachments ?? []) as LetterAttachment[];
              const hasProposals = attachments.some(a => !UNILATERAL.includes(a.type));
              const needsResponse = hasProposals && !l.response;

              return (
                <div
                  key={l.id}
                  className={`letter-paper letter-received ${l.isRead && !needsResponse ? 'letter-read' : 'letter-unread'}`}
                  onClick={() => !l.isRead && markRead(l.id)}
                >
                  <div className="letter-header-line">
                    <span className="letter-from">
                      From {sender?.countryName ?? 'Unknown'}
                    </span>
                    <span className={`letter-status ${!l.isRead ? 'letter-status-new' : l.response === 'accepted' ? 'letter-status-delivered' : l.response === 'rejected' ? 'letter-status-rejected' : ''}`}>
                      {!l.isRead ? 'Sealed' : l.response === 'accepted' ? 'Accepted' : l.response === 'rejected' ? 'Rejected' : 'Read'}
                    </span>
                  </div>
                  <p className="letter-text">{l.bodyText}</p>

                  {/* Show attachments */}
                  {attachments.length > 0 && (
                    <div className="attachment-list attachment-list-received">
                      {attachments.map((att: any, i: number) => (
                        <div key={i} className={`attachment-badge ${UNILATERAL.includes(att.type) ? 'attachment-badge-war' : 'attachment-badge-proposal'}`}>
                          <span className="attachment-seal" />
                          {ATTACHMENT_LABELS[att.type as AttachmentType] ?? att.type}
                          {att.type === 'trade_route_proposal' && att.details && (
                            <span className="attachment-trade-summary">
                              {formatTradeDetails(att.details)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Accept/Reject for proposals */}
                  {needsResponse && (
                    <div className="letter-response-bar">
                      <button
                        className="btn btn-primary letter-accept-btn"
                        onClick={(e) => { e.stopPropagation(); respondToLetter(l.id, true); }}
                      >
                        Accept
                      </button>
                      <button
                        className="btn btn-secondary letter-reject-btn"
                        onClick={(e) => { e.stopPropagation(); respondToLetter(l.id, false); }}
                      >
                        Reject
                      </button>
                    </div>
                  )}

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
              const attachments = (l.attachments ?? []) as LetterAttachment[];

              return (
                <div key={l.id} className={`letter-paper letter-sent ${l.isDelivered ? 'letter-delivered' : 'letter-in-transit'}`}>
                  <div className="letter-header-line">
                    <span className="letter-from">
                      To {recipient?.countryName ?? 'Unknown'}
                    </span>
                    <span className={`letter-status ${l.isDelivered ? (l.response === 'accepted' ? 'letter-status-delivered' : l.response === 'rejected' ? 'letter-status-rejected' : 'letter-status-delivered') : 'letter-status-transit'}`}>
                      {l.isDelivered ? (l.response === 'accepted' ? 'Accepted' : l.response === 'rejected' ? 'Rejected' : 'Delivered') : 'In Transit'}
                    </span>
                  </div>
                  <p className="letter-text">{l.bodyText}</p>

                  {attachments.length > 0 && (
                    <div className="attachment-list attachment-list-received">
                      {attachments.map((att: any, i: number) => (
                        <div key={i} className={`attachment-badge ${UNILATERAL.includes(att.type) ? 'attachment-badge-war' : 'attachment-badge-proposal'}`}>
                          <span className="attachment-seal" />
                          {ATTACHMENT_LABELS[att.type as AttachmentType] ?? att.type}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="letter-meta">
                    Sent turn {l.sentTurn}
                    {!l.isDelivered && <> &middot; Arrives turn {l.deliveryTurn}</>}
                  </div>
                  {canRecall && (
                    <button className="btn btn-secondary letter-recall-btn" onClick={() => recallLetter(l.id)}>
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

/* ─── Attachment Detail Editor (inline forms for specific attachment types) ─── */

function AttachmentDetailEditor({ attachment, onChange, players }: {
  attachment: LetterAttachment;
  onChange: (details: Record<string, unknown>) => void;
  players: Record<string, unknown>[];
}) {
  const details = (attachment.details ?? {}) as Record<string, any>;

  switch (attachment.type) {
    case 'trade_route_proposal': {
      const offered = details.offeredResources ?? [{ resource: '', amount: 0 }];
      const requested = details.requestedResources ?? [{ resource: '', amount: 0 }];
      const isStanding = details.isStanding ?? false;

      function updateOffered(idx: number, field: string, value: any) {
        const next = [...offered];
        next[idx] = { ...next[idx], [field]: value };
        onChange({ ...details, offeredResources: next, requestedResources: requested, isStanding });
      }
      function updateRequested(idx: number, field: string, value: any) {
        const next = [...requested];
        next[idx] = { ...next[idx], [field]: value };
        onChange({ ...details, offeredResources: offered, requestedResources: next, isStanding });
      }

      return (
        <div className="attachment-detail-form">
          <div className="attachment-detail-row">
            <span className="attachment-detail-label">We offer:</span>
            {offered.map((o: any, i: number) => (
              <div key={i} className="attachment-resource-row">
                <input type="number" min={1} className="attachment-input-num" value={o.amount || ''} placeholder="Qty"
                  onChange={e => updateOffered(i, 'amount', parseInt(e.target.value) || 0)} />
                <input type="text" className="attachment-input-text" value={o.resource} placeholder="Resource"
                  onChange={e => updateOffered(i, 'resource', e.target.value)} />
              </div>
            ))}
            <button className="btn btn-secondary attachment-add-resource"
              onClick={() => onChange({ ...details, offeredResources: [...offered, { resource: '', amount: 0 }], requestedResources: requested, isStanding })}>+ row</button>
          </div>
          <div className="attachment-detail-row">
            <span className="attachment-detail-label">In exchange for:</span>
            {requested.map((r: any, i: number) => (
              <div key={i} className="attachment-resource-row">
                <input type="number" min={1} className="attachment-input-num" value={r.amount || ''} placeholder="Qty"
                  onChange={e => updateRequested(i, 'amount', parseInt(e.target.value) || 0)} />
                <input type="text" className="attachment-input-text" value={r.resource} placeholder="Resource"
                  onChange={e => updateRequested(i, 'resource', e.target.value)} />
              </div>
            ))}
            <button className="btn btn-secondary attachment-add-resource"
              onClick={() => onChange({ ...details, offeredResources: offered, requestedResources: [...requested, { resource: '', amount: 0 }], isStanding })}>+ row</button>
          </div>
          <label className="attachment-checkbox">
            <input type="checkbox" checked={isStanding}
              onChange={e => onChange({ ...details, offeredResources: offered, requestedResources: requested, isStanding: e.target.checked })} />
            Standing agreement (repeats each turn)
          </label>
        </div>
      );
    }

    case 'alliance_proposal': {
      const name = details.name ?? '';
      return (
        <div className="attachment-detail-form">
          <div className="attachment-detail-row">
            <span className="attachment-detail-label">Alliance name:</span>
            <input type="text" className="attachment-input-text" value={name} placeholder="The Grand Alliance"
              onChange={e => onChange({ ...details, tier: 'alliance', name: e.target.value })} />
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/* ─── Helpers ─── */

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

function formatTradeDetails(d: any): string {
  const offered = (d.offeredResources ?? []).filter((r: any) => r.amount > 0 && r.resource);
  const requested = (d.requestedResources ?? []).filter((r: any) => r.amount > 0 && r.resource);
  const parts: string[] = [];
  if (offered.length > 0) parts.push(offered.map((r: any) => `${r.amount} ${r.resource}`).join(', '));
  if (requested.length > 0) parts.push('for ' + requested.map((r: any) => `${r.amount} ${r.resource}`).join(', '));
  return parts.length > 0 ? ` (${parts.join(' ')})` : '';
}
