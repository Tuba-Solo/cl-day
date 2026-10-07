// Data layer. Firebase (Firestore + anonymous sign-in) when configured, otherwise a
// browser-only demo store so the site can be rehearsed without any setup.
import { firebaseConfig, SESSION_ID } from './config.js';

const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---------------- Demo store ----------------
function makeDemoStore() {
  const KEY = 'wtn-demo-' + SESSION_ID;
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const listeners = new Set();
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { ratings: {}, tables: {}, briefs: {}, ranks: {} }; }
    catch { return { ratings: {}, tables: {}, briefs: {}, ranks: {} }; }
  };
  let db = load();
  const notify = () => listeners.forEach(fn => fn());
  const commit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    if (bc) bc.postMessage('changed');
    notify();
  };
  const refresh = () => { db = load(); notify(); };
  if (bc) bc.onmessage = refresh;
  window.addEventListener('storage', e => { if (e.key === KEY) refresh(); });
  const watch = (fn) => { listeners.add(fn); fn(); return () => listeners.delete(fn); };
  let uid = sessionStorage.getItem('wtn-demo-uid');
  if (!uid) { uid = 'demo-' + randomId(); sessionStorage.setItem('wtn-demo-uid', uid); }
  const now = () => new Date().toISOString();

  return {
    mode: 'demo',
    async init() { return uid; },
    uid: () => uid,
    async getMine() { return db.ratings[uid] || null; },
    watchMine(cb) { return watch(() => cb(db.ratings[uid] || null)); },
    async saveRating(table, key, val) {
      db.ratings[uid] = deepMerge(db.ratings[uid] || {}, { table, updatedAt: now(), r: { [key]: val } });
      commit();
    },
    async setMyTable(table) {
      db.ratings[uid] = deepMerge(db.ratings[uid] || {}, { table, updatedAt: now() });
      commit();
    },
    watchRatings(table, cb) {
      return watch(() => cb(Object.entries(db.ratings)
        .filter(([, d]) => !table || d.table === table)
        .map(([id, d]) => ({ id, ...d }))));
    },
    watchTable(letter, cb) { return watch(() => cb(db.tables[letter] || {})); },
    watchTables(cb) { return watch(() => cb({ ...db.tables })); },
    async saveVerdict(letter, key, val) {
      db.tables[letter] = deepMerge(db.tables[letter] || {}, { v: { [key]: val }, updatedAt: now() });
      commit();
    },
    async saveTableField(letter, field, value) {
      db.tables[letter] = deepMerge(db.tables[letter] || {}, { [field]: value, updatedAt: now() });
      commit();
    },
    watchBriefs(table, cb) {
      return watch(() => cb(Object.entries(db.briefs)
        .filter(([, b]) => !table || b.table === table)
        .map(([id, b]) => ({ id, ...b }))
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))));
    },
    async addBrief(table) {
      const id = randomId();
      db.briefs[id] = { table, createdAt: now(), updatedAt: now(), code: '', content: '', know: '', fits: '', watch: '', sources: '' };
      commit();
      return id;
    },
    async saveBrief(id, fields) {
      db.briefs[id] = deepMerge(db.briefs[id] || {}, { ...fields, updatedAt: now() });
      commit();
    },
    watchMyRank(cb) { return watch(() => cb((db.ranks || {})[uid] || null)); },
    watchRanks(cb) { return watch(() => cb(Object.entries(db.ranks || {}).map(([id, d]) => ({ id, ...d })))); },
    async saveRank(fields) {
      db.ranks = db.ranks || {};
      db.ranks[uid] = { ...(db.ranks[uid] || {}), ...fields, updatedAt: now() };
      commit();
    },
    async resetDemo() { db = { ratings: {}, tables: {}, briefs: {}, ranks: {} }; commit(); }
  };
}

