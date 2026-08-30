import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    DocumentData,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
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
type MessageItem = DocumentData & { id: string };
const isWeb = Platform.OS === "web";
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
// ===== メッセージ内の、動画を、操作ボタン付きで再生する部品 =====
function MessageVideo({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = false;
  });
  return <VideoView style={style} player={player} contentFit="cover" nativeControls allowsFullscreen={false} />;
}
export default function GroupChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messageText, setMessageText] = useState("");
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const myUid = auth.currentUser?.uid;
  const myEmail = auth.currentUser?.email;
  // ===== メールアドレス → プロフィール画像、などを、引ける、辞書 =====
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  // ===== メッセージの、長押し・三点メニュー（返信・削除） =====
  const [messageMenuTarget, setMessageMenuTarget] = useState<{ item: MessageItem; isMine: boolean } | null>(null);
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
    const unsubscribe = onSnapshot(doc(db, "groups", id), (docSnap) => {
      if (docSnap.exists()) {
        setGroup({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);
  useEffect(() => {
    if (!id || !myUid) return;
    const unsubscribe = onSnapshot(doc(db, "groups", id, "members", myUid), (docSnap) => {
      setMemberRole(docSnap.exists() ? docSnap.data().role : null);
    });
    return unsubscribe;
  }, [id, myUid]);
  useEffect(() => {
    if (!id || !myUid) return;
    const unsubscribe = onSnapshot(doc(db, "groups", id, "joinRequests", myUid), (docSnap) => {
      setHasPendingRequest(docSnap.exists());
    });
    return unsubscribe;
  }, [id, myUid]);
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "groups", id, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as MessageItem[];
      setMessages(data);
    });
    return unsubscribe;
  }, [id]);
  // ===== 全ユーザーの、プロフィール情報を、取得しておく（メールアドレスから、アイコンを、引くため） =====
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
  // ===== グループの、チャット画面を開いたら、まだ読んでいない、メッセージを、既読にする =====
  useEffect(() => {
    const markAllAsRead = async () => {
      if (!id || !myEmail) return;
      const unreadMessages = messages.filter((m) => !(m.readBy || []).includes(myEmail));
      await Promise.all(
        unreadMessages.map((m) =>
          updateDoc(doc(db, "groups", id, "messages", m.id), {
            readBy: [...(m.readBy || []), myEmail],
          })
        )
      );
    };
    markAllAsRead();
  }, [id, messages, myEmail]);
  const isMember = !!memberRole;
  const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";
  const handleJoin = async () => {
    if (!id || !myUid || !myEmail || !group) return;
    if (memberRole) return;
    if (group.requireApproval) {
      await setDoc(doc(db, "groups", id, "joinRequests", myUid), {
        email: myEmail,
        requestedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, "groups", id, "members", myUid), {
        email: myEmail,
        role: "member",
        joinedAt: serverTimestamp(),
      });
    }
  };
  const handleLeave = async () => {
    if (!id || !myUid) return;
    if (memberRole === "owner") {
      alert("オーナーは、退会できません。先に、グループを、削除するか、管理画面から、他のメンバーに、権限を、譲ってください。");
      return;
    }
    if (isWeb) {
      const confirmed = window.confirm("このグループを、退会しますか？");
      if (!confirmed) return;
    }
    await deleteDoc(doc(db, "groups", id, "members", myUid));
  };
  const handleCancelRequest = async () => {
    if (!id || !myUid) return;
    await deleteDoc(doc(db, "groups", id, "joinRequests", myUid));
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
    await updateDoc(doc(db, "groups", id, "messages", messageId), {
      text: "",
      deleted: true,
    });
  };
  // ===== 三点・長押しメニューを開く（返信・削除） =====
  const openMessageMenu = (item: MessageItem, isMine: boolean, event?: any) => {
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
  const startReplyTo = (item: MessageItem) => {
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
    if (senderEmail === myEmail) return "自分";
    return senderEmail;
  };
  // ===== 絵文字リアクションの、候補ピッカーを開く =====
  const openReactionPicker = (messageId: string, event?: any) => {
    const pageX = event?.nativeEvent?.pageX ?? 100;
    const pageY = event?.nativeEvent?.pageY ?? 100;
    setReactionPickerFor({ id: messageId, top: pageY - 50, left: pageX - 120 });
  };
  // ===== メッセージへの、絵文字リアクションを、付ける・外す =====
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!id || !myEmail) return;
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
    await updateDoc(doc(db, "groups", id, "messages", messageId), { reactions });
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
      const folder = mediaType === "video" ? "groupVideos" : "groupImages";
      const fileName = `${folder}/${myUid}_${Date.now()}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, "groups", id, "messages"), {
        senderEmail: myEmail,
        text: "",
        mediaUrl: url,
        mediaType,
        mediaRatio: ratio,
        readBy: [myEmail],
        createdAt: serverTimestamp(),
        replyTo: replyingTo
          ? { id: replyingTo.id, text: replyingTo.text, senderEmail: replyingTo.senderEmail }
          : null,
      });
      setReplyingTo(null);
    } catch (error: any) {
      alert("送信に失敗しました：" + error.message);
    } finally {
      setMediaSending(false);
    }
  };
  const handleSend = async () => {
    if (!messageText.trim() || !id || !myEmail) return;
    await addDoc(collection(db, "groups", id, "messages"), {
      senderEmail: myEmail,
      text: messageText.trim(),
      readBy: [myEmail],
      createdAt: serverTimestamp(),
      replyTo: replyingTo
        ? { id: replyingTo.id, text: replyingTo.text, senderEmail: replyingTo.senderEmail }
        : null,
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
  if (!group) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text>グループが、見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }
  // ===== メンバーでなければ、チャットの中身は見せず、参加を促す画面にする =====
  if (!isMember) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.pageWrapper}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backText}>← 戻る</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group.name}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.joinPromptContainer}>
            <View style={styles.groupIconWrapper}>
              {group.iconUrl ? (
                <Image source={{ uri: group.iconUrl }} style={styles.groupIcon} />
              ) : (
                <MaterialIcons name="groups" size={30} color="#bbb" />
              )}
            </View>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.description ? <Text style={styles.groupDescription}>{group.description}</Text> : null}
            <Text style={styles.metaText}>メンバー {group.memberCount || 0}人</Text>
            {hasPendingRequest ? (
              <TouchableOpacity style={styles.pendingButton} onPress={handleCancelRequest}>
                <Text style={styles.pendingButtonText}>承認待ち（タップで、取り消し）</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.joinButton} onPress={handleJoin}>
                <Text style={styles.joinButtonText}>
                  {group.requireApproval ? "参加を申請する" : "参加する"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerIconWrapper}>
              {group.iconUrl ? (
                <Image source={{ uri: group.iconUrl }} style={styles.headerIcon} />
              ) : (
                <MaterialIcons name="groups" size={16} color="#bbb" />
              )}
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group.name}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push({ pathname: "/group/[id]/manage", params: { id } })}>
            <MaterialIcons name={isOwnerOrAdmin ? "settings" : "info-outline"} size={22} color="#333" />
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
                if (item.sharedPostId) {
                  const senderPhotoUrl = !isMine ? userMap[item.senderEmail]?.photoUrl : null;
                  return (
                    <View>
                      {dateSeparatorView}
                      <View
                        style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}
                        {...({
                          onMouseEnter: () => isWeb && setHoveredMessageId(item.id),
                          onMouseLeave: () => isWeb && setHoveredMessageId((current: string | null) => (current === item.id ? null : current)),
                        } as any)}
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
                        {isMine && isHovered && (
                          <View style={styles.hoverActionRow}>
                            <TouchableOpacity style={styles.hoverActionButton} onPress={(event) => openReactionPicker(item.id, event)}>
                              <Text style={styles.hoverActionIcon}>🙂</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.hoverActionButton} onPress={() => startReplyTo(item)}>
                              <Text style={styles.hoverActionIcon}>↩</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.hoverActionButton} onPress={(event) => openMessageMenu(item, isMine, event)}>
                              <Text style={styles.hoverActionIcon}>⋮</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.sharedPostCard}
                          onLongPress={(event) => openMessageMenu(item, isMine, event)}
                          onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.sharedPostId } })}
                        >
                          <View style={styles.sharedPostThumbnailPlaceholder}>
                            <MaterialIcons name="article" size={22} color="#bbb" />
                          </View>
                          <Text style={styles.sharedPostLabel}>投稿を、共有しました</Text>
                        </TouchableOpacity>
                        {!isMine && isHovered && (
                          <View style={styles.hoverActionRow}>
                            <TouchableOpacity style={styles.hoverActionButton} onPress={(event) => openReactionPicker(item.id, event)}>
                              <Text style={styles.hoverActionIcon}>🙂</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.hoverActionButton} onPress={() => startReplyTo(item)}>
                              <Text style={styles.hoverActionIcon}>↩</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.hoverActionButton} onPress={(event) => openMessageMenu(item, isMine, event)}>
                              <Text style={styles.hoverActionIcon}>⋮</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      {reactionsView}
                    </View>
                  );
                }
                if (item.mediaUrl) {
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
                        <Text style={isMine ? styles.myMessageText : styles.otherMessageText}>{item.text}</Text>
                      </TouchableOpacity>
                      {!isMine && actionIconsView}
                    </View>
                    {reactionsView}
                  </View>
                );
              }}
            />
          </TouchableWithoutFeedback>
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
              placeholder="メッセージを送信"
              value={messageText}
              onChangeText={setMessageText}
              style={styles.input}
              multiline
            />
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Text style={styles.sendButtonText}>送信</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
      {/* ===== メッセージの、三点・長押しメニュー ===== */}
      <Modal
        visible={!!messageMenuTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageMenuTarget(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMessageMenuTarget(null)}>
          <View style={styles.chatActionOverlayWeb}>
            <TouchableWithoutFeedback>
              <View
                style={[styles.chatActionPopup, { top: messageMenuPosition.top, left: messageMenuPosition.left }]}
              >
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
    paddingVertical: 30,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    gap: 10,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f7f7f7",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  headerIcon: {
    width: "100%",
    height: "100%",
  },
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  joinPromptContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  groupIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f7f7f7",
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  groupIcon: {
    width: "100%",
    height: "100%",
  },
  groupName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
  },
  groupDescription: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  metaText: {
    fontSize: 12,
    color: "#999",
    marginTop: 10,
  },
  joinButton: {
    backgroundColor: "#222",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 16,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  pendingButton: {
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 16,
  },
  pendingButtonText: {
    color: "#666",
    fontSize: 13,
    fontWeight: "600",
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
  senderEmailLabel: {
    fontSize: 11,
    color: "#999",
    marginBottom: 3,
    marginLeft: 4,
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
    marginLeft: 4,
  },
  reactionRowMine: {
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
    width: 200,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fafafa",
  },
  sharedPostThumbnailPlaceholder: {
    width: "100%",
    height: 100,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  sharedPostLabel: {
    fontSize: 12,
    color: "#666",
    padding: 10,
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