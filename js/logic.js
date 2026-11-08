/* לוגיקה עסקית: שלב נוכחי, התראות חכמות, ומצב משותף של פורטל הלקוח */

function sortedTimeline(p) {
  return [...p.timeline].sort((a, b) => a.due - b.due);
}

function currentStage(p) {
  const t = sortedTimeline(p);
  return t.find(s => s.status === 'blocked')
      || t.find(s => s.status === 'current')
      || t.find(s => s.status === 'upcoming')
      || t[t.length - 1];
}

/* ---------- התראות חכמות: מחושבות מהנתונים, לא כתובות ידנית ---------- */
function computeAlerts(projects) {
  const R = ALERT_RULES;
  const out = [];
  for (const p of projects) {
    // 1. פרויקט אדום שעולה בקרוב
    if (p.health === 'red' && p.launchIn >= 0 && p.launchIn <= R.launchSoonDays) {
      out.push({
        level: 'red', projectId: p.id, kind: 'launch',
        text: `${p.name} עולה לאוויר ${relDay(p.launchIn)}, והלקוח עדיין לא אישר`,
        action: `לברר מול ${p.contact.name} מה בדיוק לא טוב, בשאלות סגורות, לפני כל החלטה על דחייה.`,
      });
    }
    // 2. תוכן או פריט קריטי באיחור שמאיים על תאריך העלייה
    for (const w of p.waitingFromClient) {
      if (w.due >= 0) continue;
      const slack = p.launchIn - p.contentLeadDays; // כמה ימים נשארו עד שהאיחור מזיז את העלייה
      if (w.critical && slack <= R.contentSlackWarnDays) {
        out.push({
          level: slack <= 1 ? 'red' : 'yellow', projectId: p.id, kind: 'content',
          text: slack > 0
            ? `התוכן מ${p.name} באיחור של ${daysWord(w.due)}, ועוד ${daysWord(slack)} זה ידחה את העלייה`
            : `התוכן מ${p.name} באיחור של ${daysWord(w.due)}, וזה כבר דוחה את העלייה`,
          action: `לפנות היום ישירות ל${p.contact.name}, ולהציע דרך שמורידה ממנה עומס (למשל טיוטה מטעמנו). להגדיר תאריך אחרון שאחריו העלייה זזה.`,
        });
      } else {
        out.push({
          level: 'info', projectId: p.id, kind: 'overdue',
          text: `ממתין מ${p.name} באיחור של ${daysWord(w.due)}: ${w.internal}`,
          action: `תזכורת ל${p.contact.name} עם הסבר קצר למה זה חשוב עכשיו.`,
        });
      }
    }
    // 3. תקוע אצל גורם פנימי
    if (['dev', 'studio', 'us'].includes(p.owner) && p.health !== 'green' && -p.ownerSince >= R.stuckWithOwnerDays) {
      out.push({
        level: 'yellow', projectId: p.id, kind: 'stuck',
        text: `${p.name} תקוע אצל ${OWNERS[p.owner]} כבר ${daysWord(p.ownerSince)}`,
        action: `לקבוע עם ${OWNERS[p.owner]} תאריך יעד ותוכנית ב' שמאפשרת לעלות בזמן גם אם החסם לא נפתר.`,
      });
    }
    // 4. אין קשר עם הלקוח
    if (-p.lastContact >= R.noContactDays) {
      out.push({
        level: 'yellow', projectId: p.id, kind: 'contact',
        text: `לא היה קשר עם ${p.name} כבר ${daysWord(p.lastContact)}`,
        action: `לשלוח ל${p.contact.name} עדכון קצר היום, גם אם אין חדשות, לפני שהשקט ייראה כמו בעיה.`,
      });
    }
  }
  const rank = { red: 0, yellow: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/* ---------- מצב משותף: אישורים ושאלות מפורטל הלקוח ---------- */
/* נשמר בדפדפן כדי שמה שהלקוח מאשר במסך 2 יופיע אצל מנהל הפרויקט במסך 1 */
const PORTAL_KEY = 'launchpad-portal-v1';
let PORTAL = store.get(PORTAL_KEY, {});

function portalOf(id) {
  if (!PORTAL[id]) PORTAL[id] = { approvals: {}, questions: [] };
  return PORTAL[id];
}
function savePortal() { store.set(PORTAL_KEY, PORTAL); }

function isApproved(p, a) { return !!(a.preApproved || portalOf(p.id).approvals[a.id]); }

function approve(p, approvalId) {
  portalOf(p.id).approvals[approvalId] = new Date().toISOString();
  savePortal();
}
function addQuestion(p, text) {
  portalOf(p.id).questions.push({ text, at: new Date().toISOString() });
  savePortal();
}
function resetPortal() { PORTAL = {}; store.remove(PORTAL_KEY); }
