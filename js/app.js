/* האפליקציה: ניתוב בין שלושת המסכים ורינדור */

const App = (() => {
  const view = () => document.getElementById('view');
  const byId = id => PROJECTS.find(p => p.id === id);
  const HEALTH = {
    green:  { label: 'ירוק', long: 'במסלול' },
    yellow: { label: 'צהוב', long: 'דורש תשומת לב' },
    red:    { label: 'אדום', long: 'בסיכון' },
  };
  const healthRank = { red: 0, yellow: 1, green: 2 };

  const healthPill = p => `<span class="health health-${p.health}"><i></i>${HEALTH[p.health].label} · ${HEALTH[p.health].long}</span>`;
  const arrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`;

  /* ================= ניתוב ================= */
  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [screen, id] = hash.split('/');
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.screen === (screen || 'dashboard') || (screen === 'project' && a.dataset.screen === 'dashboard')));

    if (screen === 'project' && byId(id)) { renderProject(byId(id)); Chat.setContext('internal', id); }
    else if (screen === 'client' && byId(id)) { renderClient(byId(id)); Chat.setContext('client', id); }
    else if (screen === 'client') { renderClientList(); Chat.setContext('client', null, false); }
    else if (screen === 'spec') { renderSpec(); Chat.setContext('internal', null, false); }
    else { renderDashboard(); Chat.setContext('internal', null); }
    window.scrollTo(0, 0);
  }

  const byUrgency = () => [...PROJECTS].sort((a, b) => healthRank[a.health] - healthRank[b.health] || a.launchIn - b.launchIn);

  /* ================= מסך 1: מרכז ניהול ================= */
  /* מסך פתיחה נקי: רשימת לקוחות. כל הפרטים נמצאים בעמוד הפרויקט. ההתראות מקופלות. */
  let alertsOpen = false;

  function renderDashboard() {
    const alerts = computeAlerts(PROJECTS);
    const urgent = alerts.filter(a => a.level !== 'info');

    view().innerHTML = `
      <section class="hero hero-slim">
        <div class="wrap">
          <p class="eyebrow">${esc(fmtDate(0))}</p>
          <h1>${PROJECTS.length} פרויקטים בהקמה.</h1>
          <button class="alerts-toggle" id="alerts-toggle" aria-expanded="${alertsOpen}" aria-controls="alerts-panel">
            <span class="alerts-count">${urgent.length}</span>
            <span>${urgent.length ? 'דברים דורשים אותך היום' : 'אין התראות דחופות היום'}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </section>

      <div class="wrap">
        <section class="alerts-panel" id="alerts-panel" ${alertsOpen ? '' : 'hidden'}>
          <p class="muted small">ההתראות מחושבות אוטומטית מהנתונים: ימים בלי קשר, תוכן באיחור מול תאריך העלייה, ופרויקטים שתקועים אצל גורם אחד.</p>
          ${alerts.length ? `<ul class="alerts">${alerts.map(a => alertHTML(a, true)).join('')}</ul>` : '<p class="empty">אין התראות. יום טוב 🙂</p>'}
        </section>

        <section class="block">
          <div class="list-head"><h2>הלקוחות</h2><span class="muted small">לפי דחיפות</span></div>
          <ul class="client-list">
            ${byUrgency().map((p, i) => listRow(p, i, `#/project/${p.id}`, `
              <span class="row-health row-health-${p.health}" title="${HEALTH[p.health].label}: ${HEALTH[p.health].long}"><i></i>${HEALTH[p.health].long}</span>
              <span class="row-days"><b>${p.launchIn}</b><small>ימים לעלייה</small></span>`)).join('')}
          </ul>
        </section>
      </div>`;

    document.getElementById('alerts-toggle').addEventListener('click', e => {
      alertsOpen = !alertsOpen;
      e.currentTarget.setAttribute('aria-expanded', alertsOpen);
      document.getElementById('alerts-panel').hidden = !alertsOpen;
    });
  }

  /* שורה ברשימת לקוחות — משותפת למסך הניהול ולבחירת לקוח */
  function listRow(p, i, href, meta) {
    return `<li><a class="client-row" href="${href}">
      <span class="row-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="row-avatar" aria-hidden="true">${esc(p.name[0])}</span>
      <span class="row-main">
        <b>${esc(p.name)}</b>
        <small>${esc(p.package.name)}</small>
      </span>
      <span class="row-meta">${meta}</span>
      <span class="arrow-btn arrow-sm">${arrow}</span>
    </a></li>`;
  }

  function alertHTML(a, withLink) {
    return `<li class="alert alert-${a.level}">
      <span class="alert-dot" aria-hidden="true"></span>
      <div class="alert-text">
        <strong>${esc(a.text)}</strong>
        <span><b>הצעד הבא:</b> ${esc(a.action)}</span>
      </div>
      ${withLink ? `<a class="pill-btn pill-sm" href="#/project/${a.projectId}">לפרויקט</a>` : ''}
    </li>`;
  }

  /* ================= מסך 2 (פתיחה): בחירת לקוח ================= */
  function renderClientList() {
    view().innerHTML = `
      <section class="hero hero-slim hero-ink">
        <div class="wrap">
          <p class="eyebrow">תצוגת לקוח</p>
          <h1>איך הלקוח רואה את הפרויקט שלו.</h1>
          <p class="hero-sub">בוחרים לקוח ונכנסים לפורטל שלו, בדיוק כפי שהוא רואה אותו. בלי הערות פנימיות ובלי מצב בריאות.</p>
        </div>
      </section>
      <div class="wrap">
        <section class="block">
          <div class="list-head"><h2>בחירת לקוח</h2></div>
          <ul class="client-list">
            ${PROJECTS.map((p, i) => listRow(p, i, `#/client/${p.id}`, `
              <span class="row-date"><small>עלייה לאוויר</small><b>${esc(fmtShort(p.launchIn))}</b></span>`)).join('')}
          </ul>
        </section>
      </div>`;
  }

  /* ================= עמוד פרויקט (פנימי) ================= */
  function renderProject(p) {
    const alerts = computeAlerts([p]);
    const portal = portalOf(p.id);
    const portalApproved = p.clientFacing.approvals.filter(a => !a.preApproved && portal.approvals[a.id]);

    view().innerHTML = `
      <div class="wrap">
        <a class="back" href="#/">→ חזרה למרכז הניהול</a>
        <header class="phead">
          <div>
            ${healthPill(p)}
            <h1>${esc(p.name)}</h1>
            <p class="muted">${esc(p.industry)} · איש קשר: ${esc(p.contact.name)}, ${esc(p.contact.role)}</p>
          </div>
          <div class="phead-actions">
            <button class="pill-btn pill-dark" id="ask-ai">שאל את העוזר על הפרויקט</button>
            <a class="pill-btn" href="#/client/${p.id}">איך הלקוח רואה את זה</a>
          </div>
        </header>

        <div class="reason reason-${p.health}"><b>למה ${HEALTH[p.health].label}:</b> ${esc(p.healthReason)}</div>

        <div class="facts">
          <div><span>עלייה לאוויר</span><b>${relDay(p.launchIn)}</b><small>${esc(fmtDate(p.launchIn))}</small></div>
          <div><span>לינק לצפייה</span><b>${p.previewIn < 0 ? 'נשלח' : relDay(p.previewIn)}</b><small>${esc(fmtDate(p.previewIn))}</small></div>
          <div><span>הפרויקט נמצא אצל</span><b>${OWNERS[p.owner]}</b><small>כבר ${daysWord(p.ownerSince)}</small></div>
          <div><span>קשר אחרון</span><b class="${-p.lastContact >= ALERT_RULES.noContactDays ? 'warn' : ''}">${relDay(p.lastContact)}</b><small>${esc(p.lastContactNote)}</small></div>
        </div>

        ${alerts.length ? `<ul class="alerts alerts-compact">${alerts.map(a => alertHTML(a, false)).join('')}</ul>` : ''}

        ${(portalApproved.length || portal.questions.length) ? `
          <section class="card portal-activity">
            <h3>חדש מפורטל הלקוח</h3>
            <ul>
              ${portalApproved.map(a => `<li>✅ הלקוח לחץ "${esc(a.label)}"</li>`).join('')}
              ${portal.questions.map(q => `<li>💬 שאלה: "${esc(q.text)}"</li>`).join('')}
            </ul>
          </section>` : ''}

        <div class="pgrid">
          <div class="pmain">
            <section class="card">
              <h3>אפיון</h3>
              <dl class="spec">
                <dt>מטרה</dt><dd>${esc(p.spec.goal)}</dd>
                <dt>קהל</dt><dd>${esc(p.spec.audience)}</dd>
                <dt>איך זה צריך להיראות</dt><dd>${esc(p.spec.look)}</dd>
                <dt>חובה שיהיה</dt><dd><ul class="tags">${p.spec.mustHave.map(m => `<li>${esc(m)}</li>`).join('')}</ul></dd>
              </dl>
            </section>

            <section class="card">
              <div class="card-head">
                <h3>סיכום שיחת האפיון <span class="muted small">(גולמי)</span></h3>
                <button class="link-btn" id="extract">✨ חלץ משימות עם AI</button>
              </div>
              <div class="raw">${esc(p.rawCallSummary).replace(/\n/g, '<br>')}</div>
            </section>

            <section class="card">
              <h3>ציר זמן</h3>
              <ol class="timeline">
                ${sortedTimeline(p).map(s => `
                  <li class="tl-${s.status}">
                    <span class="tl-dot" aria-hidden="true"></span>
                    <div><b>${esc(STAGES[s.stage].label)}</b>
                    <small>${esc(fmtDate(s.due))} · ${{ done: 'הושלם', current: 'בעבודה', blocked: 'תקוע', upcoming: 'מתוכנן' }[s.status]}</small></div>
                  </li>`).join('')}
              </ol>
            </section>

            <section class="card">
              <h3>יומן החלטות</h3>
              <ul class="log">
                ${p.decisions.map(d => `<li><time>${fmtShort(d.day)}</time><div>${esc(d.text)}<small>${esc(d.by)}</small></div></li>`).join('')}
              </ul>
            </section>
          </div>

          <aside class="pside">
            <section class="card">
              <h3>ממתין מהלקוח</h3>
              <ul class="waiting">
                ${p.waitingFromClient.map(w => `<li class="${w.due < 0 ? 'late' : ''}">
                  <b>${esc(w.internal)}</b>
                  <small>עד ${esc(fmtDate(w.due))}${w.due < 0 ? ` · באיחור של ${daysWord(w.due)}` : ` · ${relDay(w.due)}`}</small>
                </li>`).join('') || '<li>כלום כרגע</li>'}
              </ul>
            </section>

            <section class="card notes">
              <h3>הערות פנימיות <span class="lock" title="לא מוצג ללקוח">🔒</span></h3>
              <ul class="log">
                ${p.internalNotes.map(n => `<li><time>${fmtShort(n.day)}</time><div>${esc(n.text)}<small>${esc(n.author)}</small></div></li>`).join('')}
              </ul>
            </section>

            <section class="card">
              <h3>החבילה: ${esc(p.package.name)}</h3>
              <ul class="checks">${p.package.includes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            </section>
          </aside>
        </div>
      </div>`;

    document.getElementById('ask-ai').addEventListener('click', () => Chat.toggle(true));
    document.getElementById('extract').addEventListener('click', () => Chat.run('tasks'));
  }

  /* ================= מסך 2: מה שהלקוח רואה ================= */
  /* שימו לב: המסך הזה מרונדר רק מ-toClientView(), אותה פונקציה שמזינה את העוזר של הלקוח */
  function renderClient(p) {
    const v = toClientView(p);
    const firstName = v.contactName.replace(/^עו״ד\s+/, '').split(' ')[0];
    const doneCount = v.stages.filter(s => s.state === 'הושלם').length;

    view().innerHTML = `
      <div class="demo-bar">
        <div class="wrap demo-bar-in">
          <a class="demo-back" href="#/client">→ כל הלקוחות</a>
          <span class="demo-note-txt">👁 כך הלקוח רואה את הפרויקט</span>
          <label>לקוח לדמו:
            <select id="client-pick" aria-label="בחירת לקוח לתצוגה">
              ${PROJECTS.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>

      <div class="wrap client">
        <section class="c-hero">
          <p class="eyebrow-dark">${esc(v.projectName)} · ${esc(v.package.name)}</p>
          <h1>שלום ${esc(firstName)},<br>הנה איפה אנחנו עומדים.</h1>
          <p class="c-status">${esc(v.status)}</p>
          <div class="c-dates">
            <div><span>לינק לצפייה באתר</span><b>${v.previewAlreadySent ? 'כבר אצלך ✓' : esc(v.previewDate)}</b></div>
            <div><span>עלייה לאוויר</span><b>${esc(v.launchDate)}</b></div>
          </div>
        </section>

        <section class="c-waiting ${v.waitingFromYou.length ? '' : 'c-waiting-empty'}" aria-labelledby="wait-h">
          <h2 id="wait-h">מה מחכה ממך</h2>
          ${v.waitingFromYou.length ? `<ul>
            ${v.waitingFromYou.map(w => `<li>
              <div><b>${esc(w.what)}</b>${w.isLate ? '<span class="soon">כדאי בהקדם, זה עוזר לנו לשמור על תאריך העלייה</span>' : ''}</div>
              <time>עד ${esc(w.until)}</time>
            </li>`).join('')}
          </ul>` : '<p>כרגע שום דבר. אנחנו נעדכן כשנצטרך ממך משהו 🙂</p>'}
        </section>

        <section class="card c-progress">
          <h2>ההתקדמות <span class="muted small">${doneCount} מתוך ${v.stages.length} שלבים</span></h2>
          <ol class="stepper">
            ${v.stages.map(s => `<li class="st-${s.state === 'הושלם' ? 'done' : s.state === 'עכשיו' ? 'now' : 'next'}">
              <span class="st-dot" aria-hidden="true">${s.state === 'הושלם' ? '✓' : ''}</span>
              <b>${esc(s.name)}</b><small>${s.state === 'עכשיו' ? 'אנחנו כאן' : esc(s.date)}</small>
            </li>`).join('')}
          </ol>
        </section>

        <div class="c-grid">
          <section class="card">
            <h2>מה כבר מוכן</h2>
            <ul class="checks">${v.completed.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
          </section>

          <section class="card">
            <h2>אישורים</h2>
            <p class="muted small">לחיצה על אישור מעדכנת מיד את מנהל הפרויקט.</p>
            <div class="approvals">
              ${p.clientFacing.approvals.map(a => isApproved(p, a)
                ? `<div class="approved">✓ ${esc(a.label)}</div>`
                : `<button class="pill-btn approve-btn" data-approve="${a.id}">${esc(a.label)}</button>`).join('')}
            </div>
          </section>
        </div>

        <section class="card c-questions">
          <h2>יש לך שאלה?</h2>
          <p class="muted small">כותבים כאן, ומנהל הפרויקט חוזר אליך תוך יום עבודה. לתשובה מיידית אפשר גם לשאול את העוזר (בפינת המסך).</p>
          <form id="q-form">
            <textarea id="q-text" rows="3" placeholder="למשל: אפשר להוסיף עוד תמונה לעמוד הבית?" aria-label="השאלה שלך"></textarea>
            <button class="pill-btn pill-dark" type="submit">שליחת שאלה</button>
          </form>
          ${v.yourQuestions.length ? `<ul class="sent-q">${v.yourQuestions.map(q => `<li><span>${esc(q)}</span><small>נשלח ✓</small></li>`).join('')}</ul>` : ''}
        </section>

        <details class="card c-package">
          <summary>מה כלול בחבילה שלך</summary>
          <ul class="checks">${v.package.includes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </details>
      </div>`;

    document.getElementById('client-pick').addEventListener('change', e => { location.hash = `#/client/${e.target.value}`; });
    view().querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
      approve(p, b.dataset.approve);
      toast('תודה! מנהל הפרויקט קיבל את האישור.');
      renderClient(p); Chat.refresh();
    }));
    document.getElementById('q-form').addEventListener('submit', e => {
      e.preventDefault();
      const t = document.getElementById('q-text').value.trim();
      if (!t) { toast('כדאי לכתוב שאלה לפני השליחה 🙂'); return; }
      addQuestion(p, t);
      toast('השאלה נשלחה. נחזור אליך תוך יום עבודה.');
      renderClient(p); Chat.refresh();
    });
  }

  /* ================= מסך 3: מסמך אפיון הכלי ================= */
  /* הטקסטים של המסמך: כל סעיף הוא HTML פשוט (פסקאות ורשימות). כאן עורכים. */
  const SPEC_DOC = [
    { title: 'הבעיה שהכלי פותר', html: `
      <p>הקטע שבין "האפיון נסגר" לבין "האתר באוויר" הוא המקום שבו פרויקטים הכי נוטים להחליק. העבודה מתפצלת בין הסטודיו, הפיתוח והלקוח, ולכל אחד יש לוח זמנים משלו. עיכובים קטנים לא נראים כמו בעיה כשהם קורים: טקסט שמתעכב בכמה ימים, חיבור טכני שתקוע אצל ספק חיצוני, או שבוע שבו אף אחד לא דיבר עם הלקוח. הם מתגלים רק כשהם כבר מזיזים את תאריך העלייה.</p>
      <p>הלקוח מרגיש את זה מהצד השני. הוא לא יודע איפה הפרויקט עומד ומה מחכה ממנו, אז הוא שולח "נו, מה קורה?" ומגיב מאוחר לדברים שבאמת תלויים בו. מנהל הפרויקט, בינתיים, מרכיב את התמונה מוואטסאפים, ממיילים ומסיכומי שיחות.</p>
      <p><strong>דוגמה מהדמו:</strong> אצל משרד עורכי הדין, הטקסטים מתעכבים רק 4 ימים. זה לא נשמע דרמטי. אבל כשמחשבים שצריך 13 ימי עבודה מהרגע שהתוכן מגיע ועד העלייה, מתברר שנשארו 3 ימים בלבד לפני שהתאריך זז. הכלי עושה את החישוב הזה בשבילי, כל בוקר, על כל הפרויקטים.</p>` },

    { title: 'למה בניתי אותו ככה', html: `
      <ul>
        <li><strong>שני מבטים על אותו פרויקט.</strong> מנהל הפרויקט צריך את כל האמת, כולל השערות והערות פנימיות. הלקוח צריך תמונה פשוטה ומרגיעה, ושורה אחת ברורה שאומרת מה הוא צריך לעשות ועד מתי. לכן יש מסך פנימי ומסך לקוח, והמסמך הזה מסביר את ההיגיון.</li>
        <li><strong>התראות שמחושבות מהנתונים, לא נכתבות ביד.</strong> התראה שצריך לזכור לכתוב היא בדיוק ההתראה שתישכח. הכלי עונה לבד על שלוש השאלות שאני שואל כל בוקר: עם מי לא דיברתי? מה מאיים על תאריך? מה תקוע אצל מישהו?</li>
        <li><strong>כל התראה מגיעה עם צעד הבא.</strong> המטרה היא פעולה, לא עוד לוח מחוונים שמסתכלים עליו.</li>
        <li><strong>AI במשימות שגוזלות זמן ממנהל פרויקט.</strong> לסנן סיכום שיחה ארוך למשימות, לנסח עדכון שבועי, ולכתוב מייל ללקוח לחוץ בלי לאבד את הטון. ה-AI מנסח, ואני מחליט ושולח.</li>
        <li><strong>מה השארתי בחוץ בכוונה:</strong> התחברות, בסיס נתונים, הרשאות משתמשים ואינטגרציות. העדפתי מעט דברים שעובדים עד הסוף על פני הרבה דברים חצי גמורים.</li>
      </ul>` },

    { title: 'החלטות מרכזיות', html: `
      <ul>
        <li><strong>הפרדת ההרשאות של ה-AI קורית בקוד, לא בפרומפט.</strong> העוזר במסך הלקוח מקבל רק שדות מרשימה לבנה, כך שהערות פנימיות ומצב הבריאות לא נכנסים לבקשה בכלל. הוראה בפרומפט אפשר לעקוף בשאלה מתוחכמת, אבל מידע שלא נשלח אי אפשר להדליף. הפרומפט הנפרד לכל מצב הוא שכבת הגנה שנייה. מול לקוחות זו שאלה של אמון: הערה כמו "השערה: מה שמפריע לו זה התמונות" לא אמורה להגיע ללקוח, אף פעם.</li>
        <li><strong>מקור מידע אחד למסך הלקוח ולעוזר שלו.</strong> מה שהלקוח רואה על המסך ומה שהעוזר שלו יודע נבנים מאותה פונקציה. אין מצב שבו העוזר "יודע" משהו שהלקוח לא אמור לראות. בעוזר יש גם כפתור שמראה בדיוק מה נשלח ל-AI.</li>
        <li><strong>שפה בלי האשמות במסך הלקוח.</strong> עיכוב פנימי מוצג ללקוח פשוט כ"אנחנו כאן". את הבעיה פותרים מבפנים, ולא מגלגלים אותה ללקוח.</li>
        <li><strong>"מה מחכה ממך" בראש מסך הלקוח.</strong> זה הדבר שהכי משפיע על לוחות הזמנים, ולכן הוא הכי בולט, עם תאריכים. אישור בלחיצה ושאלה מהלקוח מופיעים מיד אצל מנהל הפרויקט.</li>
        <li><strong>תאריכים יחסיים להיום.</strong> כל תאריך שמור כ"בעוד X ימים", כך שבכל יום שפותחים את הדמו ההתראות נכונות.</li>
        <li><strong>המפתח נשמר רק בדפדפן, ויש מצב דמו מסומן.</strong> לדמו זה מספיק. במוצר אמיתי המפתח והסינון היו רצים בשרת.</li>
      </ul>` },

    { title: 'שאלות שהייתי שואל על התהליך האמיתי בחברה', html: `
      <ol>
        <li>איך נראה היום המעבר מאפיון ועיצוב לניהול ההקמה? מה מנהל הפרויקט מקבל, ומה בדרך כלל חסר בו?</li>
        <li>מה הסיבה הנפוצה ביותר לדחיית עלייה לאוויר: תוכן מהלקוח, סבבי תיקונים מאוחרים, או חסמים טכניים?</li>
        <li>איפה מתנהלת התקשורת עם הלקוח (וואטסאפ, מייל, מערכת), ואיפה נשמרות ההחלטות?</li>
        <li>איך מתנהל סבב התיקונים אחרי שהלקוח מקבל לינק לצפייה? יש מגבלה על מספר הסבבים, ומי מגדיר מה נכנס לפני העלייה ומה אחריה?</li>
        <li>בפרויקטים של סוכני AI, מה לוקח בדרך כלל יותר זמן מהצפוי: החיבור למערכות של הלקוח, איסוף הידע לסוכן, או הכיוונון של הטון?</li>
        <li>האם הפלטפורמה של החברה כבר חושפת סטטוסים, כך שחלק מהנתונים כאן יוכלו להתעדכן אוטומטית?</li>
        <li>איך מודדים הצלחה בתפקיד: עמידה בתאריכים, שביעות רצון של הלקוח, או משהו אחר?</li>
      </ol>` },
  ];

  function renderSpec() {
    view().innerHTML = `
      <article class="wrap doc">
        <header class="doc-head">
          <p class="eyebrow-dark">מסמך אפיון</p>
          <h1>מרכז ניהול הקמה</h1>
          <p class="muted">כלי לניהול פרויקטים מהרגע שהאפיון והעיצוב נסגרו ועד העלייה לאוויר. [שם] · ${esc(new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(TODAY))}</p>
        </header>
        ${SPEC_DOC.map((s, i) => `
          <section class="doc-sec">
            <span class="num">${String(i + 1).padStart(2, '0')}</span>
            <h2>${s.title}</h2>
            <div class="doc-body">${s.html}</div>
          </section>`).join('')}
      </article>`;
  }

  /* ================= מודאל, הגדרות והודעות ================= */
  function openModal(title, html) {
    const m = document.getElementById('modal');
    m.querySelector('.modal-title').textContent = title;
    m.querySelector('.modal-body').innerHTML = html;
    m.hidden = false;
    m.querySelector('.modal-close').focus();
    return m.querySelector('.modal-body');
  }
  function closeModal() { document.getElementById('modal').hidden = true; }

  function openSettings() {
    const body = openModal('הגדרות: חיבור ל-AI', `
      ${SERVER.available
        ? '<p class="server-on">✓ העוזר כבר מחובר ל-Claude דרך השרת של הדמו, ולא צריך מפתח. אפשר להדביק כאן מפתח אישי כדי להשתמש בו במקום.</p>'
        : '<p class="modal-lead">בלי מפתח, העוזר עובד במצב דמו עם תשובות מוכנות. עם מפתח, הוא עונה בזמן אמת על כל שאלה.</p>'}
      <fieldset class="seg" role="radiogroup" aria-label="ספק">
        <label><input type="radio" name="prov" value="anthropic" ${SETTINGS.provider === 'anthropic' ? 'checked' : ''}> Claude (Anthropic)</label>
        <label><input type="radio" name="prov" value="openai" ${SETTINGS.provider === 'openai' ? 'checked' : ''}> OpenAI</label>
      </fieldset>
      <label class="field">מפתח API
        <div class="key-row">
          <input type="password" id="s-key" autocomplete="off" spellcheck="false" dir="ltr" placeholder="sk-…">
          <button type="button" class="link-btn" id="s-show">הצגה</button>
        </div>
      </label>
      <label class="field">מודל
        <input type="text" id="s-model" dir="ltr" spellcheck="false">
      </label>
      <p class="hint">🔒 המפתח נשמר רק בדפדפן הזה (localStorage), לא נמצא בקוד ונשלח רק ישירות ל-API של הספק שבחרת.</p>
      <p class="s-status" id="s-status" role="status"></p>
      <div class="modal-actions">
        <button class="pill-btn pill-dark" id="s-save">שמירה</button>
        <button class="pill-btn" id="s-test">בדיקת חיבור</button>
        <button class="link-btn danger" id="s-clear">מחיקת המפתח</button>
      </div>`);

    const keyEl = body.querySelector('#s-key'), modelEl = body.querySelector('#s-model'), status = body.querySelector('#s-status');
    const prov = () => body.querySelector('input[name=prov]:checked').value;
    const fill = () => { keyEl.value = SETTINGS.keys[prov()] || ''; modelEl.value = SETTINGS.models[prov()] || DEFAULT_MODELS[prov()]; status.textContent = ''; };
    fill();
    body.querySelectorAll('input[name=prov]').forEach(r => r.addEventListener('change', fill));
    body.querySelector('#s-show').addEventListener('click', e => {
      const show = keyEl.type === 'password'; keyEl.type = show ? 'text' : 'password'; e.target.textContent = show ? 'הסתרה' : 'הצגה';
    });
    const save = () => {
      const p = prov(), k = keyEl.value.trim();
      SETTINGS.provider = p; SETTINGS.keys[p] = k; SETTINGS.models[p] = modelEl.value.trim() || DEFAULT_MODELS[p];
      saveSettings(); updateModeBadge(); Chat.refresh();
      if (k && p === 'anthropic' && !k.startsWith('sk-ant-')) return 'נשמר. שימו לב: מפתחות של Anthropic מתחילים בדרך כלל ב-sk-ant-';
      if (k && p === 'openai' && !k.startsWith('sk-')) return 'נשמר. שימו לב: מפתחות של OpenAI מתחילים בדרך כלל ב-sk-';
      return k ? 'נשמר. העוזר משתמש במפתח האישי שלך.' : (SERVER.available ? 'נשמר. העוזר מחובר דרך השרת של הדמו.' : 'נשמר. בלי מפתח העוזר עובד במצב דמו.');
    };
    body.querySelector('#s-save').addEventListener('click', () => { status.className = 's-status ok'; status.textContent = save(); });
    body.querySelector('#s-clear').addEventListener('click', () => {
      SETTINGS.keys[prov()] = ''; keyEl.value = ''; saveSettings(); updateModeBadge(); Chat.refresh();
      status.className = 's-status ok'; status.textContent = SERVER.available ? 'המפתח נמחק מהדפדפן. העוזר חזר לחיבור דרך השרת.' : 'המפתח נמחק מהדפדפן. העוזר חזר למצב דמו.';
    });
    body.querySelector('#s-test').addEventListener('click', async () => {
      save();
      if (!activeKey()) { status.className = 's-status err'; status.textContent = 'קודם צריך להדביק מפתח.'; return; }
      status.className = 's-status'; status.textContent = 'בודק חיבור…';
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
      try {
        await callLLM({ system: 'ענה במילה אחת.', messages: [{ role: 'user', content: 'בדיקה' }], signal: ctrl.signal });
        status.className = 's-status ok'; status.textContent = '✓ החיבור עובד.';
      } catch (e) { status.className = 's-status err'; status.textContent = e.message; }
      finally { clearTimeout(t); }
    });
  }

  function updateModeBadge() {
    const b = document.getElementById('mode-badge');
    const demo = isDemoMode();
    const route = aiRoute();
    b.textContent = demo ? 'מצב דמו' : `מחובר ל-${route === 'server' || SETTINGS.provider === 'anthropic' ? 'Claude' : 'OpenAI'}`;
    b.className = 'mode-badge ' + (demo ? 'is-demo' : 'is-live');
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  function init() {
    Chat.mount();
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('mode-badge').addEventListener('click', openSettings);
    document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('.modal-close')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    document.getElementById('reset-demo').addEventListener('click', () => {
      resetPortal(); toast('נתוני הדמו אופסו.'); route();
    });
    updateModeBadge();
    checkServer().then(() => { updateModeBadge(); Chat.refresh(); });
    window.addEventListener('hashchange', route);
    route();
  }

  return { init, openModal, openSettings, toast };
})();

document.addEventListener('DOMContentLoaded', App.init);
