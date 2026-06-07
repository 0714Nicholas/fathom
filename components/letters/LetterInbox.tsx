'use client'

import { useMemo, useState } from 'react'
import { HandwrittenLetter } from '@/components/letters/HandwrittenLetter'
import type { LetterPayload } from '@/hooks/useRealtimeLetters'

export interface LetterInboxProps {
  status: string
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
  onBury: (id: string) => void
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
  const [showArchive, setShowArchive] = useState(false)

  const unreadCount = useMemo(() => {
    return liveLetters.length
  }, [liveLetters])

  return (
    <section className="panel glass-shell inbox-panel">
      <div className="panel-inner">
        <div className="row-between">
          <div className="label">Inbox · Resonance</div>
          {activeLetter ? (
            <button className="btn" onClick={onDismiss}>
              dismiss
            </button>
          ) : (
            <button className="btn" onClick={() => setShowArchive((s) => !s)}>
              {showArchive ? 'close archive' : 'archive'}
            </button>
          )}
        </div>

        <div className="row" style={{ marginTop: 8 }}>
          <div className="small" style={{ opacity: 0.6 }}>
            channel {status} ·
          </div>
          <div className="presence-chip">
            <span className="pulse-dot" />
            {presenceCount} fathoming
          </div>
        </div>

        {activeLetter ? (
          <div className="letter-stage received" style={{ marginTop: 18 }}>
            <HandwrittenLetter
              animateKey={activeLetter.id}
              text={activeLetter.text}
              fontUrl="/fonts/ZenKurenaido-Regular.ttf"
              fontSize={36} 
              lineHeight={64}
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
            <div
              className="row-between"
              style={{ marginTop: 24, padding: '0 8px' }}
            >
              <div className="small" style={{ opacity: 0.5 }}>
                from the deep visitor • {activeLetter.city ?? 'unknown'} •{' '}
                {new Date(activeLetter.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' • '}
                {Math.round(activeLetter.depth * 100)}% depth
              </div>
              <button
                className="btn"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => onBury(activeLetter.id)}
              >
                bury
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {showArchive ? (
              <div className="archive-list">
                {archiveLoading && (
                  <div className="inbox-empty">fetching deep archive...</div>
                )}
                {!archiveLoading && archive.length === 0 && (
                  <div className="inbox-empty">no past letters found.</div>
                )}
                {archive.map((l) => {
                  const isMine = l.authorId === selfId
                  return (
                    <div
                      key={l.id}
                      className="archive-item"
                      onClick={() => onSelectLetter(l)}
                    >
                      <div className="archive-text">{l.text}</div>
                      <div className="archive-meta row-between">
                        <span>{l.city ?? 'unknown'}</span>
                        <span>{Math.round(l.depth * 100)}% depth</span>
                      </div>
                      {isMine && <div className="archive-mine-badge">your letter</div>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="live-list">
                {liveLetters.length === 0 ? (
                  <div className="inbox-empty">waiting for resonance...</div>
                ) : (
                  <div className="inbox-empty" style={{ opacity: 0.8 }}>
                    {unreadCount} new letter{unreadCount > 1 ? 's' : ''} drifting
                    near you.
                    <br />
                    <button
                      className="btn btn-accent"
                      style={{ marginTop: 12 }}
                      onClick={() => onSelectLetter(liveLetters[0])}
                    >
                      read
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
