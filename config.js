// Firebase web app config for the eips-planner-dev project. Data goes to the clDaySessions collection.
// If apiKey is emptied, the site runs in DEMO MODE: data is kept in this browser only.
export const firebaseConfig = {
  apiKey: "AIzaSyAgKPb0soFXspLJWb5WvKXBFf91Xf3JmU8",
  authDomain: "eips-planner-dev.firebaseapp.com",
  projectId: "eips-planner-dev",
  storageBucket: "eips-planner-dev.firebasestorage.app",
  messagingSenderId: "864110241026",
  appId: "1:864110241026:web:865ee9c3ca571b9bd0ce1b"
};

// Session IDs, one per grade. Each grade's answers are stored apart from the others.
// Grade 7 keeps the October 8 session, so its earlier ratings, verdicts and briefs still show.
// To practise, add ?session=practice to the address. Practice answers are stored apart from the real ones.
export const DEFAULT_SESSIONS = { '7': 'cl-2026-10-08', '8': 'cl-2026-gr8', '9': 'cl-2026-gr9' };
const fromUrl = (new URLSearchParams(location.search).get('session') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
export const PRACTICE = fromUrl;
export const sessionFor = g => fromUrl ? (g === '7' ? fromUrl : `${fromUrl}-gr${g}`) : DEFAULT_SESSIONS[g];
// The Grade 7 views use these two.
export const DEFAULT_SESSION = DEFAULT_SESSIONS['7'];
export const SESSION_ID = sessionFor('7');
