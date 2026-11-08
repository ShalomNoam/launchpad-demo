/* רכיב הצ'אט הצף — משותף למסך הפנימי ולמסך הלקוח */

const Chat = (() => {
  let mode = 'internal';      // 'internal' | 'client'
  let projectId = PROJECTS[0].id;
  let open = false;
  let busy = false;
  const histories = {};       // `${mode}:${projectId}` → [{role, content, prompt?, demo?}]

  const el = {};
  const hist = () => (histories[`${mode}:${projectId}`] ||= []);
  const project = () => PROJECTS.find(p => p.id === projectId);

  function mount() {
    const root = document.getElementById('chat-root');
    root.innerHTML = `
      <button class="chat-fab" id="chat-fab" aria-label="פתיחת עוזר ה-AI" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 5.6L19.5 9l-5.7 1.5L12 16l-1.8-5.5L4.5 9l5.7-1.4z"/><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>
        <span>עוזר AI</span>
      </button>
      <section class="chat-panel" id="chat-panel" role="dialog" aria-label="עוזר AI" hidden>
        <header class="chat-head">
          <div class="chat-title">
            <strong id="chat-title">עוזר AI</strong>
            <span class="badge" id="chat-mode-badge"></span>
          </div>
          <button class="icon-btn" id="chat-close" aria-label="סגירת העוזר">✕</button>
        </header>
        <div class="chat-scope" id="chat-scope"></div>
        <div class="chat-body" id="chat-body" aria-live="polite"></div>
        <div class="chat-shortcuts" id="chat-shortcuts"></div>
        <form class="chat-input" id="chat-form">
          <textarea id="chat-text" rows="1" placeholder="אפשר לשאול כל שאלה על הפרויקט…" aria-label="הודעה לעוזר"></textarea>
          <button class="send-btn" type="submit" aria-label="שליחה">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12l18-9-6 18-3-7z"/></svg>
          </button>
        </form>
      </section>`;
    Object.assign(el, {
      fab: root.querySelector('#chat-fab'), panel: root.querySelector('#chat-panel'),
      title: root.querySelector('#chat-title'), badge: root.querySelector('#chat-mode-badge'),
      scope: root.querySelector('#chat-scope'), body: root.querySelector('#chat-body'),
      shortcuts: root.querySelector('#chat-shortcuts'), form: root.querySelector('#chat-form'),
      text: root.querySelector('#chat-text'),
    });
    el.fab.addEventListener('click', () => toggle(true));
    root.querySelector('#chat-close').addEventListener('click', () => toggle(false));
    el.form.addEventListener('submit', e => { e.preventDefault(); submitText(); });
    el.text.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); }
    });
    el.text.addEventListener('input', autoGrow);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
  }

  function autoGrow() { el.text.style.height = 'auto'; el.text.style.height = Math.min(el.text.scrollHeight, 120) + 'px'; }

  function toggle(state) {
    open = state;
    el.panel.hidden = !open;
    el.fab.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('chat-open', open);
    if (open) { render(); setTimeout(() => el.text.focus(), 50); }
  }

  /* נקרא מהאפליקציה בכל מעבר מסך */
  function setContext(newMode, newProjectId, visible = true) {
    mode = newMode;
    if (newProjectId) projectId = newProjectId;
    el.fab.hidden = !visible;
    if (!visible && open) toggle(false);
    if (open) render();
  }

  function render() {
    const p = project();
    const demo = isDemoMode();
    el.title.textContent = mode === 'client' ? 'העוזר שלך' : 'עוזר AI פנימי';
    el.badge.textContent = demo ? 'מצב דמו' : (aiRoute() === 'server' || SETTINGS.provider === 'anthropic' ? 'Claude' : 'OpenAI');
    el.badge.className = 'badge ' + (demo ? 'badge-demo' : 'badge-live');

    // שורת היקף: על איזה פרויקט, ומה העוזר רואה
    if (mode === 'internal') {
      el.scope.innerHTML = `
        <label class="scope-select">
          <span>פרויקט:</span>
          <select id="chat-project" aria-label="בחירת פרויקט לעוזר">
            ${PROJECTS.map(x => `<option value="${x.id}" ${x.id === projectId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select>
        </label>
        <button class="scope-chip scope-full" data-show-context title="מה נשלח ל-AI?">🔓 גישה מלאה</button>`;
      el.scope.querySelector('#chat-project').addEventListener('change', e => { projectId = e.target.value; render(); });
    } else {
      el.scope.innerHTML = `
        <span class="scope-name">${esc(p.name)}</span>
        <button class="scope-chip scope-safe" data-show-context title="מה נשלח ל-AI?">🔒 רק מידע של לקוח</button>`;
    }
    el.scope.querySelector('[data-show-context]').addEventListener('click', showContext);

    // הודעות
    const h = hist();
    if (!h.length) {
      el.body.innerHTML = `<div class="chat-empty">
        ${mode === 'client'
          ? `<p><strong>היי ${esc(p.contact.name.replace(/^עו״ד\s+/, ''))} 👋</strong></p><p>אני יכול לספר לך איפה הפרויקט עומד ומה מחכה ממך. אפשר להתחיל מאחד הכפתורים למטה.</p>`
          : `<p><strong>על מה עובדים היום?</strong></p><p>יש לי גישה לכל נתוני הפרויקט: אפיון, סיכום שיחה, יומן החלטות והערות פנימיות.</p>`}
        ${demo ? `<p class="demo-note">מצב דמו: התשובות מוכנות מראש. לחיבור ל-Claude או ל-OpenAI מוסיפים מפתח API בהגדרות (⚙).</p>` : `<p class="live-note">מחובר ל-AI: אפשר לשאול גם שאלות חופשיות.</p>`}
      </div>`;
    } else {
      el.body.innerHTML = h.map((m, i) => msgHTML(m, i)).join('') + (busy ? typingHTML() : '');
      el.body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyMsg(+b.dataset.copy, b)));
      el.body.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', retry));
      // תשובה חדשה: גוללים לתחילתה (כדי שמייל ארוך ייקרא מההתחלה). אחרת: לסוף.
      const last = el.body.lastElementChild;
      el.body.scrollTop = (!busy && last && !last.classList.contains('msg-user'))
        ? last.offsetTop - 12 : el.body.scrollHeight;
    }

    // קיצורים לפי המסך (והמייל רק ללקוח אדום)
    const list = SHORTCUTS[mode].filter(s => !s.onlyHealth || s.onlyHealth === p.health);
    el.shortcuts.innerHTML = list.map(s => `<button class="shortcut ${s.onlyHealth ? 'shortcut-hot' : ''}" data-sc="${s.id}" ${busy ? 'disabled' : ''}>${esc(s.label)}</button>`).join('');
    el.shortcuts.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => {
      const s = list.find(x => x.id === b.dataset.sc);
      send(s.label, s.prompt, s.id);
    }));
    el.form.querySelector('button').disabled = busy;
  }

  function msgHTML(m, i) {
    if (m.role === 'user') return `<div class="msg msg-user">${esc(m.content)}</div>`;
    if (m.role === 'error') return `<div class="msg msg-error" role="alert"><strong>משהו השתבש</strong><p>${esc(m.content)}</p>
      <div class="msg-actions">${m.kind === 'auth' || m.kind === 'model' ? `<button class="link-btn" onclick="App.openSettings()">פתיחת ההגדרות</button>` : ''}<button class="link-btn" data-retry>לנסות שוב</button></div></div>`;
    return `<div class="msg msg-ai">${m.demo ? '<span class="msg-tag">תשובת דמו</span>' : ''}${m.note ? `<p class="msg-note">${esc(m.note)}</p>` : ''}${renderMarkdown(m.content)}
      <div class="msg-actions"><button class="link-btn" data-copy="${i}">העתקה</button></div></div>`;
  }
  const typingHTML = () => `<div class="msg msg-ai typing" aria-label="העוזר כותב"><span></span><span></span><span></span></div>`;

  async function copyMsg(i, btn) {
    try { await navigator.clipboard.writeText(hist()[i].content); btn.textContent = 'הועתק ✓'; }
    catch { btn.textContent = 'לא הצלחתי להעתיק'; }
    setTimeout(() => (btn.textContent = 'העתקה'), 1600);
  }

  function submitText() {
    const t = el.text.value.trim();
    if (!t || busy) return;
    el.text.value = ''; autoGrow();
    send(t, t, null);
  }

  let lastRequest = null;
  function retry() {
    const h = hist();
    if (h.length && h[h.length - 1].role === 'error') h.pop();
    if (h.length && h[h.length - 1].role === 'user') h.pop();
    if (lastRequest) send(...lastRequest);
  }

  async function send(display, prompt, shortcutId) {
    if (busy) return;
    lastRequest = [display, prompt, shortcutId];
    const h = hist();
    const key = `${mode}:${projectId}`;
    const p = project();
    h.push({ role: 'user', content: display, prompt });
    busy = true; render();

    const demoAnswer = () => {
      if (shortcutId && mode === 'client') return DEMO_ANSWERS.client[shortcutId](toClientView(p)); // גם הדמו מקבל רק את התצוגה המסוננת
      if (shortcutId) return DEMO_ANSWERS.internal[shortcutId](p);
      return DEMO_ANSWERS.freeText;
    };

    try {
      let answer, demo = false, note = '';
      const route = aiRoute();
      const messages = h.filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-12).map(m => ({ role: m.role, content: m.prompt || m.content }));

      if (route === 'demo') {
        await new Promise(r => setTimeout(r, 700));
        demo = true; answer = demoAnswer();
      } else {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60000);
        try {
          if (route === 'server') {
            // ההקשר נבנה ומסונן בשרת. הדפדפן שולח רק מזהה פרויקט ושיחה.
            answer = await callServer({ mode, projectId: p.id, messages, signal: ctrl.signal });
          } else {
            const context = buildContext(mode, p);           // ← כאן קורה הסינון, לפני השליחה
            answer = await callLLM({ system: buildSystemPrompt(mode, context), messages, signal: ctrl.signal });
          }
        } catch (e) {
          // השרת לא זמין או שהמכסה נגמרה: בקיצורים חוזרים לתשובת דמו במקום להציג שגיאה
          if (route === 'server' && shortcutId && ['unavailable', 'quota', 'network', 'server', 'timeout'].includes(e.kind)) {
            demo = true; answer = demoAnswer(); note = 'החיבור ל-AI לא זמין כרגע, אז זו תשובה מוכנה מראש.';
          } else throw e;
        } finally { clearTimeout(timer); }
      }
      (histories[key] ||= []).push({ role: 'assistant', content: answer, demo, note });
    } catch (e) {
      (histories[key] ||= []).push({ role: 'error', content: e.message || 'שגיאה לא צפויה.', kind: e.kind });
    } finally {
      busy = false; render();
    }
  }

  /* חלון שקיפות: מראה בדיוק מה נשלח ל-AI במצב הנוכחי */
  function showContext() {
    const ctx = buildContext(mode, project());
    App.openModal(mode === 'client' ? 'מה העוזר של הלקוח רואה' : 'מה העוזר הפנימי רואה', `
      <p class="modal-lead">${mode === 'client'
        ? `זה כל המידע שה-AI מקבל במסך הלקוח. הוא נבנה בקוד מרשימה לבנה של שדות (<code>toClientView</code>), כך שהערות פנימיות, מצב הבריאות ויומן ההחלטות לא נכנסים לבקשה בכלל, ולא רק "אסורים" בפרומפט.${aiRoute() === 'server' ? ' כאן הבנייה הזו רצה בשרת: הדפדפן שולח רק את מזהה הפרויקט ואת השאלה.' : ''}`
        : 'במסך הפנימי העוזר מקבל את כל נתוני הפרויקט, כולל הערות פנימיות וסיכום השיחה הגולמי.'}</p>
      <pre class="json">${esc(JSON.stringify(ctx, null, 2))}</pre>`);
  }

  /* הפעלת קיצור מבחוץ (למשל מכפתור בעמוד הפרויקט) */
  function run(shortcutId) {
    toggle(true);
    const s = SHORTCUTS[mode].find(x => x.id === shortcutId);
    if (s) send(s.label, s.prompt, s.id);
  }

  return { mount, setContext, toggle, run, refresh: () => open && render() };
})();
