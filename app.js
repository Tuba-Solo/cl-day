import { DATA } from './data.js';
import { createStore } from './store.js';
import { SESSION_ID, DEFAULT_SESSION } from './config.js';

// ---------- Reference data ----------
// People rate topics (subject-matter content). Each topic lists the curriculum statements it covers.
const TABLES = Object.keys(DATA.tables);
const TOPICS = DATA.topics;
const TP = Object.fromEntries(TOPICS.map(t => [t.id, t]));
const ST = DATA.statements;
const topicsFor = t => TOPICS.filter(x => x.table === t);
const idsFor = t => topicsFor(t).map(x => x.id);
// A person rated table t if they saved anything for one of its topics. Each person has one record for all tables.
const ratedTable = (r, t) => idsFor(t).some(c => r.r && r.r[c]);
const topicOrder = TOPICS.map(t => t.id);
const MAIN_TABLES = TABLES.filter(t => !DATA.tables[t].optional);
const OPT_TABLES = TABLES.filter(t => DATA.tables[t].optional);
// Version A unit label for a topic, such as "Unit 2" or "Units 2–3".
const unitLabel = t => !t.units || !t.units.length ? '' : (t.units.length === 1 ? `Unit ${t.units[0]}` : `Units ${t.units[0]}–${t.units[t.units.length - 1]}`);

const OLD = [['7', 'Gr 7'], ['8', 'Gr 8'], ['9', 'Gr 9'], ['none', 'Not taught']];
const LEVELS = [['R', 'Ready'], ['U', 'Read up'], ['L', 'Learn']];
const LEVEL_LABEL = Object.fromEntries(LEVELS);
const VERDICTS = [['familiar', 'Familiar'], ['partly', 'Partly new'], ['new', 'Truly new']];
const VERDICT_LABEL = Object.fromEntries(VERDICTS);

// Resource priorities: what a Social Studies resource developer could make. People rank their top six.
const RESOURCES = [
  { id: 'content-guides', kind: 'Teacher', name: 'Content guides', desc: 'Background on a new topic for the teacher. The history, key terms and what to watch for.' },
  { id: 'year-plans', kind: 'Teacher', name: 'Year plans and pacing', desc: 'The order of units across the year, with time for each.' },
  { id: 'unit-plans', kind: 'Teacher', name: 'Unit plans', desc: 'One unit mapped out. Outcomes, key questions, the lesson sequence and where assessment falls.' },
  { id: 'lesson-plans', kind: 'Teacher', name: 'Lesson plans', desc: 'Step-by-step plans for a single lesson.' },
  { id: 'assessments', kind: 'Teacher', name: 'Assessment tasks and rubrics', desc: 'End-of-unit tasks with criteria and marking keys.' },
  { id: 'exemplars', kind: 'Teacher', name: 'Exemplars', desc: 'Marked student work at each level, to calibrate marking.' },
  { id: 'resource-lists', kind: 'Teacher', name: 'Vetted resource lists', desc: 'Existing videos, books and sites, checked and matched to outcomes.' },
  { id: 'crosswalks', kind: 'Teacher', name: 'Curriculum crosswalks', desc: 'What is new, moved or gone compared with the old program of studies.' },
  { id: 'slide-decks', kind: 'Student', name: 'Lesson slide decks', desc: 'Slides a teacher can present as is or adapt.' },
  { id: 'readings', kind: 'Student', name: 'Student readings', desc: 'Short texts on the content, written for the grade.' },
  { id: 'source-packets', kind: 'Student', name: 'Primary source packets', desc: 'Documents, photos and maps from the time, with guiding questions.' },
  { id: 'organizers', kind: 'Student', name: 'Graphic organizers', desc: 'Reusable templates for cause and effect, comparison, perspective and more.' },
  { id: 'maps-timelines', kind: 'Student', name: 'Maps and timelines', desc: 'Visuals that place events in space and time.' },
  { id: 'video-guides', kind: 'Student', name: 'Video viewing guides', desc: 'Questions with time stamps for specific Curio and other videos.' },
  { id: 'simulations', kind: 'Student', name: 'Simulations and role plays', desc: 'Students take on roles and make decisions people faced at the time.' },
  { id: 'inquiry', kind: 'Student', name: 'Inquiry projects', desc: 'Multi-lesson projects built on a driving question, with checkpoints.' },
  { id: 'vocabulary', kind: 'Student', name: 'Vocabulary supports', desc: 'Glossaries and word walls for key terms.' },
  { id: 'quick-checks', kind: 'Student', name: 'Quick checks', desc: 'Exit slips and short quizzes to see who has it.' },
  { id: 'adapted', kind: 'Student', name: 'Adapted materials', desc: 'Existing materials at a lower reading level or with added supports.' }
];
const RS = Object.fromEntries(RESOURCES.map(x => [x.id, x]));
// Share of the developer's time by grade. The three together cannot go over 100.
const GRADES = [{ id: 'g7', name: 'Social Studies 7' }, { id: 'g8', name: 'Social Studies 8' }, { id: 'g9', name: 'Social Studies 9' }];
const GRADE_STEP = 5;
// When the developer should start. People pick one.
const WHEN = [
  { id: 's2-2627', name: 'Semester 2, 2026-2027', desc: 'Before the curriculum update' },
  { id: 's1-2728', name: 'Semester 1, 2027-2028', desc: 'After the curriculum update' }
];
const WS = Object.fromEntries(WHEN.map(x => [x.id, x]));
const gradeVals = g => Object.fromEntries(GRADES.map(x => [x.id, Math.max(0, Math.min(100, Number((g || {})[x.id]) || 0))]));
const gradeSum = v => GRADES.reduce((t, x) => t + (v[x.id] || 0), 0);
const TOP_N = 6;

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const splitCode = code => { const [lo, c] = code.split(' '); return { lo, c, type: c.startsWith('K') ? 'K' : 'SP' }; };
const tsString = x => (x && typeof x.toDate === 'function') ? x.toDate().toISOString() : (x || '');

// ---------- App state ----------
let store;
let unsubs = [];
const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const timers = {};
const pending = new Set();
function debounce(id, fn, ms = 700) {
  clearTimeout(timers[id]);
  pending.add(id);
  timers[id] = setTimeout(() => { delete timers[id]; Promise.resolve(fn()).finally(() => { if (!timers[id]) pending.delete(id); }); }, ms);
}
// A field is safe to overwrite from the database only if it is not focused and has no unsaved edit.
const canPaint = (el, id) => document.activeElement !== el && !pending.has(id);
function cleanup() { unsubs.forEach(f => { try { f(); } catch {} }); unsubs = []; }

function setStatus(text, kind = 'ok') {
  statusEl.className = 'status ' + kind;
  statusEl.innerHTML = `<span class="dot" aria-hidden="true"></span>${esc(text)}`;
}
function connectionStatus() {
  if (store.mode === 'demo') return setStatus('Demo mode', 'warn');
  if (navigator.onLine) setStatus('Connected', 'ok');
  else setStatus('Offline. Answers are kept and will send when you reconnect.', 'warn');
}
window.addEventListener('online', () => store && connectionStatus());
window.addEventListener('offline', () => store && connectionStatus());

function track(promise, el) {
  if (el) el.textContent = 'Saving…';
  return Promise.resolve(promise).then(() => { if (el) el.textContent = 'All changes saved'; })
    .catch(err => { console.error(err); if (el) el.textContent = 'Not saved. Check the connection and try again.'; });
}

