import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
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
  textSub,
  webGlassBox,
  webScreenBackground,
  webSoftButton,
} from "../components/glass";
import { auth } from "../firebaseConfig";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSendResetEmail = async () => {
    if (!email.trim()) {
      setErrorMessage(t("forgotPassword.emailRequired"));
      return;
    }

    setErrorMessage("");
    setSending(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (error: any) {
      setErrorMessage(t("forgotPassword.sendFailed") + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ===== スマホ：今までどおり、画面の左上に「戻る」を置く ===== */}
        {!isWeb && (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t("forgotPassword.backButton")}</Text>
          </TouchableOpacity>
        )}

        {/* ===== Web版：中央寄せ・固定幅のガラスのカード(スマホでは、ただの入れ物) ===== */}
        <View style={styles.formWrapper}>
          {/* ===== Web版：「戻る」はカードの中に置く ===== */}
          {isWeb && (
            <TouchableOpacity style={styles.backButtonWeb} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>{t("forgotPassword.backButton")}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.title}>{t("forgotPassword.title")}</Text>

          {sent ? (
            <View style={styles.sentBox}>
              <Text style={styles.sentText}>{t("forgotPassword.sentMessage")}</Text>
              <TouchableOpacity style={styles.backToLoginButton} onPress={() => router.back()}>
                <Text style={styles.backToLoginButtonText}>{t("forgotPassword.backToLogin")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.subtitle}>{t("forgotPassword.subtitle")}</Text>

              <TextInput
                placeholder={t("forgotPassword.emailPlaceholder")}
                placeholderTextColor={pick("rgba(255,255,255,0.4)", undefined as any)}
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSendResetEmail}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color={pick("#1a2050", "#fff")} size="small" />
                ) : (
                  <Text style={styles.sendButtonText}>{t("forgotPassword.sendButton")}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
  // ===== Web版：フォームを、中央寄せ・固定幅の、1枚のガラスのカードにする =====
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
  // ===== スマホ用：画面の左上に固定 =====
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
  },
  // ===== Web版用：カードの中に、普通に並べる =====
  backButtonWeb: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: accentColor,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
    color: pick("#ffffff", undefined as any),
  },
  subtitle: {
    fontSize: 13,
    color: textSub,
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: pick("rgba(255,255,255,0.18)", "#ddd"),
    backgroundColor: pick("rgba(255,255,255,0.06)", "transparent"),
    color: pick("#ffffff", undefined as any),
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: dangerColor,
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: pick("#f4f6ff", "#222"),
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendButtonText: {
    color: pick("#1a2050", "#fff"),
    fontWeight: "bold",
    fontSize: 16,
  },
  sentBox: {
    alignItems: "center",
  },
  sentText: {
    fontSize: 14,
    color: pick("rgba(255,255,255,0.85)", "#333"),
    lineHeight: 22,
    marginBottom: 24,
    textAlign: "center",
  },
  backToLoginButton: {
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 30,
    ...webSoftButton,
  },
  backToLoginButtonText: {
    color: pick("#ffffff", "#222"),
    fontWeight: "600",
    fontSize: 14,
  },
});