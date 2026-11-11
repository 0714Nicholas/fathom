'use client'

import { useEffect, useState } from 'react'
import type { usePushReminder } from '@/hooks/usePushReminder'
import { formatRemindMinute } from '@/lib/push/shared'

type Reminder = ReturnType<typeof usePushReminder>

const DAY_MINUTES = 24 * 60

// 「毎日 21:00 の潜航を知らせる」。押すだけで、いま潜っている時刻に合わせて設定できる
export function ReminderControl({ reminder, suggestedMinute }: {
  reminder: Reminder
  suggestedMinute: number
}) {
  const [editing, setEditing] = useState(false)
  const [minute, setMinute] = useState(suggestedMinute)
  const [weekdaysOnly, setWeekdaysOnly] = useState(false)

  // 編集していないときは、保存済みの設定か、いま潜っている時刻に合わせておく
  useEffect(() => {
    if (editing) return
    setMinute(reminder.settings?.remindMinute ?? suggestedMinute)
    setWeekdaysOnly(reminder.settings?.weekdaysOnly ?? false)
  }, [editing, reminder.settings, suggestedMinute])

  if (reminder.state === 'unsupported') return null

  if (reminder.state === 'needs-install') {
    return (
      <div className="font-mincho reminder-note">
        ホーム画面に追加すると、毎日の潜航を通知で受け取れます<br />
        （共有 →「ホーム画面に追加」）
      </div>
    )
  }

  if (reminder.state === 'blocked') {
    return <div className="font-mincho reminder-note">通知はブラウザの設定でオフになっています</div>
  }

  const message = reminder.message ? <div className="font-mincho reminder-message">{reminder.message}</div> : null

  if (reminder.state === 'on' && reminder.settings && !editing) {
    const days = reminder.settings.weekdaysOnly ? '平日' : '毎日'
    return (
      <div className="reminder">
        <div className="font-mincho reminder-status">
          {days} {formatRemindMinute(reminder.settings.remindMinute)} の潜航を知らせます
        </div>
        <div className="reminder-actions">
          <button type="button" className="hud-btn landing-link-quiet" disabled={reminder.busy} onClick={() => setEditing(true)}>
            <span className="font-mincho">[ 変える ]</span>
          </button>
          <button type="button" className="hud-btn landing-link-quiet" disabled={reminder.busy} onClick={() => void reminder.sendTest()}>
            <span className="font-mincho">[ 試しに送る ]</span>
          </button>
          <button type="button" className="hud-btn landing-link-quiet" disabled={reminder.busy} onClick={() => void reminder.disable()}>
            <span className="font-mincho">[ 止める ]</span>
          </button>
        </div>
        {message}
      </div>
    )
  }

  const days = weekdaysOnly ? '平日' : '毎日'
  const step = (delta: number) => setMinute((current) => (current + delta + DAY_MINUTES) % DAY_MINUTES)

  return (
    <div className="reminder">
      {editing ? (
        <div className="reminder-picker">
          <button type="button" className="hud-btn landing-link" aria-label="30分早くする" onClick={() => step(-30)}>‹</button>
          <span className="reminder-time">{formatRemindMinute(minute)}</span>
          <button type="button" className="hud-btn landing-link" aria-label="30分遅くする" onClick={() => step(30)}>›</button>
          <button
            type="button"
            className="hud-btn landing-link-quiet"
            aria-pressed={weekdaysOnly}
            onClick={() => setWeekdaysOnly((value) => !value)}
          >
            <span className="font-mincho">[ {days} ]</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={`hud-btn ${editing ? 'landing-link' : 'landing-link-quiet'}`}
        disabled={reminder.busy}
        onClick={async () => {
          await reminder.save({ remindMinute: minute, weekdaysOnly })
          setEditing(false)
        }}
      >
        <span className="font-mincho">[ {days} {formatRemindMinute(minute)} の潜航を知らせる ]</span>
      </button>
      <button
        type="button"
        className="hud-btn landing-link-quiet reminder-sub"
        disabled={reminder.busy}
        onClick={() => setEditing((value) => !value)}
      >
        <span className="font-mincho">{editing ? 'やめる' : '時刻を変える'}</span>
      </button>
      {message}
    </div>
  )
}