// ---------------- Firebase store ----------------
async function makeFirebaseStore() {
  const fb = await import('./firebase-bundle.js');
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);
  let db;
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch (e) {
    db = fb.initializeFirestore(app, {});
  }
  const base = ['clDaySessions', SESSION_ID];
  const ratingsCol = () => fb.collection(db, ...base, 'ratings');
  const tablesCol = () => fb.collection(db, ...base, 'tables');
  const briefsCol = () => fb.collection(db, ...base, 'briefs');
  const ranksCol = () => fb.collection(db, ...base, 'ranks');
  let uid = null;
  const ts = () => fb.serverTimestamp();
  const plain = (snap) => ({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) });

  return {
    mode: 'live',
    async init() {
      uid = await new Promise((resolve, reject) => {
        const off = fb.onAuthStateChanged(auth, (user) => {
          if (user) { off(); resolve(user.uid); }
        }, reject);
        fb.signInAnonymously(auth).catch(reject);
      });
      return uid;
    },
    uid: () => uid,
    async getMine() {
      try {
        const s = await fb.getDoc(fb.doc(ratingsCol(), uid));
        return s.exists() ? s.data() : null;
      } catch { return null; }
    },
    watchMine(cb) {
      return fb.onSnapshot(fb.doc(ratingsCol(), uid), s => cb(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null), e => console.error(e));
    },
    saveRating(table, key, val) {
      return fb.setDoc(fb.doc(ratingsCol(), uid), { table, updatedAt: ts(), r: { [key]: val } }, { merge: true });
    },
    setMyTable(table) {
      return fb.setDoc(fb.doc(ratingsCol(), uid), { table, updatedAt: ts() }, { merge: true });
    },
    watchRatings(table, cb) {
      const q = table ? fb.query(ratingsCol(), fb.where('table', '==', table)) : ratingsCol();
      return fb.onSnapshot(q, s => cb(s.docs.map(plain)), e => console.error(e));
    },
    watchTable(letter, cb) {
      return fb.onSnapshot(fb.doc(tablesCol(), letter), s => cb(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : {}), e => console.error(e));
    },
    watchTables(cb) {
      return fb.onSnapshot(tablesCol(), s => {
        const out = {};
        s.docs.forEach(d => { out[d.id] = d.data({ serverTimestamps: 'estimate' }); });
        cb(out);
      }, e => console.error(e));
    },
    saveVerdict(letter, key, val) {
      return fb.setDoc(fb.doc(tablesCol(), letter), { v: { [key]: val }, updatedAt: ts() }, { merge: true });
    },
    saveTableField(letter, field, value) {
      return fb.setDoc(fb.doc(tablesCol(), letter), { [field]: value, updatedAt: ts() }, { merge: true });
    },
    watchBriefs(table, cb) {
      const q = table ? fb.query(briefsCol(), fb.where('table', '==', table)) : briefsCol();
      return fb.onSnapshot(q, s => {
        const list = s.docs.map(plain);
        const t = (x) => (x.createdAt && x.createdAt.toMillis) ? x.createdAt.toMillis() : 0;
        list.sort((a, b) => t(a) - t(b));
        cb(list);
      }, e => console.error(e));
    },
    async addBrief(table) {
      const ref = await fb.addDoc(briefsCol(), { table, createdAt: ts(), updatedAt: ts(), code: '', content: '', know: '', fits: '', watch: '', sources: '' });
      return ref.id;
    },
    saveBrief(id, fields) {
      return fb.setDoc(fb.doc(briefsCol(), id), { ...fields, updatedAt: ts() }, { merge: true });
    },
    // Resource priorities: one document per person, the ordered top six plus an optional suggestion.
    watchMyRank(cb) {
      return fb.onSnapshot(fb.doc(ranksCol(), uid), s => cb(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null), e => console.error(e));
    },
    watchRanks(cb) {
      return fb.onSnapshot(ranksCol(), s => cb(s.docs.map(plain)), e => console.error(e));
    },
    saveRank(fields) {
      return fb.setDoc(fb.doc(ranksCol(), uid), { ...fields, updatedAt: ts() }, { merge: true });
    }
  };
}

export async function createStore() {
  if (!isConfigured) return makeDemoStore();
  return makeFirebaseStore();
}
