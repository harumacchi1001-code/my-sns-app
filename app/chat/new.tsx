import { useRouter } from "expo-router";
import { addDoc, collection, doc, DocumentData, getDoc, getDocs, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";
type UserItem = DocumentData & { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export default function NewChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    const loadFollowingUsers = async () => {
      const myUid = auth.currentUser?.uid;
      if (!myUid) return;
      const myDoc = await getDoc(doc(db, "users", myUid));
      const followingIds: string[] = myDoc.exists() ? myDoc.data().following || [] : [];
      if (followingIds.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }
      const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
        const data = snapshot.docs
          .filter((docSnap) => followingIds.includes(docSnap.id))
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as UserItem[];
        setUsers(data);
        setLoading(false);
      });
      return unsubscribe;
    };
    loadFollowingUsers();
  }, []);

  // ===== ストーリー一覧を取得 =====
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "stories"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setStories(data);
    });
    return unsubscribe;
  }, []);

  // ===== 任意のユーザーIDから、24時間以内のストーリー一覧を取り出す =====
  const getUserStories = (userId: string) => {
    const now = Date.now();
    return stories.filter((s) => {
      if (s.authorId !== userId) return false;
      const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
      return now - createdMs < DAY_MS;
    });
  };

  const myUid = auth.currentUser?.uid;

  const filteredUsers = users.filter((u) =>
    (u.username || "").toLowerCase().includes(searchText.toLowerCase())
  );
  const isGroup = selectedEmails.length > 1;
  const toggleSelect = (email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };
  const handleCreateChat = async () => {
    if (selectedEmails.length === 0) return;
    setCreating(true);
    const myEmail = auth.currentUser?.email;
    try {
      if (!isGroup) {
        const otherEmail = selectedEmails[0];
        const q = query(
          collection(db, "chats"),
          where("participants", "array-contains", myEmail),
          where("isGroup", "==", false)
        );
        const snapshot = await getDocs(q);
        const existingChat = snapshot.docs.find((docSnap) => {
          const participants: string[] = docSnap.data().participants || [];
          return participants.includes(otherEmail) && participants.length === 2;
        });
        if (existingChat) {
          router.replace({ pathname: "/chat/[id]", params: { id: existingChat.id } });
          return;
        }
      }
      const participants = [myEmail, ...selectedEmails];
      const newChat = await addDoc(collection(db, "chats"), {
        participants,
        isGroup,
        groupName: isGroup ? (groupName.trim() || t("chatDetail.group")) : null,
        lastMessage: "",
        lastMessageAt: serverTimestamp(),
      });
      router.replace({ pathname: "/chat/[id]", params: { id: newChat.id } });
    } finally {
      setCreating(false);
    }
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>{t("chatNew.cancelButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("chatNew.headerTitle")}</Text>
          <TouchableOpacity onPress={handleCreateChat} disabled={selectedEmails.length === 0 || creating}>
            {creating ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={[styles.createText, selectedEmails.length === 0 && styles.disabledText]}>
                {t("chatNew.createButton")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {isGroup && (
          <TextInput
            placeholder={t("chatNew.groupNamePlaceholder")}
            value={groupName}
            onChangeText={setGroupName}
            style={styles.groupNameInput}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        )}
        <TextInput
          placeholder={t("chatNew.searchPlaceholder")}
          value={searchText}
          onChangeText={setSearchText}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {selectedEmails.length > 0 && (
          <Text style={styles.selectedCount}>{selectedEmails.length}{t("chatNew.selectedCount")}</Text>
        )}
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("chatNew.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selectedEmails.includes(item.email);
            const userStories = getUserStories(item.id);
            const hasUnread = userStories.some((s) => !(s.viewedBy || []).includes(myUid));

            return (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => toggleSelect(item.email)}
              >
                <StampFrame
                  size={44}
                  imageUri={item.photoUrl || null}
                  borderColor="#888"
                  frameThickness={userStories.length > 0 && hasUnread ? 3 : 1.5}
                  gradientColors={
                    userStories.length > 0 && hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
                  }
                  notchesPerSide={4}
                  notchRadius={2}
                />
                <Text style={styles.username}>{item.username || item.email}</Text>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </SafeAreaView>
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  cancelText: {
    color: "#999",
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  createText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledText: {
    color: "#ccc",
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#fafafa",
    fontWeight: "600",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: "#fafafa",
  },
  selectedCount: {
    fontSize: 12,
    color: "#4a90e2",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  username: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#4a90e2",
    borderColor: "#4a90e2",
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});