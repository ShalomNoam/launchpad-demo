/* =====================================================================
   עוזר ה-AI: בניית ההקשר, הפרדת הרשאות וקריאות API.
   ---------------------------------------------------------------------
   העיקרון: מה שלא נשלח לא יכול לדלוף.
   במסך הלקוח ההקשר נבנה מרשימה לבנה של שדות (toClientView),
   כך שהערות פנימיות, מצב בריאות ויומן החלטות לא נכנסים לבקשה בכלל.
   ===================================================================== */

/* תצוגת לקוח: רשימה לבנה בלבד. שדה חדש בנתונים לא ייחשף ללקוח עד שמוסיפים אותו כאן במפורש. */
function toClientView(p) {
  const portal = portalOf(p.id);
  return {
    today: fmtDate(0),
    projectName: p.name,
    contactName: p.contact.name,
    package: { name: p.package.name, includes: [...p.package.includes] },
    status: p.clientFacing.statusText,
    completed: [...p.clientFacing.completed],
    stages: sortedTimeline(p).map(s => ({
      name: STAGES[s.stage].client,
      state: s.status === 'done' ? 'הושלם' : (s.status === 'upcoming' ? 'בהמשך' : 'עכשיו'), // "תקוע" פנימי מוצג כ"עכשיו"
      date: fmtDate(s.due),
    })),
    previewDate: fmtDate(p.previewIn),
    previewAlreadySent: p.previewIn < 0,
    launchDate: fmtDate(p.launchIn),
    waitingFromYou: p.waitingFromClient.map(w => ({ what: w.client, until: fmtDate(w.due), isLate: w.due < 0 })),
    approvals: p.clientFacing.approvals.map(a => ({ item: a.label, approved: isApproved(p, a) })),
    yourQuestions: portal.questions.map(q => q.text),
  };
}

/* תצוגה פנימית: הכול, עם תאריכים מתורגמים כדי שהמודל לא יצטרך לחשב */
function toInternalContext(p) {
  const portal = portalOf(p.id);
  return {
    today: fmtDate(0),
    project: p.name, industry: p.industry, contact: p.contact,
    package: p.package,
    health: p.health, healthReason: p.healthReason,
    currentStage: STAGES[currentStage(p).stage].label,
    nowWith: `${OWNERS[p.owner]} (כבר ${daysWord(p.ownerSince)})`,
    previewDate: fmtDate(p.previewIn), launchDate: `${fmtDate(p.launchIn)} (${relDay(p.launchIn)})`,
    lastContact: `${relDay(p.lastContact)}: ${p.lastContactNote}`,
    daysNeededFromContentToLaunch: p.contentLeadDays,
    waitingFromClient: p.waitingFromClient.map(w => ({ item: w.internal, due: fmtDate(w.due), overdue: w.due < 0 ? daysWord(w.due) : false, critical: w.critical })),
    timeline: sortedTimeline(p).map(s => ({ stage: STAGES[s.stage].label, date: fmtDate(s.due), status: s.status })),
    spec: p.spec,
    rawCallSummary: p.rawCallSummary,
    decisionLog: p.decisions.map(d => ({ date: fmtShort(d.day), decision: d.text, by: d.by })),
    internalNotes: p.internalNotes.map(n => ({ date: fmtShort(n.day), author: n.author, note: n.text })),
    alerts: computeAlerts([p]).map(a => a.text),
    clientPortalActivity: {
      approved: p.clientFacing.approvals.filter(a => isApproved(p, a)).map(a => a.label),
      questions: portal.questions.map(q => q.text),
    },
  };
}

function buildContext(mode, p) {
  return mode === 'client' ? toClientView(p) : toInternalContext(p);
}

function buildSystemPrompt(mode, context) {
  return `${SYSTEM_PROMPTS[mode]}\n\n---\nנתוני הפרויקט (JSON):\n${JSON.stringify(context, null, 2)}`;
}

/* ---------- הגדרות: מפתח API נשמר רק בדפדפן הזה ---------- */
const SETTINGS_KEY = 'launchpad-settings-v1';
const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5.4-mini' };

let SETTINGS = Object.assign(
  { provider: 'anthropic', keys: { anthropic: '', openai: '' }, models: { ...DEFAULT_MODELS } },
  store.get(SETTINGS_KEY, {})
);

