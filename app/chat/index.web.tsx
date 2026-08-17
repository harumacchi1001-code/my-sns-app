// ===== ここからWeb版専用ファイル =====
// 画面幅が広いとき（768px以上）は、左に会話一覧・右にトークを表示する2カラムレイアウトにする。
// 画面幅が狭いとき（スマホでWebを見ている場合）は、これまでどおり「一覧→タップで別画面」の動きにする。
import { useRouter } from "expo-router";
import {
    addDoc,
    arrayRemove,
    collection,
    collectionGroup,
    deleteDoc,
    doc,
    DocumentData,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";
type Chat = DocumentData & { id: string };
type Message = DocumentData & { id: string };
const DAY_MS = 24 * 60 * 60 * 1000;
// ===== ここからWeb版専用：2カラムに切り替える、画面幅のしきい値 =====
const MOBILE_BREAKPOINT = 768;
const LIST_COLUMN_WIDTH = 360;
// ===== ここまでWeb版専用 =====
export default function ChatWebScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrowWidth = width < MOBILE_BREAKPOINT;
  // ===== 一覧まわりの状態（既存 index.tsx と同じ） =====
  const [chats, setChats] = useState<Chat[]>([]);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [stories, setStories] = useState<DocumentData[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  // ===== ここからWeb版専用：選択中の会話ID（2カラムのとき、右側に表示する会話） =====
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  // ===== ここまでWeb版専用 =====
  // ===== 「すべて／個人／グループ」の、タブの選択状態 =====
  const [activeChatTab, setActiveChatTab] = useState<"all" | "individual" | "group">("all");
  // ===== 一覧側の、削除・退会メニュー（自作Modal） =====
  const [listMenuTargetChat, setListMenuTargetChat] = useState<Chat | null>(null);
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
      setLoadingList(false);
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
  const getUserStories = (userId: string) => {
    const now = Date.now();
    return stories.filter((s) => {
      if (s.authorId !== userId) return false;
      const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
      return now - createdMs < DAY_MS;
    });
  };
  const myUid = auth.currentUser?.uid;
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
    // ===== ここからWeb版専用：削除した会話が選択中だった場合、選択を解除 =====
    setSelectedChatId((current) => (current === chatId ? null : current));
    // ===== ここまでWeb版専用 =====
  };
  const handleLeaveChat = async (chatId: string) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    await updateDoc(doc(db, "chats", chatId), {
      participants: arrayRemove(myEmail),
    });
    setSelectedChatId((current) => (current === chatId ? null : current));
  };
  // ===== 三本線・長押しどちらでも、一覧側のメニューを開く =====
  const openListChatMenu = (chat: Chat) => {
    setListMenuTargetChat(chat);
  };
  // ===== ここからWeb版専用：会話をクリックしたときの動作 =====
  const handleSelectChat = (chatId: string) => {
    if (isNarrowWidth) {
      router.push({ pathname: "/chat/[id]", params: { id: chatId } });
    } else {
      setSelectedChatId(chatId);
    }
  };
  // ===== ここまでWeb版専用 =====
  // ===== 選択中のタブに応じて、会話を絞り込む =====
  const filteredChats = chats.filter((chat) => {
    if (activeChatTab === "individual") return !chat.isGroup;
    if (activeChatTab === "group") return !!chat.isGroup;
    return true;
  });
  const renderListPane = () => (
    <View style={isNarrowWidth ? styles.listPaneFull : styles.listPane}>
      <View style={styles.header}>
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
      {loadingList ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
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
            const isSelected = !isNarrowWidth && selectedChatId === item.id;
            return (
              <TouchableOpacity
                style={[styles.chatRow, isSelected && styles.chatRowSelected]}
                onPress={() => handleSelectChat(item.id)}
                onLongPress={() => openListChatMenu(item)}
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
                  onPress={() => openListChatMenu(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.chatMenuIcon}>≡</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
  // ===== 幅が狭い場合は、これまでどおり一覧のみ（タップで別画面へ遷移） =====
  if (isNarrowWidth) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {renderListPane()}
        {/* ===== 削除・退会・キャンセルの、自作メニュー ===== */}
        <Modal
          visible={!!listMenuTargetChat}
          transparent
          animationType="fade"
          onRequestClose={() => setListMenuTargetChat(null)}
        >
          <TouchableWithoutFeedback onPress={() => setListMenuTargetChat(null)}>
            <View style={styles.chatActionOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.chatActionSheet}>
                  <TouchableOpacity
                    style={styles.chatActionItem}
                    onPress={() => {
                      if (listMenuTargetChat) handleDeleteChat(listMenuTargetChat.id);
                      setListMenuTargetChat(null);
                    }}
                  >
                    <Text style={styles.chatActionTextDanger}>{t("chatList.deleteOption")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chatActionItem}
                    onPress={() => {
                      if (listMenuTargetChat) handleLeaveChat(listMenuTargetChat.id);
                      setListMenuTargetChat(null);
                    }}
                  >
                    <Text style={styles.chatActionText}>{t("chatList.leaveOption")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.chatActionCancel} onPress={() => setListMenuTargetChat(null)}>
                    <Text style={styles.chatActionCancelText}>{t("chatList.cancelOption")}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    );
  }
  // ===== ここから、幅が広い場合の、2カラムレイアウト =====
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.twoColumnWrapper}>
        {renderListPane()}
        <View style={styles.detailPane}>
          {selectedChatId ? (
            <ChatDetailPane
              key={selectedChatId}
              chatId={selectedChatId}
              stories={stories}
              userMap={userMap}
              onChatRemoved={() => setSelectedChatId(null)}
            />
          ) : (
            <View style={styles.emptyDetailContainer}>
              <Text style={styles.emptyDetailText}>{t("chatList.headerTitle")}</Text>
            </View>
          )}
        </View>
      </View>
      {/* ===== 削除・退会・キャンセルの、自作メニュー（一覧側） ===== */}
      <Modal
        visible={!!listMenuTargetChat}
        transparent
        animationType="fade"
        onRequestClose={() => setListMenuTargetChat(null)}
      >
        <TouchableWithoutFeedback onPress={() => setListMenuTargetChat(null)}>
          <View style={styles.chatActionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.chatActionSheet}>
                <TouchableOpacity
                  style={styles.chatActionItem}
                  onPress={() => {
                    if (listMenuTargetChat) handleDeleteChat(listMenuTargetChat.id);
                    setListMenuTargetChat(null);
                  }}
                >
                  <Text style={styles.chatActionTextDanger}>{t("chatList.deleteOption")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chatActionItem}
                  onPress={() => {
                    if (listMenuTargetChat) handleLeaveChat(listMenuTargetChat.id);
                    setListMenuTargetChat(null);
                  }}
                >
                  <Text style={styles.chatActionText}>{t("chatList.leaveOption")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chatActionCancel} onPress={() => setListMenuTargetChat(null)}>
                  <Text style={styles.chatActionCancelText}>{t("chatList.cancelOption")}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}
