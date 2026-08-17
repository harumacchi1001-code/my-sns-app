import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
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

// ===== ログイン状態の保存方法を、自動判定ではなく、明示的に指定する =====
// （ExpoでビルドしたWeb環境では、自動判定がうまく働かず、
// 　Googleログイン（リダイレクト方式）の結果が、正しく受け取れないことがあるため）
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

export const db = getFirestore(app);
export const storage = getStorage(app);