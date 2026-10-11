import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
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
  isWeb,
  pick,
  webGlassBox,
  webScreenBackground,
  webSoftButton
} from "../components/glass";
import { auth } from "../firebaseConfig";
import { normalizeEmail } from "../utils/emailHelpers";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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

  const content = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ===== ここからWeb版専用（PC向けに中央寄せ・固定幅のガラスのカードにするラッパー） ===== */}
      <View style={styles.formWrapper}>
        {/* ===== ここまでWeb版専用 ===== */}
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{t("login.title")}</Text>

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

        <TouchableOpacity onPress={() => router.push("/forgot-password")}>
          <Text style={styles.forgotPasswordText}>{t("login.forgotPassword")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>{t("login.loginButton")}</Text>
        </TouchableOpacity>

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
    // ===== Web版：暗いオーロラ風の背景 =====
    ...webScreenBackground,
  },
  // ===== ここからWeb版専用（フォームを、1枚のガラスのカードにする） =====
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
  // ===== ここまでWeb版専用 =====
  logo: {
    width: 64,
    height: 64,
    alignSelf: "center",
    marginBottom: 16,
    // ===== Web版：ロゴが暗い背景に埋もれないよう、明るい角丸の下地を敷く =====
    ...(isWeb ? ({ backgroundColor: "#f4f6ff", borderRadius: 16 } as any) : {}),
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 30,
    textAlign: "center",
    color: pick("#ffffff", undefined as any),
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
  forgotPasswordText: {
    color: accentColor,
    fontSize: 13,
    textAlign: "right",
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: pick("#f4f6ff", "#222"),
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  loginButtonText: {
    color: pick("#1a2050", "#fff"),
    fontWeight: "bold",
    fontSize: 16,
  },
  signupButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222",
    ...webSoftButton,
  },
  signupButtonText: {
    color: pick("#ffffff", "#222"),
    fontWeight: "bold",
    fontSize: 16,
  },
});