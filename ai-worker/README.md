# הפעלת הדמיית AI בתשלום (Grow + OpenAI)

מתכנן התקרה (`planner.html`) עובד גם בלי השלב הזה: הוא מייצר הדמיה סכמטית ותוכנית תקרה בחינם.
אחרי ההפעלה, לקוח שמעלה תמונה של החדר יכול לשלם 5 ₪ דרך Grow ולקבל הדמיה של התקרה **על התמונה שלו**.

## איך זה עובד
1. הלקוח לוחץ "לתשלום ויצירת ההדמיה" ועובר לעמוד התשלום המאובטח של Grow (אשראי / ביט).
2. אחרי התשלום, Grow מודיע לשרת. השרת בודק מול Grow שהתשלום באמת עבר, ורק אז יוצר את ההדמיה.
3. הלקוח חוזר אוטומטית לאתר, וההדמיה מופיעה לו תוך פחות מדקה.

אי אפשר לקבל הדמיה בלי לשלם. השרת לא סומך על ההודעה שמגיעה אליו, אלא שואל את Grow ישירות.

## עלויות
- **OpenAI:** בערך 15–25 אגורות להדמיה. מומלץ להגדיר תקרת הוצאה חודשית (Settings → Limits), למשל $10.
- **Grow:** לפי המסלול שלך (דמי מנוי ועמלת סליקה).
- **Cloudflare:** חינם.

## מה צריך להכין
1. **Grow:** חשבון עסקי עם גישת API. מבקשים מהתמיכה של Grow:
   - `pageCode` ו-`userId` של עמוד תשלום
   - גישה לסביבת בדיקות (sandbox)
   - הפעלת עדכוני שרת (notifyUrl)
2. **OpenAI:** חשבון ב-platform.openai.com עם אמצעי תשלום, ו-API key.
   ייתכן שתתבקש אימות ארגון כדי להשתמש במודל התמונות.
3. **Cloudflare:** חשבון חינמי ב-dash.cloudflare.com.

## התקנה (פעם אחת)
1. Cloudflare → Storage & Databases → KV → Create namespace בשם `JOBS`.
2. Workers & Pages → Create → Worker. מדביקים את כל התוכן של `worker.js` ולוחצים Deploy.
3. ב-Worker → Settings → Bindings מוסיפים KV namespace: שם המשתנה `JOBS`, ובוחרים את ה-namespace שיצרת.
4. ב-Settings → Variables and Secrets מוסיפים:

| שם | סוג | ערך |
|---|---|---|
| `OPENAI_API_KEY` | Secret | המפתח מ-OpenAI |
| `GROW_PAGE_CODE` | Secret | מ-Grow |
| `GROW_USER_ID` | Secret | מ-Grow |
| `GROW_API_BASE` | Text | לבדיקות: `https://sandbox.meshulam.co.il/api/light/server/1.0` |
| `SITE_URL` | Text | `https://michaelhajaj.github.io/Michael/planner.html` |
| `ALLOWED_ORIGINS` | Text | `https://michaelhajaj.github.io` |
| `PRICE` | Text | `5` |

5. מעתיקים את כתובת ה-Worker (משהו כמו `https://ceiling-ai.xxxx.workers.dev`) ומדביקים ב-`js/config.js`:
   ```js
   aiPrice: 5,
   aiEndpoint: "https://ceiling-ai.xxxx.workers.dev"
   ```
6. **בדיקה בסביבת הבדיקות של Grow** עם כרטיס בדיקה. אם הכול עובד, מחליפים את `GROW_API_BASE` ל-
   `https://secure.meshulam.co.il/api/light/server/1.0`.

## שינוי מחיר
משנים גם את `PRICE` ב-Cloudflare וגם את `aiPrice` ב-`js/config.js`.

## הערה טכנית
שמות השדות של Grow נלקחו מהתיעוד ב-developers.grow.business. לפני שעוברים לסליקה אמיתית צריך
לוודא אותם מול המסמכים ש-Grow שולחים עם פרטי החשבון, ובמיוחד את `getPaymentProcessInfo` ואת `approveTransaction`.
