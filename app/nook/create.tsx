import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebSidebar from "../../components/WebSidebar";
import { GENRE_TEMPLATES } from "../../constants/postTemplates";
import { auth, db, storage } from "../../firebaseConfig";
const isWeb = Platform.OS === "web";
const MEMBER_LIMIT_OPTIONS = [10, 30, 50, 100, 150, 200, 300, 400, 500];
// ===== 1アカウントが、作成できる、Nookの、上限数（将来的に、課金・ランクで、変える、余地を、持たせる） =====
const MAX_NOOKS_PER_ACCOUNT = 3;
export default function NookCreateScreen() {
  const router = useRouter();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genreId, setGenreId] = useState<string | null>(null);
  const [customGenre, setCustomGenre] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  // ===== 定員（デフォルトは30人）。「その他」を選ぶと、自由入力になる =====
  const [memberLimit, setMemberLimit] = useState<number>(30);
  const [isCustomLimit, setIsCustomLimit] = useState(false);
  const [customLimitText, setCustomLimitText] = useState("");
  const [saving, setSaving] = useState(false);
  // ===== 自分が、すでに、作成している（オーナーの）、Nookの、数 =====
  const [ownedNookCount, setOwnedNookCount] = useState<number | null>(null);
  useEffect(() => {
    const checkOwnedCount = async () => {
      const myEmail = auth.currentUser?.email;
      if (!myEmail) return;
      const q = query(collection(db, "nooks"), where("ownerEmail", "==", myEmail));
      const snapshot = await getDocs(q);
      setOwnedNookCount(snapshot.size);
    };
    checkOwnedCount();
  }, []);
  const pickIcon = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      setIcon(result.assets[0].uri);
    }
  };
  const hasReachedLimit = ownedNookCount !== null && ownedNookCount >= MAX_NOOKS_PER_ACCOUNT;
  const handleCreate = async () => {
    if (hasReachedLimit) {
      alert(`作成できるNookは、1アカウントにつき${MAX_NOOKS_PER_ACCOUNT}個までです`);
      return;
    }
    if (!name.trim()) {
      alert("Nook名を、入力してください");
      return;
    }
    if (genreId === "other" && !customGenre.trim()) {
      alert("ジャンルを、入力してください");
      return;
    }
    let finalMemberLimit = memberLimit;
    if (isCustomLimit) {
      const parsed = parseInt(customLimitText, 10);
      if (!parsed || parsed < 1 || parsed > 500) {
        alert("定員は、1〜500の、範囲で、入力してください");
        return;
      }
      finalMemberLimit = parsed;
    }
    const myEmail = auth.currentUser?.email;
    const myUid = auth.currentUser?.uid;
    if (!myEmail || !myUid) return;
    setSaving(true);
    try {
      let iconUrl: string | null = null;
      if (icon) {
        const response = await fetch(icon);
        const blob = await response.blob();
        const fileName = `nookIcons/${myUid}_${Date.now()}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        iconUrl = await getDownloadURL(storageRef);
      }
      const nookRef = await addDoc(collection(db, "nooks"), {
        name: name.trim(),
        description: description.trim(),
        genreId: genreId || null,
        customGenre: genreId === "other" ? customGenre.trim() : null,
        iconUrl,
        isPublic,
        requireApproval,
        memberLimit: finalMemberLimit,
        ownerEmail: myEmail,
        memberCount: 1,
        createdAt: serverTimestamp(),
      });
      // ===== 作成者を、自動的に、オーナーとして、メンバーに追加する =====
      await setDoc(doc(db, "nooks", nookRef.id, "members", myUid), {
        email: myEmail,
        role: "owner",
        joinedAt: serverTimestamp(),
      });
      setSaving(false);
      router.replace({ pathname: "/nook/[id]", params: { id: nookRef.id } });
    } catch (error: any) {
      setSaving(false);
      alert("作成に失敗しました：" + error.message);
    }
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isWeb && <WebSidebar onExpandChange={setIsSidebarExpanded} />}
      <View style={[styles.pageWrapper, isWeb && { paddingLeft: isSidebarExpanded ? 200 : 64 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nookを作成</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.iconPicker} onPress={pickIcon}>
            {icon ? (
              <Image source={{ uri: icon }} style={styles.iconImage} />
            ) : (
              <MaterialIcons name="add-a-photo" size={28} color="#bbb" />
            )}
          </TouchableOpacity>
          <Text style={styles.fieldLabel}>Nook名</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="例：筋トレ日記"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>説明文</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="どんな、Nookか、簡単に、説明してください"
            style={[styles.input, styles.textarea]}
            multiline
          />
          <Text style={styles.fieldLabel}>ジャンル（任意）</Text>
          <View style={styles.genreRow}>
            <TouchableOpacity
              style={[styles.genreChip, !genreId && styles.genreChipActive]}
              onPress={() => setGenreId(null)}
            >
              <Text style={!genreId ? styles.genreChipTextActive : styles.genreChipText}>なし</Text>
            </TouchableOpacity>
            {GENRE_TEMPLATES.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.genreChip, genreId === g.id && styles.genreChipActive]}
                onPress={() => setGenreId(g.id)}
              >
                <Text style={genreId === g.id ? styles.genreChipTextActive : styles.genreChipText}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.genreChip, styles.genreChipOther, genreId === "other" && styles.genreChipActive]}
              onPress={() => setGenreId("other")}
            >
              <Text style={genreId === "other" ? styles.genreChipTextActive : styles.genreChipText}>
                + その他
              </Text>
            </TouchableOpacity>
          </View>
          {genreId === "other" && (
            <TextInput
              value={customGenre}
              onChangeText={setCustomGenre}
              placeholder="ジャンルを、自由に、入力（例：ボードゲーム）"
              style={[styles.input, { marginTop: 8 }]}
            />
          )}
          <Text style={styles.fieldLabel}>定員</Text>
          {isWeb ? (
            <select
              value={isCustomLimit ? "other" : String(memberLimit)}
              onChange={(e: any) => {
                const val = e.target.value;
                if (val === "other") {
                  setIsCustomLimit(true);
                } else {
                  setIsCustomLimit(false);
                  setMemberLimit(Number(val));
                }
              }}
              style={{
                width: 160,
                height: 38,
                borderRadius: 8,
                border: "1px solid #ddd",
                paddingLeft: 10,
                fontSize: 14,
              }}
            >
              {MEMBER_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}人まで
                </option>
              ))}
              <option value="other">その他（自由入力）</option>
            </select>
          ) : (
            <View style={styles.genreRow}>
              {MEMBER_LIMIT_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.genreChip, !isCustomLimit && memberLimit === n && styles.genreChipActive]}
                  onPress={() => {
                    setIsCustomLimit(false);
                    setMemberLimit(n);
                  }}
                >
                  <Text style={!isCustomLimit && memberLimit === n ? styles.genreChipTextActive : styles.genreChipText}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.genreChip, styles.genreChipOther, isCustomLimit && styles.genreChipActive]}
                onPress={() => setIsCustomLimit(true)}
              >
                <Text style={isCustomLimit ? styles.genreChipTextActive : styles.genreChipText}>その他</Text>
              </TouchableOpacity>
            </View>
          )}
          {isCustomLimit && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <TextInput
                value={customLimitText}
                onChangeText={setCustomLimitText}
                placeholder="1〜500"
                keyboardType="numeric"
                style={[styles.input, { width: 100 }]}
              />
              <Text style={{ fontSize: 13, color: "#666" }}>人まで</Text>
            </View>
          )}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>公開Nookにする</Text>
              <Text style={styles.switchHint}>オフにすると、検索や、一覧に、表示されません</Text>
            </View>
            <Switch value={isPublic} onValueChange={setIsPublic} />
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>参加を、承認制にする</Text>
              <Text style={styles.switchHint}>オンにすると、参加には、管理者の、承認が、必要です</Text>
            </View>
            <Switch value={requireApproval} onValueChange={setRequireApproval} />
          </View>
          {ownedNookCount !== null && (
            <View style={styles.limitNoticeBox}>
              <MaterialIcons name="info-outline" size={18} color="#666" />
              <Text style={styles.limitNoticeText}>
                作成できるNookは、1アカウントにつき{MAX_NOOKS_PER_ACCOUNT}個までです（残り {Math.max(0, MAX_NOOKS_PER_ACCOUNT - ownedNookCount)}個）
              </Text>
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.createButton, hasReachedLimit && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={saving || hasReachedLimit}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.createButtonText}>
                {hasReachedLimit ? "作成の上限に達しています" : "Nookを作成する"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  iconPicker: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#f7f7f7",
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
    overflow: "hidden",
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  genreChipOther: {
    borderStyle: "dashed",
  },
  genreChipActive: {
    backgroundColor: "#222",
    borderColor: "#222",
  },
  genreChipText: {
    fontSize: 12,
    color: "#333",
  },
  genreChipTextActive: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    marginTop: 10,
    gap: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  switchHint: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  limitNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f7f7f7",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  limitNoticeText: {
    flex: 1,
    fontSize: 12,
    color: "#666",
  },
  footer: {
    padding: 16,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
  },
  createButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  createButtonDisabled: {
    backgroundColor: "#ccc",
  },
  createButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});