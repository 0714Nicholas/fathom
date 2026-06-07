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
    <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)' }}>
      {/* HUD Header */}
      <div style={{ opacity: 0.4, marginBottom: 8, fontSize: 10 }}>[ RESONANCE ]</div>
      <div style={{ marginBottom: 4 }}>Channel: {status}</div>
      <div style={{ marginBottom: 12, color: presenceCount > 1 ? '#8fd8ff' : 'inherit' }}>
        Echoes: {presenceCount} presence
      </div>

      <div style={{ marginBottom: 16 }}>
        {activeLetter ? (
          <button 
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7, fontSize: 11, textDecoration: 'underline', textUnderlineOffset: '4px' }}
          >
            dismiss signal
          </button>
        ) : (
          <button 
            onClick={() => setShowArchive((s) => !s)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7, fontSize: 11, textDecoration: 'underline', textUnderlineOffset: '4px' }}
          >
            {showArchive ? 'close archive' : 'open archive'}
          </button>
        )}
      </div>

      {/* Content Area (Floating) */}
      {activeLetter ? (
        <div style={{ width: '100%', maxWidth: '300px', marginLeft: 'auto', textAlign: 'left', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '4px', borderLeft: '1px solid rgba(143,216,255,0.3)' }}>
          <HandwrittenLetter
            animateKey={activeLetter.id}
            text={activeLetter.text}
            fontUrl="/fonts/ZenKurenaido-Regular.ttf"
            fontSize={24} 
            lineHeight={40}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
            <div style={{ opacity: 0.5, fontSize: 9 }}>
              depth: {Math.round(activeLetter.depth * 100)}%
            </div>
            <button
              style={{ background: 'none', border: 'none', color: '#ff8f8f', opacity: 0.8, cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em' }}
              onClick={() => onBury(activeLetter.id)}
            >
              [ bury ]
            </button>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: '240px', marginLeft: 'auto' }}>
          {showArchive ? (
            <div>
              {archiveLoading && <div style={{ opacity: 0.5 }}>fetching archive...</div>}
              {!archiveLoading && archive.length === 0 && <div style={{ opacity: 0.5 }}>no past letters found.</div>}
              {archive.map((l) => {
                const isMine = l.authorId === selfId
                return (
                  <div
                    key={l.id}
                    onClick={() => onSelectLetter(l)}
                    style={{ cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px', color: isMine ? '#8fd8ff' : '#fff' }}>
                      {l.text}
                    </div>
                    <div style={{ opacity: 0.5 }}>{Math.round(l.depth * 100)}%</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div>
              {liveLetters.length === 0 ? (
                <div style={{ opacity: 0.5 }}>waiting for resonance...</div>
              ) : (
                <div style={{ opacity: 0.8 }}>
                  {unreadCount} new signal{unreadCount > 1 ? 's' : ''} detected.
                  <br />
                  <button
                    onClick={() => onSelectLetter(liveLetters[0])}
                    style={{ marginTop: 12, background: 'none', border: '1px solid rgba(143,216,255,0.4)', color: '#8fd8ff', padding: '4px 12px', fontSize: 10, cursor: 'pointer' }}
                  >
                    READ SIGNAL
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
