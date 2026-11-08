/* כלי עזר: תאריכים, טקסט, Markdown בסיסי */

/* "היום". בשרת (api/chat.js) הדפדפן מעביר את התאריך המקומי שלו, כדי ששני הצדדים יחשבו אותו דבר. */
const TODAY = (() => {
  const given = globalThis.__TODAY__;
  const d = (typeof given === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(given)) ? new Date(given + 'T00:00:00') : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function todayISO() {
  const p = n => String(n).padStart(2, '0');
  return `${TODAY.getFullYear()}-${p(TODAY.getMonth() + 1)}-${p(TODAY.getDate())}`;
}

function dateFromOffset(days) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d;
}

const _fmtLong = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const _fmtShort = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' });

function fmtDate(days) { return _fmtLong.format(dateFromOffset(days)); }
function fmtShort(days) { return _fmtShort.format(dateFromOffset(days)); }

/* "יום אחד" / "יומיים" / "5 ימים" */
function daysWord(n) {
  n = Math.abs(n);
  if (n === 1) return 'יום אחד';
  if (n === 2) return 'יומיים';
  return `${n} ימים`;
}

/* היסט ← "היום" / "מחר" / "בעוד 3 ימים" / "לפני יומיים" */
function relDay(days) {
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === -1) return 'אתמול';
  return days > 0 ? `בעוד ${daysWord(days)}` : `לפני ${daysWord(days)}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Markdown מינימלי ובטוח: כותרות, מודגש, נטוי, רשימות, פסקאות. הטקסט מנוקה לפני העיבוד. */
function renderMarkdown(md) {
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let html = '', list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { closeList(); continue; }
    if ((m = line.match(/^#{1,4}\s+(.*)/))) { closeList(); html += `<h4>${inline(m[1])}</h4>`; continue; }
    if ((m = line.match(/^\s*[-•*]\s+(.*)/))) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

/* אחסון בדפדפן — עטוף ב-try כי בחלק מהסביבות הוא חסום */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};
