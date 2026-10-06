import { DATA } from './data.js';
import { createStore } from './store.js';
import { SESSION_ID, DEFAULT_SESSION } from './config.js';

// ---------- Reference data ----------
const TABLES = Object.keys(DATA.tables);
const CL = Object.fromEntries(DATA.clusters.map(c => [c.n, c]));
const ST = DATA.statements;
const keyOf = code => code.replace(/[^A-Za-z0-9]/g, '');
const codeOfKey = {};
const clusterOf = {};
const tableOf = {};
Object.keys(ST).forEach(c => { codeOfKey[keyOf(c)] = c; });
DATA.clusters.forEach(c => c.codes.forEach(code => { clusterOf[code] = c.n; }));
TABLES.forEach(t => DATA.tables[t].forEach(n => CL[n].codes.forEach(code => { tableOf[code] = t; })));
const codesFor = t => DATA.tables[t].flatMap(n => CL[n].codes);
const curriculumOrder = Object.keys(ST);

const OLD = [['7', 'Gr 7'], ['8', 'Gr 8'], ['9', 'Gr 9'], ['none', 'Not taught']];
const LEVELS = [['R', 'Ready'], ['U', 'Read up'], ['L', 'Learn']];
const LEVEL_LABEL = Object.fromEntries(LEVELS);
const VERDICTS = [['familiar', 'Familiar'], ['partly', 'Partly new'], ['new', 'Truly new']];
const VERDICT_LABEL = Object.fromEntries(VERDICTS);

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
function aggregate(ratings, code) {
  const k = keyOf(code);
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

// ---------- Start ----------
function viewStart() {
  const last = lsGet('wtn-table');
  app.innerHTML = `
    <h1>Find what is truly new in Grade 7</h1>
    <div class="emph">Evaluate your comfort level with the content of the new curriculum. We will aggregate responses to determine where the critical gaps in teacher knowledge lie.</div>
    <h2>Choose your table</h2>
    <div class="table-grid">
      ${TABLES.map(t => `
        <section class="table-card" aria-labelledby="tc-${t}">
          <div class="head"><span class="letter" aria-hidden="true">${t}</span>
            <div><h3 id="tc-${t}">Table ${t}${last === t ? ' <span class="muted">(you)</span>' : ''}</h3><div class="count">${codesFor(t).length} statements</div></div></div>
          <ul>${DATA.tables[t].map(n => `<li>${esc(CL[n].name)}</li>`).join('')}</ul>
          <div class="actions">
            <span style="font-size: 14px; font-weight: 700; color: var(--muted)">On your own</span>
            <a class="btn primary" href="#/rate/${t}">Rate my curriculum</a>
            <span style="font-size: 14px; font-weight: 700; color: var(--muted); margin-top: 6px">As a group</span>
            <a class="btn" href="#/table/${t}">Review your ratings</a>
          </div>
        </section>`).join('')}
    </div>
    <h2>Four steps</h2>
    <ol class="lede">
      <li><b>On your own · 25 min.</b> Open <b>Rate my curriculum</b> on your own laptop and rate your table’s statements.</li>
      <li><b>As a group · 25 min.</b> Close your laptops. Open <b>Review your ratings</b> on one screen. Agree on a verdict for each statement.</li>
      <li><b>Briefs · 15 min.</b> Write a brief for the two or three truly new items that matter most.</li>
      <li><b>With the room · 15 min.</b> Each table shares its top items.</li>
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
  const codes = codesFor(T);
  const seen = lsGet('wtn-howto-seen') === '1';
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Step 1 · On your own · 25 min</span>
      <h1>Table ${T} · Your ratings</h1></div>
      <div class="row"><a class="btn" href="#/">Change table</a><a class="btn" href="#/table/${T}">Review your ratings</a></div>
    </div>
    <details class="howto" ${seen ? '' : 'open'}>
      <summary>How to rate</summary>
      <dl class="key">
        <dt>Old program</dt><dd>Where the 2005 program taught this content. Tick every grade that taught it. Grade 7 was <i>Canada: Origins, Histories and Movement of Peoples</i>. Grade 8 was <i>Historical Worldviews Examined</i>. Grade 9 was <i>Canada: Opportunities and Challenges</i>.</dd>
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
    ${DATA.tables[T].map(n => `
      <div class="cluster-head"><h2>Cluster ${n} · ${esc(CL[n].name)}</h2><p>${esc(CL[n].covers)}</p></div>
      ${CL[n].codes.map(code => {
        const k = keyOf(code);
        return `<article class="card" data-key="${k}">
          <div class="card-top">${codeHtml(code)}<div class="stmt">${esc(ST[code].text)}</div><span class="done-tick" hidden>Rated</span></div>
          <div class="groups">
            ${optButtons('o', k, OLD, 'Old program')}
            ${optButtons('me', k, LEVELS, 'Me')}
            ${optButtons('most', k, LEVELS, 'Most teachers')}
          </div>
          <input class="note" type="text" maxlength="500" placeholder="Note: a resource you know, or a question" aria-label="Note for ${esc(code)}">
        </article>`;
      }).join('')}`).join('')}`;

  app.querySelector('details.howto').addEventListener('toggle', () => lsSet('wtn-howto-seen', '1'));
  const saveState = app.querySelector('#save-state');
  const mineDoc = await store.getMine();
  const mine = (mineDoc && mineDoc.r) ? JSON.parse(JSON.stringify(mineDoc.r)) : {};
  if (!mineDoc || mineDoc.table !== T) track(store.setMyTable(T), saveState);

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
    const done = codes.filter(c => { const x = mine[keyOf(c)]; return x && x.me && x.most; }).length;
    app.querySelector('#prog-label').textContent = `${done} of ${codes.length} rated`;
    app.querySelector('#prog-bar').style.width = `${Math.round(100 * done / codes.length)}%`;
    app.querySelector('#done').hidden = done < codes.length;
  };
  codes.forEach(c => paint(keyOf(c)));
  progress();

  const save = (k) => {
    const x = mine[k] || {};
    const val = { o: x.o || [], me: x.me || null, most: x.most || null, note: x.note || '' };
    return track(store.saveRating(T, k, val), saveState);
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
  const codes = codesFor(T);
  let order = [...codes];
  let ratings = [];
  let tableDoc = {};
  app.innerHTML = `
    <div class="pagehead"><div>
      <span class="step-tag">Step 2 · As a group · 25 min</span>
      <h1>Table ${T} · Review your ratings</h1></div>
      <div class="row"><a class="btn" href="#/rate/${T}">Rate my curriculum</a></div>
    </div>
    <p class="lede">Work from this one screen. Start with the statements marked <b>Split</b>. Agree on a verdict for each statement.</p>
    <div class="toolbar">
      <span class="label" id="raters"><b>0</b> people have rated</span>
      <button type="button" class="btn" id="sort-talk">Put split statements first</button>
      <button type="button" class="btn" id="sort-curr">Curriculum order</button>
      <button type="button" class="btn" id="go-briefs">Go to briefs</button>
      <span class="muted" id="save-state" aria-live="polite"></span>
    </div>
    <div id="cards"></div>
    <h2>Where we disagreed</h2>
    <textarea class="big" data-field="disagreed" maxlength="3000" aria-label="Where we disagreed" placeholder="Statements you could not agree on, and why"></textarea>
    <h2 id="briefs">Briefs</h2>
    <p><span class="step-tag">Step 3 · 15 min</span></p>
    <p class="lede">Write one brief for each truly new item that matters most. Write for the person who will build the resource.</p>
    <div id="brief-list"></div>
    <button type="button" class="btn primary" id="add-brief">Add a brief</button>`;

  const cardsEl = app.querySelector('#cards');
  const saveState = app.querySelector('#save-state');

  const renderCards = () => {
    cardsEl.innerHTML = order.map(code => {
      const k = keyOf(code);
      return `<article class="card" data-key="${k}">
        <div class="card-top">${codeHtml(code)}<div class="stmt">${esc(ST[code].text)}</div></div>
        <div class="stats" data-stats></div>
        <div class="badges" data-badges></div>
        <ul class="rnotes" data-notes hidden></ul>
        <div class="verdict">
          <div class="opts" role="group" aria-label="Verdict for ${esc(code)}">
            ${VERDICTS.map(([v, l]) => `<button type="button" class="opt" data-g="v" data-v="${v}" aria-pressed="false">${esc(l)}</button>`).join('')}
          </div>
          <input type="text" class="vnote" maxlength="500" placeholder="Old unit or resource, or why it is new" aria-label="Verdict note for ${esc(code)}">
        </div>
      </article>`;
    }).join('');
    paintStats(); paintVerdicts();
  };

  const paintStats = () => {
    app.querySelector('#raters').innerHTML = `<b>${ratings.length}</b> ${ratings.length === 1 ? 'person has' : 'people have'} rated`;
    codes.forEach(code => {
      const card = cardsEl.querySelector(`.card[data-key="${keyOf(code)}"]`);
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

  unsubs.push(store.watchRatings(T, list => { ratings = list; paintStats(); }));
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
    ['fits', 'Where it fits', 'Its outcome. What comes before and after, in Grade 7, 8 or 9.', 'textarea'],
    ['watch', 'Watch for', 'Common errors. Sensitive topics.', 'textarea'],
    ['sources', 'Sources', 'What you trust. What we already have.', 'textarea']
  ];
  const briefCard = (b, i) => {
    const el = document.createElement('section');
    el.className = 'brief';
    el.dataset.id = b.id;
    el.innerHTML = `<h3>Brief ${i + 1}</h3>
      <div><label for="bc-${b.id}">Statement</label>
        <select id="bc-${b.id}" data-f="code">
          <option value="">Choose a statement</option>
          ${codes.map(c => `<option value="${esc(c)}">${esc(c)} · ${esc(ST[c].text.slice(0, 70))}${ST[c].text.length > 70 ? '…' : ''}</option>`).join('')}
          <option value="several">Several statements (name them below)</option>
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
      <p class="muted">CSV files open in Excel. Ratings has one row per person per statement. No names are collected.</p>
      <div class="row">
        <button type="button" class="btn primary" data-dl="ratings">Ratings (CSV)</button>
        <button type="button" class="btn" data-dl="summary">Statement summary (CSV)</button>
        <button type="button" class="btn" data-dl="verdicts">Table verdicts (CSV)</button>
        <button type="button" class="btn" data-dl="briefs">Briefs (CSV)</button>
        <button type="button" class="btn" data-dl="json">Everything (JSON)</button>
      </div>
    </div>
    <h2>Statements</h2>
    <div class="toolbar">
      <label>Show <select class="select" id="filter">
        <option value="all">All statements</option>
        <option value="new">Table said truly or partly new</option>
        <option value="learn">Half or more said most teachers must learn it</option>
      </select></label>
      <label>Sort <select class="select" id="sort">
        <option value="learn">Most teachers must learn it</option>
        <option value="curr">Curriculum order</option>
      </select></label>
    </div>
    <div class="tablewrap"><table class="sum">
      <thead><tr><th>Code</th><th>Statement</th><th>Table</th><th>Rated</th><th>Most teachers: Learn</th><th>Me: Learn</th><th>Old program</th><th>Verdict</th><th>Table note</th></tr></thead>
      <tbody id="sum-body"></tbody></table></div>
    <h2>Briefs</h2>
    <div id="room-briefs"></div>`;

  const pct = x => `${Math.round(x * 100)}%`;
  const paint = () => {
    // Tiles
    app.querySelector('#tiles').innerHTML = TABLES.map(t => {
      const cs = codesFor(t);
      const rs = ratings.filter(r => r.table === t);
      const done = rs.reduce((s, r) => s + cs.filter(c => { const x = r.r && r.r[keyOf(c)]; return x && x.me && x.most; }).length, 0);
      const possible = rs.length * cs.length;
      const v = (tables[t] && tables[t].v) || {};
      const verdicts = cs.filter(c => v[keyOf(c)] && v[keyOf(c)].verdict).length;
      const nb = briefs.filter(b => b.table === t).length;
      return `<div class="tile"><div class="row"><span class="letter" aria-hidden="true">${t}</span><b>Table ${t}</b></div>
        <div class="num">${rs.length}</div><div class="lbl">people rating · ${possible ? pct(done / possible) : '0%'} complete</div>
        <div class="lbl">${verdicts} of ${cs.length} verdicts · ${nb} ${nb === 1 ? 'brief' : 'briefs'}</div></div>`;
    }).join('');
    // Summary
    const filter = app.querySelector('#filter').value;
    const sort = app.querySelector('#sort').value;
    let rows = curriculumOrder.map(code => {
      const t = tableOf[code];
      const a = aggregate(ratings.filter(r => r.table === t), code);
      const v = ((tables[t] && tables[t].v) || {})[keyOf(code)] || {};
      return { code, t, a, v };
    });
    if (filter === 'new') rows = rows.filter(r => r.v.verdict === 'new' || r.v.verdict === 'partly');
    if (filter === 'learn') rows = rows.filter(r => r.a.mostN && r.a.learnShare >= 0.5);
    if (sort === 'learn') rows.sort((x, y) => y.a.learnShare - x.a.learnShare || y.a.mostN - x.a.mostN);
    app.querySelector('#sum-body').innerHTML = rows.map(({ code, t, a, v }) => {
      const old = OLD.filter(([k]) => a.o[k]).map(([k, l]) => `${l} ${a.o[k]}`).join(', ') || '<span class="muted">None ticked</span>';
      return `<tr>
        <td><b>${esc(code)}</b></td>
        <td class="stmt-cell">${esc(ST[code].text)}</td>
        <td>${t}</td>
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
          <div><b>${esc(b.code || 'No statement chosen')}</b>${b.content ? ` · ${esc(b.content)}` : ''}</div>
          ${b.know ? `<div><b>What a teacher needs to know.</b> ${esc(b.know)}</div>` : ''}
          ${b.fits ? `<div><b>Where it fits.</b> ${esc(b.fits)}</div>` : ''}
          ${b.watch ? `<div><b>Watch for.</b> ${esc(b.watch)}</div>` : ''}
          ${b.sources ? `<div><b>Sources.</b> ${esc(b.sources)}</div>` : ''}
        </div>`).join('')}`;
    }).join('') || '<p class="muted">No briefs yet.</p>';
  };
  app.querySelector('#filter').onchange = paint;
  app.querySelector('#sort').onchange = paint;
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
  TABLES.forEach(t => {
    ratings.filter(r => r.table === t).sort((a, b) => a.id.localeCompare(b.id)).forEach((r, i) => {
      ids[r.id] = `${t}${String(i + 1).padStart(2, '0')}`;
    });
  });
  return ids;
}
function download(kind, ratings, tables, briefs) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${SESSION_ID}`;
  const meta = code => {
    const { lo, type } = splitCode(code);
    const n = clusterOf[code];
    return [lo, type, n, CL[n].name, tableOf[code]];
  };
  if (kind === 'ratings') {
    const pid = participantIds(ratings);
    const rows = [['session', 'participant', 'participant_table', 'code', 'outcome', 'type', 'cluster', 'cluster_name', 'statement_table', 'old_gr7', 'old_gr8', 'old_gr9', 'old_not_taught', 'me', 'most_teachers', 'note', 'updated_at']];
    ratings.forEach(r => {
      Object.entries(r.r || {}).forEach(([k, x]) => {
        const code = codeOfKey[k];
        if (!code) return;
        const o = x.o || [];
        rows.push([SESSION_ID, pid[r.id] || r.id, r.table, code, ...meta(code),
          o.includes('7') ? 1 : 0, o.includes('8') ? 1 : 0, o.includes('9') ? 1 : 0, o.includes('none') ? 1 : 0,
          LEVEL_LABEL[x.me] || '', LEVEL_LABEL[x.most] || '', x.note || '', tsString(r.updatedAt)]);
      });
    });
    save(`${base}-ratings-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else if (kind === 'summary') {
    const rows = [['code', 'outcome', 'type', 'cluster', 'cluster_name', 'table', 'statement', 'raters', 'old_gr7', 'old_gr8', 'old_gr9', 'old_not_taught', 'me_ready', 'me_read_up', 'me_learn', 'most_ready', 'most_read_up', 'most_learn', 'most_learn_share', 'verdict', 'verdict_note']];
    curriculumOrder.forEach(code => {
      const t = tableOf[code];
      const a = aggregate(ratings.filter(r => r.table === t), code);
      const v = ((tables[t] && tables[t].v) || {})[keyOf(code)] || {};
      rows.push([code, ...meta(code).slice(0, 4), t, ST[code].text, a.n, a.o['7'], a.o['8'], a.o['9'], a.o.none,
        a.me.R, a.me.U, a.me.L, a.most.R, a.most.U, a.most.L, a.mostN ? a.learnShare.toFixed(2) : '',
        VERDICT_LABEL[v.verdict] || '', v.note || '']);
    });
    save(`${base}-summary-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else if (kind === 'verdicts') {
    const rows = [['table', 'code', 'verdict', 'note']];
    TABLES.forEach(t => {
      const v = (tables[t] && tables[t].v) || {};
      codesFor(t).forEach(code => { const x = v[keyOf(code)] || {}; rows.push([t, code, VERDICT_LABEL[x.verdict] || '', x.note || '']); });
      if (tables[t] && tables[t].disagreed) rows.push([t, 'Where we disagreed', '', tables[t].disagreed]);
    });
    save(`${base}-verdicts-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else if (kind === 'briefs') {
    const rows = [['table', 'code', 'content', 'need_to_know', 'where_it_fits', 'watch_for', 'sources', 'created_at', 'updated_at']];
    briefs.forEach(b => rows.push([b.table, b.code, b.content, b.know, b.fits, b.watch, b.sources, tsString(b.createdAt), tsString(b.updatedAt)]));
    save(`${base}-briefs-${stamp}.csv`, csv(rows), 'text/csv;charset=utf-8');
  } else {
    const norm = o => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v));
    const pid = participantIds(ratings);
    const out = { session: SESSION_ID, exportedAt: new Date().toISOString(), ratings: norm(ratings.map(r => ({ ...r, id: pid[r.id] || r.id }))), tables: norm(tables), briefs: norm(briefs) };
    save(`${base}-all-${stamp}.json`, JSON.stringify(out, null, 2), 'application/json');
  }
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
  else viewStart();
  app.focus({ preventScroll: true });
}

(async () => {
  try {
    store = await createStore();
    await store.init();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="emph"><b>Could not connect.</b> Check the Wi-Fi and reload the page. If it still fails, use the paper sheets. (${esc(err.message || err)})</div>`;
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
