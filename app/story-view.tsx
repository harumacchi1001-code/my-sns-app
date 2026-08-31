import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
    addDoc,
    arrayUnion,
    collection,
    doc,
    DocumentData,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
const STORY_DURATION_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
// ===== 投稿画面と、同じ、スタンプの、配置パターン =====
const STAMP_POSITIONS: { top?: string; bottom?: string; left?: string; right?: string }[] = [
  { top: "15%", left: "15%" },
  { top: "15%", right: "15%" },
  { bottom: "30%", left: "15%" },
  { bottom: "30%", right: "15%" },
  { top: "35%", left: "40%" },
  { top: "55%", left: "10%" },
];
export default function StoryViewScreen() {
  const router = useRouter();
  const { authorId } = useLocalSearchParams<{ authorId: string }>();
  const [stories, setStories] = useState<DocumentData[]>([]);
  const [author, setAuthor] = useState<DocumentData | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  // ===== 返信の、入力・送信中の状態 =====
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  // ===== 絵文字リアクションの、候補、選択、状態 =====
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];
  useEffect(() => {
    const loadStories = async () => {
      if (!authorId) return;
      const q = query(collection(db, "stories"), where("authorId", "==", authorId));
      const snapshot = await getDocs(q);
      const now = Date.now();
      const active = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((s: any) => {
          const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
          return now - createdMs < DAY_MS;
        })
        .sort((a: any, b: any) => {
          const aT = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bT = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return aT - bT;
        });
      setStories(active);
      setLoading(false);
      const authorQuery = query(collection(db, "users"), where("__name__", "==", authorId));
      const authorSnap = await getDocs(authorQuery);
      if (!authorSnap.empty) {
        setAuthor({ id: authorSnap.docs[0].id, ...authorSnap.docs[0].data() });
      }
    };
    loadStories();
  }, [authorId]);
  const currentStory = stories[index];
  // ===== 動画再生用の、プレーヤーを準備する =====
  // （写真のときは、videoSourceがnullになり、プレーヤーは何もしない）
  const videoSource = currentStory?.mediaType === "video" ? currentStory.mediaUrl : null;
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    // Web版のブラウザは、音声付き動画の自動再生を、ブロックすることがあるため、
    // 消音にしてから、自動再生する
    p.muted = true;
  });
  // ===== ストーリーが切り替わる、たびに、動画の、再生位置をリセットし、確実に、再生を、開始する =====
  useEffect(() => {
    if (!videoSource) return;
    player.currentTime = 0;
    player.play();
  }, [videoSource]);
  // ===== 開いたストーリーを、見た記録として残す =====
  useEffect(() => {
    const recordView = async () => {
      const myUid = auth.currentUser?.uid;
      if (!myUid || !currentStory) return;
      const viewedBy: string[] = currentStory.viewedBy || [];
      if (!viewedBy.includes(myUid)) {
        await updateDoc(doc(db, "stories", currentStory.id), {
          viewedBy: arrayUnion(myUid),
        });
      }
    };
    recordView();
  }, [currentStory?.id]);
  const goNext = () => {
    if (index < stories.length - 1) {
      setIndex((prev) => prev + 1);
    } else {
      router.back();
    }
  };
  const goPrev = () => {
    if (index > 0) {
      setIndex((prev) => prev - 1);
    } else {
      router.back();
    }
  };
  // ===== 写真のときだけ、5秒固定の、進み具合バーのタイマーを動かす =====
  useEffect(() => {
    if (!currentStory || currentStory.mediaType === "video") return;
    setProgress(0);
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const ratio = Math.min(elapsed / STORY_DURATION_MS, 1);
      setProgress(ratio);
      if (ratio >= 1) {
        goNext();
      }
    }, 50);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [index, currentStory?.id, currentStory?.mediaType]);
  // ===== 動画のときは、動画自体の再生位置を使って、進み具合バーを動かす =====
  useEffect(() => {
    if (!currentStory || currentStory.mediaType !== "video") return;
    setProgress(0);
    const endSubscription = player.addListener("playToEnd", () => {
      goNext();
    });
    const progressTimer = setInterval(() => {
      if (player.duration > 0) {
        setProgress(Math.min(player.currentTime / player.duration, 1));
      }
    }, 100);
    return () => {
      endSubscription.remove();
      clearInterval(progressTimer);
    };
  }, [currentStory?.id, currentStory?.mediaType]);
  const goToViewersList = () => {
    if (!currentStory) return;
    router.push({ pathname: "/story-viewers", params: { storyId: currentStory.id } });
  };
  const isMyStory = authorId === auth.currentUser?.uid;
  // ===== リアクションの、飛び出す、エフェクト、用の状態 =====
  const [floatingEmoji, setFloatingEmoji] = useState<string | null>(null);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const playReactionEffect = (emoji: string) => {
    setFloatingEmoji(emoji);
    floatAnim.setValue(0);
    Animated.timing(floatAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start(() => setFloatingEmoji(null));
  };
  // ===== ストーリーに、絵文字リアクションを、送る =====
  const sendReaction = async (emoji: string) => {
    if (!currentStory) return;
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    playReactionEffect(emoji);
    const reactions: Record<string, string[]> = { ...(currentStory.reactions || {}) };
    const list: string[] = reactions[emoji] || [];
    if (!list.includes(myEmail)) {
      reactions[emoji] = [...list, myEmail];
      await updateDoc(doc(db, "stories", currentStory.id), { reactions });
    }
    setReactionPickerVisible(false);
  };
  // ===== ストーリーへの、返信を、送信する（既存の個人チャットがあれば、そこに送り、なければ新しく作る） =====
  const handleSendReply = async () => {
    if (!replyText.trim() || !currentStory || !author?.email) return;
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    setSendingReply(true);
    try {
      const q = query(
        collection(db, "chats"),
        where("participants", "array-contains", myEmail),
        where("isGroup", "==", false)
      );
      const snapshot = await getDocs(q);
      const existingChat = snapshot.docs.find((docSnap) => {
        const participants: string[] = docSnap.data().participants || [];
        return participants.includes(author.email) && participants.length === 2;
      });
      let chatId: string;
      if (existingChat) {
        chatId = existingChat.id;
      } else {
        const newChat = await addDoc(collection(db, "chats"), {
          participants: [myEmail, author.email],
          isGroup: false,
          groupName: null,
          lastMessage: "",
          lastMessageAt: serverTimestamp(),
        });
        chatId = newChat.id;
      }
      // ===== 「〇〇さんのストーリーに返信」の、引用付きで、メッセージを送る =====
      const messageText = replyText.trim();
      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderEmail: myEmail,
        text: messageText,
        readBy: [myEmail],
        createdAt: new Date(),
        replyTo: {
          id: currentStory.id,
          text: "ストーリーに、返信",
          senderEmail: author.email,
          storyMediaUrl: currentStory.mediaUrl,
          storyMediaType: currentStory.mediaType,
        },
      });
      await updateDoc(doc(db, "chats", chatId), {
        lastMessage: messageText,
        lastMessageAt: new Date(),
      });
      setReplyText("");
      Keyboard.dismiss();
    } finally {
      setSendingReply(false);
    }
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  if (!currentStory) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>表示できるストーリーがありません</Text>
          <TouchableOpacity style={styles.closeTextButton} onPress={() => router.back()}>
            <Text style={styles.closeTextButtonLabel}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={styles.pageWrapper} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* 進み具合バー */}
        <View style={styles.progressRow}>
          {stories.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width:
                      i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
                  },
                ]}
              />
            </View>
          ))}
        </View>
        {/* ヘッダー */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {author?.photoUrl ? (
              <Image source={{ uri: author.photoUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={{ fontSize: 12 }}>👤</Text>
              </View>
            )}
            <Text style={styles.headerUsername}>
              {author?.handle || author?.username || "unknown"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* メディア表示 */}
        <View style={styles.mediaArea}>
          {currentStory.mediaType === "image" ? (
            <Image source={{ uri: currentStory.mediaUrl }} style={styles.media} />
          ) : (
            <VideoView
              key={currentStory.id}
              style={styles.media}
              player={player}
              contentFit="contain"
              nativeControls={false}
            />
          )}
          {/* ===== 投稿時に、重ねられた、テキスト（中央、固定） ===== */}
          {currentStory.overlayText && (
            <View style={styles.overlayTextWrapper} pointerEvents="none">
              <Text style={styles.overlayTextView}>{currentStory.overlayText}</Text>
            </View>
          )}
          {/* ===== 投稿時に、配置された、スタンプ ===== */}
          {(currentStory.overlayStamps || []).map((emoji: string, index: number) => (
            <View key={index} style={[styles.stampWrapper, STAMP_POSITIONS[index] as any]} pointerEvents="none">
              <Text style={styles.stampTextView}>{emoji}</Text>
            </View>
          ))}
          {/* 左右のタップゾーン（返信欄がある分、下側は、避けて配置） */}
          <View style={styles.tapZoneRow} pointerEvents="box-none">
            <TouchableOpacity style={styles.tapZone} activeOpacity={1} onPress={goPrev} />
            <TouchableOpacity style={styles.tapZone} activeOpacity={1} onPress={goNext} />
          </View>
        </View>
        {/* 自分のストーリーのときだけ、閲覧者ボタン＋受け取った、リアクションの、集計を、表示 */}
        {isMyStory && (
          <>
            <TouchableOpacity style={styles.viewersButton} onPress={goToViewersList}>
              <MaterialIcons name="visibility" size={18} color="#fff" />
              <Text style={styles.viewersButtonText}>
                {(currentStory.viewedBy || []).length}人が閲覧
              </Text>
            </TouchableOpacity>
            {Object.keys(currentStory.reactions || {}).length > 0 && (
              <View style={styles.myReactionSummaryRow}>
                {Object.entries(currentStory.reactions || {}).map(([emoji, list]: [string, any]) => (
                  <View key={emoji} style={styles.myReactionSummaryPill}>
                    <Text style={styles.myReactionSummaryText}>
                      {emoji} {list.length}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        {/* ===== 自分のストーリーでなければ、リアクションボタン＋返信の入力欄を表示 ===== */}
        {!isMyStory && (
          <View style={styles.replyRow}>
            <TouchableOpacity
              style={styles.reactionButton}
              onPress={() => setReactionPickerVisible((v) => !v)}
            >
              <Text style={{ fontSize: 20 }}>🙂</Text>
            </TouchableOpacity>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="返信を送信"
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.replyInput}
              onFocus={() => {
                if (timerRef.current) clearInterval(timerRef.current);
              }}
            />
            <TouchableOpacity
              onPress={handleSendReply}
              disabled={!replyText.trim() || sendingReply}
              style={styles.replySendButton}
            >
              {sendingReply ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="send" size={20} color={replyText.trim() ? "#4a90e2" : "#666"} />
              )}
            </TouchableOpacity>
          </View>
        )}
        {/* ===== 絵文字リアクションの、候補、選択、パネル ===== */}
        {reactionPickerVisible && !isMyStory && (
          <View style={styles.reactionPickerRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.reactionPickerButton} onPress={() => sendReaction(emoji)}>
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* ===== リアクションを送った、瞬間に、大きく飛び出す、エフェクト ===== */}
        {floatingEmoji && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.floatingEmojiWrapper,
              {
                opacity: floatAnim.interpolate({
                  inputRange: [0, 0.15, 0.7, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateY: floatAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -120],
                    }),
                  },
                  {
                    scale: floatAnim.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0.3, 1.3, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.floatingEmojiText}>{floatingEmoji}</Text>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
    backgroundColor: "#000",
  },
  emptyText: {
    color: "#fff",
    fontSize: 14,
    marginBottom: 16,
  },
  closeTextButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeTextButtonLabel: {
    color: "#4a90e2",
    fontSize: 14,
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#333",
  },
  headerAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  headerUsername: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  mediaArea: {
    flex: 1,
    position: "relative",
  },
  media: {
    flex: 1,
    resizeMode: "contain",
  },
  tapZoneRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  tapZone: {
    flex: 1,
  },
  viewersButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  viewersButtonText: {
    color: "#fff",
    fontSize: 13,
  },
  myReactionSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    paddingBottom: 10,
  },
  myReactionSummaryPill: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  myReactionSummaryText: {
    color: "#fff",
    fontSize: 13,
  },
  reactionButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  reactionPickerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  reactionPickerButton: {
    paddingHorizontal: 4,
  },
  floatingEmojiWrapper: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  floatingEmojiText: {
    fontSize: 80,
  },
  overlayTextWrapper: {
    position: "absolute",
    top: "45%",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  overlayTextView: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  stampWrapper: {
    position: "absolute",
  },
  stampTextView: {
    fontSize: 40,
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  replySendButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
});