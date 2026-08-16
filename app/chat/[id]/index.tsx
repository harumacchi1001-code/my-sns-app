import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, DocumentData, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../../../components/StampFrame";
import { auth, db } from "../../../firebaseConfig";
type Message = DocumentData & { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ChatDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [chat, setChat] = useState<DocumentData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [sharedPosts, setSharedPosts] = useState<Record<string, DocumentData>>({});
  const [loading, setLoading] = useState(true);

  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);

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
    if (!id) return;
    const q = query(
      collection(db, "chats", id, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Message[];
      setMessages(data);
    });
    return unsubscribe;
  }, [id]);
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

  useEffect(() => {
    const sharedIds = messages
      .filter((m) => m.sharedPostId)
      .map((m) => m.sharedPostId as string);
    const uniqueIds = Array.from(new Set(sharedIds));
    const idsToFetch = uniqueIds.filter((pid) => !sharedPosts[pid]);
    if (idsToFetch.length === 0) return;
    idsToFetch.forEach((postId) => {
      onSnapshot(doc(db, "posts", postId), (docSnap) => {
        if (docSnap.exists()) {
          setSharedPosts((prev) => ({ ...prev, [postId]: { id: docSnap.id, ...docSnap.data() } }));
        }
      });
    });
  }, [messages]);
  useEffect(() => {
    const markAllAsRead = async () => {
      if (!id) return;
      const myEmail = auth.currentUser?.email;
      if (!myEmail) return;
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const q = query(collection(db, "chats", id, "messages"));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      let hasUnread = false;
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const readBy: string[] = data.readBy || [];
        if (!readBy.includes(myEmail)) {
          hasUnread = true;
          batch.update(docSnap.ref, { readBy: [...readBy, myEmail] });
        }
      });
      if (hasUnread) {
        await batch.commit();
      }
    };
    markAllAsRead();
  }, [id]);

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

  // ===== 相手のユーザーID・ストーリー情報 =====
  const getOtherUserInfo = () => {
    if (!chat || chat.isGroup) return { userId: undefined as string | undefined, userStories: [] as DocumentData[] };
    const myEmail = auth.currentUser?.email;
    const otherEmail = chat.participants.find((p: string) => p !== myEmail);
    const otherUser = userMap[otherEmail];
    const userId = otherUser?.id as string | undefined;
    const userStories = userId ? getUserStories(userId) : [];
    return { userId, userStories };
  };

  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleHeaderAvatarPress = () => {
    const { userId, userStories } = getOtherUserInfo();
    if (!userId) return;
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: userId } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: userId } });
    }
  };

  const getChatTitle = () => {
    if (!chat) return "";
    if (chat.isGroup) return chat.groupName || t("chatDetail.group");
    const myEmail = auth.currentUser?.email;
    const otherEmail = chat.participants.find((p: string) => p !== myEmail);
    return userMap[otherEmail]?.username || otherEmail || t("chatDetail.unknownUser");
  };
  const handleSend = async () => {
    if (!messageText.trim() || !id) return;
    const myEmail = auth.currentUser?.email;
    await addDoc(collection(db, "chats", id, "messages"), {
      senderEmail: myEmail,
      text: messageText.trim(),
      readBy: [myEmail],
      createdAt: new Date(),
    });
    await updateDoc(doc(db, "chats", id), {
      lastMessage: messageText.trim(),
      lastMessageAt: new Date(),
    });
    setMessageText("");
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  const myEmail = auth.currentUser?.email;
  const { userId: otherUserId, userStories: otherUserStories } = getOtherUserInfo();
  const otherHasUnread = otherUserStories.some((s) => !(s.viewedBy || []).includes(myUid));
  const chatMyEmailForPhoto = chat && !chat.isGroup
    ? userMap[chat.participants.find((p: string) => p !== myEmail)]?.photoUrl
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>{t("chatDetail.backButton")}</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {chat && !chat.isGroup && (
              <TouchableOpacity onPress={handleHeaderAvatarPress}>
                <StampFrame
                  size={30}
                  imageUri={chatMyEmailForPhoto || null}
                  borderColor="#888"
                  frameThickness={otherUserStories.length > 0 && otherHasUnread ? 2.5 : 1}
                  gradientColors={
                    otherUserStories.length > 0 && otherHasUnread
                      ? ["#3D8BFF", "#7B3DFF"]
                      : undefined
                  }
                  notchesPerSide={4}
                  notchRadius={1.5}
                />
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>{getChatTitle()}</Text>
          </View>

          {chat?.isGroup ? (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/chat/[id]/info", params: { id: id as string } })}
            >
              <Text style={styles.infoText}>{t("chatDetail.infoButton")}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messageList}
              renderItem={({ item }) => {
                const isMine = item.senderEmail === myEmail;
                if (item.sharedPostId) {
                  const sharedPost = sharedPosts[item.sharedPostId];
                  return (
                    <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}>
                      <TouchableOpacity
                        style={styles.sharedPostCard}
                        onPress={() =>
                          router.push({ pathname: "/post/[id]", params: { id: item.sharedPostId } })
                        }
                      >
                        {sharedPost?.thumbnailUrl ? (
                          <Image
                            source={{ uri: sharedPost.thumbnailUrl }}
                            style={styles.sharedPostThumbnail}
                          />
                        ) : (
                          <View style={styles.sharedPostThumbnailPlaceholder} />
                        )}
                        <View style={styles.sharedPostInfo}>
                          <Text style={styles.sharedPostTitle} numberOfLines={2}>
                            {sharedPost?.title || t("chatDetail.sharedPostFallback")}
                          </Text>
                          <Text style={styles.sharedPostLabel}>{t("chatDetail.sharedPostLabel")}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }
                return (
                  <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}>
                    <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.otherBubble]}>
                      <Text style={isMine ? styles.myMessageText : styles.otherMessageText}>
                        {item.text}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          </TouchableWithoutFeedback>
          <View style={styles.inputRow}>
            <TextInput
              placeholder={t("chatDetail.placeholder")}
              value={messageText}
              onChangeText={setMessageText}
              style={styles.input}
              multiline
            />
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Text style={styles.sendButtonText}>{t("chatDetail.sendButton")}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  infoText: {
    color: "#4a90e2",
    fontSize: 14,
  },
  messageList: {
    padding: 16,
  },
  messageBubbleRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  messageBubbleRowMine: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "75%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: "#4a90e2",
  },
  otherBubble: {
    backgroundColor: "#f0f0f0",
  },
  myMessageText: {
    color: "#fff",
    fontSize: 14,
  },
  otherMessageText: {
    color: "#222",
    fontSize: 14,
  },
  sharedPostCard: {
    width: 220,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fafafa",
  },
  sharedPostThumbnail: {
    width: "100%",
    height: 120,
    backgroundColor: "#eee",
  },
  sharedPostThumbnailPlaceholder: {
    width: "100%",
    height: 120,
    backgroundColor: "#eee",
  },
  sharedPostInfo: {
    padding: 10,
  },
  sharedPostTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
    marginBottom: 4,
  },
  sharedPostLabel: {
    fontSize: 11,
    color: "#999",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  sendButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButtonText: {
    color: "#4a90e2",
    fontWeight: "600",
  },
});