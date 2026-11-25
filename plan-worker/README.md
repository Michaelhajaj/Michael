# הפעלת זיהוי אוטומטי של תוכניות (Claude)

הכפתור "🤖 זיהוי אוטומטי" במתכנן הגבס שולח את התוכנית לשרת קטן (Cloudflare Worker).
השרת שולח אותה ל-Claude ומחזיר: קנה מידה, תקרות, מחיצות, ספוטים, רמקולים, ספרינקלרים, תריסי מיזוג, דלתות, שקעים ומפסקים.
האתר מכניס את הכול לתוכנית. הלקוח עובר על התוצאה, מתקן אם צריך, ויכול לבטל בלחיצה.

## עלות
- **Claude (Anthropic):** בערך 0.10–0.30 $ לזיהוי (תלוי בגודל התוכנית). מומלץ להגדיר תקרת הוצאה חודשית ב-console.anthropic.com → Settings → Limits.
- **Cloudflare Workers:** חינם עד 100,000 בקשות ביום.

## מה צריך
1. חשבון ב-[console.anthropic.com](https://console.anthropic.com) עם אמצעי תשלום, ומפתח API (API Keys → Create Key).
2. חשבון חינמי ב-Cloudflare.
3. Node.js מותקן במחשב (nodejs.org).

## התקנה (פעם אחת, מתוך התיקייה `plan-worker`)
```bash
npm install
npx wrangler login                       # נפתח דפדפן להתחברות ל-Cloudflare
npx wrangler kv namespace create LIMITS  # מגבלת שימוש יומית. מעתיקים את ה-id ל-wrangler.toml (מורידים את ה-# מ-3 השורות)
npx wrangler secret put ANTHROPIC_API_KEY  # מדביקים את המפתח מ-Anthropic
npx wrangler deploy
```
בסוף מקבלים כתובת כמו `https://plan-worker.<שם>.workers.dev`.

## חיבור לאתר
ב-`js/config.js`:
```js
planAiEndpoint: "https://plan-worker.<שם>.workers.dev",
```
ב-`wrangler.toml`, `ALLOWED_ORIGINS` צריך להכיל את כתובת האתר (ברירת המחדל: `https://michaelhajaj.github.io`). אם מחברים דומיין משלכם, מוסיפים אותו עם פסיק.

## הגנות
- רק האתר שלכם יכול לקרוא לשרת (בדיקת Origin).
- מגבלה של `DAILY_LIMIT` זיהויים לכל כתובת IP ביום (ברירת מחדל 8, דורש את ה-KV).
- המפתח של Anthropic נשמר כסוד ב-Cloudflare, ואף פעם לא מגיע לדפדפן.

## טיפים לדיוק
- תוכנית תקרה או תוכנית חשמל עם מקרא נותנות את התוצאה הכי טובה.
- PDF וקטורי (מקורי מהאדריכל) עדיף על צילום.
- אחרי הזיהוי כדאי לוודא את קנה המידה עם 📏, ואז לעבור על הספוטים והשקעים.