// ===== ここからWeb版専用：右カラムに表示する、個別チャットの中身 =====
function ChatDetailPane({
  chatId,
  stories,
  userMap,
  onChatRemoved,
}: {
  chatId: string;
  stories: DocumentData[];
  userMap: Record<string, DocumentData>;
  onChatRemoved?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [chat, setChat] = useState<DocumentData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sharedPosts, setSharedPosts] = useState<Record<string, DocumentData>>({});
  const [loading, setLoading] = useState(true);
  // ===== 削除・退会・キャンセルの、自作メニューの表示状態 =====
  const [showChatMenu, setShowChatMenu] = useState(false);
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "chats", chatId), (docSnap) => {
      if (docSnap.exists()) {
        setChat({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [chatId]);
  useEffect(() => {
    const q = query(
      collection(db, "chats", chatId, "messages"),
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
  }, [chatId]);
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
      const myEmail = auth.currentUser?.email;
      if (!myEmail) return;
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const q = query(collection(db, "chats", chatId, "messages"));
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
  }, [chatId]);
  const getUserStories = (userId: string) => {
    const now = Date.now();
    return stories.filter((s) => {
      if (s.authorId !== userId) return false;
      const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
      return now - createdMs < DAY_MS;
    });
  };
  const myUid = auth.currentUser?.uid;
  const getOtherUserInfo = () => {
    if (!chat || chat.isGroup) return { userId: undefined as string | undefined, userStories: [] as DocumentData[] };
    const myEmail = auth.currentUser?.email;
    const otherEmail = chat.participants.find((p: string) => p !== myEmail);
    const otherUser = userMap[otherEmail];
    const userId = otherUser?.id as string | undefined;
    const userStories = userId ? getUserStories(userId) : [];
    return { userId, userStories };
  };
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
  // ===== 削除・退会の処理 =====
  const handleDeleteThisChat = async () => {
    setShowChatMenu(false);
    await deleteDoc(doc(db, "chats", chatId));
    onChatRemoved?.();
  };
  const handleLeaveThisChat = async () => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    setShowChatMenu(false);
    await updateDoc(doc(db, "chats", chatId), { participants: arrayRemove(myEmail) });
    onChatRemoved?.();
  };
  const handleSend = async () => {
    if (!messageText.trim()) return;
    const myEmail = auth.currentUser?.email;
    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderEmail: myEmail,
      text: messageText.trim(),
      readBy: [myEmail],
      createdAt: new Date(),
    });
    await updateDoc(doc(db, "chats", chatId), {
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
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
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
        <View style={styles.headerRightRow}>
          {chat?.isGroup && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/chat/[id]/info", params: { id: chatId } })}
            >
              <Text style={styles.infoText}>{t("chatDetail.infoButton")}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowChatMenu(true)}>
            <Text style={styles.headerMenuIcon}>≡</Text>
          </TouchableOpacity>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
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
      {/* ===== 削除・退会・キャンセルの、自作メニュー（右カラム側） ===== */}
      <Modal
        visible={showChatMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChatMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowChatMenu(false)}>
          <View style={styles.chatActionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.chatActionSheet}>
                <TouchableOpacity style={styles.chatActionItem} onPress={handleDeleteThisChat}>
                  <Text style={styles.chatActionTextDanger}>削除</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chatActionItem} onPress={handleLeaveThisChat}>
                  <Text style={styles.chatActionText}>退会</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chatActionCancel} onPress={() => setShowChatMenu(false)}>
                  <Text style={styles.chatActionCancelText}>キャンセル</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}
// ===== ここまでWeb版専用 =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
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
  // ===== ここからWeb版専用：2カラムのレイアウト =====
  twoColumnWrapper: {
    flex: 1,
    flexDirection: "row",
  },
  listPane: {
    width: LIST_COLUMN_WIDTH,
    borderRightWidth: 0.5,
    borderRightColor: "#eee",
  },
  listPaneFull: {
    flex: 1,
  },
  detailPane: {
    flex: 1,
  },
  emptyDetailContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyDetailText: {
    fontSize: 14,
    color: "#bbb",
  },
  chatRowSelected: {
    backgroundColor: "#f5f5f5",
  },
  // ===== ここまでWeb版専用 =====
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
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
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerMenuIcon: {
    fontSize: 20,
    color: "#222",
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
  // ===== 削除・退会メニュー（自作Modal）のスタイル =====
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
});
// ===== ここまでWeb版専用ファイル =====