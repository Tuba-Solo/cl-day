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

// Session ID. The real session is the default.
// To practise, add ?session=practice to the address. Practice answers are stored apart from the real ones.
export const DEFAULT_SESSION = "cl-2026-10-08";
const fromUrl = (new URLSearchParams(location.search).get('session') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
export const SESSION_ID = fromUrl || DEFAULT_SESSION;
