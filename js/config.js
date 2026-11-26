/* ==========================================================
   הגדרות האתר – כאן משנים את כל הפרטים שלך
   ========================================================== */
const SITE_CONFIG = {
  businessName: "Michael Hajaj",
  ownerName: "מיכאל חגאג",
  brand: "MICHAEL HAJAJ",             // ← השם בכותרת
  brandSub: "עבודות גבס וצבעים דקורטיביים",
  phone: "058-5766956",
  whatsapp: "972585766956",          // ← וואטסאפ בפורמט בינלאומי
  email: "michaelhajaj10@gmail.com",
  area: "אשדוד והסביבה",
  heroImage: "images/works/arava-laser-ashdod-1.jpg",
  contactImage: "images/works/fine-line-ashdod.jpg",   // ← תמונת הפתיחה הגדולה
  yearsExperience: 4,
  projectsDone: 50,                  // ← יוצג כ"מעל 50 פרויקטים"
  instagram: "",                     // ← קישור לאינסטגרם (לא חובה)
  facebook: "",                      // ← קישור לפייסבוק (לא חובה)
  aiPrice: 5,                        // ← מחיר הדמיית AI בשקלים (צריך להתאים גם ל-PRICE בשרת)
  aiEndpoint: "",                    // ← כתובת שרת ה-AI להדמיה על תמונה (ראו ai-worker/README.md)

  /* ---------- מתכנן הגבס החכם (plans.html) ---------- */
  planAiEndpoint: "",                // ← כתובת שרת הזיהוי האוטומטי (ראו plan-worker/README.md), למשל "https://plan-worker.xxx.workers.dev"

  payments: {
    free: true,                      // ← true = תקופת השקה: הכול פתוח בחינם. כשמוכנים לגבות – משנים ל-false
    prices: [35, 30, 25],            // ← תוכנית ראשונה, שנייה, ומהשלישית והלאה
    maxPlans: 10,
    // קישורי תשלום – כפתור בלי קישור מוצג כ"בקרוב". {amount} = הסכום, {order} = קוד ההזמנה
    paypal: "",                      // ← למשל "https://paypal.me/MichaelHajaj" (הסכום מתווסף לבד)
    bit: "",                         // ← קישור לתשלום בביט (Bit Business / קישור מהבנק)
    paybox: "",                      // ← קישור לקבוצת / בקשת תשלום בפייבוקס
    card: "",                        // ← קישור לדף תשלום באשראי (Grow / משולם / קארדקום)
    // קודי פתיחה: מייצרים בעמוד codes.html ומדביקים כאן את ה"טביעות" (לא את הקודים עצמם)
    unlockHashes: []
  }
};

/* ==========================================================
   העבודות שלך – הגלריה
   כדי להוסיף עבודה:
   1. שים את התמונה בתיקייה images/works
   2. הוסף שורה לרשימה למטה
   before: "תמונה.jpg" = תמונת "לפני" – מוסיפה השוואת לפני/אחרי באתר
   הגלריה מסדרת את התמונות בגדלים שונים באופן אוטומטי.
   כמה תמונות לאותו פרויקט: images: ["a.jpg", "b.jpg"] במקום image
   העבודה הראשונה ברשימה מוצגת כ"פרויקט נבחר" בגדול.
   ========================================================== */
const WORKS = [
  { images: ["images/works/arava-laser-ashdod-1.jpg", "images/works/arava-laser-ashdod-2.jpg"], title: "טיח ערבה – מכון לייזר", category: "טיח ערבה", location: "אשדוד",
    text: "חיפוי קירות בטיח ערבה בגוון אפור-בטון, עם מדפי נישה מגבס ותאורת לד נסתרת. המרקם הטבעי של הטיח יוצר תחושה רגועה ויוקרתית, כמו שמכון טיפולים צריך." },
  { images: ["images/works/bathroom-ashkelon-1.jpg", "images/works/bathroom-ashkelon-2.jpg", "images/works/bathroom-ashkelon-3.jpg"],
    title: "שיפוץ שירותים קומפלט", category: "שיפוצים", location: "אשקלון" },
  { images: ["images/works/salon-ashdod-2.jpg", "images/works/salon-ashdod-1.jpg"], title: "מדפי פינה מוארים – מספרה", category: "נישות ותאורה", location: "אשדוד" },
  { image: "images/works/sloped-ceiling-tlv.jpg", title: "תקרת גבס משופעת", category: "תקרות", location: "תל אביב" },
  { image: "images/works/fine-line-ashdod.jpg", title: "תקרה אקוסטית פיין ליין שחור", category: "תקרות אקוסטיות", location: "אשדוד",
    before: "images/works/fine-line-ashdod-before.jpg",
    text: "תקרה אקוסטית עם פרופיל פיין ליין שחור דק ותאורת פאנלים שקועה. הקווים השחורים יוצרים גריד גרפי ונקי, והלוחות האקוסטיים משפרים את השקט בחלל." },
  { images: ["images/works/bath-ceiling-shtulim-1.jpg", "images/works/bath-ceiling-shtulim-2.jpg"], title: "תקרת גבס לאמבטיה – שלבי ביצוע", category: "תקרות", location: "שתולים" }
];
