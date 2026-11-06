import { localParts, shiftDate } from './time.js';

function amountOf(entry, fallbackMl) {
  if (Number.isFinite(entry)) return fallbackMl;
  return Number.isInteger(entry?.ml) && entry.ml > 0 ? entry.ml : 0;
}

function timestampOf(entry) {
  return Number.isFinite(entry) ? entry : Number(entry?.at) || 0;
}

export function totalForDate(device, dateKey) {
  return (device.log[dateKey] || []).reduce(
    (sum, entry) => sum + amountOf(entry, device.settings.cupSizeMl),
    0,
  );
}

/** Everything the client needs to render its home screen. */
export function buildState(device, now = new Date()) {
  const { goalMl, tz } = device.settings;
  const { date: today } = localParts(now, tz);
  const todayEntries = device.log[today] || [];
  const totalMl = totalForDate(device, today);

  // last 7 days, oldest first, ending today
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftDate(today, -i);
    week.push({ date, ml: totalForDate(device, date), count: (device.log[date] || []).length });
  }

  const [year, monthNumber] = today.split('-').map(Number);
  const monthLength = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const month = [];
  for (let day = 1; day <= monthLength; day++) {
    const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const ml = totalForDate(device, date);
    month.push({
      date,
      ml,
      count: (device.log[date] || []).length,
      done: ml >= goalMl,
    });
  }

  // streak = consecutive days at or above goal. Today only counts once it is reached,
  // but an unfinished today does not break the streak yet.
  let streak = 0;
  let cursor = totalMl >= goalMl ? today : shiftDate(today, -1);
  while (totalForDate(device, cursor) >= goalMl && streak < 3650) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  const lastDrinkAt = todayEntries.length
    ? Math.max(...todayEntries.map(timestampOf))
    : null;
  const telegram = device.telegram || {};
  const weekTotalMl = week.reduce((sum, day) => sum + day.ml, 0);

  return {
    settings: device.settings,
    today,
    count: todayEntries.length,
    totalMl,
    goalMl,
    streak,
    week,
    weekSummary: {
      totalMl: weekTotalMl,
      averageMl: Math.round(weekTotalMl / 7),
      completedDays: week.filter((day) => day.ml >= goalMl).length,
    },
    month,
    todayLog: [...todayEntries]
      .sort((a, b) => timestampOf(b) - timestampOf(a))
      .map((entry) => ({ at: timestampOf(entry), ml: amountOf(entry, device.settings.cupSizeMl) })),
    lastDrinkAt,
    subscribed: Boolean(device.subscription),
    telegram: {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      reminder: telegram.reminder ? { connected: true, name: telegram.reminder.name } : { connected: false },
      owner: telegram.owner ? { connected: true, name: telegram.owner.name } : { connected: false },
    },
  };
}

export function lastDrinkTimestamp(device) {
  let latest = 0;
  for (const list of Object.values(device.log)) {
    for (const entry of list) {
      const timestamp = timestampOf(entry);
      if (timestamp > latest) latest = timestamp;
    }
  }
  return latest;
}