// ---------- Aggregation ----------
function aggregate(ratings, k) {
  const a = { n: 0, o: { '7': 0, '8': 0, '9': 0, none: 0 }, me: { R: 0, U: 0, L: 0 }, most: { R: 0, U: 0, L: 0 }, notes: [] };
  for (const r of ratings) {
    const x = r.r && r.r[k];
    if (!x) continue;
    (x.o || []).forEach(v => { if (v in a.o) a.o[v]++; });
    if (x.me in a.me) a.me[x.me]++;
    if (x.most in a.most) a.most[x.most]++;
    if (x.note && x.note.trim()) a.notes.push(x.note.trim());
    if (x.me || x.most) a.n++;
  }
  const mostN = a.most.R + a.most.U + a.most.L;
  const meN = a.me.R + a.me.U + a.me.L;
  const taught = a.o['7'] + a.o['8'] + a.o['9'];
  a.mostN = mostN;
  a.meN = meN;
  a.learnShare = mostN ? a.most.L / mostN : 0;
  a.meLearnShare = meN ? a.me.L / meN : 0;
  a.split = (a.most.R > 0 && a.most.L > 0) || (a.me.R > 0 && a.me.L > 0);
  a.oldSplit = a.o.none > 0 && taught > 0;
  a.talkScore = (a.split ? 2 : 0) + (a.oldSplit ? 1 : 0) + a.learnShare;
  return a;
}

function tallyHtml(counts, labels) {
  const max = Math.max(...labels.map(([v]) => counts[v] || 0));
  return `<div class="tally">${labels.map(([v, l]) => {
    const n = counts[v] || 0;
    const cls = n === 0 ? 'zero' : (n === max ? 'lead' : '');
    return `<span class="${cls}">${esc(l)} · ${n}</span>`;
  }).join('')}</div>`;
}

function codeHtml(code) {
  const { lo, c, type } = splitCode(code);
  return `<div class="code"><span class="lo">${esc(lo)}</span><span class="chip ${type}">${esc(c)}</span></div>`;
}

// The topic heading, the content description, and the curriculum statements tucked away until opened.
function topicHtml(t) {
  const n = t.codes.length + t.also.length;
  const row = code => `<li>${codeHtml(code)}<div class="stmt">${esc(ST[code].text)}</div></li>`;
  return `<div class="topic-top"><span class="tid" aria-hidden="true">${esc(t.id)}</span><h3 class="tname">${esc(t.name)}</h3></div>
    <div class="unit-tag">${esc(unitLabel(t))}</div>
    <p class="tdesc">${esc(t.desc)}</p>
    <details class="stmts"><summary>Curriculum statements (${n})</summary>
      ${t.codes.length ? `<ul class="stmt-list">${t.codes.map(row).join('')}</ul>` : ''}
      ${t.also.length ? `<div class="also-label">${t.codes.length ? 'Also touches this topic' : 'Where this topic appears'}</div><ul class="stmt-list also">${t.also.map(row).join('')}</ul>` : ''}
    </details>`;
}

// ---------- Start ----------
function viewStart() {
  const last = lsGet('wtn-table');
  app.innerHTML = `
    <h1>Find what is truly new in Grade 7</h1>
    <div class="emph">Evaluate your comfort level with the content of the new curriculum. We will aggregate responses to determine where the critical gaps in teacher knowledge lie.</div>
    <section class="prio-card" aria-labelledby="prio-h">
      <div><h2 id="prio-h">Resource Developer Priorities</h2>
        <p>If we hire a Social Studies resource developer, where should their time go? Responses closed on October 8. You can still see what the room said.</p></div>
      <div class="row"><a class="btn primary" href="#/rank/room">See the room's results</a></div>
    </section>
    <h2>Choose your table</h2>
    <div class="table-grid">
      ${MAIN_TABLES.map(t => `
        <section class="table-card" aria-labelledby="tc-${t}">
          <div class="head"><span class="letter" aria-hidden="true">${t}</span>
            <div><h3 id="tc-${t}">Table ${t}${last === t ? ' <span class="muted">(you)</span>' : ''}</h3><div class="count">${esc(DATA.tables[t].name)} · ${topicsFor(t).length} topics</div></div></div>
          <ul>${topicsFor(t).map(x => `<li>${esc(x.name)}</li>`).join('')}</ul>
          <div class="actions">
            <span style="font-size: 14px; font-weight: 700; color: var(--muted)">On your own</span>
            <a class="btn primary" href="#/rate/${t}">Rate my curriculum</a>
            <span style="font-size: 14px; font-weight: 700; color: var(--muted); margin-top: 6px">As a group</span>
            <a class="btn" href="#/table/${t}">Review your ratings</a>
          </div>
        </section>`).join('')}
    </div>
    ${OPT_TABLES.map(t => `
      <section class="optional-card" aria-labelledby="oc-${t}">
        <div><h3 id="oc-${t}">Optional · ${esc(DATA.tables[t].name)}</h3>
          <p class="muted">We are already teaching Unit 1. Rate these ${topicsFor(t).length} topics only if your table finishes early.</p></div>
        <div class="row"><a class="btn" href="#/rate/${t}">Rate Unit 1</a><a class="btn" href="#/table/${t}">Review Unit 1</a></div>
      </section>`).join('')}
    <h2>Three steps</h2>
    <ol class="lede">
      <li><b>On your own · 25 min.</b> Open <b>Rate my curriculum</b> on your own laptop and rate your table’s topics.</li>
      <li><b>As a group · 25 min.</b> Close your laptops. Open <b>Review your ratings</b> on one screen. Agree on a verdict for each topic. Then write a short brief for each truly new topic that needs a resource.</li>
      <li><b>With the room · 20 min.</b> Each table shares its briefs. We look at every table’s results together and decide where to start.</li>
    </ol>`;
}

// ---------- Rate ----------
function optButtons(group, k, options, label) {
  return `<div><div class="group-label" id="g-${group}-${k}">${esc(label)}</div>
    <div class="opts" role="group" aria-labelledby="g-${group}-${k}">
      ${options.map(([v, l]) => `<button type="button" class="opt" data-g="${group}" data-v="${v}" aria-pressed="false">${esc(l)}</button>`).join('')}
    </div></div>`;
}

