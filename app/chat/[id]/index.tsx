import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { addDoc, arrayRemove, collection, deleteDoc, doc, DocumentData, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MediaLightbox from "../../../components/MediaLightbox";
import StampFrame from "../../../components/StampFrame";
import { auth, db, storage } from "../../../firebaseConfig";
type Message = DocumentData & { id: string };
const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
// ===== メッセージ内の、動画を、操作ボタン付きで再生する部品 =====
function MessageVideo({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = false;
  });
  return <VideoView style={style} player={player} contentFit="cover" nativeControls allowsFullscreen={false} />;
}
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
  // ===== 削除・退会・キャンセルの、自作メニューの表示状態 =====
  const [showChatMenu, setShowChatMenu] = useState(false);
  // ===== Web版専用：ポップアップの表示位置 =====
  const [menuPosition, setMenuPosition] = useState({ top: 60, left: 100 });
  const isWeb = Platform.OS === "web";
  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);
  // ===== メッセージの、長押し・三点メニュー（返信・削除） =====
  const [messageMenuTarget, setMessageMenuTarget] = useState<{ item: Message; isMine: boolean } | null>(null);
  const [messageMenuPosition, setMessageMenuPosition] = useState({ top: 100, left: 100 });
  // ===== 返信中の、メッセージ =====
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; senderEmail: string } | null>(null);
  // ===== Web版専用：ホバー中の、メッセージID =====
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  // ===== 絵文字リアクションの、候補ピッカー =====
  const [reactionPickerFor, setReactionPickerFor] = useState<{ id: string; top: number; left: number } | null>(null);
  // ===== 画像・動画の、送信中フラグ =====
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
  // ===== 削除・退会の処理 =====
  const handleDeleteThisChat = async () => {
    if (!id) return;
    setShowChatMenu(false);
    await deleteDoc(doc(db, "chats", id));
    router.back();
  };
  const handleLeaveThisChat = async () => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail || !id) return;
    setShowChatMenu(false);
    await updateDoc(doc(db, "chats", id), { participants: arrayRemove(myEmail) });
    router.back();
  };
  // ===== 三本線ボタンから、タップ位置を受け取ってメニューを開く =====
  const openChatMenu = (event?: any) => {
    if (isWeb && event) {
      const pageX = event?.nativeEvent?.pageX ?? 100;
      const pageY = event?.nativeEvent?.pageY ?? 60;
      setMenuPosition({ top: pageY + 10, left: pageX - 180 });
    }
    setShowChatMenu(true);
  };
  // ===== メッセージの、日付を、「8月24日」のような、表示用の文字列に変換する =====
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
  // ===== 自分が送った、メッセージを削除する =====
  const handleDeleteMessage = async (messageId: string) => {
    if (!id) return;
    await updateDoc(doc(db, "chats", id, "messages", messageId), {
      text: "",
      deleted: true,
    });
  };
  // ===== 三点メニュー・長押しメニューを開く（返信・削除） =====
  const openMessageMenu = (item: Message, isMine: boolean, event?: any) => {
    console.log("DEBUG openMessageMenu:", "isMine=", isMine, "sharedPostId=", item.sharedPostId, "text=", item.text);
    if (isWeb && event) {
      const pageX = event?.nativeEvent?.pageX ?? 100;
      const pageY = event?.nativeEvent?.pageY ?? 100;
      const menuWidth = 180;
      const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1000;
      const left = Math.min(Math.max(pageX - 90, 8), windowWidth - menuWidth - 8);
      setMessageMenuPosition({ top: pageY - 10, left });
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
  // ===== 絵文字リアクションの、候補ピッカーを開く =====
  const openReactionPicker = (messageId: string, event?: any) => {
    const pageX = event?.nativeEvent?.pageX ?? 100;
    const pageY = event?.nativeEvent?.pageY ?? 100;
    setReactionPickerFor({ id: messageId, top: pageY - 50, left: pageX - 120 });
  };
  // ===== メッセージへの、絵文字リアクションを、付ける・外す =====
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!id) return;
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
    await updateDoc(doc(db, "chats", id, "messages", messageId), { reactions });
    setReactionPickerFor(null);
  };
  // ===== 画像・動画を選んで、アップロードし、メッセージとして送る =====
  const pickAndSendMedia = async () => {
    if (!id) return;
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
      await addDoc(collection(db, "chats", id, "messages"), {
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
      await updateDoc(doc(db, "chats", id), {
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
    if (!messageText.trim() || !id) return;
    const myEmail = auth.currentUser?.email;
    await addDoc(collection(db, "chats", id, "messages"), {
      senderEmail: myEmail,
      text: messageText.trim(),
      readBy: [myEmail],
      createdAt: new Date(),
      replyTo: replyingTo
        ? { id: replyingTo.id, text: replyingTo.text, senderEmail: replyingTo.senderEmail }
        : null,
    });
    await updateDoc(doc(db, "chats", id), {
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
  // ===== 個人チャットの、相手のメールアドレス（既読判定に使う） =====
  const otherEmailForRead = chat && !chat.isGroup
    ? chat.participants.find((p: string) => p !== myEmail)
    : null;
  // ===== 自分が送った、最後のメッセージのID =====
  const lastMyMessage = [...messages].reverse().find((m) => m.senderEmail === myEmail);
  const lastMyMessageId = lastMyMessage?.id;
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
          <View style={styles.headerRightRow}>
            {chat?.isGroup && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/chat/[id]/info", params: { id: id as string } })}
              >
                <Text style={styles.infoText}>{t("chatDetail.infoButton")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={(event) => openChatMenu(event)}>
              <Text style={styles.headerMenuIcon}>≡</Text>
            </TouchableOpacity>
          </View>
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
                const isHovered = isWeb && hoveredMessageId === item.id;
                const actionIconsView = isHovered ? (
                  <View style={styles.hoverActionRow}>
                    <TouchableOpacity
                      style={styles.hoverActionButton}
                      onPress={(event) => openReactionPicker(item.id, event)}
                    >
                      <Text style={styles.hoverActionIcon}>🙂</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.hoverActionButton} onPress={() => startReplyTo(item)}>
                      <Text style={styles.hoverActionIcon}>↩</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.hoverActionButton}
                      onPress={(event) => openMessageMenu(item, isMine, event)}
                    >
                      <Text style={styles.hoverActionIcon}>⋮</Text>
                    </TouchableOpacity>
                  </View>
                ) : null;
                const hoverHandlers = isWeb
                  ? {
                      onMouseEnter: () => setHoveredMessageId(item.id),
                      onMouseLeave: () => setHoveredMessageId((current) => (current === item.id ? null : current)),
                    }
                  : {};
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
                      <View
                        style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}
                        {...hoverHandlers}
                      >
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
                    <View
                      style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}
                      {...hoverHandlers}
                    >
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
                            {item.replyTo.storyMediaUrl && (
                              <TouchableOpacity
                                onPress={() =>
                                  openLightbox(item.replyTo.storyMediaUrl, item.replyTo.storyMediaType === "video")
                                }
                              >
                                {item.replyTo.storyMediaType === "video" ? (
                                  <View style={styles.replyStoryThumbnailPlaceholder}>
                                    <Text style={{ fontSize: 12 }}>🎬</Text>
                                  </View>
                                ) : (
                                  <Image
                                    source={{ uri: item.replyTo.storyMediaUrl }}
                                    style={styles.replyStoryThumbnail}
                                  />
                                )}
                              </TouchableOpacity>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.replyQuoteSender}>
                                {getSenderDisplayName(item.replyTo.senderEmail)}
                              </Text>
                              <Text style={styles.replyQuoteText} numberOfLines={1}>
                                {item.replyTo.text}
                              </Text>
                            </View>
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
          </TouchableWithoutFeedback>
          {/* ===== 返信中のプレビュー ===== */}
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
      </View>
      {/* ===== 削除・退会・キャンセルの、自作メニュー ===== */}
      <Modal
        visible={showChatMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChatMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowChatMenu(false)}>
          <View style={isWeb ? styles.chatActionOverlayWeb : styles.chatActionOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={
                  isWeb
                    ? [styles.chatActionPopup, { top: menuPosition.top, left: menuPosition.left }]
                    : styles.chatActionSheet
                }
              >
                <TouchableOpacity style={isWeb ? styles.chatActionItemWeb : styles.chatActionItem} onPress={handleDeleteThisChat}>
                  <Text style={styles.chatActionTextDanger}>削除</Text>
                </TouchableOpacity>
                <TouchableOpacity style={isWeb ? styles.chatActionItemWeb : styles.chatActionItem} onPress={handleLeaveThisChat}>
                  <Text style={styles.chatActionText}>退会</Text>
                </TouchableOpacity>
                {!isWeb && (
                  <TouchableOpacity style={styles.chatActionCancel} onPress={() => setShowChatMenu(false)}>
                    <Text style={styles.chatActionCancelText}>キャンセル</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* ===== メッセージの、三点・長押しメニュー ===== */}
      <Modal
        visible={!!messageMenuTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageMenuTarget(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMessageMenuTarget(null)}>
          <View style={isWeb ? styles.chatActionOverlayWeb : styles.chatActionOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={
                  isWeb
                    ? [styles.chatActionPopup, { top: messageMenuPosition.top, left: messageMenuPosition.left }]
                    : styles.chatActionSheet
                }
              >
                {messageMenuTarget && (
                  <TouchableOpacity style={isWeb ? styles.chatActionItemWeb : styles.chatActionItem} onPress={startReplyFromMenu}>
                    <Text style={styles.chatActionText}>返信</Text>
                  </TouchableOpacity>
                )}
                {messageMenuTarget?.isMine && (
                  <TouchableOpacity style={isWeb ? styles.chatActionItemWeb : styles.chatActionItem} onPress={confirmDeleteFromMenu}>
                    <Text style={styles.chatActionTextDanger}>削除</Text>
                  </TouchableOpacity>
                )}
                {!isWeb && (
                  <TouchableOpacity style={styles.chatActionCancel} onPress={() => setMessageMenuTarget(null)}>
                    <Text style={styles.chatActionCancelText}>キャンセル</Text>
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
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
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
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerMenuIcon: {
    fontSize: 22,
    color: "#222",
  },
  messageList: {
    padding: 16,
  },
  messageBubbleRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-end",
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
  // ===== 画像・動画メッセージの表示 =====
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
  // ===== 入力欄の、画像・動画ボタン =====
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(255,255,255,0.6)",
    paddingLeft: 8,
    marginBottom: 6,
  },
  replyStoryThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: "#333",
  },
  replyStoryThumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
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
  chatActionOverlayWeb: {
    flex: 1,
    position: "relative",
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
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
  chatActionItemWeb: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 40,
    justifyContent: "center",
  },
});