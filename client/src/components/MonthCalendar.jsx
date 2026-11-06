const DAYS = ['တနင်္ဂနွေ', 'တနင်္လာ', 'အင်္ဂါ', 'ဗုဒ္ဓဟူး', 'ကြာသပတေး', 'သောကြာ', 'စနေ'];

function monthTitle(dateKey) {
  try {
    return new Intl.DateTimeFormat('my-MM', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${dateKey}T00:00:00Z`));
  } catch {
    return dateKey.slice(0, 7);
  }
}

export default function MonthCalendar({ days, today, summary }) {
  const firstDay = days.length
    ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay()
    : 0;
  return (
    <section className="card month-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">MONTHLY VIEW</span>
          <h2>{monthTitle(today)}</h2>
        </div>
        <span className="goal-note">{summary.completedDays}/7 ရက်ပြည့်</span>
      </div>
      <div className="week-summary">
        <span><b>{summary.totalMl.toLocaleString('en-US')}</b><small>ဒီအပတ် ml</small></span>
        <span><b>{summary.averageMl.toLocaleString('en-US')}</b><small>နေ့စဉ်ပျမ်းမျှ</small></span>
      </div>
      <div className="month-grid" aria-label="လစဉ် ရေသောက်မှတ်တမ်း">
        {DAYS.map((day) => <span className="calendar-dow" key={day}>{day.slice(0, 2)}</span>)}
        {Array.from({ length: firstDay }, (_, index) => <i key={`blank-${index}`} />)}
        {days.map((day) => {
          const isFuture = day.date > today;
          return (
            <div
              key={day.date}
              className={`calendar-day${day.done ? ' done' : ''}${day.date === today ? ' today' : ''}${isFuture ? ' future' : ''}`}
              title={`${day.date}: ${day.ml} ml`}
            >
              <b>{Number(day.date.slice(-2))}</b>
              {day.done ? <span>✓</span> : day.ml > 0 ? <span className="drop">•</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
