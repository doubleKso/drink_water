// Sunday-first, matching Date.getUTCDay(): နွေ လာ ဂါ ဟူး ကြာ သော စနေ
const DAY_NAMES = ['နွေ', 'လာ', 'ဂါ', 'ဟူး', 'ကြာ', 'သော', 'စနေ'];

export default function WeekChart({ week, goalMl, today }) {
  return (
    <div className="week" role="list">
      {week.map((day) => {
        const share = Math.min(1, day.ml / goalMl);
        const height = day.ml > 0 ? Math.max(share * 100, 10) : 0;
        const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
        const done = day.ml >= goalMl;
        return (
          <div
            key={day.date}
            role="listitem"
            className={`day${day.date === today ? ' is-today' : ''}`}
            aria-label={`${day.date}: ${day.ml}/${goalMl} ml`}
          >
            <div className="bar-track">
              <div className={`bar${done ? ' done' : ''}`} style={{ height: `${height}%` }} />
            </div>
            <span className="count">{done ? '✓' : day.ml > 0 ? `${+(day.ml / 1000).toFixed(1)}L` : '0'}</span>
            <span className="dow">{DAY_NAMES[weekday]}</span>
          </div>
        );
      })}
    </div>
  );
}
