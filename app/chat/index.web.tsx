// ===== ここからWeb版専用ファイル =====
// 画面幅が広いとき（768px以上）は、左に会話一覧・右にトークを表示する2カラムレイアウトにする。
// 画面幅が狭いとき（スマホでWebを見ている場合）は、これまでどおり「一覧→タップで別画面」の動きにする。
// このファイルは常にWeb版でのみ使われるため、削除・退会メニューは常にポップアップ形式で表示する。
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
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
import MediaLightbox from "../../components/MediaLightbox";
import StampFrame from "../../components/StampFrame";
import { auth, db, storage } from "../../firebaseConfig";
type Chat = DocumentData & { id: string };
type Message = DocumentData & { id: string };
const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
// ===== ここからWeb版専用：2カラムに切り替える、画面幅のしきい値 =====
const MOBILE_BREAKPOINT = 768;
const LIST_COLUMN_WIDTH = 360;
// ===== ここまでWeb版専用 =====
// ===== メッセージ内の、動画を、操作ボタン付きで再生する部品 =====
function MessageVideo({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = false;
  });
  return <VideoView style={style} player={player} contentFit="cover" nativeControls allowsFullscreen={false} />;
}
export default function ChatWebScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrowWidth = width < MOBILE_BREAKPOINT;
  const [chats, setChats] = useState<Chat[]>([]);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [stories, setStories] = useState<DocumentData[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [activeChatTab, setActiveChatTab] = useState<"all" | "individual" | "group">("all");
  const [listMenuTargetChat, setListMenuTargetChat] = useState<Chat | null>(null);
  const [listMenuPosition, setListMenuPosition] = useState({ top: 100, left: 100 });
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
    setSelectedChatId((current) => (current === chatId ? null : current));
  };
  const handleLeaveChat = async (chatId: string) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    await updateDoc(doc(db, "chats", chatId), {
      participants: arrayRemove(myEmail),
    });
    setSelectedChatId((current) => (current === chatId ? null : current));
  };
  const openListChatMenu = (chat: Chat, event?: any) => {
    if (event) {
      const pageX = event?.nativeEvent?.pageX ?? 100;
      const pageY = event?.nativeEvent?.pageY ?? 100;
      setListMenuPosition({ top: pageY + 10, left: pageX - 180 });
    }
    setListMenuTargetChat(chat);
  };
  const handleSelectChat = (chatId: string) => {
    if (isNarrowWidth) {
      router.push({ pathname: "/chat/[id]", params: { id: chatId } });
    } else {
      setSelectedChatId(chatId);
    }
  };
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
                  <View style={styles.groupStampWrapper}>
                    <StampFrame size={50} imageUri={null} borderColor="#888" notchesPerSide={5} notchRadius={2.5} />
                    <Text style={styles.groupStampEmoji}>👥</Text>
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
                  onPress={(event) => openListChatMenu(item, event)}
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
  const renderListActionMenu = () => (
    <Modal
      visible={!!listMenuTargetChat}
      transparent
      animationType="fade"
      onRequestClose={() => setListMenuTargetChat(null)}
    >
      <TouchableWithoutFeedback onPress={() => setListMenuTargetChat(null)}>
        <View style={styles.chatActionOverlayWeb}>
          <TouchableWithoutFeedback>
            <View style={[styles.chatActionPopup, { top: listMenuPosition.top, left: listMenuPosition.left }]}>
              <TouchableOpacity
                style={styles.chatActionItemWeb}
                onPress={() => {
                  if (listMenuTargetChat) handleDeleteChat(listMenuTargetChat.id);
                  setListMenuTargetChat(null);
                }}
              >
                <Text style={styles.chatActionTextDanger}>{t("chatList.deleteOption")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chatActionItemWeb}
                onPress={() => {
                  if (listMenuTargetChat) handleLeaveChat(listMenuTargetChat.id);
                  setListMenuTargetChat(null);
                }}
              >
                <Text style={styles.chatActionText}>{t("chatList.leaveOption")}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
  if (isNarrowWidth) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {renderListPane()}
        {renderListActionMenu()}
      </SafeAreaView>
    );
  }
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
      {renderListActionMenu()}
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
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 60, left: 300 });
  const [messageMenuTarget, setMessageMenuTarget] = useState<{ item: Message; isMine: boolean } | null>(null);
  const [messageMenuPosition, setMessageMenuPosition] = useState({ top: 100, left: 300 });
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; senderEmail: string } | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<{ id: string; top: number; left: number } | null>(null);
  const [mediaSending, setMediaSending] = useState(false);
  // ===== 画像・動画を、タップしたときの、全画面表示（ライトボックス） =====
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const openLightbox = (url: string, isVideoItem: boolean) => {
    setLightboxUrl(url);
    setLightboxIsVideo(isVideoItem);
    setLightboxVisible(true);
  };
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
  const openChatMenu = (event?: any) => {
    if (event) {
      const pageX = event?.nativeEvent?.pageX ?? 300;
      const pageY = event?.nativeEvent?.pageY ?? 60;
      setMenuPosition({ top: pageY + 10, left: pageX - 180 });
    }
    setShowChatMenu(true);
  };
  const formatDateSeparator = (timestamp: any) => {
    if (!timestamp?.toDate) return "";
    const date = timestamp.toDate();
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) return "今日";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "昨日";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };
  const handleDeleteMessage = async (messageId: string) => {
    await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
      text: "",
      deleted: true,
    });
  };
  const openMessageMenu = (item: Message, isMine: boolean, event?: any) => {
    if (event) {
      const pageX = event?.nativeEvent?.pageX ?? 300;
      const pageY = event?.nativeEvent?.pageY ?? 100;
      setMessageMenuPosition({ top: pageY - 10, left: pageX - 90 });
    }
    setMessageMenuTarget({ item, isMine });
  };
  const startReplyTo = (item: Message) => {
    setReplyingTo({ id: item.id, text: item.text || (item.mediaType ? "（画像・動画）" : ""), senderEmail: item.senderEmail });
  };
  const startReplyFromMenu = () => {
    if (!messageMenuTarget) return;
    startReplyTo(messageMenuTarget.item);
    setMessageMenuTarget(null);
  };
  const confirmDeleteFromMenu = () => {
    if (!messageMenuTarget) return;
    handleDeleteMessage(messageMenuTarget.item.id);
    setMessageMenuTarget(null);
  };
  const getSenderDisplayName = (senderEmail: string) => {
    const myEmail = auth.currentUser?.email;
    if (senderEmail === myEmail) return "自分";
    return userMap[senderEmail]?.username || senderEmail;
  };
  const openReactionPicker = (messageId: string, event?: any) => {
    const pageX = event?.nativeEvent?.pageX ?? 300;
    const pageY = event?.nativeEvent?.pageY ?? 100;
    setReactionPickerFor({ id: messageId, top: pageY - 50, left: pageX - 120 });
  };
  const toggleReaction = async (messageId: string, emoji: string) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    const target = messages.find((m) => m.id === messageId);
    const reactions: Record<string, string[]> = { ...(target?.reactions || {}) };
    const list: string[] = reactions[emoji] || [];
    if (list.includes(myEmail)) {
      const filtered = list.filter((e) => e !== myEmail);
      if (filtered.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = filtered;
      }
    } else {
      reactions[emoji] = [...list, myEmail];
    }
    await updateDoc(doc(db, "chats", chatId, "messages", messageId), { reactions });
    setReactionPickerFor(null);
  };
  // ===== 画像・動画を選んで、アップロードし、メッセージとして送る =====
  const pickAndSendMedia = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真・動画ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mediaType: "image" | "video" = asset.type === "video" ? "video" : "image";
    const ratio = asset.width && asset.height ? asset.width / asset.height : mediaType === "video" ? 16 / 9 : 4 / 3;
    setMediaSending(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const folder = mediaType === "video" ? "chatVideos" : "chatImages";
      const myEmail = auth.currentUser?.email;
      const fileName = `${folder}/${auth.currentUser?.uid}_${Date.now()}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderEmail: myEmail,
        text: "",
        mediaUrl: url,
        mediaType,
        mediaRatio: ratio,
        readBy: [myEmail],
        createdAt: new Date(),
        replyTo: replyingTo
          ? { id: replyingTo.id, text: replyingTo.text, senderEmail: replyingTo.senderEmail }
          : null,
      });
      await updateDoc(doc(db, "chats", chatId), {
        lastMessage: mediaType === "video" ? "（動画）" : "（画像）",
        lastMessageAt: new Date(),
      });
      setReplyingTo(null);
    } catch (error: any) {
      alert("送信に失敗しました：" + error.message);
    } finally {
      setMediaSending(false);
    }
  };
  const handleSend = async () => {
    if (!messageText.trim()) return;
    const myEmail = auth.currentUser?.email;
    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderEmail: myEmail,
      text: messageText.trim(),
      readBy: [myEmail],
      createdAt: new Date(),
      replyTo: replyingTo
        ? { id: replyingTo.id, text: replyingTo.text, senderEmail: replyingTo.senderEmail }
        : null,
    });
    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: messageText.trim(),
      lastMessageAt: new Date(),
    });
    setMessageText("");
    setReplyingTo(null);
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
  const otherEmailForRead = chat && !chat.isGroup
    ? chat.participants.find((p: string) => p !== myEmail)
    : null;
  const lastMyMessage = [...messages].reverse().find((m) => m.senderEmail === myEmail);
  const lastMyMessageId = lastMyMessage?.id;
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
          <TouchableOpacity onPress={(event) => openChatMenu(event)}>
            <Text style={styles.headerMenuIcon}>≡</Text>
          </TouchableOpacity>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item, index }) => {
            const isMine = item.senderEmail === myEmail;
            const prevItem = index > 0 ? messages[index - 1] : null;
            const currentDateLabel = formatDateSeparator(item.createdAt);
            const prevDateLabel = prevItem ? formatDateSeparator(prevItem.createdAt) : null;
            const showDateSeparator = currentDateLabel !== prevDateLabel;
            const dateSeparatorView = showDateSeparator ? (
              <View style={styles.dateSeparatorRow}>
                <Text style={styles.dateSeparatorText}>{currentDateLabel}</Text>
              </View>
            ) : null;
            const showReadLabel =
              isMine &&
              item.id === lastMyMessageId &&
              !chat?.isGroup &&
              otherEmailForRead &&
              (item.readBy || []).includes(otherEmailForRead);
            const reactionEntries: [string, string[]][] = Object.entries(item.reactions || {});
            const reactionsView = reactionEntries.length > 0 ? (
              <View style={[styles.reactionRow, isMine && styles.reactionRowMine]}>
                {reactionEntries.map(([emoji, list]) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionPill}
                    onPress={() => toggleReaction(item.id, emoji)}
                  >
                    <Text style={styles.reactionPillText}>{emoji} {list.length}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null;
            const isHovered = hoveredMessageId === item.id;
            const actionIconsView = isHovered ? (
              <View style={styles.hoverActionRow}>
                <TouchableOpacity
                  style={styles.hoverActionButton}
                  onPress={(event) => openReactionPicker(item.id, event)}
                >
                  <Text style={styles.hoverActionIcon}>🙂</Text>
                </TouchableOpacity>
                {!item.sharedPostId && (
                  <TouchableOpacity style={styles.hoverActionButton} onPress={() => startReplyTo(item)}>
                    <Text style={styles.hoverActionIcon}>↩</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.hoverActionButton}
                  onPress={(event) => openMessageMenu(item, isMine, event)}
                >
                  <Text style={styles.hoverActionIcon}>⋮</Text>
                </TouchableOpacity>
              </View>
            ) : null;
            const hoverHandlers = {
              onMouseEnter: () => setHoveredMessageId(item.id),
              onMouseLeave: () => setHoveredMessageId((current) => (current === item.id ? null : current)),
            };
            if (item.deleted) {
              return (
                <View>
                  {dateSeparatorView}
                  <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}>
                    <View style={[styles.messageBubble, styles.deletedBubble]}>
                      <Text style={styles.deletedMessageText}>メッセージが削除されました</Text>
                    </View>
                  </View>
                </View>
              );
            }
            // ===== 画像・動画メッセージの表示 =====
            if (item.mediaUrl) {
              const senderPhotoUrlForMedia = !isMine ? userMap[item.senderEmail]?.photoUrl : null;
              return (
                <View>
                  {dateSeparatorView}
                  <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]} {...hoverHandlers}>
                    {!isMine && (
                      <View style={styles.messageAvatarWrapper}>
                        <StampFrame
                          size={30}
                          imageUri={senderPhotoUrlForMedia}
                          borderColor="#888"
                          notchesPerSide={4}
                          notchRadius={1.5}
                        />
                      </View>
                    )}
                    {isMine && actionIconsView}
                    <TouchableOpacity
                      style={styles.mediaBubbleWrapper}
                      activeOpacity={0.9}
                      onLongPress={(event) => openMessageMenu(item, isMine, event)}
                      onPress={() => openLightbox(item.mediaUrl, item.mediaType === "video")}
                    >
                      {item.replyTo && (
                        <View style={styles.replyQuoteBoxOutside}>
                          <Text style={styles.replyQuoteSenderOutside}>
                            {getSenderDisplayName(item.replyTo.senderEmail)}
                          </Text>
                          <Text style={styles.replyQuoteTextOutside} numberOfLines={1}>
                            {item.replyTo.text}
                          </Text>
                        </View>
                      )}
                      {item.mediaType === "video" ? (
                        <MessageVideo
                          uri={item.mediaUrl}
                          style={[styles.mediaContent, { aspectRatio: item.mediaRatio || 16 / 9 }]}
                        />
                      ) : (
                        <Image
                          source={{ uri: item.mediaUrl }}
                          style={[styles.mediaContent, { aspectRatio: item.mediaRatio || 4 / 3 }]}
                          resizeMode="cover"
                        />
                      )}
                    </TouchableOpacity>
                    {!isMine && actionIconsView}
                  </View>
                  {reactionsView}
                  {showReadLabel && (
                    <View style={styles.readLabelRow}>
                      <Text style={styles.readLabelText}>既読</Text>
                    </View>
                  )}
                </View>
              );
            }
            if (item.sharedPostId) {
              const sharedPost = sharedPosts[item.sharedPostId];
              const sharedSenderPhotoUrl = !isMine ? userMap[item.senderEmail]?.photoUrl : null;
              return (
                <View>
                  {dateSeparatorView}
                  <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]} {...hoverHandlers}>
                    {!isMine && (
                      <View style={styles.messageAvatarWrapper}>
                        <StampFrame
                          size={30}
                          imageUri={sharedSenderPhotoUrl}
                          borderColor="#888"
                          notchesPerSide={4}
                          notchRadius={1.5}
                        />
                      </View>
                    )}
                    {isMine && actionIconsView}
                    <TouchableOpacity
                      style={styles.sharedPostCard}
                      onLongPress={(event) => openMessageMenu(item, isMine, event)}
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
                    {!isMine && actionIconsView}
                  </View>
                  {reactionsView}
                  {showReadLabel && (
                    <View style={styles.readLabelRow}>
                      <Text style={styles.readLabelText}>既読</Text>
                    </View>
                  )}
                </View>
              );
            }
            const senderPhotoUrl = !isMine ? userMap[item.senderEmail]?.photoUrl : null;
            return (
              <View>
                {dateSeparatorView}
                <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]} {...hoverHandlers}>
                  {!isMine && (
                    <View style={styles.messageAvatarWrapper}>
                      <StampFrame
                        size={30}
                        imageUri={senderPhotoUrl}
                        borderColor="#888"
                        notchesPerSide={4}
                        notchRadius={1.5}
                      />
                    </View>
                  )}
                  {isMine && actionIconsView}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onLongPress={(event) => openMessageMenu(item, isMine, event)}
                    style={[styles.messageBubble, isMine ? styles.myBubble : styles.otherBubble]}
                  >
                    {item.replyTo && (
                      <View style={styles.replyQuoteBox}>
                        <Text style={styles.replyQuoteSender}>
                          {getSenderDisplayName(item.replyTo.senderEmail)}
                        </Text>
                        <Text style={styles.replyQuoteText} numberOfLines={1}>
                          {item.replyTo.text}
                        </Text>
                      </View>
                    )}
                    <Text style={isMine ? styles.myMessageText : styles.otherMessageText}>
                      {item.text}
                    </Text>
                  </TouchableOpacity>
                  {!isMine && actionIconsView}
                </View>
                {reactionsView}
                {showReadLabel && (
                  <View style={styles.readLabelRow}>
                    <Text style={styles.readLabelText}>既読</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
        {replyingTo && (
          <View style={styles.replyPreviewRow}>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewSender}>{getSenderDisplayName(replyingTo.senderEmail)}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyingTo.text}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
              <Text style={styles.replyPreviewCloseText}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={pickAndSendMedia} style={styles.mediaPickButton} disabled={mediaSending}>
            {mediaSending ? (
              <ActivityIndicator size="small" color="#4a90e2" />
            ) : (
              <Text style={styles.mediaPickIcon}>🖼️</Text>
            )}
          </TouchableOpacity>
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
      {/* ===== 削除・退会・キャンセルの、ポップアップメニュー（右カラム側） ===== */}
      <Modal
        visible={showChatMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChatMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowChatMenu(false)}>
          <View style={styles.chatActionOverlayWeb}>
            <TouchableWithoutFeedback>
              <View style={[styles.chatActionPopup, { top: menuPosition.top, left: menuPosition.left }]}>
                <TouchableOpacity style={styles.chatActionItemWeb} onPress={handleDeleteThisChat}>
                  <Text style={styles.chatActionTextDanger}>削除</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chatActionItemWeb} onPress={handleLeaveThisChat}>
                  <Text style={styles.chatActionText}>退会</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* ===== メッセージの、三点メニュー（返信・削除） ===== */}
      <Modal
        visible={!!messageMenuTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageMenuTarget(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMessageMenuTarget(null)}>
          <View style={styles.chatActionOverlayWeb}>
            <TouchableWithoutFeedback>
              <View style={[styles.chatActionPopup, { top: messageMenuPosition.top, left: messageMenuPosition.left }]}>
                {messageMenuTarget && !messageMenuTarget.item.sharedPostId && (
                  <TouchableOpacity style={styles.chatActionItemWeb} onPress={startReplyFromMenu}>
                    <Text style={styles.chatActionText}>返信</Text>
                  </TouchableOpacity>
                )}
                {messageMenuTarget?.isMine && (
                  <TouchableOpacity style={styles.chatActionItemWeb} onPress={confirmDeleteFromMenu}>
                    <Text style={styles.chatActionTextDanger}>削除</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* ===== 絵文字リアクションの、候補ピッカー ===== */}
      <Modal
        visible={!!reactionPickerFor}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerFor(null)}
      >
        <TouchableWithoutFeedback onPress={() => setReactionPickerFor(null)}>
          <View style={styles.chatActionOverlayWeb}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.reactionPickerPopup,
                  { top: reactionPickerFor?.top || 100, left: reactionPickerFor?.left || 100 },
                ]}
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionPickerItem}
                    onPress={() => reactionPickerFor && toggleReaction(reactionPickerFor.id, emoji)}
                  >
                    <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <MediaLightbox
        visible={lightboxVisible}
        items={lightboxUrl ? [{ url: lightboxUrl, isVideo: lightboxIsVideo }] : []}
        startIndex={0}
        onClose={() => setLightboxVisible(false)}
      />
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
  groupStampWrapper: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  groupStampEmoji: {
    position: "absolute",
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
    alignItems: "flex-end",
  },
  messageBubbleRowMine: {
    justifyContent: "flex-end",
  },
  dateSeparatorRow: {
    alignItems: "center",
    marginVertical: 14,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: "#999",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  deletedBubble: {
    backgroundColor: "#f5f5f5",
  },
  deletedMessageText: {
    fontSize: 13,
    color: "#aaa",
    fontStyle: "italic",
  },
  messageAvatarWrapper: {
    marginRight: 8,
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
  mediaBubbleWrapper: {
    maxWidth: "70%",
    borderRadius: 14,
    overflow: "hidden",
  },
  mediaContent: {
    width: 220,
    borderRadius: 14,
    backgroundColor: "#eee",
  },
  replyQuoteBoxOutside: {
    borderLeftWidth: 3,
    borderLeftColor: "#4a90e2",
    paddingLeft: 8,
    marginBottom: 4,
    backgroundColor: "#f7f7f7",
    paddingVertical: 4,
  },
  replyQuoteSenderOutside: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4a90e2",
  },
  replyQuoteTextOutside: {
    fontSize: 12,
    color: "#666",
  },
  mediaPickButton: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  mediaPickIcon: {
    fontSize: 20,
  },
  hoverActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 6,
  },
  hoverActionButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
  },
  hoverActionIcon: {
    fontSize: 13,
  },
  reactionPickerPopup: {
    position: "absolute",
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#eee",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  reactionPickerItem: {
    paddingHorizontal: 4,
  },
  reactionPickerEmoji: {
    fontSize: 20,
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginLeft: 38,
  },
  reactionRowMine: {
    marginLeft: 0,
    justifyContent: "flex-end",
  },
  reactionPill: {
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reactionPillText: {
    fontSize: 12,
  },
  readLabelRow: {
    alignItems: "flex-end",
    marginTop: 2,
    marginRight: 4,
  },
  readLabelText: {
    fontSize: 11,
    color: "#999",
  },
  replyQuoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: "rgba(255,255,255,0.6)",
    paddingLeft: 8,
    marginBottom: 6,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  replyQuoteText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },
  replyPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#f7f7f7",
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
  },
  replyPreviewContent: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: "#4a90e2",
    paddingLeft: 8,
  },
  replyPreviewSender: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4a90e2",
  },
  replyPreviewText: {
    fontSize: 12,
    color: "#666",
  },
  replyPreviewClose: {
    paddingHorizontal: 10,
  },
  replyPreviewCloseText: {
    fontSize: 18,
    color: "#999",
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
  chatActionText: {
    fontSize: 15,
    color: "#333",
  },
  chatActionTextDanger: {
    fontSize: 15,
    color: "#e74c3c",
  },
});
// ===== ここまでWeb版専用ファイル =====