import { isIOS, isStandalone, pushSupported } from '../push.js';

export function formatInterval(min) {
  if (min < 60) return `${min} မိနစ်`;
  return `${+(min / 60).toFixed(1)} နာရီ`;
}

export default function NotifyCard({ state, permission, busy, onEnable, onTest, onDisable }) {
  // 1) iPhone, opened in Safari instead of from the Home Screen icon: push is impossible here
  if (isIOS() && !isStandalone()) {
    return (
      <section className="card notify">
        <h2>📲 iPhone မှာ Home Screen ထည့်ပါ</h2>
        <p className="muted">Notification ရဖို့ app ကို Home Screen ကနေ ဖွင့်ရပါမယ်။</p>
        <ol className="steps">
          <li>Safari ရဲ့ အောက်ဘက်က <b>Share</b> ခလုတ် (⬆︎) ကို နှိပ်ပါ</li>
          <li><b>Add to Home Screen</b> ကို ရွေးပါ</li>
          <li>Home Screen ပေါ်က <b>ရေသောက်ပါ</b> icon ကနေ ပြန်ဖွင့်ပါ</li>
        </ol>
        <p className="muted small">(Safari ထဲမှာ တိုက်ရိုက်ဖွင့်ထားရင် notification မရနိုင်ပါဘူး)</p>
      </section>
    );
  }

  // 2) browser that cannot do push at all
  if (!pushSupported()) {
    return (
      <section className="card notify">
        <h2>🔕 Notification မရနိုင်ပါ</h2>
        <p className="muted">ဒီ browser မှာ notification မထောက်ပံ့ပါဘူး။ Safari / Chrome အသစ်နဲ့ ဖွင့်ကြည့်ပါ။</p>
      </section>
    );
  }

  // 3) she said "don't allow" earlier
  if (permission === 'denied') {
    return (
      <section className="card notify">
        <h2>🔕 Notification ပိတ်ထားတယ်</h2>
        <p className="muted">
          ဖုန်း <b>Settings → Notifications → ရေသောက်ပါ</b> ထဲမှာ Allow လုပ်ပေးပြီး app ကို ပြန်ဖွင့်ပါ။
        </p>
      </section>
    );
  }

  // 4) all set
  if (permission === 'granted' && state.subscribed && state.settings.enabled && state.settings.pushEnabled) {
    const { start, end, intervalMin } = state.settings;
    const telegramBackup = state.telegram?.reminder?.connected && state.settings.telegramReminderEnabled;
    return (
      <section className="card notify">
        <div className="notify-title">
          <span className="status-dot" />
          <div>
            <span className="eyebrow">REMINDERS ON</span>
            <h2>သတိပေးစနစ် အသင့်ဖြစ်ပြီ</h2>
          </div>
        </div>
        <p className="muted">
          {start}–{end} အတွင်း {formatInterval(intervalMin)} ခြားတစ်ခါ သတိပေးမယ်
        </p>
        <div className="delivery-row">
          <span> iPhone push</span>
          {telegramBackup && <span>✈️ Telegram backup</span>}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={onTest} disabled={busy}>စမ်းပို့ကြည့်မယ်</button>
          <button className="btn ghost danger" onClick={onDisable} disabled={busy}>Push ပိတ်မယ်</button>
        </div>
      </section>
    );
  }

  // 5) not enabled yet (first visit, switched off, or subscription lost)
  return (
    <section className="card notify">
      <h2>🔔 Reminder ဖွင့်ရအောင်</h2>
      <p className="muted">ရေသောက်ချိန်ရောက်ရင် ဖုန်းမှာ သတိပေးပါမယ်။</p>
      <button className="btn primary wide" onClick={onEnable} disabled={busy}>
        🔔 Reminder ဖွင့်မယ်
      </button>
    </section>
  );
}
