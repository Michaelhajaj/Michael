# הפעלת הזיהוי האוטומטי (🤖) – בלי התקנות

סך הכול כ-15 דקות, מהדפדפן בלבד. בסוף שולחים למיכאל/ל-Claude כתובת אחת, והכפתור באתר מתחיל לעבוד.

## שלב 1 – Anthropic (המוח שקורא את התוכנית)
1. נכנסים ל-**console.anthropic.com** ונרשמים.
2. **Settings → Billing**: מוסיפים אמצעי תשלום וטוענים קרדיט, למשל 20$ (מספיק לכ-100 זיהויים).
3. **Settings → Limits**: מגדירים תקרת הוצאה חודשית, למשל 30$. **חשוב:** זו ההגנה שלכם מפני הפתעות.
4. **API Keys → Create Key**: נותנים שם (למשל `plan-worker`) ומעתיקים את המפתח (מתחיל ב-`sk-ant-`).
   שומרים אותו רגע בצד. **לא שולחים אותו לאף אחד, גם לא בצ'אט.**

## שלב 2 – Cloudflare (השרת הקטן, חינם)
1. נכנסים ל-**dash.cloudflare.com** ונרשמים (חינם).
2. בתפריט: **Workers & Pages → Create → Create Worker** (או "Start with Hello World").
   נותנים שם: `plan-worker`, ולוחצים **Deploy**.
3. לוחצים **Edit code**. מוחקים את כל הקוד שמופיע.
4. פותחים בטאב חדש את הקובץ המוכן:
   **https://michaelhajaj.github.io/Michael/plan-worker/dist/worker.js**
   מסמנים הכול (Ctrl+A), מעתיקים (Ctrl+C), חוזרים ל-Cloudflare ומדביקים (Ctrl+V).
5. לוחצים **Deploy** (למעלה מימין).
6. חוזרים לדף ה-Worker → **Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Variable name: `ANTHROPIC_API_KEY`
   - Value: המפתח משלב 1
   - **Deploy / Save**
7. מעתיקים את כתובת ה-Worker שמופיעה בדף, משהו כמו
   `https://plan-worker.<השם-שלכם>.workers.dev`

## שלב 3 – חיבור לאתר
שולחים את הכתובת משלב 2.7 (רק הכתובת, לא המפתח), והיא מוכנסת ל-`js/config.js`:
```js
planAiEndpoint: "https://plan-worker.<השם-שלכם>.workers.dev",
```

## הגנות שכבר בנויות
- השרת מקבל בקשות **רק מהאתר שלכם** (`https://michaelhajaj.github.io`). אם תחברו דומיין משלכם, מוסיפים ב-Variables משתנה רגיל `ALLOWED_ORIGINS` עם שתי הכתובות מופרדות בפסיק.
- המפתח שמור כסוד ב-Cloudflare ואף פעם לא מגיע לדפדפן.
- **מגבלה יומית לכל לקוח (מומלץ):** Workers & Pages → KV → Create namespace בשם `LIMITS`. אחר כך ב-Worker → Settings → Bindings → Add → KV namespace, שם המשתנה `LIMITS`, ובוחרים את מה שיצרתם. ברירת המחדל: 8 זיהויים לכל כתובת IP ביום (אפשר לשנות במשתנה `DAILY_LIMIT`).

## עלות
- **Anthropic:** בערך 0.10–0.30$ לזיהוי, לפי גודל התוכנית (הערכה, תלוי במורכבות).
- **Cloudflare:** חינם עד 100,000 בקשות ביום.

## למפתחים
הקוד המקורי ב-`src/worker.js`. הקובץ `dist/worker.js` נבנה ממנו:
```bash
npm install
npx esbuild src/worker.js --bundle --format=esm --platform=browser --conditions=worker,browser --external:'node:*' --minify --legal-comments=none --outfile=dist/worker.js
```
אפשר גם להעלות עם `npx wrangler deploy` (ההגדרות ב-`wrangler.toml`).
