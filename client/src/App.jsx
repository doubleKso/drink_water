import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import {
  deviceTimeZone,
  disablePush,
  enablePush,
  notificationPermission,
  syncSubscription,
} from './push.js';
import Glass from './components/Glass.jsx';
import WeekChart from './components/WeekChart.jsx';
import NotifyCard from './components/NotifyCard.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';

function clock(timestamp, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(timestamp);
}

// `dateKey` is already her local date, so format it in UTC to avoid shifting the day.
function prettyDate(dateKey) {
  try {
    return new Intl.DateTimeFormat('my-MM', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${dateKey}T00:00:00Z`));
  } catch {
    return dateKey;
  }
}

const CONFETTI = ['🎉', '💧', '✨', '💙', '🥳'];
const CUP_SIZES = [150, 250, 350, 500];

function formatMl(value) {
  return `${Number(value).toLocaleString('en-US')} ml`;
}

export default function App() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());
  const [selectedMl, setSelectedMl] = useState(null);
  const startupSyncDone = useRef(false);
  const toastTimer = useRef();

  const say = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  // first load, and again whenever she comes back to the app (e.g. by tapping a notification)
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setPermission(notificationPermission());
        refresh();
      }
    };
    const onMessage = (event) => {
      if (event.data?.type === 'refresh') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [refresh]);

  // once per app start: keep the timezone current and re-register the push subscription
  // (phones sometimes rotate subscriptions silently; this heals that)
  useEffect(() => {
    if (!state || startupSyncDone.current) return;
    startupSyncDone.current = true;
    (async () => {
      try {
        let next = state;
        if (next.settings.tz !== deviceTimeZone()) next = await api.saveSettings({ tz: deviceTimeZone() });
        if (next.settings.enabled && next.settings.pushEnabled) {
          next = (await syncSubscription(next.settings)) || next;
        }
        setState(next);
      } catch (error) {
        console.warn('startup sync failed', error);
      }
    })();
  }, [state]);

  useEffect(() => {
    if (state && selectedMl === null) setSelectedMl(state.settings.cupSizeMl);
  }, [state, selectedMl]);

  async function run(action, failMessage) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      say(failMessage || error.message || 'တစ်ခုခု မှားသွားတယ်');
    } finally {
      setBusy(false);
    }
  }

  const onDrink = () =>
    run(async () => {
      const before = state.totalMl;
      const next = await api.drink(selectedMl || state.settings.cupSizeMl);
      setState(next);
      navigator.vibrate?.(25);
      if (before < next.goalMl && next.totalMl >= next.goalMl) {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 4500);
      }
    }, 'မှတ်လို့မရဘူး၊ အင်တာနက် စစ်ကြည့်ပါ');

  const onUndo = () => run(async () => setState(await api.undo()), 'ပြန်ဖျက်လို့မရဘူး');

  const onSaveSettings = useCallback(async (form) => {
    const next = await api.saveSettings(form);
    setState(next);
    setSelectedMl(next.settings.cupSizeMl);
    return next;
  }, []);

  // NOTE: this must stay a direct tap handler. enablePush() asks for permission before any await.
  const onEnable = () =>
    run(async () => {
      const result = await enablePush(state.settings);
      setPermission(notificationPermission());
      if (typeof result === 'string') {
        say(result === 'denied' ? 'Notification ကို ခွင့်မပြုထားပါဘူး' : 'ခွင့်ပြုချက် မရသေးပါဘူး');
        return;
      }
      setState(result.state);
      say('Reminder ဖွင့်ပြီးပါပြီ 🔔');
    }, null);

  const onTest = () =>
    run(async () => {
      try {
        await api.test();
        say('စမ်းသပ်စာ ပို့လိုက်ပါပြီ၊ ခဏစောင့်ပါ 🔔');
      } catch (error) {
        if (error.status === 410 || error.status === 409) {
          await refresh();
          say('Subscription ကုန်သွားပြီ၊ Reminder ပြန်ဖွင့်ပေးပါ');
        } else {
          throw error;
        }
      }
    }, 'စမ်းပို့လို့မရဘူး');

  const onDisable = () =>
    run(async () => {
      setState(await disablePush());
      say('iPhone push ကို ပိတ်လိုက်ပါပြီ');
    }, 'Push ပိတ်လို့မရဘူး');

  const onLinkTelegram = (role) =>
    run(async () => {
      const { url } = await api.telegramLink(role);
      window.location.assign(url);
    }, 'Telegram link ဖွင့်လို့မရဘူး');

  const onDisconnectTelegram = (role) =>
    run(async () => {
      setState(await api.disconnectTelegram(role));
      say('Telegram ချိတ်ဆက်မှု ဖြုတ်ပြီးပါပြီ');
    }, 'Telegram ဖြုတ်လို့မရဘူး');

  const onTestTelegram = (role) =>
    run(async () => {
      await api.testTelegram(role);
      say('Telegram ဆီ စမ်းပို့လိုက်ပါပြီ ✈️');
    }, 'Telegram ဆီ ပို့လို့မရဘူး');

  if (!state) {
    return (
      <main className="app">
        <div className="card center">
          {loadError ? (
            <>
              <p>ချိတ်ဆက်လို့ မရဘူး 😢</p>
              <button className="btn primary" onClick={refresh}>ပြန်စမ်းမယ်</button>
            </>
          ) : (
            <p className="muted">ခဏစောင့်ပါ…</p>
          )}
        </div>
      </main>
    );
  }

  const { count, totalMl, goalMl, streak, week, today, lastDrinkAt, settings } = state;
  const done = totalMl >= goalMl;
  const cupOptions = Array.from(new Set([...CUP_SIZES, settings.cupSizeMl])).sort((a, b) => a - b);

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>💧 ရေသောက်ပါ</h1>
          <p className="muted">{prettyDate(today)}</p>
        </div>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="ချိန်ညှိမယ်">⚙️</button>
      </header>

      <section className="card hero">
        <Glass
          fraction={totalMl / goalMl}
          label={formatMl(totalMl)}
          sub={done ? 'ဒီနေ့ ပြည့်ပြီ 🎉' : `${formatMl(Math.max(0, goalMl - totalMl))} ကျန်`}
        />
        <div className="chips">
          {streak > 0 && <span className="chip fire">🔥 {streak} ရက်ဆက်တိုက်</span>}
          <span className="chip">
            {lastDrinkAt ? `⏱ ${clock(lastDrinkAt, settings.tz)} · ${count} ကြိမ်` : '⏱ ဒီနေ့ မသောက်ရသေးဘူး'}
          </span>
        </div>

        <div className="cup-picker" role="radiogroup" aria-label="ခွက်အရွယ်အစား ရွေးမယ်">
          {cupOptions.map((ml) => (
            <button
              type="button"
              role="radio"
              aria-checked={selectedMl === ml}
              className={`cup-option${selectedMl === ml ? ' selected' : ''}`}
              key={ml}
              onClick={() => setSelectedMl(ml)}
            >
              <span className="cup-icon">▱</span>
              <b>{ml}</b>
              <small>ml</small>
            </button>
          ))}
        </div>

        <button className="drink-btn" onClick={onDrink} disabled={busy}>
          + {selectedMl || settings.cupSizeMl} ml မှတ်မယ်
        </button>
        {count > 0 && (
          <button className="link" onClick={onUndo} disabled={busy}>
            ↩︎ နောက်ဆုံးတစ်ခွက် ပြန်ဖျက်မယ်
          </button>
        )}
      </section>

      <NotifyCard
        state={state}
        permission={permission}
        busy={busy}
        onEnable={onEnable}
        onTest={onTest}
        onDisable={onDisable}
      />

      <section className="card">
        <div className="section-title">
          <div>
            <span className="eyebrow">PROGRESS</span>
            <h2>ဒီအပတ်</h2>
          </div>
          <span className="goal-note">နေ့စဉ် {formatMl(goalMl)}</span>
        </div>
        <WeekChart week={week} goalMl={goalMl} today={today} />
      </section>

      {showSettings && (
        <SettingsSheet
          settings={settings}
          telegram={state.telegram}
          saving={busy}
          onSave={onSaveSettings}
          onClose={() => setShowSettings(false)}
          onLinkTelegram={onLinkTelegram}
          onDisconnectTelegram={onDisconnectTelegram}
          onTestTelegram={onTestTelegram}
        />
      )}

      {celebrate && (
        <div className="celebrate" aria-live="polite" onClick={() => setCelebrate(false)}>
          {Array.from({ length: 22 }, (_, i) => (
            <span
              key={i}
              className="confetti"
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${(i % 7) * 0.18}s`,
                animationDuration: `${2.4 + (i % 5) * 0.4}s`,
              }}
            >
              {CONFETTI[i % CONFETTI.length]}
            </span>
          ))}
          <div className="celebrate-msg">ဒီနေ့ ပန်းတိုင် ပြည့်သွားပြီ! 🎉</div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
