import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDnPtmSoz4f1xAFqshe5BGbqgueDxKtWgs",
  authDomain: "my-diary-sns.firebaseapp.com",
  projectId: "my-diary-sns",
  storageBucket: "my-diary-sns.firebasestorage.app",
  messagingSenderId: "231980929254",
  appId: "1:231980929254:web:6f9e014cc446170c1f2b27"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);