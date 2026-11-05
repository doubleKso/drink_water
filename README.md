# 💧 ရေသောက်ပါ — Water Reminder (React PWA + Web Push + Telegram)

ရုံးမှာ အလုပ်များနေတဲ့သူ ရေသောက်ဖို့ မမေ့စေဖို့ သတိပေးတဲ့ app။ iPhone Home Screen မှာ install လုပ်ပြီး notification ရနိုင်ပါတယ်။

**ပါတာတွေ**
- ml နဲ့မှတ်တမ်းတင်ပြီး 150 / 250 / 350 / 500 ml ခွက်အရွယ်အစားကို လွယ်လွယ်ရွေးနိုင်တယ်
- Glass ထဲ ရေဖြည့်သွားတဲ့ progress + နောက်ဆုံးမှတ်တမ်းကို ပြန်ဖျက်လို့ရ
- ရုံးချိန်အတွင်း သတ်မှတ်ချိန်ခြား iPhone push + Telegram backup reminder
- စနေ၊ တနင်္ဂနွေ reminder မပို့ဖို့ setting
- ပန်းတိုင်ပြည့်တဲ့အခါ ကိုယ့် Telegram ဆီ “ဒီနေ့ ပြည့်ပြီ” အသိပေးစာ
- Streak 🔥၊ အပတ်စဉ် chart၊ ပန်းတိုင်ပြည့်ရင် 🎉
- စာသားတွေ ကိုယ်တိုင် ပြင်လို့ရ (`server/lib/messages.js`)

```
water-reminder/
├─ client/   React + Vite PWA (UI, service worker, manifest, icons)
└─ server/   Node + Express (API, push ပို့တာ, minute scheduler, db.json)
```

## ၁။ ကွန်ပျူတာမှာ run ကြည့်ရန်

Node 22 (LTS) လိုပါတယ်။

```bash
npm run setup     # server + client dependencies ထည့်
npm run build     # React app ကို build လုပ်
npm start         # http://localhost:3001
```

