import { useRouter } from "expo-router";
import {
    GoogleAuthProvider,
    getRedirectResult,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { auth, db } from "../firebaseConfig";
import { normalizeEmail } from "../utils/emailHelpers";

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== ここまでWeb版専用 =====

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ===== ここからWeb版専用：スマホのブラウザかどうかを判定する =====
  const isMobileBrowser = () => {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
  };

  // ===== Googleログイン後、共通で行う処理（新規か、既存か、で分岐する） =====
  const handleGoogleUserResult = async (result: any) => {
    const uid = result.user.uid;
    const userDocRef = doc(db, "users", uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      await setDoc(userDocRef, {
        email: result.user.email || "",
        username: result.user.displayName || "",
        photoUrl: result.user.photoURL || "",
        bio: "",
        snsLinks: { x: "", instagram: "", tiktok: "", youtube: "", facebook: "" },
        following: [],
        followers: [],
      });
      router.replace({ pathname: "/signup-details", params: { isNewSignup: "true" } });
    } else {
      router.replace("/(tabs)");
    }
  };

  // ===== スマホの場合、リダイレクト方式で戻ってきたときの結果を確認する =====
  useEffect(() => {
    if (!isWeb) return;
    if (!isMobileBrowser()) return;
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result) return;
        await handleGoogleUserResult(result);
      } catch (error: any) {
        console.log("Googleログイン（リダイレクト）エラー:", error.message);
        alert("Googleログインに失敗しました: " + error.message);
      }
    };
    checkRedirectResult();
  }, []);
  // ===== ここまでWeb版専用 =====

  const handleLogin = async () => {
    try {
      // ===== 入力前チェック：見えない全角文字・空白を、自動で整える =====
      const cleanedEmail = normalizeEmail(email);
      await signInWithEmailAndPassword(auth, cleanedEmail, password);
      router.replace("/(tabs)");
    } catch (error: any) {
      console.log("エラー:", error.message);
      alert(t("login.loginError") + error.message);
    }
  };

  // ===== ここからWeb版専用：Googleログイン（スマホはリダイレクト、パソコンはポップアップ） ===== 
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();

    if (isMobileBrowser()) {
      // ===== スマホ：リダイレクト方式（この後は、上のuseEffectで結果を受け取る） =====
      await signInWithRedirect(auth, provider);
      return;
    }

    // ===== パソコン：ポップアップ方式 =====
    try {
      const result = await signInWithPopup(auth, provider);
      await handleGoogleUserResult(result);
    } catch (error: any) {
      console.log("Googleログインエラー:", error.message);
      alert("Googleログインに失敗しました: " + error.message);
    }
  };
  // ===== ここまでWeb版専用 =====

  const content = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ===== ここからWeb版専用（PC向けに中央寄せ・固定幅にするラッパー） ===== */}
      <View style={styles.formWrapper}>
        {/* ===== ここまでWeb版専用 ===== */}
        <Text style={styles.title}>{t("login.title")}</Text>

        <TextInput
          placeholder={t("login.emailPlaceholder")}
          value={email}
          onChangeText={setEmail}
          // ===== 入力欄から離れたタイミングで、見た目にも整えておく =====
          onBlur={() => setEmail((prev) => normalizeEmail(prev))}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={styles.passwordWrapper}>
          <TextInput
            placeholder={t("login.passwordPlaceholder")}
            value={password}
            onChangeText={setPassword}
            style={styles.passwordInput}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.toggleText}>{showPassword ? t("login.hide") : t("login.show")}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push("/forgot-password")}>
          <Text style={styles.forgotPasswordText}>{t("login.forgotPassword")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>{t("login.loginButton")}</Text>
        </TouchableOpacity>

        {/* ===== ここからWeb版専用：Googleログインボタン ===== */}
        {isWeb && (
          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
            <Text style={styles.googleButtonText}>Googleでログイン</Text>
          </TouchableOpacity>
        )}
        {/* ===== ここまでWeb版専用 ===== */}

        <TouchableOpacity style={styles.signupButton} onPress={() => router.push("/signup")}>
          <Text style={styles.signupButtonText}>{t("login.signupButton")}</Text>
        </TouchableOpacity>
      {/* ===== ここからWeb版専用 ===== */}
      </View>
      {/* ===== ここまでWeb版専用 ===== */}
    </KeyboardAvoidingView>
  );

  if (Platform.OS === "web") {
    return content;
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      {content}
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
    justifyContent: "center",
  },
  // ===== ここからWeb版専用 =====
  formWrapper: Platform.select({
    web: {
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
    },
    default: {},
  }),
  // ===== ここまでWeb版専用 =====
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 30,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
  },
  toggleText: {
    color: "#4a90e2",
    fontSize: 12,
  },
  forgotPasswordText: {
    color: "#4a90e2",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  loginButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  // ===== ここからWeb版専用：Googleボタンのスタイル =====
  googleButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  googleButtonText: {
    color: "#333",
    fontWeight: "600",
    fontSize: 15,
  },
  // ===== ここまでWeb版専用 =====
  signupButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222",
  },
  signupButtonText: {
    color: "#222",
    fontWeight: "bold",
    fontSize: 16,
  },
});