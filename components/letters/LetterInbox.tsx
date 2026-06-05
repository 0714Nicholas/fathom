'use client'

import { HandwrittenLetter } from '@/components/letters/HandwrittenLetter'
import type { LetterPayload } from '@/hooks/useRealtimeLetters'

type LetterInboxProps = {
  status: 'idle' | 'connecting' | 'subscribed' | 'error' | 'disabled'
  liveLetters: LetterPayload[]
  archive: LetterPayload[]
  archiveLoading: boolean
  activeLetter: LetterPayload | null
  presenceCount: number
  selfId: string
  onSelectLetter: (letter: LetterPayload) => void
  onDismiss: () => void
  onActiveStrokeImpulse: (intensity: number, durationMs: number) => void
  onActiveComplete: () => void
  onBury: (letterId: string) => void
}

function formatTime(ts: number) {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function statusLabel(status: LetterInboxProps['status']) {
  switch (status) {
    case 'subscribed':
      return 'channel subscribed'
    case 'connecting':
      return 'connecting...'
    case 'error':
      return 'connection error'
    case 'disabled':
      return 'realtime disabled'
    default:
      return 'idle'
  }
}

export function LetterInbox({
  status,
  liveLetters,
  archive,
  archiveLoading,
  activeLetter,
  presenceCount,
  selfId,
  onSelectLetter,
  onDismiss,
  onActiveStrokeImpulse,
  onActiveComplete,
  onBury,
}: LetterInboxProps) {
  const canBuryActive =
    activeLetter?.source === 'live' && activeLetter.authorId === selfId

  return (
    <section className="panel glass-shell">
      <div className="panel-inner">
        <div className="row-between">
          <div>
            <div className="label">Inbox · Resonance</div>
            <div className="inbox-meta">
              <span>{statusLabel(status)}</span>
              <span className="divider" />
              <span className="presence-pill">
                <span className="presence-dot" />
                {presenceCount} fathoming
              </span>
            </div>
          </div>

          <div className="row">
            {canBuryActive && activeLetter ? (
              <button
                className="btn"
                onClick={() => onBury(activeLetter.id)}
                title="Sink this letter deeper. It will no longer surface."
              >
                sink deeper
              </button>
            ) : null}

            {activeLetter ? (
              <button className="btn" onClick={onDismiss}>
                dismiss
              </button>
            ) : null}
          </div>
        </div>

        {activeLetter ? (
          <div className="letter-stage received" style={{ marginTop: 18 }}>
            <HandwrittenLetter
              animateKey={activeLetter.id}
              text={activeLetter.text}
              fontUrl="/fonts/YourHandwritingFont.otf"
              fontSize={70}
              lineHeight={102}
              letterSpacing={1.1}
              className="handwritten-svg"
              strokeColor="rgba(232,246,255,0.94)"
              glowColor="rgba(143,216,255,0.28)"
              strokeWidth={2.0}
              onStrokeImpulse={(payload) => {
                onActiveStrokeImpulse(payload.intensity, payload.durationMs)
              }}
              onComplete={onActiveComplete}
            />
            <div className="inbox-meta" style={{ marginTop: 12 }}>
              <span>
                {activeLetter.source === 'archive' ? 'from the deep' : 'from'}{' '}
                {activeLetter.authorName ?? 'anonymous'}
              </span>
              {activeLetter.city ? (
                <>
                  <span className="divider" />
                  <span>{activeLetter.city}</span>
                </>
              ) : null}
              <span className="divider" />
              <span>{formatTime(activeLetter.createdAt)}</span>
              {typeof activeLetter.fathomDepth === 'number' ? (
                <>
                  <span className="divider" />
                  <span>{Math.round(activeLetter.fathomDepth * 100)}% depth</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* LIVE section */}
        {!activeLetter ? (
          <>
            <div className="label" style={{ marginTop: 22 }}>
              Live · Present
            </div>

            {liveLetters.length === 0 ? (
              <div className="inbox-empty" style={{ marginTop: 10 }}>
                いま、誰の筆も入っていません。
              </div>
            ) : (
              <div className="inbox-list">
                {[...liveLetters]
                  .slice()
                  .reverse()
                  .map((letter) => (
                    <button
                      key={letter.id}
                      className="inbox-item"
                      onClick={() => onSelectLetter(letter)}
                    >
                      <div className="inbox-item-title">{letter.text}</div>
                      <div className="inbox-item-meta">
                        <span>{letter.authorName ?? 'anonymous'}</span>
                        {letter.city ? <span>· {letter.city}</span> : null}
                        <span>· {formatTime(letter.createdAt)}</span>
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {/* ARCHIVE section */}
            <div className="label" style={{ marginTop: 22 }}>
              From the deep · Archive
            </div>

            {archiveLoading ? (
              <div className="small" style={{ marginTop: 8 }}>
                水底を確かめています…
              </div>
            ) : archive.length === 0 ? (
              <div className="inbox-empty" style={{ marginTop: 10 }}>
                水底はまだ静かです。
              </div>
            ) : (
              <div className="inbox-list">
                {archive.map((letter) => (
                  <button
                    key={letter.id}
                    className="inbox-item"
                    onClick={() => onSelectLetter(letter)}
                  >
                    <div className="inbox-item-title">{letter.text}</div>
                    <div className="inbox-item-meta">
                      <span>{letter.authorName ?? 'anonymous'}</span>
                      {letter.city ? <span>· {letter.city}</span> : null}
                      <span>· {formatTime(letter.createdAt)}</span>
                      {typeof letter.fathomDepth === 'number' ? (
                        <span>
                          · {Math.round(letter.fathomDepth * 100)}% depth
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}
