import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// REPLACE WITH YOUR FIREBASE CONSOLE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyBCn0jh3Azq8YfUAv7jNH9OC5UjMEvi0ZY",
  authDomain: "jewelhk-5917b.firebaseapp.com",
  projectId: "jewelhk-5917b",
  storageBucket: "jewelhk-5917b.firebasestorage.app",
  messagingSenderId: "362379420420",
  appId: "1:362379420420:web:9b472ca73fc305e953a651",
  measurementId: "G-RY2WJ028LB"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);