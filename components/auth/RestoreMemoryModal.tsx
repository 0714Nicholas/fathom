import React, { useState } from 'react'

const modalStyles = `
  .restore-modal-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(2, 5, 10, 0.85);
    backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; animation: fadeIn 0.8s ease forwards;
  }
  .restore-modal-content {
    display: flex; flex-direction: column; align-items: center;
    padding: 32px; width: 100%; max-width: 400px;
  }
  .seed-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.2);
    color: rgba(143, 216, 255, 0.9);
    font-family: monospace;
    font-size: 16px;
    letter-spacing: 0.1em;
    text-align: center;
    width: 100%;
    padding: 12px 0;
    margin-bottom: 24px;
    outline: none;
    transition: all 0.5s ease;
  }
  .seed-input:focus {
    border-bottom: 1px solid rgba(143, 216, 255, 0.8);
    box-shadow: 0 4px 12px rgba(143, 216, 255, 0.1);
  }
  .seed-input::placeholder {
    color: rgba(255,255,255,0.15);
  }
  @keyframes fadeIn {
    to { opacity: 1; }
  }
`

export function RestoreMemoryModal({ 
  onClose, 
  onRestore 
}: { 
  onClose: () => void, 
  onRestore: (seed: string) => Promise<boolean> 
}) {
  const [inputVal, setInputVal] = useState('')
  const [error, setError] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || isRestoring) return
    
    setIsRestoring(true)
    setError(false)
    const success = await onRestore(inputVal.trim())
    
    if (!success) {
      setError(true)
      setIsRestoring(false)
    }
  }

  return (
    <div className="restore-modal-overlay">
      <style>{modalStyles}</style>
      <div className="restore-modal-content">
        <div className="font-mincho" style={{ fontSize: 13, opacity: 0.7, marginBottom: 32, letterSpacing: '0.15em', textAlign: 'center', lineHeight: 2 }}>
          かつての結晶の記憶を<br/>水底へ提示してください。
        </div>
        
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            type="text"
            className="seed-input"
            placeholder="e.g. silent pale snow"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setError(false); }}
            autoFocus
            spellCheck={false}
          />
          
          <div style={{ height: 24, marginBottom: 24, display: 'flex', alignItems: 'center' }}>
            {error ? (
              <span className="font-mincho" style={{ color: '#ff8f8f', fontSize: 11, letterSpacing: '0.1em' }}>
                その記憶は水底で見つかりませんでした。
              </span>
            ) : isRestoring ? (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.2em' }}>
                searching in the deep...
              </span>
            ) : null}
          </div>
          
          <div style={{ display: 'flex', gap: 32 }}>
            <button type="button" className="hud-btn" onClick={onClose} disabled={isRestoring}>
              [ cancel ]
            </button>
            <button type="submit" className="hud-btn" style={{ color: inputVal ? '#8fd8ff' : 'inherit' }} disabled={!inputVal || isRestoring}>
              [ descend ]
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}