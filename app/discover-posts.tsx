import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    DocumentData,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../components/StampFrame";
import SwipeableCard from "../components/SwipeableCard";
import { auth, db } from "../firebaseConfig";
const DAILY_SWIPE_LIMIT = 99999;
const DAY_MS = 24 * 60 * 60 * 1000;
// ===== Web版・スマホ幅かどうかの判定に使う、しきい値 =====
const MOBILE_BREAKPOINT = 768;
type PostCandidate = DocumentData & { id: string };
// 今日の日付を、"2026-8-7" のような文字列にする（1日ごとの上限管理に使う）
const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};
// HTMLタグを取り除いた、プレーンテキストにする
const stripHtml = (html: string) => {
  return (html || "").replace(/<[^>]+>/g, "");
};
// 本文の中から、最初の3文だけを取り出す
const getFirstSentences = (html: string, count: number) => {
  const text = stripHtml(html).trim();
  if (!text) return "";
  const sentences = text.split(/(?<=[。！？.!?])\s*/).filter((s) => s.trim().length > 0);
  return sentences.slice(0, count).join("");
};
// 投稿の、サムネイル＋本文中の画像を、まとめて1つの配列にする
const getPostPhotos = (post: PostCandidate): string[] => {
  const photos: string[] = [];
  if (post.thumbnailUrl) photos.push(post.thumbnailUrl);
  if (post.contentBlocks) {
    post.contentBlocks.forEach((block: any) => {
      if (block.type === "image" && block.url) photos.push(block.url);
    });
  }
  return photos;
};
export default function DiscoverPostsScreen() {
  const router = useRouter();
  // ===== Web版・スマホ幅のときだけ、カードをコンパクトにするための判定 =====
  const { width } = useWindowDimensions();
  const isCompactWeb = Platform.OS === "web" && width < MOBILE_BREAKPOINT;
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<PostCandidate[]>([]);
  const [authorMap, setAuthorMap] = useState<Record<string, DocumentData>>({});
  const [cardIndex, setCardIndex] = useState(0);
  const [swipeCountToday, setSwipeCountToday] = useState(0);
  const [processing, setProcessing] = useState(false);
  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);
  useEffect(() => {
    const loadData = async () => {
      const myUid = auth.currentUser?.uid;
      const myEmail = auth.currentUser?.email;
      if (!myUid || !myEmail) return;
      // 今日、すでに何回スワイプしたかを確認する（ユーザー・投稿は共通の1日上限として扱う）
      const todayKey = getTodayKey();
      const limitDocSnap = await getDoc(doc(db, "swipeLimits", `${myUid}_${todayKey}`));
      const countSoFar = limitDocSnap.exists() ? limitDocSnap.data().count || 0 : 0;
      setSwipeCountToday(countSoFar);
      // 自分のフォロー中一覧を取得（非公開アカウントの判定に使う）
      const myDocSnap = await getDoc(doc(db, "users", myUid));
      const following: string[] = myDocSnap.exists() ? myDocSnap.data().following || [] : [];
      // 全ユーザー情報を取得し、著者情報・非公開判定・マイカード掲載投稿の判定に使う
      const usersSnap = await getDocs(collection(db, "users"));
      const usersById: Record<string, DocumentData> = {};
      const usersByEmail: Record<string, DocumentData> = {};
      usersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        usersById[docSnap.id] = { id: docSnap.id, ...data };
        if (data.email) {
          usersByEmail[data.email] = { id: docSnap.id, ...data };
        }
      });
      // マイカードに掲載されている投稿IDを、全ユーザー分まとめる
      const cardSelectedPostIds = new Set<string>();
      usersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const selectedIds: string[] = data.discoveryCard?.selectedPostIds || [];
        selectedIds.forEach((id) => cardSelectedPostIds.add(id));
      });
      // 今日、左スワイプ済みの投稿一覧を取得（優先順位を下げるために使う）
      const swipesSnap = await getDocs(collection(db, "swipes"));
      const leftSwipedToday: string[] = [];
      swipesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          data.fromUid === myUid &&
          data.targetType === "post" &&
          data.direction === "left" &&
          data.dayKey === todayKey
        ) {
          leftSwipedToday.push(data.targetId);
        }
      });
      // 公開中の投稿を取得
      const postsQuery = query(collection(db, "posts"), where("status", "==", "published"));
      const postsSnap = await getDocs(postsQuery);
      const allCandidates = postsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as PostCandidate[];
      // 自分自身の投稿・非公開かつ未フォローの人の投稿・
      // マイカードに掲載されていない投稿を除外
      const filteredCandidates = allCandidates.filter((post) => {
        if (post.authorEmail === myEmail) return false;
        if (!cardSelectedPostIds.has(post.id)) return false;
        const author = usersByEmail[post.authorEmail];
        if (author?.isPrivate && !following.includes(author.id)) return false;
        return true;
      });
      // 「まだ見ていない投稿」と「今日、左スワイプ済みの投稿」に分け、
      // それぞれシャッフルしてから、未見の投稿を優先して繋げる
      const notYetSeen = filteredCandidates.filter((p) => !leftSwipedToday.includes(p.id));
      const alreadySeenToday = filteredCandidates.filter((p) => leftSwipedToday.includes(p.id));
      const shuffle = (arr: PostCandidate[]) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };
      const orderedCandidates = [...shuffle(notYetSeen), ...shuffle(alreadySeenToday)];
      setCandidates(orderedCandidates);
      setAuthorMap(usersByEmail);
      setLoading(false);
    };
    loadData();
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
  const recordSwipe = async (targetId: string, direction: "left" | "right") => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const todayKey = getTodayKey();
    await setDoc(doc(db, "swipes", `${myUid}_post_${targetId}`), {
      fromUid: myUid,
      targetType: "post",
      targetId,
      direction,
      dayKey: todayKey,
      createdAt: serverTimestamp(),
    });
    const newCount = swipeCountToday + 1;
    await setDoc(doc(db, "swipeLimits", `${myUid}_${todayKey}`), {
      count: newCount,
    });
    setSwipeCountToday(newCount);
  };
  const handleLike = async (post: PostCandidate) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    const postRef = doc(db, "posts", post.id);
    const alreadyLiked = post.likedBy?.includes(myEmail);
    if (alreadyLiked) return;
    await updateDoc(postRef, { likedBy: [...(post.likedBy || []), myEmail] });
    if (post.authorEmail && post.authorEmail !== myEmail) {
      const myUid = auth.currentUser?.uid;
      let myUsername = myEmail;
      if (myUid) {
        const myDoc = await getDoc(doc(db, "users", myUid));
        if (myDoc.exists()) {
          myUsername = myDoc.data().username || myEmail;
        }
      }
      await addDoc(collection(db, "notifications"), {
        toUserEmail: post.authorEmail,
        fromUserEmail: myEmail,
        fromUsername: myUsername,
        type: "like",
        postId: post.id,
        read: false,
        createdAt: serverTimestamp(),
      });
    }
  };
  const handleSwipe = async (direction: "left" | "right") => {
    if (processing) return;
    if (swipeCountToday >= DAILY_SWIPE_LIMIT) return;
    const current = candidates[cardIndex];
    if (!current) return;
    setProcessing(true);
    try {
      if (direction === "right") {
        await handleLike(current);
      }
      await recordSwipe(current.id, direction);
      setCardIndex((prev) => prev + 1);
    } finally {
      setProcessing(false);
    }
  };
  const goToPostDetail = (postId: string) => {
    router.push({ pathname: "/post/[id]", params: { id: postId } });
  };
  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAvatarPress = (authorId: string) => {
    const authorStories = getUserStories(authorId);
    if (authorStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: authorId } });
    }
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  const hasReachedLimit = swipeCountToday >= DAILY_SWIPE_LIMIT;
  const currentCard = candidates[cardIndex];
  const nextCard = candidates[cardIndex + 1];
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>投稿で探す</Text>
          <Text style={styles.countText}>
            {swipeCountToday}/{DAILY_SWIPE_LIMIT}
          </Text>
        </View>
        <View style={styles.cardArea}>
          {hasReachedLimit ? (
            <View style={styles.centerContainer}>
              <MaterialIcons name="check-circle-outline" size={48} color="#ccc" />
              <Text style={styles.emptyTitle}>本日の発見は終わりです</Text>
              <Text style={styles.emptyText}>また明日、新しい投稿が待っています</Text>
            </View>
          ) : !currentCard ? (
            <View style={styles.centerContainer}>
              <MaterialIcons name="search" size={48} color="#ccc" />
              <Text style={styles.emptyTitle}>今は候補がありません</Text>
              <Text style={styles.emptyText}>また後で見に来てください</Text>
            </View>
          ) : (
            <>
              {nextCard && (
                <View style={[styles.card, styles.cardBehind]}>
                  <PostCardContent
                    key={nextCard.id}
                    post={nextCard}
                    author={authorMap[nextCard.authorEmail]}
                    onViewDetail={goToPostDetail}
                    authorStories={
                      authorMap[nextCard.authorEmail]?.id
                        ? getUserStories(authorMap[nextCard.authorEmail].id)
                        : []
                    }
                    onAvatarPress={handleAvatarPress}
                    isCompactWeb={isCompactWeb}
                  />
                </View>
              )}
              <SwipeableCard
                key={currentCard.id}
                onSwipeLeft={() => handleSwipe("left")}
                onSwipeRight={() => handleSwipe("right")}
              >
                <View style={styles.card}>
                  <PostCardContent
                    key={currentCard.id}
                    post={currentCard}
                    author={authorMap[currentCard.authorEmail]}
                    onViewDetail={goToPostDetail}
                    authorStories={
                      authorMap[currentCard.authorEmail]?.id
                        ? getUserStories(authorMap[currentCard.authorEmail].id)
                        : []
                    }
                    onAvatarPress={handleAvatarPress}
                    isCompactWeb={isCompactWeb}
                  />
                </View>
              </SwipeableCard>
            </>
          )}
        </View>
        {!hasReachedLimit && currentCard && (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.passButton}
              onPress={() => handleSwipe("left")}
              disabled={processing}
            >
              <MaterialIcons name="close" size={26} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.likeButton}
              onPress={() => handleSwipe("right")}
              disabled={processing}
            >
              <MaterialIcons name="favorite" size={24} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
