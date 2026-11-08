/* =====================================================================
   פונקציית שרת (Vercel): העוזר מחובר ל-Claude בלי שהגולש צריך מפתח.
   ---------------------------------------------------------------------
   - המפתח נשמר במשתנה סביבה ANTHROPIC_API_KEY בהגדרות Vercel.
     הוא לא נמצא בקוד ולא מגיע לדפדפן.
   - הדפדפן שולח רק: מצב (internal / client), מזהה פרויקט והשאלות.
     השרת בונה את ההקשר בעצמו, כך שבמסך הלקוח הסינון (toClientView) רץ כאן, בשרת.
   - הגנות: בדיקת קלט, הגבלת קצב לכל גולש, ותקרת אורך תשובה.
     ההגנה החשובה ביותר היא תקרת הוצאה בחשבון Anthropic (ראו README).

   משתני סביבה:
     ANTHROPIC_API_KEY  (חובה)  המפתח
     ANTHROPIC_MODEL    (רשות)  ברירת מחדל: claude-sonnet-5-5
     RATE_LIMIT         (רשות)  בקשות לגולש ב-10 דקות. ברירת מחדל: 20
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const PER_IP_LIMIT = Number(process.env.RATE_LIMIT) || 20;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 12;
const MAX_USER_CHARS = 2000;
const MAX_ASSISTANT_CHARS = 8000;

/* אותם קבצים שהדפדפן טוען: מקור אמת אחד לנתונים, לפרומפטים ולסינון */
const SHARED_FILES = ['data.js', 'utils.js', 'logic.js', 'prompts.js', 'ai.js'];
let compiled = null;
function scripts() {
  if (!compiled) {
    compiled = SHARED_FILES.map(f => new vm.Script(
      fs.readFileSync(path.join(process.cwd(), 'js', f), 'utf8'), { filename: f }));
  }
  return compiled;
}

/* בונה את ה-system prompt בסביבה מבודדת, עם התאריך של הגולש */
function buildSystem(mode, projectId, portal, today) {
  const ctx = vm.createContext({ console, __TODAY__: today, __IN__: { mode, projectId, portal } });
  for (const s of scripts()) s.runInContext(ctx);
  return new vm.Script(`(() => {
    const p = PROJECTS.find(x => x.id === __IN__.projectId);
    if (!p) return null;
    PORTAL = { [p.id]: __IN__.portal };
    return buildSystemPrompt(__IN__.mode, buildContext(__IN__.mode, p));
  })()`).runInContext(ctx);
}

function projectIds() {
  const ctx = vm.createContext({});
  scripts()[0].runInContext(ctx);
  return new vm.Script('PROJECTS.map(p => ({ id: p.id, approvals: p.clientFacing.approvals.map(a => a.id) }))').runInContext(ctx);
}

/* הגבלת קצב פשוטה בזיכרון. ב-serverless זה "הכי טוב שאפשר" ולא מושלם, ולכן יש גם תקרת הוצאה בחשבון. */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= PER_IP_LIMIT) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function fail(res, status, kind, error) {
  res.status(status).json({ error, kind });
}

/* מנקה את מה שהדפדפן שולח על פעילות הלקוח בפורטל (אישורים ושאלות) */
function cleanPortal(raw, allowedApprovals) {
  const out = { approvals: {}, questions: [] };
  if (raw && typeof raw === 'object') {
    for (const id of allowedApprovals) if (raw.approvals && raw.approvals[id]) out.approvals[id] = true;
    if (Array.isArray(raw.questions)) {
      out.questions = raw.questions.slice(-10)
        .map(q => ({ text: String((q && q.text) || '').slice(0, 500) }))
        .filter(q => q.text);
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.ANTHROPIC_API_KEY;

  // בדיקת זמינות: הדפדפן שואל כאן אם יש חיבור מוכן
  if (req.method === 'GET') return res.status(200).json({ available: !!key, provider: 'anthropic' });
  if (req.method !== 'POST') return fail(res, 405, 'method', 'שיטה לא נתמכת.');
  if (!key) return fail(res, 503, 'unavailable', 'החיבור ל-AI לא הוגדר בשרת.');

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return fail(res, 429, 'rate', 'שלחת הרבה שאלות בזמן קצר. אפשר לנסות שוב בעוד כמה דקות.');

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return fail(res, 400, 'input', 'בקשה לא תקינה.');

  const { mode, projectId, messages, portal, today } = body;
  if (mode !== 'internal' && mode !== 'client') return fail(res, 400, 'input', 'מצב לא תקין.');
  const project = projectIds().find(p => p.id === projectId);
  if (!project) return fail(res, 400, 'input', 'פרויקט לא נמצא.');
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES)
    return fail(res, 400, 'input', 'השיחה ארוכה מדי. אפשר לסגור ולפתוח את העוזר מחדש.');

  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim())
      return fail(res, 400, 'input', 'בקשה לא תקינה.');
    const limit = m.role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    if (m.content.length > limit) return fail(res, 400, 'input', 'ההודעה ארוכה מדי.');
    clean.push({ role: m.role, content: m.content });
  }
  if (clean[clean.length - 1].role !== 'user') return fail(res, 400, 'input', 'בקשה לא תקינה.');

  let system;
  try {
    system = buildSystem(mode, projectId, cleanPortal(portal, project.approvals), typeof today === 'string' ? today : undefined);
  } catch (e) {
    console.error('context build failed', e);
    return fail(res, 500, 'server', 'שגיאה פנימית בבניית ההקשר.');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages: clean }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = data?.error?.message || '';
      console.error('anthropic error', r.status, msg);
      if (r.status === 401 || r.status === 403) return fail(res, 503, 'unavailable', 'החיבור ל-AI בשרת לא תקין כרגע. הכפתורים המוכנים עדיין עובדים.');
      if (r.status === 429 || /credit|billing|limit/i.test(msg)) return fail(res, 503, 'quota', 'המכסה של הדמו נוצלה לעכשיו. הכפתורים המוכנים עדיין עובדים, ואפשר גם להדביק מפתח אישי בהגדרות.');
      return fail(res, 502, 'server', 'שרת ה-AI לא זמין כרגע. כדאי לנסות שוב בעוד רגע.');
    }
    const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (!text) return fail(res, 502, 'empty', 'התקבלה תשובה ריקה. כדאי לנסות שוב.');
    return res.status(200).json({ text, model: MODEL });
  } catch (e) {
    if (e.name === 'AbortError') return fail(res, 504, 'timeout', 'הבקשה לקחה יותר מדי זמן. כדאי לנסות שוב.');
    console.error('fetch failed', e);
    return fail(res, 502, 'network', 'השרת לא הצליח להתחבר ל-AI.');
  } finally {
    clearTimeout(timer);
  }
};
