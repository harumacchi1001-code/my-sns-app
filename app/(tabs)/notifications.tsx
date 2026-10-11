import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { collection, doc, DocumentData, getDocs, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../../components/StampFrame";
import {
  isWeb,
  pick,
  textFaint,
  textMain,
  webGlassBox,
  webScreenBackground,
} from "../../components/glass";
import { auth, db } from "../../firebaseConfig";

type Notification = DocumentData & { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // ===== 送信者のユーザー情報・ストーリー関連の状態 =====
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [stories, setStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;

    const q = query(
      collection(db, "notifications"),
      where("toUserEmail", "==", myEmail),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Notification[];
      setNotifications(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ===== ユーザー情報・ストーリー一覧を取得 =====
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, DocumentData> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email) {
          map[data.email] = { id: docSnap.id, ...data };
        }
      });
      setUserMap(map);
    });

    const unsubscribeStories = onSnapshot(collection(db, "stories"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setStories(data);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeStories();
    };
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

  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return "";
    const date = timestamp.toDate();
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getMessage = (notification: Notification) => {
    const name = notification.fromUsername || notification.fromUserEmail;
    if (notification.type === "like") {
      return `${name}${t("notifications.likeMessage")}`;
    }
    if (notification.type === "comment") {
      return `${name}${t("notifications.commentMessage")}`;
    }
    if (notification.type === "follow") {
      return `${name}${t("notifications.followMessage")}`;
    }
        if (notification.type === "follow_request") {
      return `${name}${t("notifications.followRequestMessage")}`;
    }
    if (notification.type === "nookApproved") {
      return `「${notification.nookName}」への参加が承認されました`;
    }
    if (notification.type === "nookNewPost") {
      return `${name}が「${notification.nookName}」に投稿しました`;
    }
    return "";
  };

    const getIconName = (type: string) => {
    if (type === "like") return "favorite";
    if (type === "comment") return "chat-bubble-outline";
    if (type === "follow_request") return "person-add";
    if (type === "nookApproved" || type === "nookNewPost") return "groups";
    return "person";
  };

  const getIconColor = (type: string) => {
    if (type === "like") return pick("#ff7a7a", "#e74c3c");
    return pick("rgba(255,255,255,0.8)", "#666");
  };

  const handlePress = async (notification: Notification) => {
    if (!notification.read) {
      await updateDoc(doc(db, "notifications", notification.id), { read: true });
    }

    if (notification.type === "follow_request") {
      router.push("/follow-requests");
      return;
    }

    if (notification.type === "follow") {
      if (!notification.fromUserEmail) return;
      const q = query(
        collection(db, "users"),
        where("email", "==", notification.fromUserEmail)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const userId = snapshot.docs[0].id;
        router.push({ pathname: "/user/[id]", params: { id: userId } });
      }
      return;
    }

    if (notification.type === "nookNewPost" && notification.postId) {
      router.push({ pathname: "/post/[id]", params: { id: notification.postId } });
      return;
    }

    if (notification.type === "nookApproved" && notification.nookId) {
      router.push({ pathname: "/nook/[id]", params: { id: notification.nookId } });
      return;
    }

    if (notification.postId) {
      router.push({ pathname: "/post/[id]", params: { id: notification.postId } });
    }
  };

  // ===== 送信者アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAvatarPress = async (notification: Notification, event: any) => {
    event.stopPropagation();
    const sender = userMap[notification.fromUserEmail];
    if (!sender?.id) return;
    const senderStories = getUserStories(sender.id);
    if (senderStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: sender.id } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: sender.id } });
    }
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
        <Text style={styles.header}>{t("notifications.title")}</Text>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("notifications.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const sender = userMap[item.fromUserEmail];
            const senderStories = sender?.id ? getUserStories(sender.id) : [];
            const hasUnread = senderStories.some((s) => !(s.viewedBy || []).includes(myUid));

            return (
              <TouchableOpacity
                style={[styles.notificationItem, !item.read && styles.unreadItem]}
                onPress={() => handlePress(item)}
              >
                <TouchableOpacity
                  style={styles.avatarWrapper}
                  onPress={(event) => handleAvatarPress(item, event)}
                >
                  <StampFrame
                    size={40}
                    imageUri={sender?.photoUrl || null}
                    borderColor="#888"
                    frameThickness={senderStories.length > 0 && hasUnread ? 3 : 1.5}
                    gradientColors={
                      senderStories.length > 0 && hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
                    }
                    notchesPerSide={4}
                    notchRadius={2}
                  />
                  <View style={styles.typeIconBadge}>
                    <MaterialIcons
                      name={getIconName(item.type)}
                      size={12}
                      color={getIconColor(item.type)}
                    />
                  </View>
                </TouchableOpacity>

                <View style={styles.textContainer}>
                  <Text style={styles.message}>{getMessage(item)}</Text>
                  <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
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
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: textMain,
  },
  // ===== Web版：通知のカードを、少し内側に寄せて、間をあける =====
  listContent: isWeb
    ? { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 20 }
    : {},
  // ===== 通知の1件：Web版はガラスのカード、スマホは今までの下線 =====
  notificationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    gap: 12,
    ...(isWeb
      ? ({
          ...webGlassBox,
          borderRadius: 20,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.12)",
          marginBottom: 10,
          transition: "all 0.18s ease",
        } as any)
      : {}),
  },
  // ===== 未読：Web版は、青みがかった明るいガラスにする =====
  unreadItem: {
    backgroundColor: pick("rgba(157,180,255,0.14)", "#f0f7ff"),
    ...(isWeb
      ? ({
          borderColor: "rgba(157,180,255,0.4)",
          borderBottomColor: "rgba(157,180,255,0.4)",
        } as any)
      : {}),
  },
  avatarWrapper: {
    position: "relative",
  },
  typeIconBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: pick("#1a1d33", "#fff"),
    borderWidth: 1,
    borderColor: pick("rgba(255,255,255,0.2)", "#eee"),
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: 14,
    color: textMain,
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    color: textFaint,
  },
});