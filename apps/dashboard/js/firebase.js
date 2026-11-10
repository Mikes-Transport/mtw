// Firebase for the dashboard: exposes the API the tool scripts expect as window.MTW.
// The config below is a Firebase web config: it identifies the project and is
// public by design. Access to data is controlled by Firestore security rules.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA6i9ZVdE1xmSzjebcx1zUJpA-Zuy_DgSs',
  authDomain: 'mtw-lookup.firebaseapp.com',
  projectId: 'mtw-lookup',
  storageBucket: 'mtw-lookup.firebasestorage.app',
  messagingSenderId: '365628896617',
  appId: '1:365628896617:web:f3d718fad93b14501679f8'
};

// Reuse an app the host page already created (the old Webflow embed did this).
const app = window.firebaseApp || getApps()[0] || initializeApp(firebaseConfig);
const db = window.db || getFirestore(app);

window.firebaseApp = app;
window.db = db;
window.MTW = Object.assign({
  db,
  $: selector => document.querySelector(selector),
  $$: selector => Array.from(document.querySelectorAll(selector)),
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot
}, window.MTW || {});
