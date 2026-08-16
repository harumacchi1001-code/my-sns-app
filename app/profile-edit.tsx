import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { collection, doc, DocumentData, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../components/StampFrame";
import { auth, db, storage } from "../firebaseConfig";

const SNS_LIST = [
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
];

const USERNAME_COLORS = [
  "#222222",
  "#e74c3c",
  "#4a90e2",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#e91e63",
];

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
const needsUpload = (uri: string) => uri.startsWith("file://") || uri.startsWith("blob:");
// ===== ここまでWeb版専用 =====

export default function ProfileEditScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [originalHandle, setOriginalHandle] = useState("");
  const [usernameColor, setUsernameColor] = useState("#222222");
  const [bio, setBio] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthDate, setBirthDate] = useState(new Date(2000, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);
  const [snsLinks, setSnsLinks] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [handleError, setHandleError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const docSnap = await getDoc(doc(db, "users", uid));
      if (docSnap.exists()) {
        const data: DocumentData = docSnap.data();
        setDisplayName(data.username || "");
        setHandle(data.handle || "");
        setOriginalHandle(data.handle || "");
        setUsernameColor(data.usernameColor || "#222222");
        setBio(data.bio || "");
        setPhoneNumber(data.phoneNumber || "");
        setGender(data.gender || null);
        setSnsLinks(data.snsLinks || {});
        setPhotoUrl(data.photoUrl || null);
        setIsPrivate(data.isPrivate || false);
        if (data.birthDate) {
          setBirthDate(new Date(data.birthDate));
        }
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const validateHandle = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9_.]/g, "");
    setHandle(cleaned);
    setHandleError("");
  };

  const pickPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert(t("profileEdit.photoPermission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) {
      setPhotoUrl(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (handle.trim().length < 3) {
      setHandleError(t("profileEdit.handleTooShort"));
      return;
    }

    setSaving(true);

    try {
      const normalizedHandle = handle.trim().toLowerCase();

      if (normalizedHandle !== originalHandle) {
        const q = query(collection(db, "users"), where("handle", "==", normalizedHandle));
        const snapshot = await getDocs(q);
        const isTaken = snapshot.docs.some((docSnap) => docSnap.id !== uid);
        if (isTaken) {
          setHandleError(t("profileEdit.handleTaken"));
          setSaving(false);
          return;
        }
      }

      let finalPhotoUrl = photoUrl;

      // ===== ここからWeb版専用（blob:のURLも、アップロード対象に含める） =====
      if (photoUrl && needsUpload(photoUrl)) {
      // ===== ここまでWeb版専用 =====
        const response = await fetch(photoUrl);
        const blob = await response.blob();
        const fileName = `profilePhotos/${uid}_${Date.now()}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        finalPhotoUrl = await getDownloadURL(storageRef);
      }

      await setDoc(
        doc(db, "users", uid),
        {
          username: displayName.trim(),
          handle: normalizedHandle,
          usernameColor: usernameColor,
          bio: bio.trim(),
          phoneNumber: phoneNumber.trim(),
          birthDate: birthDate.toISOString(),
          gender: gender,
          snsLinks: snsLinks,
          photoUrl: finalPhotoUrl,
          isPrivate: isPrivate,
        },
        { merge: true }
      );

      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return null;
  }

  const content = (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>{t("profileEdit.cancelButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("profileEdit.headerTitle")}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={styles.saveText}>
              {saving ? t("profileEdit.saving") : t("profileEdit.saveButton")}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <TouchableOpacity style={styles.photoSection} onPress={pickPhoto}>
            <StampFrame size={90} imageUri={photoUrl} borderColor="#888" frameThickness={2} />
            <Text style={styles.photoChangeText}>{t("profileEdit.photoChange")}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>{t("profileEdit.displayNameLabel")}</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <Text style={styles.label}>{t("profileEdit.handleLabel")}</Text>
          <View style={styles.handleInputWrapper}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              value={handle}
              onChangeText={validateHandle}
              style={styles.handleInput}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
          {handleError ? <Text style={styles.errorText}>{handleError}</Text> : null}

          <Text style={styles.label}>{t("profileEdit.colorLabel")}</Text>
          <View style={styles.colorRow}>
            {USERNAME_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  usernameColor === color && styles.colorSwatchSelected,
                ]}
                onPress={() => setUsernameColor(color)}
              />
            ))}
          </View>

          <Text style={styles.label}>{t("profileEdit.bioLabel")}</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            style={[styles.input, styles.bioInput]}
            multiline
            placeholder={t("profileEdit.bioPlaceholder")}
          />

          <View style={styles.privateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.privateLabel}>{t("profileEdit.privateLabel")}</Text>
              <Text style={styles.privateHint}>{t("profileEdit.privateHint")}</Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: "#ddd", true: "#4a90e2" }}
            />
          </View>

          <Text style={styles.label}>{t("profileEdit.phoneLabel")}</Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            style={styles.input}
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <Text style={styles.label}>{t("profileEdit.birthDateLabel")}</Text>
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
                  <Text style={styles.datePickerDoneText}>{t("profileEdit.datePickerDone")}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.label}>{t("profileEdit.genderLabel")}</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={[styles.genderButton, gender === "male" && styles.genderButtonActive]}
              onPress={() => setGender("male")}
            >
              <Text style={gender === "male" ? styles.genderTextActive : styles.genderText}>
                {t("profileEdit.genderMale")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, gender === "female" && styles.genderButtonActive]}
              onPress={() => setGender("female")}
            >
              <Text style={gender === "female" ? styles.genderTextActive : styles.genderText}>
                {t("profileEdit.genderFemale")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, gender === "other" && styles.genderButtonActive]}
              onPress={() => setGender("other")}
            >
              <Text style={gender === "other" ? styles.genderTextActive : styles.genderText}>
                {t("profileEdit.genderOther")}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{t("profileEdit.snsLabel")}</Text>
          {SNS_LIST.map((sns) => (
            <View key={sns.key} style={styles.snsInputRow}>
              <Text style={styles.snsInputLabel}>{sns.label}</Text>
              <TextInput
                value={snsLinks[sns.key] || ""}
                onChangeText={(text) => setSnsLinks({ ...snsLinks, [sns.key]: text })}
                style={styles.snsInput}
                placeholder={t("profileEdit.snsUrlPlaceholder")}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
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
  },
  // ===== ここからWeb版専用 =====
  pageWrapper: Platform.select({
    web: {
      flex: 1,
      width: "100%",
      maxWidth: 630,
      alignSelf: "center",
    },
    default: {
      flex: 1,
    },
  }),
  // ===== ここまでWeb版専用 =====
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelText: {
    color: "#999",
    fontSize: 14,
  },
  saveText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 10,
  },
  photoChangeText: {
    color: "#4a90e2",
    fontSize: 13,
    marginTop: 8,
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
  errorText: {
    fontSize: 12,
    color: "#e74c3c",
    marginTop: 4,
  },
  colorRow: {
    flexDirection: "row",
    gap: 12,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchSelected: {
    borderColor: "#000",
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  privateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  privateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    marginBottom: 4,
  },
  privateHint: {
    fontSize: 11,
    color: "#999",
    paddingRight: 10,
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
  snsInputRow: {
    marginBottom: 10,
  },
  snsInputLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  snsInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fafafa",
    fontSize: 13,
  },
});