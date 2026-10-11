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
import {
  accentColor,
  isWeb,
  pick,
  textFaint,
  textMain,
  webGlassBox,
  webScreenBackground,
  webSoftButton,
} from "../components/glass";
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
        <ActivityIndicator size="large" color={pick("#ffffff", undefined as any)} />
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
          contentContainerStyle={styles.listContent}
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
    // ===== Web版：暗いオーロラ風の背景 =====
    ...webScreenBackground,
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
    color: textFaint,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: pick(0, 0.5),
    borderBottomColor: "#eee",
  },
  backText: {
    color: accentColor,
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: textMain,
  },
  // ===== Web版：リクエストのカードを、少し内側に寄せて、間をあける =====
  listContent: isWeb ? { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 20 } : {},
  // ===== リクエスト1件：Web版はガラスのカード、スマホは今までの下線 =====
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
    ...(isWeb
      ? ({
          ...webGlassBox,
          borderRadius: 20,
          marginBottom: 10,
        } as any)
      : {}),
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
    backgroundColor: pick("rgba(255,255,255,0.1)", "#f0f0f0"),
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: pick("rgba(255,255,255,0.1)", "#eee"),
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderText: {
    fontSize: 18,
  },
  username: {
    fontSize: 15,
    fontWeight: "500",
    color: textMain,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  // 承認ボタン：Web版は丸い青紫のガラス
  approveButton: {
    backgroundColor: "#4a90e2",
    borderRadius: pick(16, 6),
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...(isWeb
      ? ({
          backgroundColor: "rgba(110,140,255,0.55)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.25)",
          boxShadow: "0 3px 10px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.3)",
        } as any)
      : {}),
  },
  approveButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // 拒否ボタン：Web版は薄いガラスの丸いボタン
  declineButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: pick(16, 6),
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...(isWeb ? ({ ...webSoftButton } as any) : {}),
  },
  declineButtonText: {
    color: pick("rgba(255,255,255,0.8)", "#666"),
    fontSize: 12,
    fontWeight: "600",
  },
});