function PostCardContent({
  post,
  author,
  onViewDetail,
  authorStories,
  onAvatarPress,
  isCompactWeb,
}: {
  post: PostCandidate;
  author?: DocumentData;
  onViewDetail: (postId: string) => void;
  authorStories: DocumentData[];
  onAvatarPress: (authorId: string) => void;
  isCompactWeb: boolean;
}) {
  const photos = getPostPhotos(post);
  const myUid = auth.currentUser?.uid;
  const hasUnread = authorStories.some((s) => !(s.viewedBy || []).includes(myUid));
  // ===== 写真を、左右タップで切り替えるための状態 =====
  const [photoIndex, setPhotoIndex] = useState(0);
  const goPrevPhoto = () => {
    setPhotoIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };
  const goNextPhoto = () => {
    setPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : prev));
  };
  const displayedPhoto = photos[photoIndex] || photos[0];
  const bodyPreview = getFirstSentences(post.body, isCompactWeb ? 2 : 3);
  return (
    <>
      <View style={[styles.cardPhotoArea, isCompactWeb && styles.cardPhotoAreaCompact]}>
        {displayedPhoto ? (
          <Image source={{ uri: displayedPhoto }} style={styles.cardPhoto} />
        ) : (
          <View style={styles.cardPhotoPlaceholder}>
            <MaterialIcons name="image" size={40} color="#ccc" />
          </View>
        )}
        {/* ===== 写真が複数あるときだけ、進み具合を示すバーを表示 ===== */}
        {photos.length > 1 && (
          <View style={styles.photoProgressRow}>
            {photos.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.photoProgressSegment,
                  index === photoIndex && styles.photoProgressSegmentActive,
                ]}
              />
            ))}
          </View>
        )}
        {/* ===== 写真の左半分・右半分をタップして、前後の写真に切り替える ===== */}
        {photos.length > 1 && (
          <View style={styles.photoTapZoneRow} pointerEvents="box-none">
            <TouchableOpacity style={styles.photoTapZone} activeOpacity={1} onPress={goPrevPhoto} />
            <TouchableOpacity style={styles.photoTapZone} activeOpacity={1} onPress={goNextPhoto} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        {/* ===== タイトル：省略せず全文表示 ===== */}
        <Text style={styles.postTitle}>{post.title || "（無題）"}</Text>
        {/* ===== ハッシュタグ：全て表示 ===== */}
        {post.hashtags && post.hashtags.length > 0 && (
          <View style={styles.hashtagRow}>
            {post.hashtags.map((tag: string) => (
              <Text key={tag} style={styles.hashtagText}>
                #{tag}
              </Text>
            ))}
          </View>
        )}
        {/* ===== 本文：最初の3文だけをプレビュー表示 ===== */}
        {bodyPreview ? <Text style={styles.bodyPreview}>{bodyPreview}</Text> : null}
        <View style={styles.cardHeaderRow}>
          <TouchableOpacity onPress={() => author?.id && onAvatarPress(author.id)}>
            <StampFrame
              size={26}
              imageUri={author?.photoUrl || null}
              borderColor="#888"
              frameThickness={authorStories.length > 0 && hasUnread ? 2.5 : 1}
              gradientColors={
                authorStories.length > 0 && hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
              }
              notchesPerSide={4}
              notchRadius={1.5}
            />
          </TouchableOpacity>
          <Text style={styles.cardUsername}>@{author?.handle || "unknown"}</Text>
        </View>
        {/* ===== 投稿を見るボタン ===== */}
        <TouchableOpacity
          style={styles.viewDetailButton}
          onPress={() => onViewDetail(post.id)}
        >
          <MaterialIcons name="article" size={16} color="#666" />
          <Text style={styles.viewDetailButtonText}>投稿を見る</Text>
        </TouchableOpacity>
      </View>
    </>
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
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
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
    fontSize: 16,
    fontWeight: "700",
  },
  countText: {
    fontSize: 13,
    color: "#999",
  },
  cardArea: {
    flex: 1,
    minHeight: 0,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  card: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardBehind: {
    position: "absolute",
    top: 28,
    width: "100%",
    alignSelf: "center",
    opacity: 0.5,
    transform: [{ scale: 0.96 }],
  },
  cardPhotoArea: {
    width: "100%",
    aspectRatio: 16 / 14,
    backgroundColor: "#f7f7f7",
    position: "relative",
  },
  // ===== Web版・スマホ幅のときだけ、写真を低くして、全体の高さに余裕を持たせる =====
  cardPhotoAreaCompact: {
    aspectRatio: 16 / 9,
  },
  cardPhoto: {
    width: "100%",
    height: "100%",
  },
  cardPhotoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  // ===== 写真の進み具合バー・タップゾーンのスタイル =====
  photoProgressRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  photoProgressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  photoProgressSegmentActive: {
    backgroundColor: "#fff",
  },
  photoTapZoneRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  photoTapZone: {
    flex: 1,
  },
  cardBody: {
    padding: 16,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    marginBottom: 8,
  },
  hashtagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 2,
    marginBottom: 8,
  },
  hashtagText: {
    fontSize: 12,
    color: "#4a90e2",
  },
  bodyPreview: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardUsername: {
    fontSize: 12,
    color: "#666",
  },
  // ===== 投稿を見るボタンのスタイル =====
  viewDetailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
  },
  viewDetailButtonText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    paddingBottom: 30,
  },
  passButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  likeButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "#e74c3c",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});