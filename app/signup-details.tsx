import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { deleteUser } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== ここまでWeb版専用 =====

// 興味のあるジャンルの一覧（発見スワイプ機能で使用）
const INTEREST_GENRES = [
  "旅行", "グルメ・料理", "ファッション", "美容・コスメ", "スポーツ・フィットネス",
  "写真・カメラ", "ペット・動物", "音楽", "映画・ドラマ", "読書・本",
  "アート・イラスト", "ゲーム", "車・バイク", "インテリア・暮らし", "育児・子育て",
];

let otherGenreIdCounter = 0;
const newOtherGenreId = () => `other-${Date.now()}-${otherGenreIdCounter++}`;

type OtherGenreEntry = {
  id: string;
  text: string;
};

export default function SignupDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isNewSignup } = useLocalSearchParams<{ isNewSignup?: string }>();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleError, setHandleError] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthDate, setBirthDate] = useState(new Date(2000, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // 興味のあるジャンル関連の状態
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  // 「その他」の自由記入欄は、複数持てるようにリストで管理する
  const [otherGenreEntries, setOtherGenreEntries] = useState<OtherGenreEntry[]>([]);

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  // ===== ここからWeb版専用（HTMLのdate inputは、yyyy-mm-dd形式の文字列を扱う） =====
  const formatDateForInput = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const handleWebDateChange = (event: any) => {
    const value = event.target.value;
    if (value) {
      const [y, m, d] = value.split("-").map(Number);
      setBirthDate(new Date(y, m - 1, d));
    }
  };
  // ===== ここまでWeb版専用 =====

  const validateHandle = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9_.]/g, "");
    setHandle(cleaned);
    setHandleError("");
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  // 「その他」ボタンを押すたびに、新しい自由記入欄を1つ追加する
  const addOtherGenreEntry = () => {
    setOtherGenreEntries((prev) => [...prev, { id: newOtherGenreId(), text: "" }]);
  };

  const updateOtherGenreEntry = (id: string, text: string) => {
    setOtherGenreEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, text } : entry))
    );
  };

  const removeOtherGenreEntry = (id: string) => {
    setOtherGenreEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (!displayName.trim() || handle.trim().length < 3 || !phoneNumber.trim() || !gender) {
      if (handle.trim().length < 3) {
        setHandleError(t("signupDetails.handleTooShort"));
      } else {
        alert(t("signupDetails.requiredFields"));
      }
      return;
    }

    setSaving(true);

    try {
      const normalizedHandle = handle.trim().toLowerCase();

      const q = query(collection(db, "users"), where("handle", "==", normalizedHandle));
      const snapshot = await getDocs(q);
      const isTaken = snapshot.docs.some((docSnap) => docSnap.id !== uid);
      if (isTaken) {
        setHandleError(t("signupDetails.handleTaken"));
        setSaving(false);
        return;
      }

      // 興味のあるジャンルを、最終的な一覧としてまとめる
      const otherGenreTexts = otherGenreEntries
        .map((entry) => entry.text.trim())
        .filter((text) => text.length > 0);
      const finalGenres = [...selectedGenres, ...otherGenreTexts];

      await setDoc(
        doc(db, "users", uid),
        {
          username: displayName.trim(),
          handle: normalizedHandle,
          phoneNumber: phoneNumber.trim(),
          birthDate: birthDate.toISOString(),
          gender: gender,
          interestGenres: finalGenres,
        },
        { merge: true }
      );

      router.replace("/(tabs)");
    } finally {
      setSaving(false);
    }
  };

  const performCancelSignup = async () => {
    setCancelling(true);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await deleteDoc(doc(db, "users", uid));
      }
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
      router.replace("/login");
    } catch (error: any) {
      setCancelling(false);
      alert(t("signupDetails.cancelError") + error.message);
    }
  };

  // ===== ここからWeb版専用（戻るボタンの確認方法の分岐） =====
  const handleCancelSignup = () => {
    if (isWeb) {
      const confirmed = window.confirm(t("signupDetails.cancelMessage"));
      if (confirmed) {
        performCancelSignup();
      }
      return;
    }

    Alert.alert(
      t("signupDetails.cancelTitle"),
      t("signupDetails.cancelMessage"),
      [
        { text: t("signupDetails.cancelContinue"), style: "cancel" },
        {
          text: t("signupDetails.cancelConfirm"),
          style: "destructive",
          onPress: performCancelSignup,
        },
      ]
    );
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
        {isNewSignup === "true" && (
          <TouchableOpacity style={styles.backButton} onPress={handleCancelSignup} disabled={cancelling}>
            <Text style={styles.backButtonText}>{t("signupDetails.backButton")}</Text>
          </TouchableOpacity>
        )}

        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t("signupDetails.title")}</Text>
          <Text style={styles.subtitle}>{t("signupDetails.subtitle")}</Text>

          <Text style={styles.label}>{t("signupDetails.displayNameLabel")}</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.input}
            placeholder={t("signupDetails.displayNamePlaceholder")}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <Text style={styles.label}>{t("signupDetails.handleLabel")}</Text>
          <View style={styles.handleInputWrapper}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              value={handle}
              onChangeText={validateHandle}
              style={styles.handleInput}
              placeholder={t("signupDetails.handlePlaceholder")}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
          <Text style={styles.hintText}>{t("signupDetails.handleHint")}</Text>
          {handleError ? <Text style={styles.errorText}>{handleError}</Text> : null}

          <Text style={styles.label}>{t("signupDetails.phoneLabel")}</Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            style={styles.input}
            placeholder={t("signupDetails.phonePlaceholder")}
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <Text style={styles.label}>{t("signupDetails.birthDateLabel")}</Text>

          {/* ===== ここからWeb版専用：HTML標準の日付入力欄 ===== */}
          {isWeb ? (
            <input
              type="date"
              value={formatDateForInput(birthDate)}
              onChange={handleWebDateChange}
              style={webDateInputStyle}
            />
          ) : (
            <>
              <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                <Text>{formatDate(birthDate)}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <View>
                  <DateTimePicker
                    value={birthDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedDate) => {
                      if (selectedDate) setBirthDate(selectedDate);
                      if (Platform.OS === "android") setShowDatePicker(false);
                    }}
                  />
                  {Platform.OS === "ios" && (
                    <TouchableOpacity
                      style={styles.datePickerDoneButton}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.datePickerDoneText}>{t("signupDetails.datePickerDone")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}
          {/* ===== ここまでWeb版専用 ===== */}

          <Text style={styles.label}>{t("signupDetails.genderLabel")}</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[styles.genderButton, gender === "male" && styles.genderButtonActive]}
              onPress={() => setGender("male")}
            >
              <Text style={gender === "male" ? styles.genderTextActive : styles.genderText}>
                {t("signupDetails.genderMale")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, gender === "female" && styles.genderButtonActive]}
              onPress={() => setGender("female")}
            >
              <Text style={gender === "female" ? styles.genderTextActive : styles.genderText}>
                {t("signupDetails.genderFemale")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, gender === "other" && styles.genderButtonActive]}
              onPress={() => setGender("other")}
            >
              <Text style={gender === "other" ? styles.genderTextActive : styles.genderText}>
                {t("signupDetails.genderOther")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 興味のあるジャンル選択セクション */}
          <Text style={styles.label}>興味のあるジャンル</Text>
          <Text style={styles.hintText}>気になるものを、いくつでも選んでください</Text>
          <View style={styles.genreGrid}>
            {INTEREST_GENRES.map((genre) => {
              const isSelected = selectedGenres.includes(genre);
              return (
                <TouchableOpacity
                  key={genre}
                  style={[styles.genreChip, isSelected && styles.genreChipSelected]}
                  onPress={() => toggleGenre(genre)}
                >
                  <Text style={isSelected ? styles.genreChipTextSelected : styles.genreChipText}>
                    {genre}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.genreChip} onPress={addOtherGenreEntry}>
              <Text style={styles.genreChipText}>＋ その他</Text>
            </TouchableOpacity>
          </View>

          {otherGenreEntries.map((entry) => (
            <View key={entry.id} style={styles.otherGenreRow}>
              <TextInput
                value={entry.text}
                onChangeText={(text) => updateOtherGenreEntry(entry.id, text)}
                style={[styles.input, styles.otherGenreInput]}
                placeholder="興味のあるジャンルを入力"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <TouchableOpacity
                style={styles.otherGenreRemoveButton}
                onPress={() => removeOtherGenreEntry(entry.id)}
              >
                <Text style={styles.otherGenreRemoveButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>
              {saving ? "..." : t("signupDetails.saveButton")}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      {/* ===== ここからWeb版専用 ===== */}
      </View>
      {/* ===== ここまでWeb版専用 ===== */}
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

// ===== ここからWeb版専用：HTML input用の、通常のCSSスタイル =====
const webDateInputStyle: any = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 8,
  padding: 12,
  backgroundColor: "#fafafa",
  fontSize: 14,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
// ===== ここまでWeb版専用 =====

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
  },
  // ===== ここからWeb版専用 =====
  formWrapper: Platform.select({
    web: {
      flex: 1,
      width: "100%",
      maxWidth: 500,
      alignSelf: "center",
    },
    default: {
      flex: 1,
    },
  }),
  // ===== ここまでWeb版専用 =====
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: "#4a90e2",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    color: "#999",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fafafa",
  },
  handleInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    paddingLeft: 12,
  },
  atSign: {
    fontSize: 15,
    color: "#999",
    marginRight: 2,
  },
  handleInput: {
    flex: 1,
    padding: 12,
    paddingLeft: 0,
  },
  hintText: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#e74c3c",
    marginTop: 4,
  },
  datePickerDoneButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  datePickerDoneText: {
    color: "#fff",
    fontWeight: "600",
  },
  genderRow: {
    flexDirection: "row",
    gap: 10,
  },
  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  genderButtonActive: {
    backgroundColor: "#4a90e2",
    borderColor: "#4a90e2",
  },
  genderText: {
    color: "#333",
  },
  genderTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  genreChip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fafafa",
  },
  genreChipSelected: {
    backgroundColor: "#4a90e2",
    borderColor: "#4a90e2",
  },
  genreChipText: {
    fontSize: 13,
    color: "#333",
  },
  genreChipTextSelected: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  otherGenreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  otherGenreInput: {
    flex: 1,
  },
  otherGenreRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  otherGenreRemoveButtonText: {
    fontSize: 16,
    color: "#e74c3c",
    fontWeight: "700",
  },
  saveButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 30,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});