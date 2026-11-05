// The words she sees in each notification. Edit these freely: make them yours!

export const TITLE = '💧 ရေသောက်ချိန်ရောက်ပြီ';

const REMINDERS = [
  'ရေတစ်ခွက် သောက်လိုက်ပါဦးနော် 💧',
  'အလုပ်များနေလည်း ရေလေးသောက်ဖို့ မမေ့နဲ့နော်',
  'ခဏနားပြီး ရေတစ်ခွက် သောက်လိုက်ပါ၊ အလုပ်က မပြေးပါဘူး 😘',
  'ကိုယ် စိတ်ပူနေတယ်နော်၊ ရေသောက်ပြီးပြီလား? 🥺',
  'နှုတ်ခမ်းလေး ကျန်းမာနေဖို့ ရေလေး သောက်လိုက်ပါနော် 💕',
  'ရေခွက်လေး လက်လှမ်းမီရာမှာ ရှိလား? သောက်လိုက်ပါဦး 🥤',
  'ကိုယ့်အတွက်ပါ ရေလေး သောက်ပေးပါနော် 🫶',
  'တစ်ခွက်ပဲလေ၊ အခုသောက်လိုက်ရင် ပြီးသွားပြီ 💧',
];

const FIRST_OF_DAY = [
  'မင်္ဂလာနံနက်ခင်းပါ ☀️ ဒီနေ့ ရေ {goal} သောက်ကြမယ်နော် 💧',
  'ဒီနေ့လည်း အားပေးနေမယ်နော် ☀️ ပထမဆုံး ရေတစ်ခွက်ကနေ စလိုက်ရအောင် 💧',
];

const ALMOST_DONE = [
  'နောက်ဆုံး ရေတစ်ခွက်ပဲ ကျန်တော့တယ်! 🎉',
  'ပန်းတိုင်နီးပြီ၊ နောက်ဆုံးတစ်ခွက် သောက်လိုက်ရင် ပြည့်ပြီ 💪',
];

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

/**
 * Builds the notification text.
 * `isFirstOfDay` is true when nothing has been drunk yet today.
 */
export function buildReminder({ totalMl: ml, goalMl: targetMl, count, goal, isFirstOfDay = false, random = Math.random }) {
  // count/goal fallback keeps older callers and persisted deployments harmless during rollout.
  const totalMl = ml ?? count ?? 0;
  const goalMl = targetMl ?? goal ?? 0;
  let text;
  if (goalMl - totalMl <= 500 && totalMl > 0) text = pick(ALMOST_DONE, random);
  else if (isFirstOfDay) text = pick(FIRST_OF_DAY, random).replace('{goal}', `${goalMl} ml`);
  else text = pick(REMINDERS, random);

  return {
    title: TITLE,
    body: `${text}\n(ယနေ့ ${totalMl.toLocaleString('en-US')}/${goalMl.toLocaleString('en-US')} ml)`,
  };
}
