import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayRemove, collection, doc, DocumentData, onSnapshot, onSnapshot as onSnapshotUsers, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../../firebaseConfig";

export default function GroupInfoScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<DocumentData | null>(null);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "chats", id), (docSnap) => {
      if (docSnap.exists()) {
        setChat({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const unsubscribe = onSnapshotUsers(collection(db, "users"), (snapshot) => {
      const map: Record<string, DocumentData> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email) {
          map[data.email] = data;
        }
      });
      setUserMap(map);
    });
    return unsubscribe;
  }, []);

  const handleRemoveMember = async (email: string) => {
    if (!id) return;
    await updateDoc(doc(db, "chats", id), {
      participants: arrayRemove(email),
    });
  };

  if (loading || !chat) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const myEmail = auth.currentUser?.email;
  const participants: string[] = chat.participants || [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>{t("chatDetail.backButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("groupInfo.headerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.groupNameSection}>
          <Text style={styles.groupName}>{chat.groupName || t("groupInfo.group")}</Text>
          <Text style={styles.memberCount}>{participants.length}{t("groupInfo.memberCount")}</Text>
        </View>

        <TouchableOpacity
          style={styles.addMemberButton}
          onPress={() => router.push({ pathname: "/chat/[id]/add-member", params: { id: id as string } })}
        >
          <Text style={styles.addMemberButtonText}>{t("groupInfo.addMemberButton")}</Text>
        </TouchableOpacity>

        <FlatList
          data={participants}
          keyExtractor={(item) => item}
          renderItem={({ item: email }) => {
            const user = userMap[email];
            const isMyself = email === myEmail;
            return (
              <View style={styles.memberRow}>
                {user?.photoUrl ? (
                  <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>👤</Text>
                  </View>
                )}
                <Text style={styles.memberName}>
                  {user?.username || email}{isMyself ? t("groupInfo.you") : ""}
                </Text>
                {!isMyself && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveMember(email)}
                  >
                    <Text style={styles.removeButtonText}>{t("groupInfo.removeButton")}</Text>
                  </TouchableOpacity>
                )}
              </View>
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
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  groupNameSection: {
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  groupName: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  memberCount: {
    fontSize: 13,
    color: "#999",
  },
  addMemberButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  addMemberButtonText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#f0f0f0",
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderText: {
    fontSize: 16,
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  removeButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removeButtonText: {
    fontSize: 12,
    color: "#666",
  },
});