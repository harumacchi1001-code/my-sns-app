import { useRouter } from "expo-router";
import { arrayRemove, collection, collectionGroup, deleteDoc, doc, DocumentData, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";
type Chat = DocumentData & { id: string };
const DAY_MS = 24 * 60 * 60 * 1000;
export default function ChatListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  // ===== 「すべて／個人／グループ」の、タブの選択状態 =====
  const [activeChatTab, setActiveChatTab] = useState<"all" | "individual" | "group">("all");
  // ===== 削除・退会メニューの、対象チャット（Modalで表示） =====
  const [menuTargetChat, setMenuTargetChat] = useState<Chat | null>(null);
  // ===== Web版専用：ポップアップの表示位置 =====
  const [menuPosition, setMenuPosition] = useState({ top: 100, left: 100 });
  const isWeb = Platform.OS === "web";
  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);
  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", myEmail),
      orderBy("lastMessageAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Chat[];
      setChats(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail || chats.length === 0) {
      setUnreadCounts({});
      return;
    }
    const myChatIds = chats.map((c) => c.id);
    const q = query(collectionGroup(db, "messages"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((docSnap) => {
        const chatId = docSnap.ref.parent.parent?.id;
        if (!chatId || !myChatIds.includes(chatId)) return;
        const data = docSnap.data();
        const readBy: string[] = data.readBy || [];
        if (data.senderEmail !== myEmail && !readBy.includes(myEmail)) {
          counts[chatId] = (counts[chatId] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
    });
    return unsubscribe;
  }, [chats]);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, DocumentData> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email) {
          map[data.email] = { id: docSnap.id, ...data };
        }
      });
      setUserMap(map);
    });
    return unsubscribe;
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
  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAvatarPress = (userId: string | undefined) => {
    if (!userId) return;
    const userStories = getUserStories(userId);
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: userId } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: userId } });
    }
  };
  const getChatDisplayInfo = (chat: Chat) => {
    const myEmail = auth.currentUser?.email;
    if (chat.isGroup) {
      return {
        name: chat.groupName || t("chatList.group"),
        photoUrl: null,
        userId: undefined as string | undefined,
      };
    }
    const otherEmail = chat.participants.find((p: string) => p !== myEmail);
    const otherUser = userMap[otherEmail];
    return {
      name: otherUser?.username || otherEmail || t("chatList.unknownUser"),
      photoUrl: otherUser?.photoUrl || null,
      userId: otherUser?.id as string | undefined,
    };
  };
  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return "";
    const date = timestamp.toDate();
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  const handleDeleteChat = async (chatId: string) => {
    await deleteDoc(doc(db, "chats", chatId));
  };
  const handleLeaveChat = async (chatId: string) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    await updateDoc(doc(db, "chats", chatId), {
      participants: arrayRemove(myEmail),
    });
  };
  // ===== 選択中のタブに応じて、会話を絞り込む =====
  const filteredChats = chats.filter((chat) => {
    if (activeChatTab === "individual") return !chat.isGroup;
    if (activeChatTab === "group") return !!chat.isGroup;
    return true;
  });
  // ===== 三本線・長押しどちらでも、メニューを開く =====
  const openChatMenu = (chat: Chat, event?: any) => {
    if (isWeb && event) {
      const pageX = event?.nativeEvent?.pageX ?? 100;
      const pageY = event?.nativeEvent?.pageY ?? 100;
      setMenuPosition({ top: pageY + 10, left: pageX - 180 });
    }
    setMenuTargetChat(chat);
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
            <Text style={styles.backText}>{t("chatDetail.backButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("chatList.headerTitle")}</Text>
          <TouchableOpacity onPress={() => router.push("/chat/new")}>
            <Text style={styles.newChatText}>{t("chatList.newChat")}</Text>
          </TouchableOpacity>
        </View>
        {/* ===== 「すべて／個人／グループ」の、タブ ===== */}
        <View style={styles.chatTabRow}>
          <TouchableOpacity
            style={[styles.chatTabButton, activeChatTab === "all" && styles.chatTabButtonActive]}
            onPress={() => setActiveChatTab("all")}
          >
            <Text style={activeChatTab === "all" ? styles.chatTabTextActive : styles.chatTabText}>
              すべて
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chatTabButton, activeChatTab === "individual" && styles.chatTabButtonActive]}
            onPress={() => setActiveChatTab("individual")}
          >
            <Text style={activeChatTab === "individual" ? styles.chatTabTextActive : styles.chatTabText}>
              個人チャット
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chatTabButton, activeChatTab === "group" && styles.chatTabButtonActive]}
            onPress={() => setActiveChatTab("group")}
          >
            <Text style={activeChatTab === "group" ? styles.chatTabTextActive : styles.chatTabText}>
              グループチャット
            </Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("chatList.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const info = getChatDisplayInfo(item);
            const unreadCount = unreadCounts[item.id] || 0;
            const userStories = info.userId ? getUserStories(info.userId) : [];
            const hasUnread = userStories.some((s) => !(s.viewedBy || []).includes(myUid));
            return (
              <TouchableOpacity
                style={styles.chatRow}
                onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
                onLongPress={() => openChatMenu(item)}
              >
                {item.isGroup ? (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>👥</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => handleAvatarPress(info.userId)}>
                    <StampFrame
                      size={50}
                      imageUri={info.photoUrl}
                      borderColor="#888"
                      frameThickness={userStories.length > 0 && hasUnread ? 3 : 1.5}
                      gradientColors={
                        userStories.length > 0 && hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
                      }
                      notchesPerSide={5}
                      notchRadius={2.5}
                    />
                  </TouchableOpacity>
                )}
                <View style={styles.chatInfo}>
                  <Text style={[styles.chatName, unreadCount > 0 && styles.chatNameUnread]}>
                    {info.name}
                  </Text>
                  <Text
                    style={[styles.lastMessage, unreadCount > 0 && styles.lastMessageUnread]}
                    numberOfLines={1}
                  >
                    {item.lastMessage || t("chatList.noMessage")}
                  </Text>
                </View>
                <View style={styles.rightColumn}>
                  <Text style={styles.chatDate}>{formatDate(item.lastMessageAt)}</Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.chatMenuButton}
                  onPress={(event) => openChatMenu(item, event)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.chatMenuIcon}>≡</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      </View>
      {/* ===== 削除・退会・キャンセルの、自作メニュー（Web版はポップアップ、アプリ版はシート） ===== */}
      <Modal
        visible={!!menuTargetChat}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuTargetChat(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuTargetChat(null)}>
          <View style={isWeb ? styles.chatActionOverlayWeb : styles.chatActionOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={
                  isWeb
                    ? [styles.chatActionPopup, { top: menuPosition.top, left: menuPosition.left }]
                    : styles.chatActionSheet
                }
              >
                <TouchableOpacity
                  style={isWeb ? styles.chatActionItemWeb : styles.chatActionItem}
                  onPress={() => {
                    if (menuTargetChat) handleDeleteChat(menuTargetChat.id);
                    setMenuTargetChat(null);
                  }}
                >
                  <Text style={styles.chatActionTextDanger}>{t("chatList.deleteOption")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={isWeb ? styles.chatActionItemWeb : styles.chatActionItem}
                  onPress={() => {
                    if (menuTargetChat) handleLeaveChat(menuTargetChat.id);
                    setMenuTargetChat(null);
                  }}
                >
                  <Text style={styles.chatActionText}>{t("chatList.leaveOption")}</Text>
                </TouchableOpacity>
                {!isWeb && (
                  <TouchableOpacity style={styles.chatActionCancel} onPress={() => setMenuTargetChat(null)}>
                    <Text style={styles.chatActionCancelText}>{t("chatList.cancelOption")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    fontSize: 17,
    fontWeight: "700",
  },
  newChatText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  // ===== 「すべて／個人／グループ」の、タブのスタイル =====
  chatTabRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  chatTabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  chatTabButtonActive: {
    borderBottomColor: "#222",
  },
  chatTabText: {
    fontSize: 13,
    color: "#999",
  },
  chatTabTextActive: {
    fontSize: 13,
    color: "#222",
    fontWeight: "600",
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
    gap: 12,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderText: {
    fontSize: 22,
  },
  chatInfo: {
    flex: 1,
  },
  chatName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  chatNameUnread: {
    fontWeight: "700",
  },
  lastMessage: {
    fontSize: 13,
    color: "#999",
  },
  lastMessageUnread: {
    color: "#222",
    fontWeight: "600",
  },
  rightColumn: {
    alignItems: "flex-end",
    gap: 6,
  },
  chatDate: {
    fontSize: 12,
    color: "#bbb",
  },
  unreadBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  chatMenuButton: {
    paddingLeft: 8,
  },
  chatMenuIcon: {
    fontSize: 18,
    color: "#999",
  },
  // ===== 削除・退会メニュー（アプリ版：Modal下シート）のスタイル =====
  chatActionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  chatActionSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  chatActionItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    alignItems: "center",
  },
  chatActionText: {
    fontSize: 15,
    color: "#333",
  },
  chatActionTextDanger: {
    fontSize: 15,
    color: "#e74c3c",
  },
  chatActionCancel: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  chatActionCancelText: {
    fontSize: 15,
    color: "#999",
    fontWeight: "600",
  },
  // ===== Web版専用：ポップアップ形式のスタイル =====
  chatActionOverlayWeb: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  chatActionPopup: {
    position: "absolute",
    width: 180,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  chatActionItemWeb: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});