async function viewRate(T) {
  lsSet('wtn-table', T);
  const codes = idsFor(T);
  const seen = lsGet('wtn-howto-seen') === '1';
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Step 1 · On your own · 25 min</span>
      <h1>Table ${T} · Your ratings</h1></div>
      <div class="row"><a class="btn" href="#/">Change table</a><a class="btn" href="#/table/${T}">Review your ratings</a></div>
    </div>
    <details class="howto" ${seen ? '' : 'open'}>
      <summary>How to rate</summary>
      <p>Each card is a topic. Rate the content of the topic, the people, events and ideas a teacher would need to know. You are not rating the wording of the curriculum. Read the short description. Open <b>Curriculum statements</b> if you want to see the exact wording.</p>
      <dl class="key">
        <dt>Old program</dt><dd>Where the old Social Studies program taught this content. Tick every grade that taught it. Grade 7 was <i>Canada: Origins, Histories and Movement of Peoples</i>. Grade 8 was <i>Historical Worldviews Examined</i>. Grade 9 was <i>Canada: Opportunities and Challenges</i>. If only part of the topic was taught, tick the grade and name the part in your note.</dd>
        <dt>Me</dt><dd>How ready you are to teach it.</dd>
        <dt>Most teachers</dt><dd>How ready the Grade 7 teachers you work with are. Not other curriculum leads.</dd>
        <dt>Ready</dt><dd>Could teach it tomorrow.</dd>
        <dt>Read up</dt><dd>Knows the topic. Would read up first.</dd>
        <dt>Learn</dt><dd>Would need to learn the content itself.</dd>
        <dt>Note</dt><dd>A resource you know, or what confuses you.</dd>
      </dl>
      <p>Leave a group blank if you are not sure. Your answers save as you go. No names are collected.</p>
    </details>
    <div class="progress" role="region" aria-label="Progress">
      <span class="label" id="prog-label">0 of ${codes.length} rated</span>
      <div class="bar" aria-hidden="true"><span id="prog-bar"></span></div>
      <span class="muted" id="save-state" aria-live="polite"></span>
    </div>
    <div id="done" class="done-banner" hidden>All rated. Close your laptop and join your table. Your table will review its ratings together on one screen.</div>
    <div class="cluster-head"><h2>${esc(DATA.tables[T].name)}</h2><p>${codes.length} topics</p></div>
    ${topicsFor(T).map(t => {
      const k = t.id;
      return `<article class="card topic" data-key="${k}">
        <span class="done-tick" hidden>Rated</span>
        ${topicHtml(t)}
        <div class="groups">
          ${optButtons('o', k, OLD, 'Old program')}
          ${optButtons('me', k, LEVELS, 'Me')}
          ${optButtons('most', k, LEVELS, 'Most teachers')}
        </div>
        <input class="note" type="text" maxlength="500" placeholder="Note: a resource you know, the part that was taught, or a question" aria-label="Note for ${esc(t.name)}">
      </article>`;
    }).join('')}`;

  app.querySelector('details.howto').addEventListener('toggle', () => lsSet('wtn-howto-seen', '1'));
  const saveState = app.querySelector('#save-state');
  // Your saved ratings load live from the database, so a reload or a slow connection never shows a blank sheet.
  const mine = {};
  const inflight = new Map();
  track(store.setMyTable(T), saveState);

  const paint = (k) => {
    const card = app.querySelector(`.card[data-key="${k}"]`);
    if (!card) return;
    const x = mine[k] || {};
    card.querySelectorAll('.opt').forEach(b => {
      const g = b.dataset.g, v = b.dataset.v;
      const on = g === 'o' ? (x.o || []).includes(v) : x[g] === v;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const note = card.querySelector('.note');
    if (document.activeElement !== note) note.value = x.note || '';
    const complete = !!(x.me && x.most);
    card.classList.toggle('complete', complete);
    card.querySelector('.done-tick').hidden = !complete;
  };
  const progress = () => {
    const done = codes.filter(c => { const x = mine[c]; return x && x.me && x.most; }).length;
    app.querySelector('#prog-label').textContent = `${done} of ${codes.length} rated`;
    app.querySelector('#prog-bar').style.width = `${Math.round(100 * done / codes.length)}%`;
    app.querySelector('#done').hidden = done < codes.length;
  };
  codes.forEach(c => paint(c));
  progress();
  unsubs.push(store.watchMine(doc => {
    const r = (doc && doc.r) || {};
    codes.forEach(c => {
      const k = c;
      if (inflight.get(k) || pending.has('note-' + k)) return;
      if (r[k]) mine[k] = JSON.parse(JSON.stringify(r[k]));
      paint(k);
    });
    progress();
  }));

  const save = (k) => {
    const x = mine[k] || {};
    const val = { o: x.o || [], me: x.me || null, most: x.most || null, note: x.note || '' };
    inflight.set(k, (inflight.get(k) || 0) + 1);
    return track(store.saveRating(T, k, val), saveState).finally(() => inflight.set(k, inflight.get(k) - 1));
  };

  app.addEventListener('click', onClick);
  app.addEventListener('input', onInput);
  unsubs.push(() => { app.removeEventListener('click', onClick); app.removeEventListener('input', onInput); });

  function onClick(e) {
    const b = e.target.closest('.opt');
    if (!b) return;
    const card = b.closest('.card');
    const k = card.dataset.key;
    const x = mine[k] = mine[k] || {};
    const g = b.dataset.g, v = b.dataset.v;
    if (g === 'o') {
      let o = x.o || [];
      if (v === 'none') o = o.includes('none') ? [] : ['none'];
      else o = o.includes(v) ? o.filter(z => z !== v) : [...o.filter(z => z !== 'none'), v];
      x.o = o;
    } else {
      x[g] = x[g] === v ? null : v;
    }
    paint(k); progress(); save(k);
  }
  function onInput(e) {
    if (!e.target.classList.contains('note')) return;
    const k = e.target.closest('.card').dataset.key;
    (mine[k] = mine[k] || {}).note = e.target.value;
    saveState.textContent = 'Saving…';
    debounce('note-' + k, () => save(k));
  }
}

// ---------- Table ----------
function viewTable(T) {
  const codes = idsFor(T);
  let order = [...codes];
  let ratings = [];
  let tableDoc = {};
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Step 2 · As a group · 25 min</span>
      <h1>Table ${T} · Review your ratings</h1></div>
      <div class="row"><a class="btn" href="#/rate/${T}">Rate my curriculum</a></div>
    </div>
    <p class="lede">Work from this one screen. Start with the topics marked <b>Split</b>. Agree on a verdict for each topic. Say which part is new in the note.</p>
    <div class="toolbar">
      <span class="label" id="raters"><b>0</b> people have rated</span>
      <button type="button" class="btn" id="sort-talk">Put split topics first</button>
      <button type="button" class="btn" id="sort-curr">Topic order</button>
      <button type="button" class="btn" id="go-briefs">Go to briefs</button>
      <span class="muted" id="save-state" aria-live="polite"></span>
    </div>
    <div id="cards"></div>
    <h2>Where we disagreed</h2>
    <textarea class="big" data-field="disagreed" maxlength="3000" aria-label="Where we disagreed" placeholder="Topics you could not agree on, and why"></textarea>
    <h2 id="briefs">Briefs</h2>
    <p class="lede">Once your verdicts are in, write a short brief for each truly new topic that needs a resource. A few lines is enough. Your table shares its briefs with the room next.</p>
    <div id="brief-list"></div>
    <button type="button" class="btn primary" id="add-brief">Add a brief</button>`;

  const cardsEl = app.querySelector('#cards');
  const saveState = app.querySelector('#save-state');

  const renderCards = () => {
    cardsEl.innerHTML = order.map(code => {
      const k = code;
      return `<article class="card topic" data-key="${k}">
        ${topicHtml(TP[code])}
        <div class="stats" data-stats></div>
        <div class="badges" data-badges></div>
        <ul class="rnotes" data-notes hidden></ul>
        <div class="verdict">
          <div class="opts" role="group" aria-label="Verdict for ${esc(TP[code].name)}">
            ${VERDICTS.map(([v, l]) => `<button type="button" class="opt" data-g="v" data-v="${v}" aria-pressed="false">${esc(l)}</button>`).join('')}
          </div>
          <input type="text" class="vnote" maxlength="500" placeholder="Which part is new, an old unit or resource, or why" aria-label="Verdict note for ${esc(TP[code].name)}">
        </div>
      </article>`;
    }).join('');
    paintStats(); paintVerdicts();
  };

  const paintStats = () => {
    app.querySelector('#raters').innerHTML = `<b>${ratings.length}</b> ${ratings.length === 1 ? 'person has' : 'people have'} rated`;
    codes.forEach(code => {
      const card = cardsEl.querySelector(`.card[data-key="${code}"]`);
      if (!card) return;
      const a = aggregate(ratings, code);
      card.querySelector('[data-stats]').innerHTML = `
        <div class="stat-group"><div class="group-label">Old program</div>${tallyHtml(a.o, OLD)}</div>
        <div class="stat-group"><div class="group-label">Me</div>${tallyHtml(a.me, LEVELS)}</div>
        <div class="stat-group"><div class="group-label">Most teachers</div>${tallyHtml(a.most, LEVELS)}</div>`;
      const badges = [];
      if (a.n === 0) badges.push('<span class="badge waiting">No ratings yet</span>');
      if (a.split) badges.push('<span class="badge split">Split on readiness</span>');
      if (a.oldSplit) badges.push('<span class="badge split">Split on old program</span>');
      card.querySelector('[data-badges]').innerHTML = badges.join('');
      const notesEl = card.querySelector('[data-notes]');
      notesEl.hidden = a.notes.length === 0;
      notesEl.innerHTML = a.notes.map(n => `<li>${esc(n)}</li>`).join('');
    });
  };

  const paintVerdicts = () => {
    const v = tableDoc.v || {};
    cardsEl.querySelectorAll('.card').forEach(card => {
      const x = v[card.dataset.key] || {};
      card.querySelectorAll('.opt').forEach(b => b.setAttribute('aria-pressed', x.verdict === b.dataset.v ? 'true' : 'false'));
      const inp = card.querySelector('.vnote');
      if (canPaint(inp, 'vnote-' + card.dataset.key)) inp.value = x.note || '';
    });
    const ta = app.querySelector('textarea[data-field="disagreed"]');
    if (canPaint(ta, 'disagreed')) ta.value = tableDoc.disagreed || '';
  };

  renderCards();

  unsubs.push(store.watchRatings(null, list => { ratings = list.filter(r => ratedTable(r, T)); paintStats(); }));
  unsubs.push(store.watchTable(T, d => { tableDoc = d || {}; paintVerdicts(); }));

  app.querySelector('#sort-talk').onclick = () => {
    const score = Object.fromEntries(codes.map(c => [c, aggregate(ratings, c).talkScore]));
    order = [...codes].sort((a, b) => score[b] - score[a] || codes.indexOf(a) - codes.indexOf(b));
    renderCards();
  };
  app.querySelector('#sort-curr').onclick = () => { order = [...codes]; renderCards(); };
  app.querySelector('#go-briefs').onclick = () => app.querySelector('#briefs').scrollIntoView({ behavior: 'smooth' });

  const onClick = (e) => {
    const b = e.target.closest('.verdict .opt');
    if (!b) return;
    const k = b.closest('.card').dataset.key;
    const cur = (tableDoc.v || {})[k] || {};
    const verdict = cur.verdict === b.dataset.v ? null : b.dataset.v;
    tableDoc.v = tableDoc.v || {};
    // Take the note from the box itself. A pending, unsaved note must not be lost.
    const note = b.closest('.card').querySelector('.vnote').value;
    tableDoc.v[k] = { ...cur, verdict, note };
    paintVerdicts();
    track(store.saveVerdict(T, k, { verdict, note }), saveState);
  };
  const onInput = (e) => {
    const t = e.target;
    if (t.classList.contains('vnote')) {
      const k = t.closest('.card').dataset.key;
      const cur = (tableDoc.v || {})[k] || {};
      tableDoc.v = tableDoc.v || {};
      tableDoc.v[k] = { verdict: cur.verdict || null, note: t.value };
      saveState.textContent = 'Saving…';
      // Read the verdict and the note when the save fires, not when typing started.
      // Live updates can replace tableDoc in between.
      debounce('vnote-' + k, () => {
        const now = (tableDoc.v || {})[k] || {};
        return track(store.saveVerdict(T, k, { verdict: now.verdict || null, note: t.value }), saveState);
      });
    } else if (t.dataset.field === 'disagreed') {
      tableDoc.disagreed = t.value;
      saveState.textContent = 'Saving…';
      debounce('disagreed', () => track(store.saveTableField(T, 'disagreed', t.value), saveState));
    } else if (t.closest('.brief') && t.tagName !== 'SELECT') {
      const id = t.closest('.brief').dataset.id;
      const f = t.dataset.f;
      saveState.textContent = 'Saving…';
      debounce('brief-' + id + f, () => track(store.saveBrief(id, { [f]: t.value }), saveState));
    }
  };
  const onChange = (e) => {
    const t = e.target;
    if (t.tagName === 'SELECT' && t.closest('.brief')) {
      track(store.saveBrief(t.closest('.brief').dataset.id, { code: t.value }), saveState);
    }
  };
  app.addEventListener('click', onClick);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);
  unsubs.push(() => { app.removeEventListener('click', onClick); app.removeEventListener('input', onInput); app.removeEventListener('change', onChange); });

  // Briefs
  const listEl = app.querySelector('#brief-list');
  const FIELDS = [
    ['content', 'The content in one sentence', '', 'input'],
    ['know', 'What a teacher needs to know', 'People, events, dates, terms', 'textarea'],
    ['watch', 'Watch for', 'Common errors. Sensitive topics.', 'textarea'],
    ['sources', 'Sources', 'What you trust. What we already have.', 'textarea']
  ];
  const briefCard = (b, i) => {
    const el = document.createElement('section');
    el.className = 'brief';
    el.dataset.id = b.id;
    el.innerHTML = `<h3>Brief ${i + 1}</h3>
      <div><label for="bc-${b.id}">Topic</label>
        <select id="bc-${b.id}" data-f="code">
          <option value="">Choose a topic</option>
          ${codes.map(c => `<option value="${esc(c)}">${esc(c)} · ${esc(TP[c].name)}</option>`).join('')}
          <option value="several">Several topics (name them below)</option>
        </select></div>
      ${FIELDS.map(([f, label, hint, kind]) => `<div><label for="b${f}-${b.id}">${esc(label)} ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>
        ${kind === 'input' ? `<input id="b${f}-${b.id}" type="text" data-f="${f}" maxlength="500">` : `<textarea id="b${f}-${b.id}" data-f="${f}" maxlength="3000"></textarea>`}</div>`).join('')}`;
    return el;
  };
  unsubs.push(store.watchBriefs(T, list => {
    list.forEach((b, i) => {
      let el = listEl.querySelector(`.brief[data-id="${b.id}"]`);
      if (!el) { el = briefCard(b, i); listEl.appendChild(el); }
      el.querySelector('h3').textContent = `Brief ${i + 1}`;
      el.querySelectorAll('[data-f]').forEach(inp => {
        if (canPaint(inp, 'brief-' + b.id + inp.dataset.f)) inp.value = b[inp.dataset.f] || '';
      });
    });
  }));
  app.querySelector('#add-brief').onclick = async () => {
    const id = await store.addBrief(T);
    setTimeout(() => {
      const el = listEl.querySelector(`.brief[data-id="${id}"] select`);
      if (el) el.focus();
    }, 300);
  };
}

