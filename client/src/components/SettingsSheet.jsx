import { useCallback, useEffect, useRef, useState } from 'react';
import { formatInterval } from './NotifyCard.jsx';

const INTERVALS = [30, 45, 60, 90, 120];
const GOALS = [1500, 2000, 2500, 3000, 3500, 4000];
const CUP_SIZES = [150, 250, 350, 500];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTimes(value) {
  const mainWindow = HM.test(value.start) && HM.test(value.end) && value.start < value.end;
  const breakWindow = !value.breakEnabled || (
    HM.test(value.breakStart) && HM.test(value.breakEnd) && value.breakStart < value.breakEnd
  );
  return mainWindow && breakWindow;
}

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
  const [saveStatus, setSaveStatus] = useState('idle');
  const [closing, setClosing] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const latestForm = useRef(form);
  const saveTimer = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const revision = useRef(0);
  const queuedRevision = useRef(0);
  const savedRevision = useRef(0);
  const mounted = useRef(true);
  const timesOk = validTimes(form);
  const goalOptions = Array.from(new Set([...GOALS, form.goalMl])).sort((a, b) => a - b);
  const cupOptions = Array.from(new Set([...CUP_SIZES, form.cupSizeMl])).sort((a, b) => a - b);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(saveTimer.current);
    };
  }, []);

  const persist = useCallback((snapshot, targetRevision) => {
    clearTimeout(saveTimer.current);
    if (targetRevision <= queuedRevision.current) return saveQueue.current;
    queuedRevision.current = targetRevision;
    if (mounted.current) setSaveStatus('saving');

    const request = saveQueue.current
      .catch(() => undefined)
      .then(() => onSave(snapshot));
    saveQueue.current = request;
    request.then(
      () => {
        savedRevision.current = Math.max(savedRevision.current, targetRevision);
        if (mounted.current && targetRevision === revision.current) setSaveStatus('saved');
      },
      () => {
        if (queuedRevision.current === targetRevision) queuedRevision.current = targetRevision - 1;
        if (mounted.current && targetRevision === revision.current) setSaveStatus('error');
      },
    );
    return request;
  }, [onSave]);

  const scheduleSave = useCallback((next) => {
    const nextRevision = ++revision.current;
    clearTimeout(saveTimer.current);
    if (!validTimes(next)) {
      setSaveStatus('invalid');
      return;
    }
    setSaveStatus('pending');
    saveTimer.current = setTimeout(() => persist(next, nextRevision), 350);
  }, [persist]);

  const set = useCallback((patch) => {
    const next = { ...latestForm.current, ...patch };
    latestForm.current = next;
    setForm(next);
    scheduleSave(next);
  }, [scheduleSave]);

  const flushSave = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const targetRevision = revision.current;
    if (!validTimes(latestForm.current)) throw new Error('invalid time range');
    if (savedRevision.current >= targetRevision) return;
    await persist(latestForm.current, targetRevision);
  }, [persist]);

  const requestClose = useCallback(async () => {
    if (closing || !validTimes(latestForm.current)) return;
    setClosing(true);
    try {
      await flushSave();
      onClose();
    } catch {
      if (mounted.current) {
        setSaveStatus('error');
        setClosing(false);
      }
    }
  }, [closing, flushSave, onClose]);

  const afterSave = useCallback(async (action, role) => {
    try {
      await flushSave();
      await action(role);
    } catch {
      if (mounted.current) setSaveStatus('error');
    }
  }, [flushSave]);

  const statusText = {
    idle: 'ပြောင်းလိုက်တာနဲ့ အလိုအလျောက်သိမ်းမယ်',
    pending: 'ခဏနေရင် အလိုအလျောက်သိမ်းမယ်…',
    saving: 'သိမ်းနေပါတယ်…',
    saved: 'သိမ်းပြီးပါပြီ ✓',
    invalid: 'အချိန်ကို မှန်အောင် ပြင်ပေးပါ',
    error: 'မသိမ်းနိုင်သေးပါ—အင်တာနက် စစ်ပါ',
  }[saveStatus];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="ချိန်ညှိမယ်" onClick={requestClose}>
      <form
        className="sheet"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          requestClose();
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div>
            <span className="eyebrow">PREFERENCES</span>
            <h2>ချိန်ညှိမယ်</h2>
          </div>
          <button type="button" className="close-btn" onClick={requestClose} aria-label="ပိတ်မယ်">×</button>
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
          {!timesOk && <p className="error">စချိန်နဲ့ နားချိန်တွေကို အစော–အနောက် မှန်အောင် ပြင်ပေးပါ</p>}

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

          <label className="setting-line">
            <span>
              <b>ထမင်းစားချိန် အနားပေးမယ်</b>
              <small>ဒီအချိန်အတွင်း reminder မပို့ပါ</small>
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={form.breakEnabled}
                onChange={(event) => set({ breakEnabled: event.target.checked })}
              />
              <span />
            </span>
          </label>
          {form.breakEnabled && (
            <div className="field-row nested-fields">
              <label className="field">
                <span>နားချိန်စ</span>
                <input type="time" value={form.breakStart} onChange={(event) => set({ breakStart: event.target.value })} />
              </label>
              <label className="field">
                <span>ပြန်စမယ့်အချိန်</span>
                <input type="time" value={form.breakEnd} onChange={(event) => set({ breakEnd: event.target.value })} />
              </label>
            </div>
          )}

          <label className="setting-line">
            <span>
              <b>တစ်ခါပဲ ထပ်သတိပေးမယ်</b>
              <small>မသောက်သေးရင် {form.followUpMin} မိနစ်အကြာ ပေါ့ပေါ့လေး ထပ်ပို့မယ်</small>
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={form.followUpEnabled}
                onChange={(event) => set({ followUpEnabled: event.target.checked })}
              />
              <span />
            </span>
          </label>
          {form.followUpEnabled && (
            <label className="field compact-field">
              <span>ထပ်သတိပေးမယ့်အချိန်</span>
              <select value={form.followUpMin} onChange={(event) => set({ followUpMin: Number(event.target.value) })}>
                {[10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} မိနစ်အကြာ</option>)}
              </select>
            </label>
          )}

          <label className="setting-line">
            <span>
              <b>အချိန်နဲ့အညီ ညှိပေးမယ်</b>
              <small>ညနေပိုင်း နောက်ကျနေရင် ပိုစော၊ ရှေ့ရောက်နေရင် ပိုကျဲမယ်</small>
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={form.adaptiveEnabled}
                onChange={(event) => set({ adaptiveEnabled: event.target.checked })}
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
            onLink={(role) => afterSave(onLinkTelegram, role)}
            onDisconnect={(role) => afterSave(onDisconnectTelegram, role)}
            onTest={(role) => afterSave(onTestTelegram, role)}
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
            onLink={(role) => afterSave(onLinkTelegram, role)}
            onDisconnect={(role) => afterSave(onDisconnectTelegram, role)}
            onTest={(role) => afterSave(onTestTelegram, role)}
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
          <label className="setting-line nested consent-line">
            <span>
              <b>မမှတ်ရသေးရင် ဂရုစိုက်စာပို့မယ်</b>
              <small>သူ့သဘောတူညီချက်နဲ့သာ ဖွင့်ပါ</small>
            </span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={telegram.owner.connected && form.telegramNoDrinkAlertEnabled}
                onChange={(event) => set({ telegramNoDrinkAlertEnabled: event.target.checked })}
                disabled={!telegram.owner.connected}
              />
              <span />
            </span>
          </label>
          {telegram.owner.connected && form.telegramNoDrinkAlertEnabled && (
            <label className="field owner-alert-time">
              <span>ဒီအချိန်ထိ မမှတ်ရသေးရင် ပို့မယ်</span>
              <input
                type="time"
                value={form.ownerNoDrinkAlertTime}
                onChange={(event) => set({ ownerNoDrinkAlertTime: event.target.value })}
              />
            </label>
          )}
        </section>

        <section className="settings-section custom-message-section">
          <div>
            <span className="eyebrow">YOUR WORDS</span>
            <h3>ကိုယ်ပိုင်စာလေးတွေ</h3>
            <p className="section-help">ထည့်ထားတဲ့စာတွေကို reminder တွေနဲ့ ရောပြီး ပို့ပေးမယ်။</p>
          </div>
          {(form.customMessages || []).map((message, index) => (
            <div className="custom-message" key={index}>
              <input
                aria-label={`ကိုယ်ပိုင်စာ ${index + 1}`}
                maxLength="120"
                value={message}
                onChange={(event) => {
                  const messages = [...form.customMessages];
                  messages[index] = event.target.value;
                  set({ customMessages: messages });
                }}
              />
              <button
                type="button"
                aria-label="စာဖျက်မယ်"
                onClick={() => set({ customMessages: form.customMessages.filter((_, itemIndex) => itemIndex !== index) })}
              >×</button>
            </div>
          ))}
          {form.customMessages.length < 20 && (
            <div className="add-message">
              <input
                maxLength="120"
                value={newMessage}
                placeholder="ဥပမာ — ဒီနေ့ အစည်းအဝေးကောင်းပါစေ 💙"
                onChange={(event) => setNewMessage(event.target.value)}
              />
              <button
                type="button"
                disabled={!newMessage.trim()}
                onClick={() => {
                  if (!newMessage.trim()) return;
                  set({ customMessages: [...form.customMessages, newMessage.trim()] });
                  setNewMessage('');
                }}
              >ထည့်မယ်</button>
            </div>
          )}
        </section>

        <div className="sheet-actions">
          <div className={`save-status ${saveStatus}`} role="status">{statusText}</div>
          <button type="submit" className="btn primary" disabled={saving || closing || !timesOk}>
            {closing ? 'ခဏလေး…' : 'ပြီးပါပြီ'}
          </button>
        </div>
      </form>
    </div>
  );
}
