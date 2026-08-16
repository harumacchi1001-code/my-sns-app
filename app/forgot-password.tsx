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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("forgotPassword.backButton")}</Text>
        </TouchableOpacity>

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
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>{t("forgotPassword.sendButton")}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
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
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: "#4a90e2",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: "#e74c3c",
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  sentBox: {
    alignItems: "center",
  },
  sentText: {
    fontSize: 14,
    color: "#333",
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
  },
  backToLoginButtonText: {
    color: "#222",
    fontWeight: "600",
    fontSize: 14,
  },
});