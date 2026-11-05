import { useState } from 'react';
import { formatInterval } from './NotifyCard.jsx';

const INTERVALS = [30, 45, 60, 90, 120];
const GOALS = [1500, 2000, 2500, 3000, 3500, 4000];
const CUP_SIZES = [150, 250, 350, 500];

function TelegramConnection({
  role,
  title,
  description,
  connection,
  configured,
  saving,
  onLink,
  onDisconnect,
  onTest,
}) {
  return (
    <div className="telegram-connection">
      <div className="telegram-mark">✈</div>
      <div className="telegram-copy">
        <b>{title}</b>
        <span>{connection.connected ? connection.name : description}</span>
        {connection.connected ? (
          <div className="mini-actions">
            <button type="button" onClick={() => onTest(role)} disabled={saving}>စမ်းပို့မယ်</button>
            <button type="button" className="danger-text" onClick={() => onDisconnect(role)} disabled={saving}>
              ဖြုတ်မယ်
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="connect-btn"
            onClick={() => onLink(role)}
            disabled={saving || !configured}
          >
            {configured ? 'Telegram ချိတ်မယ်' : 'Bot setup လိုပါသေးတယ်'}
          </button>
        )}
      </div>
      {connection.connected && <span className="connected-badge">ချိတ်ပြီး</span>}
    </div>
  );
}

export default function SettingsSheet({
  settings,
  telegram,
  saving,
  onSave,
  onClose,
  onLinkTelegram,
  onDisconnectTelegram,
  onTestTelegram,
}) {
  const [form, setForm] = useState({ ...settings });
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const timesOk = form.start < form.end;
  const goalOptions = Array.from(new Set([...GOALS, form.goalMl])).sort((a, b) => a - b);
  const cupOptions = Array.from(new Set([...CUP_SIZES, form.cupSizeMl])).sort((a, b) => a - b);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="ချိန်ညှိမယ်" onClick={onClose}>
      <form
        className="sheet"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (timesOk) onSave(form);
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <span className="eyebrow">PREFERENCES</span>
            <h2>ချိန်ညှိမယ်</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="ပိတ်မယ်">×</button>
        </div>

        <section className="settings-section">
          <h3>ရေပန်းတိုင်</h3>
          <label className="field">
            <span>နေ့စဉ် သောက်မယ့်ပမာဏ</span>
            <select value={form.goalMl} onChange={(event) => set({ goalMl: Number(event.target.value) })}>
              {goalOptions.map((ml) => <option key={ml} value={ml}>{ml.toLocaleString('en-US')} ml</option>)}
            </select>
          </label>

          <div className="field">
            <span>ပုံမှန်ခွက်အရွယ်အစား</span>
            <div className="size-grid">
              {cupOptions.map((ml) => (
                <button
                  key={ml}
                  type="button"
                  className={form.cupSizeMl === ml ? 'active' : ''}
                  onClick={() => set({ cupSizeMl: ml })}
                >
                  <b>{ml}</b><small>ml</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-title compact">
            <h3>သတိပေးချိန်</h3>
            <label className="toggle" aria-label="Reminder ပို့မယ်">
              <input type="checkbox" checked={form.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
              <span />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>စချိန်</span>
              <input type="time" value={form.start} onChange={(event) => set({ start: event.target.value })} required />
            </label>
            <label className="field">
              <span>ပြီးချိန်</span>
              <input type="time" value={form.end} onChange={(event) => set({ end: event.target.value })} required />
            </label>
          </div>
          {!timesOk && <p className="error">စချိန်က ပြီးချိန်ထက် စောရပါမယ်</p>}

          <label className="field">
            <span>သတိပေးမယ့် အချိန်ခြား</span>
            <select value={form.intervalMin} onChange={(event) => set({ intervalMin: Number(event.target.value) })}>
              {INTERVALS.map((minutes) => (
                <option key={minutes} value={minutes}>{formatInterval(minutes)}</option>
              ))}
            </select>
          </label>

          <label className="setting-line">
            <span>
              <b>စနေ၊ တနင်္ဂနွေ မပို့ပါ</b>
              <small>ရုံးပိတ်ရက်တွေမှာ reminder အနားပေးမယ်</small>
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={form.skipWeekends}
                onChange={(event) => set({ skipWeekends: event.target.checked })}
              />
              <span />
            </span>
          </label>
        </section>

        <section className="settings-section telegram-section">
          <div>
            <span className="eyebrow">BACKUP CHANNEL</span>
            <h3>Telegram</h3>
            <p className="section-help">iPhone push နောက်ကျရင် Telegram ကနေပါ တစ်ပြိုင်နက် သတိပေးနိုင်ပါတယ်။</p>
          </div>

          <TelegramConnection
            role="reminder"
            title="ရေသောက် Reminder"
            description="Reminder လက်ခံမယ့် Telegram"
            connection={telegram.reminder}
            configured={telegram.configured}
            saving={saving}
            onLink={onLinkTelegram}
            onDisconnect={onDisconnectTelegram}
            onTest={onTestTelegram}
          />
          <label className="setting-line nested">
            <span><b>Telegram backup ပို့မယ်</b></span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={telegram.reminder.connected && form.telegramReminderEnabled}
                onChange={(event) => set({ telegramReminderEnabled: event.target.checked })}
                disabled={!telegram.reminder.connected}
              />
              <span />
            </span>
          </label>

          <TelegramConnection
            role="owner"
            title="ပန်းတိုင်ပြည့် အသိပေးစာ"
            description="“ဒီနေ့ ပြည့်ပြီ” လို့ လက်ခံမယ့် Telegram"
            connection={telegram.owner}
            configured={telegram.configured}
            saving={saving}
            onLink={onLinkTelegram}
            onDisconnect={onDisconnectTelegram}
            onTest={onTestTelegram}
          />
          <label className="setting-line nested">
            <span><b>ပြည့်တာနဲ့ အသိပေးမယ်</b></span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={telegram.owner.connected && form.telegramGoalAlertEnabled}
                onChange={(event) => set({ telegramGoalAlertEnabled: event.target.checked })}
                disabled={!telegram.owner.connected}
              />
              <span />
            </span>
          </label>
        </section>

        <div className="sheet-actions">
          <button type="button" className="btn ghost" onClick={onClose}>မလုပ်တော့ဘူး</button>
          <button type="submit" className="btn primary" disabled={saving || !timesOk}>
            {saving ? 'သိမ်းနေပါတယ်…' : 'သိမ်းမယ်'}
          </button>
        </div>
      </form>
    </div>
  );
}