// ---------- Room ----------
function viewRoom() {
  let ratings = [], tables = {}, briefs = [];
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Facilitator</span>
      <h1>Whole course</h1></div></div>
    <div class="tiles" id="tiles"></div>
    <div class="export">
      <h2 style="margin-top:0">Download the data</h2>
      <p class="muted">CSV files open in Excel. Ratings has one row per person per topic. Each row lists the curriculum statements in that topic. No names are collected.</p>
      <div class="row">
        <button type="button" class="btn primary" data-dl="ratings">Ratings (CSV)</button>
        <button type="button" class="btn" data-dl="summary">Topic summary (CSV)</button>
        <button type="button" class="btn" data-dl="verdicts">Table verdicts (CSV)</button>
        <button type="button" class="btn" data-dl="briefs">Briefs (CSV)</button>
        <button type="button" class="btn" data-dl="json">Everything (JSON)</button>
      </div>
    </div>
    <div class="row" style="margin:8px 0 0"><a class="btn" href="#/rank/room">Resource Developer Priorities: the room's results</a></div>
    <h2>Topics</h2>
    <div class="toolbar">
      <label>Units <select class="select" id="unit">
        <option value="234">Units 2 to 4</option>
        <option value="2">Unit 2</option>
        <option value="3">Unit 3</option>
        <option value="4">Unit 4</option>
        <option value="1">Unit 1 (optional)</option>
        <option value="all">All units</option>
      </select></label>
      <label>Show <select class="select" id="filter">
        <option value="all">All topics</option>
        <option value="new">Table said truly or partly new</option>
        <option value="learn">Half or more said most teachers must learn it</option>
      </select></label>
      <label>Sort <select class="select" id="sort">
        <option value="learn">Most teachers must learn it</option>
        <option value="unit">Unit order</option>
        <option value="curr">Topic order</option>
      </select></label>
    </div>
    <div class="tablewrap"><table class="sum">
      <thead><tr><th>Topic</th><th>Name</th><th>Unit</th><th>Rated</th><th>Most teachers: Learn</th><th>Me: Learn</th><th>Old program</th><th>Verdict</th><th>Table note</th></tr></thead>
      <tbody id="sum-body"></tbody></table></div>
    <h2>Briefs</h2>
    <div id="room-briefs"></div>
    <h2>Skills not rated as topics</h2>
    <p class="muted">These statements are skills that run across many topics. They have no content of their own, so no one rates them.</p>
    <ul class="cross">${DATA.crosscutting.map(x => `<li>${codeHtml(x.code)}<div><div class="stmt">${esc(ST[x.code].text)}</div><div class="muted">${esc(x.why)}</div></div></li>`).join('')}</ul>`;

  const pct = x => `${Math.round(x * 100)}%`;
  const paint = () => {
    // Tiles
    app.querySelector('#tiles').innerHTML = [...MAIN_TABLES, ...OPT_TABLES].map(t => {
      const cs = idsFor(t);
      const rs = ratings.filter(r => ratedTable(r, t));
      const done = rs.reduce((s, r) => s + cs.filter(c => { const x = r.r && r.r[c]; return x && x.me && x.most; }).length, 0);
      const possible = rs.length * cs.length;
      const v = (tables[t] && tables[t].v) || {};
      const verdicts = cs.filter(c => v[c] && v[c].verdict).length;
      const nb = briefs.filter(b => b.table === t).length;
      return `<div class="tile"><div class="row"><span class="letter" aria-hidden="true">${t}</span><b>Table ${t}${DATA.tables[t].optional ? ' · optional' : ''}</b></div>
        <div class="num">${rs.length}</div><div class="lbl">people rating · ${possible ? pct(done / possible) : '0%'} complete</div>
        <div class="lbl">${verdicts} of ${cs.length} verdicts · ${nb} ${nb === 1 ? 'brief' : 'briefs'}</div></div>`;
    }).join('');
    // Summary
    const filter = app.querySelector('#filter').value;
    const sort = app.querySelector('#sort').value;
    const unit = app.querySelector('#unit').value;
    let rows = topicOrder.map(code => {
      const t = TP[code].table;
      const a = aggregate(ratings, code);
      const v = ((tables[t] && tables[t].v) || {})[code] || {};
      return { code, t, a, v };
    });
    if (unit === '234') rows = rows.filter(r => (TP[r.code].units || []).some(u => u >= 2));
    else if (unit !== 'all') rows = rows.filter(r => (TP[r.code].units || []).includes(Number(unit)));
    if (filter === 'new') rows = rows.filter(r => r.v.verdict === 'new' || r.v.verdict === 'partly');
    if (filter === 'learn') rows = rows.filter(r => r.a.mostN && r.a.learnShare >= 0.5);
    if (sort === 'learn') rows.sort((x, y) => y.a.learnShare - x.a.learnShare || y.a.mostN - x.a.mostN);
    if (sort === 'unit') rows.sort((x, y) => (TP[x.code].units[0] || 9) - (TP[y.code].units[0] || 9) || topicOrder.indexOf(x.code) - topicOrder.indexOf(y.code));
    app.querySelector('#sum-body').innerHTML = rows.map(({ code, t, a, v }) => {
      const old = OLD.filter(([k]) => a.o[k]).map(([k, l]) => `${l} ${a.o[k]}`).join(', ') || '<span class="muted">None ticked</span>';
      return `<tr>
        <td><b>${esc(code)}</b></td>
        <td class="stmt-cell"><b>${esc(TP[code].name)}</b><div class="muted">${esc([...TP[code].codes].join(', ') || 'Also in ' + TP[code].also.join(', '))}</div></td>
        <td>${esc(unitLabel(TP[code]))}<div class="muted">Table ${t}</div></td>
        <td class="num">${a.n}</td>
        <td class="num">${a.mostN ? `${a.most.L} of ${a.mostN} · ${pct(a.learnShare)}` : '–'}</td>
        <td class="num">${a.meN ? `${a.me.L} of ${a.meN}` : '–'}</td>
        <td>${old}</td>
        <td>${v.verdict ? `<span class="v-${v.verdict}">${esc(VERDICT_LABEL[v.verdict])}</span>` : '<span class="muted">Not yet</span>'}</td>
        <td>${esc(v.note || '')}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="muted">Nothing to show yet.</td></tr>';
    // Briefs
    app.querySelector('#room-briefs').innerHTML = TABLES.map(t => {
      const bs = briefs.filter(b => b.table === t);
      const dis = tables[t] && tables[t].disagreed;
      if (!bs.length && !dis) return '';
      return `<h3>Table ${t}</h3>
        ${dis ? `<p><b>Where we disagreed.</b> ${esc(dis)}</p>` : ''}
        ${bs.map(b => `<div class="brief">
          <div><b>${esc(TP[b.code] ? `${b.code} · ${TP[b.code].name}` : (b.code === 'several' ? 'Several topics' : (b.code || 'No topic chosen')))}</b>${b.content ? ` · ${esc(b.content)}` : ''}</div>
          ${b.know ? `<div><b>What a teacher needs to know.</b> ${esc(b.know)}</div>` : ''}
          ${b.watch ? `<div><b>Watch for.</b> ${esc(b.watch)}</div>` : ''}
          ${b.sources ? `<div><b>Sources.</b> ${esc(b.sources)}</div>` : ''}
        </div>`).join('')}`;
    }).join('') || '<p class="muted">No briefs yet.</p>';
  };
  app.querySelector('#filter').onchange = paint;
  app.querySelector('#sort').onchange = paint;
  app.querySelector('#unit').onchange = paint;
  unsubs.push(store.watchRatings(null, l => { ratings = l; paint(); }));
  unsubs.push(store.watchTables(d => { tables = d || {}; paint(); }));
  unsubs.push(store.watchBriefs(null, l => { briefs = l; paint(); }));

  app.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(b.dataset.dl, ratings, tables, briefs));
}