function saveSettings() { store.set(SETTINGS_KEY, SETTINGS); }
function activeKey() { return (SETTINGS.keys[SETTINGS.provider] || '').trim(); }

/* ---------- איך העוזר עונה: שלושה מסלולים ----------
   personal: הגולש הדביק מפתח אישי בהגדרות ← קריאה ישירה מהדפדפן
   server:   האתר פרוס ב-Vercel עם מפתח בשרת ← קריאה ל-/api/chat (ברירת המחדל)
   demo:     אין מפתח ואין שרת ← תשובות מוכנות */
const SERVER = { available: false };

function aiRoute() {
  if (activeKey()) return 'personal';
  if (SERVER.available) return 'server';
  return 'demo';
}
function isDemoMode() { return aiRoute() === 'demo'; }

/* בודק פעם אחת בטעינה אם יש פונקציית שרת מוגדרת. אם לא (קובץ מקומי, Netlify בלי שרת), נשארים במצב דמו. */
async function checkServer() {
  if (!/^https?:$/.test(location.protocol)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch('api/chat', { signal: ctrl.signal, cache: 'no-store' });
    const data = r.ok ? await r.json() : null;
    SERVER.available = !!data?.available;
  } catch { SERVER.available = false; }
  finally { clearTimeout(t); }
  return SERVER.available;
}

/* ---------- קריאות API ---------- */
class AIError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

/* קריאה לשרת: נשלחים רק מזהה הפרויקט, המצב והשיחה. ההקשר נבנה ומסונן בשרת. */
async function callServer({ mode, projectId, messages, signal }) {
  let res;
  try {
    res = await fetch('api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, projectId, messages, portal: portalOf(projectId), today: todayISO() }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new AIError('הבקשה לקחה יותר מדי זמן ובוטלה. כדאי לנסות שוב.', 'timeout');
    throw new AIError('לא הצלחתי להתחבר לשרת. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.', 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.text) throw new AIError(data?.error || 'משהו השתבש בשרת. כדאי לנסות שוב.', data?.kind || 'server');
  return data.text;
}

async function callLLM({ system, messages, signal }) {
  const provider = SETTINGS.provider;
  const key = activeKey();
  const model = (SETTINGS.models[provider] || DEFAULT_MODELS[provider]).trim();

  let url, headers, body;
  if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    body = { model, max_tokens: 1200, system, messages };
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
    // מודלי GPT-5 ומעלה דורשים max_completion_tokens (ולא max_tokens), וחלק מהתקציב הולך לחשיבה
    body = { model, max_completion_tokens: 4000, messages: [{ role: 'system', content: system }, ...messages] };
  }

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new AIError('הבקשה לקחה יותר מדי זמן ובוטלה. כדאי לנסות שוב.', 'timeout');
    throw new AIError('לא הצלחתי להתחבר לשרת ה-AI. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.', 'network');
  }

  let data = null;
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    const apiMsg = data?.error?.message || '';
    if (res.status === 401 || res.status === 403)
      throw new AIError('המפתח לא התקבל. כדאי לוודא שהעתקת אותו במלואו ושהוא שייך לספק שנבחר בהגדרות.', 'auth');
    if (res.status === 429)
      throw new AIError('יותר מדי בקשות, או שנגמרה המכסה בחשבון. כדאי לחכות דקה ולנסות שוב.', 'rate');
    if (res.status === 404 || /model.*(not found|does not exist|not exist|access)/i.test(apiMsg))
      throw new AIError(`המודל "${model}" לא זמין בחשבון הזה. אפשר לשנות אותו בהגדרות.`, 'model');
    if (res.status >= 500)
      throw new AIError('שרת ה-AI לא זמין כרגע. כדאי לנסות שוב בעוד רגע.', 'server');
    throw new AIError(`הבקשה נדחתה (${res.status}). ${apiMsg}`.trim(), 'other');
  }

  const text = provider === 'anthropic'
    ? (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    : data?.choices?.[0]?.message?.content;
  if (!text) throw new AIError('התקבלה תשובה ריקה. כדאי לנסות שוב.', 'empty');
  return text;
}
