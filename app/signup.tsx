import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useState } from "react";
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
import {
  accentColor,
  dangerColor,
  isWeb,
  pick,
  textFaint,
  webGlassBox,
  webScreenBackground,
} from "../components/glass";
import { auth, db } from "../firebaseConfig";
import { isValidEmailFormat, normalizeEmail } from "../utils/emailHelpers";

export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSignUp = async () => {
    setErrorText("");

    // ===== 入力前チェック：見えない全角文字・空白を、自動で整える ===== 
    const cleanedEmail = normalizeEmail(email);

    if (!isValidEmailFormat(cleanedEmail)) {
      setErrorText("メールアドレスの形式が正しくありません");
      return;
    }
    if (password.length < 6) {
      setErrorText("パスワードは6文字以上で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setErrorText("確認用パスワードが一致しません");
      return;
    }

    setSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanedEmail, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "users", uid), {
        email: cleanedEmail,
        username: "",
        bio: "",
        snsLinks: { x: "", instagram: "", tiktok: "", youtube: "", facebook: "" },
        following: [],
        followers: [],
      });

      router.replace({ pathname: "/signup-details", params: { isNewSignup: "true" } });
    } catch (error: any) {
      console.log("エラー:", error.message);
      setErrorText(t("login.signupError") + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.formWrapper}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>‹ 戻る</Text>
        </TouchableOpacity>

        <Text style={styles.title}>新規登録</Text>
        <Text style={styles.subtitle}>メールアドレスとパスワードを入力してください</Text>

        <TextInput
          placeholder={t("login.emailPlaceholder")}
          placeholderTextColor={pick("rgba(255,255,255,0.4)", undefined as any)}
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
            placeholderTextColor={pick("rgba(255,255,255,0.4)", undefined as any)}
            value={password}
            onChangeText={setPassword}
            style={styles.passwordInput}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.toggleText}>{showPassword ? t("login.hide") : t("login.show")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.passwordWrapper}>
          <TextInput
            placeholder="パスワード（確認用）"
            placeholderTextColor={pick("rgba(255,255,255,0.4)", undefined as any)}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.passwordInput}
            secureTextEntry={!showPassword}
          />
        </View>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <TouchableOpacity
          style={styles.signupButton}
          onPress={handleSignUp}
          disabled={submitting}
        >
          <Text style={styles.signupButtonText}>
            {submitting ? "..." : "登録して次へ"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  if (isWeb) {
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
    // ===== Web版：暗いオーロラ風の背景 =====
    ...webScreenBackground,
  },
  // ===== Web版：フォームを、1枚のガラスのカードにする =====
  formWrapper: Platform.select({
    web: {
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
      padding: 32,
      borderRadius: 28,
      ...webGlassBox,
    },
    default: {},
  }),
  backButton: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 15,
    color: accentColor,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 6,
    textAlign: "center",
    color: pick("#ffffff", undefined as any),
  },
  subtitle: {
    fontSize: 12,
    color: textFaint,
    marginBottom: 24,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: pick("rgba(255,255,255,0.18)", "#ddd"),
    backgroundColor: pick("rgba(255,255,255,0.06)", "transparent"),
    color: pick("#ffffff", undefined as any),
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: pick("rgba(255,255,255,0.18)", "#ddd"),
    backgroundColor: pick("rgba(255,255,255,0.06)", "transparent"),
    borderRadius: 8,
    marginBottom: 12,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    color: pick("#ffffff", undefined as any),
  },
  toggleText: {
    color: accentColor,
    fontSize: 12,
  },
  errorText: {
    color: dangerColor,
    fontSize: 13,
    marginBottom: 12,
  },
  signupButton: {
    backgroundColor: pick("#f4f6ff", "#222"),
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  signupButtonText: {
    color: pick("#1a2050", "#fff"),
    fontWeight: "bold",
    fontSize: 16,
  },
});