Code ပြင်ရင် terminal နှစ်ခုဖွင့်ပါ — `npm run dev:server` နဲ့ `npm run dev:client` (http://localhost:5173၊ `/api` ကို server ဆီ proxy လုပ်ပေးတယ်)။

Server unit tests: `npm test`

> ⚠️ **iPhone မှာ push စမ်းဖို့ HTTPS လိုတယ်။** `localhost` ကို ဖုန်းကနေ ဖွင့်လို့မရဘူး။ ကိုယ့်ကွန်ပျူတာမှာတင် iPhone push စမ်းချင်ရင် tunnel (ဥပမာ `cloudflared` / `ngrok`) သုံးပါ၊ ဒါမှမဟုတ် deploy လုပ်ပြီးမှ စမ်းပါ။ Desktop Chrome မှာတော့ `localhost` မှာတင် push စမ်းလို့ရတယ်။

## ၂။ Deploy လုပ်ရန်

HTTPS ပါပြီး Node run ပေးတဲ့ host ဘာဖြစ်ဖြစ် ရတယ် (Render, Railway, Fly.io, ကိုယ်ပိုင် VPS …)။

| Setting | တန်ဖိုး |
|---|---|
| Build command | `npm run setup && npm run build` |
| Start command | `npm start` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npm run keys` နဲ့ ထုတ်ပါ |
| `VAPID_SUBJECT` | `mailto:ကိုယ့်အီးမေးလ်` (Apple/Google push service တွေဆီ ပို့တဲ့ ဆက်သွယ်ရန်) |
| `TELEGRAM_BOT_TOKEN` | BotFather ပေးတဲ့ bot token (Telegram feature ဖွင့်ရန်) |
| `TELEGRAM_BOT_USERNAME` | Bot username (optional — မထည့်လည်း server က Telegram ဆီကနေ ရှာပေးတယ်) |
| `DATA_DIR` | **persistent disk / volume** ကို ညွှန်ပါ (`db.json` သိမ်းတဲ့နေရာ) |

အရေးကြီးတဲ့ ၃ ချက်:
1. **Server က အမြဲ run နေရမယ်။** Reminder တွေကို server ရဲ့ scheduler က ပို့တာဖြစ်လို့ အသုံးမပြုရင် ပိတ်သွားတတ်တဲ့ (sleep လုပ်တဲ့) free plan မှာ reminder မလာတော့ဘူး။ Always-on plan သို့မဟုတ် VPS သုံးပါ။
2. **Disk က ယာယီဆိုရင်** restart တိုင်း `db.json` ပျောက်တယ် (မှတ်တမ်း၊ subscription တွေအားလုံး)။ Volume mount လုပ်ပါ။
3. **VAPID key တွေ မပြောင်းပါနဲ့။** ပြောင်းရင် ရှိပြီးသား subscription တွေ အလုပ်မလုပ်တော့ဘူး (app ပြန်ဖွင့်ရင် သူ့ဘာသာ ပြန်ချိတ်ပေးတယ်)။

## ၃။ Telegram bot ချိတ်ရန်

1. Telegram မှာ **@BotFather** ကိုဖွင့်ပြီး `/newbot` နဲ့ bot အသစ်တစ်ခု ဖန်တီးပါ။ ဒီ app တစ်ခုတည်းအတွက် သီးသန့် bot သုံးတာ အကောင်းဆုံးပါ။
2. BotFather ပေးတဲ့ token ကို deploy host ရဲ့ `TELEGRAM_BOT_TOKEN` environment variable ထဲ ထည့်ပြီး redeploy လုပ်ပါ။ Token ကို client code / Git ထဲ မထည့်ပါနဲ့။
3. App → ⚙️ → **Telegram** ထဲမှာ account နှစ်ခုကို လိုသလို ချိတ်ပါ:
   - **ရေသောက် Reminder** — ရေသောက်မယ့်သူရဲ့ Telegram နဲ့ link ကိုဖွင့်ပြီး **Start** နှိပ်ပါ။
   - **ပန်းတိုင်ပြည့် အသိပေးစာ** — အသိပေးစာလက်ခံမယ့် ကိုယ့် Telegram နဲ့ link ကိုဖွင့်ပြီး **Start** နှိပ်ပါ။
4. App ကို ပြန်လာပြီး “စမ်းပို့မယ်” နဲ့ စစ်ကြည့်ပါ။ Account တစ်ခုတည်းကို နှစ်နေရာလုံး ချိတ်လည်းရပါတယ်။

ဒီ bot integration က Telegram `getUpdates` polling သုံးတာမို့ bot မှာ webhook အဟောင်းတစ်ခု ရှိမနေရပါဘူး။ Bot အသစ်ဆိုရင် ထပ်လုပ်စရာမလိုပါ။ Link က ၁၅ မိနစ်ပဲခံပြီး တစ်ကြိမ်ပဲသုံးလို့ရသလို Telegram chat ID ကို browser ဆီ ပြန်မပို့ပါဘူး။

## ၄။ သူ့ iPhone မှာ ဘယ်လိုထည့်ပေးမလဲ

iOS **16.4 အထက်** ဖြစ်ရပါမယ်။

1. **Safari** နဲ့ deploy လုပ်ထားတဲ့ link ကို ဖွင့်ပါ (Safari က အသေချာဆုံးပါ၊ Messenger/Line စတဲ့ app ထဲက browser ကတော့ မသုံးပါနဲ့)
2. **Share (⬆︎) → Add to Home Screen**
3. Home Screen ပေါ်က **ရေသောက်ပါ** icon ကနေ ပြန်ဖွင့်ပါ
4. **🔔 Reminder ဖွင့်မယ်** ကိုနှိပ် → **Allow**
5. "စမ်းပို့ကြည့်မယ်" နှိပ်ပြီး notification ရလာလား စစ်ပါ

မလာရင် စစ်စရာ: ဖုန်း **Settings → Notifications → ရေသောက်ပါ** ဖွင့်ထားလား၊ **Focus / Do Not Disturb** ဖွင့်ထားလား၊ Low Power Mode။

## ၅။ ကိုယ့်စိတ်ကြိုက် ပြင်ရန်

| ပြင်ချင်တာ | ဖိုင် |
|---|---|
| Notification စာသားတွေ (သူ့ကို ခေါ်ချင်တဲ့ နာမည်၊ စကားလုံး) | `server/lib/messages.js` |
| အစပိုင်း ရုံးချိန်၊ ချိန်ခြား၊ ml ပန်းတိုင်၊ ခွက်အရွယ် | `server/lib/store.js` → `DEFAULT_SETTINGS` (app ထဲက ⚙️ ကနေလည်း ပြောင်းလို့ရ) |
| App နာမည် | `client/index.html`၊ `client/public/manifest.webmanifest` |
| အရောင် | `client/src/styles.css` အပေါ်ဆုံး `:root` |

## ၆။ အလုပ်လုပ်ပုံ

```
သူ့ဖုန်း (PWA) ──subscribe──▶ Server ──မိနစ်တိုင်း စစ်──┬──▶ Apple/Google push ──▶ iPhone
        │                                               └──▶ Telegram bot ──────▶ သူ့ Telegram
        └──── ml မှတ်လိုက်ရင် log သိမ်း ──▶ ပန်းတိုင်ပြည့် ──▶ ကိုယ့် Telegram
```

Reminder ပို့မယ့် စည်းမျဉ်း (`server/lib/scheduler.js`): သတ်မှတ်ရုံးချိန်အတွင်း၊ weekend skip မဟုတ်တဲ့နေ့၊ ဒီနေ့ ml ပန်းတိုင် မပြည့်သေးရင်၊ နောက်ဆုံး reminder **သို့မဟုတ်** နောက်ဆုံး ရေသောက်ချိန်ကနေ သတ်မှတ်ချိန်ခြား ကျော်ပြီဆိုမှ ပို့တယ်။ Push နဲ့ Telegram နှစ်ခုလုံးချိတ်ထားရင် တစ်ပြိုင်နက်ပို့တယ်။

## မှတ်ထားစရာများ

- **iPhone notification မှာ "သောက်ပြီ" action ခလုတ် မပါနိုင်ဘူး** (iOS web push က မထောက်ပံ့ဘူး)။ Notification ကိုနှိပ်ရင် app ပွင့်ပြီး ခလုတ်ကြီးကို နှိပ်ရတယ်။
- Account/password မရှိဘူး။ ဖုန်းတစ်လုံးချင်းစီက random device id (UUID) နဲ့ ခွဲထားပြီး ဒီ id ကို ဖုန်းထဲမှာပဲ သိမ်းတယ်။ ခန့်မှန်းလို့မရတဲ့ id မို့ link ရှိရုံနဲ့ တခြားသူ data ကို ဖတ်လို့မရဘူး၊ ကိုယ်ရော သူရော နှစ်ယောက်ထဲ သုံးမယ့် app အတွက် လုံလောက်ပါတယ်။ လူအများသုံးမယ့် app ဖြစ်လာရင်တော့ login စနစ် ထည့်သင့်တယ်။
- Version အဟောင်းက ခွက်အရေအတွက်နဲ့သိမ်းထားတဲ့ log ကို ပထမဆုံး server run တဲ့အခါ ၁ ခွက် = 250 ml နဲ့ အလိုအလျောက်ပြောင်းပေးတယ်။ ရှိပြီးသား history မပျောက်ပါဘူး။
- Server က push service လေးခုကိုပဲ (Apple, Google/FCM, Mozilla, Windows) ပို့တယ်၊ တခြား URL တွေကို မပို့ဘူး။ ကိုယ့်ဘာသာ device ကန့်သတ်ချက်က `MAX_DEVICES` (default 50)။
- iOS မှာ Safari/Chrome ကနေ ဖွင့်တာနဲ့ Home Screen icon ကနေ ဖွင့်တာက data သီးခြားစီ (localStorage မတူဘူး) → Home Screen ကနေပဲ ဆက်သုံးပါ။