// ---------- Export ----------
function csv(rows) {
  const cell = v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
function save(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function participantIds(ratings) {
  const ids = {};
  [...ratings].sort((a, b) => a.id.localeCompare(b.id)).forEach((r, i) => {
    ids[r.id] = `P${String(i + 1).padStart(2, '0')}`;
  });
  return ids;
}
function download(kind, ratings, tables, briefs) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${SESSION_ID}`;
  // Topic columns shared by every export. ref is the document analysis, kept for comparison with what teachers said.
  const meta = id => {
    const t = TP[id];
    return [id, t.name, unitLabel(t), t.table, DATA.tables[t.table].name, t.codes.join('; '), t.also.join('; '), t.ref || ''];
  };
  const metaHead = ['topic_id', 'topic', 'unit', 'table', 'table_name', 'statements', 'also_touches', 'document_analysis'];
  if (kind === 'ratings') {
    const pid = participantIds(ratings);
    const rows = [['session', 'participant', 'participant_table', ...metaHead, 'old_gr7', 'old_gr8', 'old_gr9', 'old_not_taught', 'me', 'most_teachers', 'note', 'updated_at']];
    ratings.forEach(r => {
      Object.entries(r.r || {}).forEach(([k, x]) => {
        if (!TP[k]) return; // Ignore anything that is not a topic, such as old statement-level practice data.
        const o = x.o || [];
        rows.push([SESSION_ID, pid[r.id] || r.id, r.table, ...meta(k),
          o.includes('7') ? 1 : 0, o.includes('8') ? 1 : 0, o.includes('9') ? 1 : 0, o.includes('none') ? 1 : 0,
          LEVEL_LABEL[x.me] || '', LEVEL_LABEL[x.most] || '', x.note || '', tsString(r.updatedAt)]);
      });
    });
    save(`${base}-ratings-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else if (kind === 'summary') {
    const rows = [[...metaHead, 'description', 'raters', 'old_gr7', 'old_gr8', 'old_gr9', 'old_not_taught', 'me_ready', 'me_read_up', 'me_learn', 'most_ready', 'most_read_up', 'most_learn', 'most_learn_share', 'verdict', 'verdict_note', 'rater_notes']];
    topicOrder.forEach(id => {
      const t = TP[id].table;
      const a = aggregate(ratings, id);
      const v = ((tables[t] && tables[t].v) || {})[id] || {};
      rows.push([...meta(id), TP[id].desc, a.n, a.o['7'], a.o['8'], a.o['9'], a.o.none,
        a.me.R, a.me.U, a.me.L, a.most.R, a.most.U, a.most.L, a.mostN ? a.learnShare.toFixed(2) : '',
        VERDICT_LABEL[v.verdict] || '', v.note || '', a.notes.join(' | ')]);
    });
    DATA.crosscutting.forEach(x => rows.push(['', 'Skill, not rated', (x.units || []).map(u => 'Unit ' + u).join(', '), '', '', x.code, '', '', x.why]));
    save(`${base}-summary-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else if (kind === 'verdicts') {
    const rows = [['table', 'topic_id', 'topic', 'unit', 'verdict', 'note']];
    TABLES.forEach(t => {
      const v = (tables[t] && tables[t].v) || {};
      idsFor(t).forEach(id => { const x = v[id] || {}; rows.push([t, id, TP[id].name, unitLabel(TP[id]), VERDICT_LABEL[x.verdict] || '', x.note || '']); });
      if (tables[t] && tables[t].disagreed) rows.push([t, '', 'Where we disagreed', '', '', tables[t].disagreed]);
    });
    save(`${base}-verdicts-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else if (kind === 'briefs') {
    const rows = [['table', 'topic_id', 'topic', 'content', 'need_to_know', 'watch_for', 'sources', 'created_at', 'updated_at']];
    briefs.forEach(b => rows.push([b.table, b.code, TP[b.code] ? TP[b.code].name : (b.code === 'several' ? 'Several topics' : ''), b.content, b.know, b.watch, b.sources, tsString(b.createdAt), tsString(b.updatedAt)]));
    save(`${base}-briefs-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else {
    const norm = o => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v));
    const pid = participantIds(ratings);
    const out = { session: SESSION_ID, exportedAt: new Date().toISOString(), topics: TOPICS, crosscutting: DATA.crosscutting, ratings: norm(ratings.map(r => ({ ...r, id: pid[r.id] || r.id }))), tables: norm(tables), briefs: norm(briefs) };
    save(`${base}-all-${stamp}.json`, JSON.stringify(out, null, 2), 'application/json');
  }
}

// ---------- Resource priorities: my ranking ----------
function viewRank() {
  let order = [];
  let mineLoaded = false;
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Resource Developer Priorities</span>
      <h1>Set your priorities</h1></div>
      <div class="row"><a class="btn" href="#/rank/room">See the room's results</a></div>
    </div>
    <p class="lede">If we hire a Social Studies resource developer, where should their time go? Answer the three parts below. Everything saves as you go. No names are collected.</p>
    <section class="grade-card" aria-labelledby="grades-h">
      <div class="rank-head"><h2 id="grades-h">1 · Which grades?</h2><span class="muted" id="grade-state" aria-live="polite"></span></div>
      <p class="muted">Drag each slider to the share of the developer's time that grade should get. The three cannot add up to more than 100%. When a slider stops, lower another one to free up time.</p>
      ${GRADES.map(g => `<div class="grade-row">
        <label for="slider-${g.id}">${g.name}</label>
        <input type="range" id="slider-${g.id}" data-g="${g.id}" min="0" max="100" step="${GRADE_STEP}" value="0" aria-describedby="grade-left">
        <output class="grade-pct" for="slider-${g.id}" id="pct-${g.id}">0%</output>
      </div>`).join('')}
      <p class="grade-left" id="grade-left"></p>
    </section>
    <section class="grade-card when-card" aria-labelledby="when-h">
      <div class="rank-head"><h2 id="when-h">2 · When should they start?</h2><span class="muted" id="when-state" aria-live="polite"></span></div>
      <p class="muted">Pick one.</p>
      <div class="when-opts" role="radiogroup" aria-labelledby="when-h">
        ${WHEN.map(w => `<label class="when-opt"><input type="radio" name="when" value="${w.id}"><span><b>${w.name}</b><span class="muted">${w.desc}</span></span></label>`).join('')}
      </div>
    </section>
    <h2 class="rank-step">3 · Which resources?</h2>
    <details class="howto"><summary>How to rank</summary>
      <p><b>Add</b> a resource from the list. It goes into the next open place in your top ${TOP_N}.</p>
      <p><b>Move</b> it with the up and down arrows, or drag it to a new place.</p>
      <p><b>Remove</b> it with the ✕ button, or drag it back to the list.</p>
    </details>
    <div class="rank-layout">
      <section class="rank-mine" aria-labelledby="mine-h">
        <div class="rank-head"><h2 id="mine-h">Your top ${TOP_N}</h2><span class="muted" id="save-state" aria-live="polite"></span></div>
        <ol class="rank-slots" id="slots"></ol>
        <div id="rank-done" class="done-banner" hidden>Your top ${TOP_N} is saved. You can still change the order.</div>
        <label class="rank-other-label" for="rank-other">Something missing? <span class="muted">Name it here.</span></label>
        <textarea id="rank-other" class="rank-other" maxlength="500" placeholder="A kind of resource that is not on the list"></textarea>
      </section>
      <section class="rank-pool" id="pool" aria-labelledby="pool-h">
        <h2 id="pool-h">Resources</h2>
        <h3 class="pool-kind">Teacher-facing</h3><div class="pool-list" data-kind="Teacher"></div>
        <h3 class="pool-kind">Student-facing</h3><div class="pool-list" data-kind="Student"></div>
      </section>
    </div>`;
  const slotsEl = app.querySelector('#slots');
  const poolEl = app.querySelector('#pool');
  const saveState = app.querySelector('#save-state');
  const otherEl = app.querySelector('#rank-other');
  const kindChip = x => `<span class="kind ${x.kind === 'Teacher' ? 'teacher' : 'student'}">${x.kind === 'Teacher' ? 'Teacher' : 'Student'}</span>`;

  const save = () => track(store.saveRank({ order: [...order] }), saveState);
  const place = (rid, idx) => {
    if (!RS[rid]) return;
    const o = order.filter(x => x !== rid);
    o.splice(Math.max(0, Math.min(idx, o.length)), 0, rid);
    order = o.slice(0, TOP_N);
    paint(); save();
  };
  const removeAt = rid => { order = order.filter(x => x !== rid); paint(); save(); };

  const paint = () => {
    slotsEl.innerHTML = Array.from({ length: TOP_N }, (_, i) => {
      const x = RS[order[i]];
      if (!x) return `<li class="slot empty" data-slot="${i}"><span class="slot-n">${i + 1}</span><span class="muted">Empty. Add a resource from the list.</span></li>`;
      return `<li class="slot" data-slot="${i}"><div class="slot-item" draggable="true" data-rid="${x.id}">
        <span class="slot-n">${i + 1}</span>
        <div class="slot-text"><b>${esc(x.name)}</b> ${kindChip(x)}</div>
        <div class="slot-btns">
          <button type="button" class="icon-btn" data-act="up" data-rid="${x.id}" aria-label="Move ${esc(x.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-act="down" data-rid="${x.id}" aria-label="Move ${esc(x.name)} down" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn" data-act="remove" data-rid="${x.id}" aria-label="Remove ${esc(x.name)}">✕</button>
        </div></div></li>`;
    }).join('');
    const full = order.length >= TOP_N;
    poolEl.querySelectorAll('.pool-list').forEach(list => {
      list.innerHTML = RESOURCES.filter(x => x.kind === list.dataset.kind).map(x => {
        const pos = order.indexOf(x.id);
        const label = pos >= 0 ? `In your top ${TOP_N} · ${pos + 1}` : (full ? `Top ${TOP_N} full` : 'Add');
        return `<div class="pool-item${pos >= 0 ? ' chosen' : ''}" draggable="${pos >= 0 ? 'false' : 'true'}" data-rid="${x.id}">
          <div><b>${esc(x.name)}</b><div class="muted pool-desc">${esc(x.desc)}</div></div>
          <button type="button" class="btn${pos < 0 && !full ? ' primary' : ''}" data-act="add" data-rid="${x.id}" ${pos >= 0 || full ? 'disabled' : ''}>${label}</button>
        </div>`;
      }).join('');
    });
    app.querySelector('#rank-done').hidden = order.length < TOP_N;
  };

  const on = (type, fn) => { app.addEventListener(type, fn); unsubs.push(() => app.removeEventListener(type, fn)); };
  on('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b || !app.contains(b)) return;
    const rid = b.dataset.rid, i = order.indexOf(rid);
    if (b.dataset.act === 'add' && i < 0 && order.length < TOP_N) place(rid, order.length);
    else if (b.dataset.act === 'up' && i > 0) place(rid, i - 1);
    else if (b.dataset.act === 'down' && i >= 0 && i < order.length - 1) place(rid, i + 1);
    else if (b.dataset.act === 'remove' && i >= 0) removeAt(rid);
  });
  // Drag and drop on top of the buttons, for people using a mouse.
  on('dragstart', e => {
    const el = e.target.closest('[data-rid][draggable="true"]');
    if (!el) return;
    e.dataTransfer.setData('text/plain', el.dataset.rid);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  on('dragend', e => {
    app.querySelectorAll('.dragging, .over').forEach(x => x.classList.remove('dragging', 'over'));
  });
  on('dragover', e => {
    const slot = e.target.closest('[data-slot]'); const pool = e.target.closest('#pool');
    if (!slot && !pool) return;
    e.preventDefault();
    app.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
    (slot || pool).classList.add('over');
  });
  on('drop', e => {
    const slot = e.target.closest('[data-slot]'); const pool = e.target.closest('#pool');
    if (!slot && !pool) return;
    e.preventDefault();
    const rid = e.dataTransfer.getData('text/plain');
    app.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
    if (slot) place(rid, Number(slot.dataset.slot));
    else if (order.includes(rid)) removeAt(rid);
  });
  otherEl.addEventListener('input', () => debounce('rank-other', () => track(store.saveRank({ other: otherEl.value }), saveState)));

  // Grade sliders. A slider cannot go past what the other two leave free.
  let grades = gradeVals(null);
  const gradeState = app.querySelector('#grade-state');
  const sliders = [...app.querySelectorAll('.grade-row input[type="range"]')];
  const paintGrades = () => {
    const total = gradeSum(grades);
    sliders.forEach(el => {
      const g = el.dataset.g, cap = 100 - (total - grades[g]);
      el.value = grades[g];
      el.style.setProperty('--val', grades[g] + '%');
      el.style.setProperty('--cap', cap + '%');
      el.setAttribute('aria-valuetext', `${grades[g]}%. Up to ${cap}% available.`);
      app.querySelector('#pct-' + g).textContent = grades[g] + '%';
    });
    const left = 100 - total;
    app.querySelector('#grade-left').innerHTML = left > 0
      ? `Total <b>${total}%</b> · <b>${left}%</b> not yet given to a grade.`
      : `Total <b>100%</b> · All of the time is given out. Lower one grade to raise another.`;
  };
  sliders.forEach(el => el.addEventListener('input', () => {
    const g = el.dataset.g;
    const others = gradeSum(grades) - grades[g];
    grades = { ...grades, [g]: Math.min(Number(el.value) || 0, 100 - others) };
    paintGrades();
    gradeState.textContent = 'Saving…';
    debounce('rank-grades', () => track(store.saveRank({ grades: { ...grades } }), gradeState), 400);
  }));
  paintGrades();

  // When to start. One choice, saved straight away.
  const whenState = app.querySelector('#when-state');
  const whenEls = [...app.querySelectorAll('input[name="when"]')];
  let whenSaving = false;
  const paintWhen = w => whenEls.forEach(el => { el.checked = el.value === w; el.closest('.when-opt').classList.toggle('on', el.value === w); });
  whenEls.forEach(el => el.addEventListener('change', () => {
    if (!el.checked || !WS[el.value]) return;
    paintWhen(el.value);
    whenSaving = true;
    track(store.saveRank({ when: el.value }), whenState).finally(() => { whenSaving = false; });
  }));

  paint();
  unsubs.push(store.watchMyRank(d => {
    if (!mineLoaded || !pending.size) {
      order = ((d && d.order) || []).filter(id => RS[id]).slice(0, TOP_N);
      paint();
    }
    if (canPaint(otherEl, 'rank-other')) otherEl.value = (d && d.other) || '';
    if (!pending.has('rank-grades') && !sliders.includes(document.activeElement)) { grades = gradeVals(d && d.grades); paintGrades(); }
    if (!whenSaving) paintWhen(d && WS[d.when] ? d.when : null);
    mineLoaded = true;
  }));
}

// ---------- Resource priorities: the room's ranking ----------
function rankScores(list) {
  const people = list.filter(d => Array.isArray(d.order) && d.order.length);
  const rows = RESOURCES.map(x => ({ ...x, points: 0, top: 0, first: 0 }));
  const by = Object.fromEntries(rows.map(x => [x.id, x]));
  people.forEach(d => d.order.slice(0, TOP_N).forEach((id, i) => {
    if (!by[id]) return;
    by[id].points += TOP_N - i;
    by[id].top++;
    if (i === 0) by[id].first++;
  }));
  rows.sort((a, b) => b.points - a.points || b.first - a.first || a.id.localeCompare(b.id));
  return { people, rows };
}
function viewRankRoom() {
  let list = [];
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Resource Developer Priorities</span>
      <h1>The room's results</h1></div>
      <div class="row"><button type="button" class="btn" id="dl-ranks">Results (CSV)</button></div>
    </div>
    <h2>Which grades?</h2>
    <p class="lede" id="grade-count"></p>
    <div class="grade-room" id="grade-room"></div>
    <h2>When should they start?</h2>
    <p class="lede" id="when-count"></p>
    <div class="grade-room" id="when-room"></div>
    <h2>Which resources?</h2>
    <p class="lede" id="rank-count"></p>
    <p class="muted">A first place earns ${TOP_N} points, a second place ${TOP_N - 1}, down to 1 point for place ${TOP_N}. It updates as people rank.</p>
    <div class="kind-totals" id="kind-totals"></div>
    <div class="tablewrap"><table class="sum rank-table">
      <thead><tr><th>#</th><th>Resource</th><th>Kind</th><th>Points</th><th>In a top ${TOP_N}</th><th>Ranked first</th></tr></thead>
      <tbody id="rank-body"></tbody></table></div>
    <h2>Something missing?</h2>
    <ul class="rank-suggest" id="rank-suggest"></ul>`;
  const gradeStats = () => {
    const ppl = list.map(d => gradeVals(d.grades)).filter(v => gradeSum(v) > 0);
    const avg = Object.fromEntries(GRADES.map(g => [g.id, ppl.length ? Math.round(ppl.reduce((t, v) => t + v[g.id], 0) / ppl.length) : 0]));
    const most = Object.fromEntries(GRADES.map(g => [g.id, ppl.filter(v => v[g.id] > 0 && v[g.id] === Math.max(...GRADES.map(x => v[x.id]))).length]));
    return { ppl, avg, most };
  };
  const whenStats = () => {
    const picks = list.map(d => d.when).filter(w => WS[w]);
    return { n: picks.length, counts: Object.fromEntries(WHEN.map(w => [w.id, picks.filter(x => x === w.id).length])) };
  };
  const paint = () => {
    const ws = whenStats();
    app.querySelector('#when-count').innerHTML = `<b>${ws.n}</b> ${ws.n === 1 ? 'person has' : 'people have'} picked.`;
    app.querySelector('#when-room').innerHTML = WHEN.map(w => `<div class="grade-room-row">
      <span class="grade-room-name">${w.name}<span class="muted when-sub">${w.desc}</span></span>
      <div class="pbar grade-bar"><span style="width:${ws.n ? Math.round(ws.counts[w.id] / ws.n * 100) : 0}%"></span></div>
      <span class="grade-room-pct">${ws.counts[w.id]}</span>
      <span class="muted grade-room-most">${ws.n ? Math.round(ws.counts[w.id] / ws.n * 100) : 0}% of picks</span></div>`).join('');
    const gs = gradeStats();
    app.querySelector('#grade-count').innerHTML = `<b>${gs.ppl.length}</b> ${gs.ppl.length === 1 ? 'person has' : 'people have'} split the time. Each bar is the average share.`;
    app.querySelector('#grade-room').innerHTML = GRADES.map(g => `<div class="grade-room-row">
      <span class="grade-room-name">${g.name}</span>
      <div class="pbar grade-bar"><span style="width:${gs.avg[g.id]}%"></span></div>
      <span class="grade-room-pct">${gs.avg[g.id]}%</span>
      <span class="muted grade-room-most">Most time for ${gs.most[g.id]} of ${gs.ppl.length}</span></div>`).join('');
    const { people, rows } = rankScores(list);
    const max = Math.max(1, ...rows.map(r => r.points));
    app.querySelector('#rank-count').innerHTML = `<b>${people.length}</b> ${people.length === 1 ? 'person has' : 'people have'} ranked.`;
    const kt = k => rows.filter(r => r.kind === k).reduce((s, r) => s + r.points, 0);
    app.querySelector('#kind-totals').innerHTML = `<span class="kind teacher">Teacher-facing · ${kt('Teacher')} points</span><span class="kind student">Student-facing · ${kt('Student')} points</span>`;
    app.querySelector('#rank-body').innerHTML = rows.map((r, i) => `<tr>
      <td class="num">${r.points ? i + 1 : '–'}</td>
      <td><b>${esc(r.name)}</b><div class="muted">${esc(r.desc)}</div></td>
      <td>${r.kind === 'Teacher' ? 'Teacher' : 'Student'}</td>
      <td class="num"><div class="pbar"><span style="width:${Math.round(r.points / max * 100)}%"></span></div>${r.points}</td>
      <td class="num">${r.top} of ${people.length}</td>
      <td class="num">${r.first}</td></tr>`).join('');
    const sugg = list.map(d => (d.other || '').trim()).filter(Boolean);
    app.querySelector('#rank-suggest').innerHTML = sugg.length ? sugg.map(s => `<li>${esc(s)}</li>`).join('') : '<li class="muted">No suggestions yet.</li>';
  };
  app.querySelector('#dl-ranks').onclick = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { people, rows } = rankScores(list);
    const out = [['resource_id', 'resource', 'kind', 'points', 'in_top_six', 'ranked_first']];
    rows.forEach(r => out.push([r.id, r.name, r.kind, r.points, r.top, r.first]));
    out.push([]);
    out.push([]);
    const gs = gradeStats();
    out.push(['grade', 'average_share_percent', 'most_time_count', 'people']);
    GRADES.forEach(g => out.push([g.name, gs.avg[g.id], gs.most[g.id], gs.ppl.length]));
    out.push([]);
    const wst = whenStats();
    out.push(['start', 'picks', 'people']);
    WHEN.forEach(w => out.push([`${w.name} (${w.desc})`, wst.counts[w.id], wst.n]));
    out.push([]);
    const everyone = list.filter(d => (Array.isArray(d.order) && d.order.length) || gradeSum(gradeVals(d.grades)) > 0 || WS[d.when] || (d.other || '').trim());
    out.push(['person', ...GRADES.map(g => g.id + '_percent'), 'start', ...Array.from({ length: TOP_N }, (_, i) => `place_${i + 1}`), 'something_missing', 'updated_at']);
    everyone.forEach((d, i) => { const v = gradeVals(d.grades); const o = d.order || []; out.push([`P${String(i + 1).padStart(2, '0')}`, ...GRADES.map(g => v[g.id]), WS[d.when] ? WS[d.when].name : '', ...Array.from({ length: TOP_N }, (_, j) => RS[o[j]] ? RS[o[j]].name : ''), d.other || '', tsString(d.updatedAt)]); });
    save(`${SESSION_ID}-resource-priorities-${stamp}.csv`, csv(out), 'text/csv;charset=utf-8');
  };
  paint();
  unsubs.push(store.watchRanks(l => { list = l; paint(); }));
}

// ---------- Router ----------
function route() {
  cleanup();
  const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
  const [view, arg] = parts;
  const T = (arg || '').toUpperCase();
  if ((view === 'rate' || view === 'table') && !TABLES.includes(T)) { location.hash = '#/'; return; }
  window.scrollTo(0, 0);
  if (view === 'rate') viewRate(T);
  else if (view === 'table') viewTable(T);
  else if (view === 'room') viewRoom();
  else if (view === 'rank') viewRankRoom(); // priorities closed Oct 8: results only
  else viewStart();
  app.focus({ preventScroll: true });
}

(async () => {
  try {
    store = await createStore();
    await store.init();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="emph"><b>Could not connect.</b> Check the Wi-Fi and reload the page. If it still fails, let Jonathon know. (${esc(err.message || err)})</div>`;
    setStatus('Not connected', 'warn');
    return;
  }
  const banner = document.getElementById('demo-banner');
  if (store.mode === 'demo') banner.hidden = false;
  else if (SESSION_ID !== DEFAULT_SESSION) {
    banner.textContent = `Practice session “${SESSION_ID}”. These answers are kept apart from the real data.`;
    banner.hidden = false;
  }
  connectionStatus();
  window.addEventListener('hashchange', route);
  route();
})();
