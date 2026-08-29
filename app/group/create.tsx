import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, arrayUnion, collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useState } from "react";
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
import { GENRE_TEMPLATES } from "../../constants/postTemplates";
import { auth, db, storage } from "../../firebaseConfig";
const isWeb = Platform.OS === "web";
export default function GroupCreateScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genreId, setGenreId] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const handleCreate = async () => {
    if (!name.trim()) {
      alert("グループ名を、入力してください");
      return;
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
        const fileName = `groupIcons/${myUid}_${Date.now()}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        iconUrl = await getDownloadURL(storageRef);
      }
      const groupRef = await addDoc(collection(db, "groups"), {
        name: name.trim(),
        description: description.trim(),
        genreId: genreId || null,
        iconUrl,
        isPublic,
        requireApproval,
        ownerEmail: myEmail,
        memberCount: 1,
        createdAt: serverTimestamp(),
      });
      // ===== 作成者を、自動的に、オーナーとして、メンバーに追加する =====
      await setDoc(doc(db, "groups", groupRef.id, "members", myUid), {
        email: myEmail,
        role: "owner",
        joinedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", myUid), { joinedGroupIds: arrayUnion(groupRef.id) });
      setSaving(false);
      router.replace({ pathname: "/group/[id]", params: { id: groupRef.id } });
    } catch (error: any) {
      setSaving(false);
      alert("作成に失敗しました：" + error.message);
    }
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>グループを作成</Text>
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
          <Text style={styles.fieldLabel}>グループ名</Text>
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
            placeholder="どんな、グループか、簡単に、説明してください"
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
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>公開グループにする</Text>
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
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.createButtonText}>グループを作成する</Text>
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
  createButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});