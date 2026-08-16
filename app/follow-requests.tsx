import { useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, doc, DocumentData, onSnapshot, updateDoc } from "firebase/firestore";
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
import { auth, db } from "../firebaseConfig";

type UserItem = DocumentData & { id: string };

export default function FollowRequestsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [myData, setMyData] = useState<DocumentData | null>(null);
  const [userMap, setUserMap] = useState<Record<string, UserItem>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;

    const unsubscribe = onSnapshot(doc(db, "users", myUid), (docSnap) => {
      if (docSnap.exists()) {
        setMyData(docSnap.data());
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, UserItem> = {};
      snapshot.docs.forEach((docSnap) => {
        map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setUserMap(map);
    });
    return unsubscribe;
  }, []);

  const requestIds: string[] = myData?.followRequests || [];
  const requesters = requestIds.map((uid) => userMap[uid]).filter(Boolean);

  const handleApprove = async (requesterUid: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;

    await updateDoc(doc(db, "users", myUid), {
      followRequests: arrayRemove(requesterUid),
      followers: arrayUnion(requesterUid),
    });
    await updateDoc(doc(db, "users", requesterUid), {
      following: arrayUnion(myUid),
    });
  };

  const handleDecline = async (requesterUid: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;

    await updateDoc(doc(db, "users", myUid), {
      followRequests: arrayRemove(requesterUid),
    });
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
            <Text style={styles.backText}>{t("followRequests.backButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("followRequests.headerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={requesters}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("followRequests.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.requestRow}>
              <TouchableOpacity
                style={styles.userInfo}
                onPress={() => router.push({ pathname: "/user/[id]", params: { id: item.id } })}
              >
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>👤</Text>
                  </View>
                )}
                <Text style={styles.username}>{item.username || item.handle}</Text>
              </TouchableOpacity>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.approveButton}
                  onPress={() => handleApprove(item.id)}
                >
                  <Text style={styles.approveButtonText}>{t("followRequests.approveButton")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={() => handleDecline(item.id)}
                >
                  <Text style={styles.declineButtonText}>{t("followRequests.declineButton")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
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
    fontSize: 15,
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  approveButton: {
    backgroundColor: "#4a90e2",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  approveButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  declineButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  declineButtonText: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
  },
});