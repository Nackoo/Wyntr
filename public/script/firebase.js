import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { Timestamp, initializeFirestore, arrayUnion, arrayRemove, getFirestore, runTransaction, collection, addDoc, query, orderBy, limit, startAfter, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, serverTimestamp, getDocs, getCountFromServer, updateDoc, increment, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
//import { getDatabase, ref as rref, onDisconnect, set, onValue, update, get, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const SUPABASE_URL = "https://wiztducumybslhjfphay.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpenRkdWN1bXlic2xoamZwaGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjAwNjEsImV4cCI6MjA2OTU5NjA2MX0.3ojcrMLTMhaWTS-4H7FvxK6HYYXLadoIgvidqoNTwWc";    
const MAX_FILE_BYTES = 3 * 1024 * 1024; 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const firebaseConfig = {
  apiKey: "AIzaSyBf4eVTh7hJ_DOQcic08h2uno8CKFOYieg",
  authDomain: "wyntr-9664f.firebaseapp.com",
  databaseURL: "https://wyntr-9664f-default-rtdb.firebaseio.com",
  projectId: "wyntr-9664f",
  storageBucket: "wyntr-9664f.firebasestorage.app",
  messagingSenderId: "448760752467",
  appId: "1:448760752467:web:010cdd2a82e9c92d0159a6",
  measurementId: "G-7WWP4ZXRPD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  cache: { type: "persistent" }
});
const storage = getStorage(app);
//const rdb = getDatabase(app);

//export { rdb, onDisconnect, set, rref, onValue, update, get, remove }
export { createClient, SUPABASE_URL, SUPABASE_ANON_KEY, MAX_FILE_BYTES, supabase };
export { Timestamp, app, arrayUnion, initializeFirestore, increment, arrayRemove, auth, db, storage, runTransaction, initializeApp, getAuth, onAuthStateChanged, getFirestore, collection, addDoc, deleteField, serverTimestamp, query, orderBy, limit, startAfter, writeBatch, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, getDocs, getCountFromServer, getStorage, ref, uploadBytes, getDownloadURL, updateDoc, signOut }; 