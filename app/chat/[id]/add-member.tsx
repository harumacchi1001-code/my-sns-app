import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayUnion, collection, doc, DocumentData, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../../firebaseConfig";

type UserItem = DocumentData & { id: string };

export default function AddMemberScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<DocumentData | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "chats", id), (docSnap) => {
      if (docSnap.exists()) {
        setChat(docSnap.data());
      }
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const data = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((u) => u.id !== auth.currentUser?.uid) as UserItem[];
      setUsers(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const existingParticipants: string[] = chat?.participants || [];

  const availableUsers = users.filter((u) => !existingParticipants.includes(u.email));

  const filteredUsers = availableUsers.filter((u) =>
    (u.username || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const toggleSelect = (email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const handleAddMembers = async () => {
    if (selectedEmails.length === 0 || !id) return;
    setAdding(true);

    await updateDoc(doc(db, "chats", id), {
      participants: arrayUnion(...selectedEmails),
    });

    setAdding(false);
    router.back();
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
            <Text style={styles.cancelText}>{t("addMember.cancelButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("addMember.headerTitle")}</Text>
          <TouchableOpacity onPress={handleAddMembers} disabled={selectedEmails.length === 0 || adding}>
            {adding ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={[styles.addText, selectedEmails.length === 0 && styles.disabledText]}>
                {t("addMember.addButton")}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TextInput
          placeholder={t("addMember.searchPlaceholder")}
          value={searchText}
          onChangeText={setSearchText}
          style={styles.searchInput}
          autoCapitalize="none"
        />

        {selectedEmails.length > 0 && (
          <Text style={styles.selectedCount}>{selectedEmails.length}{t("addMember.selectedCount")}</Text>
        )}

        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedEmails.includes(item.email);
            return (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => toggleSelect(item.email)}
              >
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>👤</Text>
                  </View>
                )}
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
  addText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledText: {
    color: "#ccc",
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
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: "#f0f0f0",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderText: {
    fontSize: 18,
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