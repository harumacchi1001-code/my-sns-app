// ===== ここからWeb版専用：右上に開く、メッセージのパネル（リキッドグラス風） =====
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
    addDoc,
    collection,
    collectionGroup,
    doc,
    DocumentData,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

type Props = {
  width: number; // パネルの幅（画面の幅に合わせて、呼び出し側で決める）
  onClose: () => void;
};

type Chat = DocumentData & { id: string };
type Message = DocumentData & { id: string };

// ===== 日時を、ミリ秒に直す（Timestamp・Date・数値のどれでも対応） =====
const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return 0;
};

// ===== 「たった今・◯分・◯時間・◯日・◯週間」の形にする =====
const formatAgo = (ms: number): string => {
  if (!ms) return "";
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日`;
  return `${Math.floor(days / 7)}週間`;
};

export default function ChatPanel({ width, onClose }: Props) {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  // 画面の高さに合わせる（最大560、上下に24ずつ余白）
  const panelHeight = Math.min(560, windowHeight - 48);

  const [myEmail, setMyEmail] = useState<string | null>(auth.currentUser?.email ?? null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  // ===== ログイン中のメールアドレス =====
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setMyEmail(user?.email ?? null));
    return unsubscribe;
  }, []);

  // ===== 自分が参加している会話の一覧（新しい順） =====
  useEffect(() => {
    if (!myEmail) return;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", myEmail),
      orderBy("lastMessageAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChats(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Chat[]);
      setLoadingList(false);
    });
    return unsubscribe;
  }, [myEmail]);

  // ===== 会話ごとの、未読メッセージ数 =====
  useEffect(() => {
    if (!myEmail || chats.length === 0) {
      setUnreadCounts({});
      return;
    }
    const myChatIds = chats.map((c) => c.id);
    const unsubscribe = onSnapshot(query(collectionGroup(db, "messages")), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const chatId = d.ref.parent.parent?.id;
        if (!chatId || !myChatIds.includes(chatId)) return;
        const data = d.data();
        const readBy: string[] = data.readBy || [];
        if (data.senderEmail !== myEmail && !readBy.includes(myEmail)) {
          counts[chatId] = (counts[chatId] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
    });
    return unsubscribe;
  }, [chats, myEmail]);

  // ===== 相手の名前・アイコン（メールアドレスから引く） =====
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, DocumentData> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.email) map[data.email] = { id: d.id, ...data };
      });
      setUserMap(map);
    });
    return unsubscribe;
  }, []);

  // ===== 開いている会話のメッセージ（古い順）＋届いた分を、既読にする =====
  useEffect(() => {
    if (!selectedChatId || !myEmail) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, "chats", selectedChatId, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Message[]);
      const batch = writeBatch(db);
      let hasUnread = false;
      snapshot.docs.forEach((d) => {
        const readBy: string[] = d.data().readBy || [];
        if (!readBy.includes(myEmail)) {
          hasUnread = true;
          batch.update(d.ref, { readBy: [...readBy, myEmail] });
        }
      });
      if (hasUnread) batch.commit().catch(() => {});
    });
    return unsubscribe;
  }, [selectedChatId, myEmail]);

  // ===== 新しいメッセージが来たら、いちばん下までスクロール =====
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, selectedChatId]);

  // ===== 会話の相手・表示名・アイコン =====
  const getOtherEmail = (chat: Chat): string | undefined =>
    (chat.participants || []).find((p: string) => p !== myEmail);
  const getChatTitle = (chat: Chat): string => {
    if (chat.isGroup) return chat.groupName || "グループ";
    const otherEmail = getOtherEmail(chat);
    return (otherEmail && userMap[otherEmail]?.username) || otherEmail || "ユーザー";
  };
  const getChatPhoto = (chat: Chat): string | null => {
    if (chat.isGroup) return null;
    const otherEmail = getOtherEmail(chat);
    return (otherEmail && userMap[otherEmail]?.photoUrl) || null;
  };

  const handleExpand = () => {
    onClose();
    router.push("/chat");
  };

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || !selectedChatId || !myEmail) return;
    setMessageText("");
    await addDoc(collection(db, "chats", selectedChatId, "messages"), {
      senderEmail: myEmail,
      text,
      readBy: [myEmail],
      createdAt: new Date(),
      replyTo: null,
    });
    await updateDoc(doc(db, "chats", selectedChatId), {
      lastMessage: text,
      lastMessageAt: new Date(),
    });
  };

  const renderAvatar = (chat: Chat, size: number) => {
    const photo = getChatPhoto(chat);
    if (photo) {
      return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <MaterialIcons name={chat.isGroup ? "groups" : "person"} size={size * 0.55} color="rgba(255,255,255,0.7)" />
      </View>
    );
  };

  const selectedChat = chats.find((c) => c.id === selectedChatId) || null;

  return (
    <View style={[styles.panel, { width, height: panelHeight }]}>
      {/* ===== ヘッダー：一覧のときは「メッセージ」、会話のときは相手の名前と戻るボタン ===== */}
      <View style={styles.header}>
        {selectedChat ? (
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.headerButton} onPress={() => setSelectedChatId(null)}>
              <MaterialIcons name="arrow-back-ios-new" size={18} color="#ffffff" />
            </TouchableOpacity>
            {renderAvatar(selectedChat, 32)}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {getChatTitle(selectedChat)}
            </Text>
          </View>
        ) : (
          <Text style={styles.title}>メッセージ</Text>
        )}
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={handleExpand}>
            <MaterialIcons name="open-in-full" size={18} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <MaterialIcons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== 中身：会話の一覧 ===== */}
      {!selectedChat && (
        <ScrollView style={styles.body} contentContainerStyle={{ padding: 8 }}>
          {loadingList ? (
            <ActivityIndicator style={{ marginTop: 24 }} color="#ffffff" />
          ) : chats.length === 0 ? (
            <Text style={styles.emptyText}>まだ会話がありません</Text>
          ) : (
            chats.map((chat) => {
              const unread = unreadCounts[chat.id] || 0;
              const isHovered = hoveredChatId === chat.id;
              return (
                <TouchableOpacity
                  key={chat.id}
                  style={[styles.chatRow, isHovered && styles.chatRowHovered]}
                  onPress={() => setSelectedChatId(chat.id)}
                  {...({
                    onMouseEnter: () => setHoveredChatId(chat.id),
                    onMouseLeave: () => setHoveredChatId(null),
                  } as any)}
                >
                  {renderAvatar(chat, 48)}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.chatName, unread > 0 && styles.chatNameUnread]} numberOfLines={1}>
                      {getChatTitle(chat)}
                    </Text>
                    <Text style={[styles.chatPreview, unread > 0 && styles.chatPreviewUnread]} numberOfLines={1}>
                      {(chat.lastMessage || "") + (chat.lastMessageAt ? ` · ${formatAgo(toMs(chat.lastMessageAt))}` : "")}
                    </Text>
                  </View>
                  {unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ===== 中身：会話 ===== */}
      {selectedChat && (
        <View style={styles.body}>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messageList}>
            {messages.map((m) => {
              const isMine = m.senderEmail === myEmail;
              const label = m.text || (m.mediaType === "video" ? "（動画）" : m.mediaUrl ? "（画像）" : "（メッセージ）");
              return (
                <View key={m.id} style={isMine ? styles.rowMine : styles.rowOther}>
                  <View style={isMine ? styles.bubbleMine : styles.bubbleOther}>
                    {m.replyTo?.text ? (
                      <Text style={styles.replyQuote} numberOfLines={1}>
                        {m.replyTo.text}
                      </Text>
                    ) : null}
                    <Text style={styles.bubbleText}>{label}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.inputArea}>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                value={messageText}
                onChangeText={setMessageText}
                placeholder="メッセージ…"
                placeholderTextColor="rgba(255,255,255,0.4)"
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={handleSend} disabled={!messageText.trim()}>
                <MaterialIcons
                  name="send"
                  size={20}
                  color={messageText.trim() ? "#9db4ff" : "rgba(255,255,255,0.3)"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const glassSelected: any =
  Platform.OS === "web"
    ? {
        backgroundColor: "rgba(255,255,255,0.12)",
        boxShadow:
          "0 3px 10px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.15)",
      }
    : { backgroundColor: "rgba(255,255,255,0.12)" };

const styles = StyleSheet.create({
  panel: {
    position: "fixed" as any,
    top: 24,
    right: 24,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(24,26,44,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    zIndex: 20,
    ...({
      backdropFilter: "blur(24px) saturate(180%)",
      boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
    } as any),
  },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: -12,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  headerButtons: {
    flexDirection: "row",
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  body: {
    flex: 1,
  },
  emptyText: {
    marginTop: 40,
    textAlign: "center",
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },
  // 会話の一覧
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 2,
    ...(Platform.OS === "web" ? ({ transition: "all 0.18s ease" } as any) : {}),
  },
  chatRowHovered: glassSelected,
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  chatName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
  chatNameUnread: {
    fontWeight: "700",
  },
  chatPreview: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  chatPreviewUnread: {
    color: "rgba(255,255,255,0.85)",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#e74c3c",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  // 会話
  messageList: {
    padding: 14,
    gap: 10,
  },
  rowMine: {
    alignItems: "flex-end",
  },
  rowOther: {
    alignItems: "flex-start",
  },
  bubbleOther: {
    maxWidth: "78%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  bubbleMine: {
    maxWidth: "78%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(120,130,255,0.5)",
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#ffffff",
  },
  replyQuote: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
  },
  inputArea: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
  },
  inputBox: {
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: "#ffffff",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
});
// ===== ここまでWeb版専用 =====