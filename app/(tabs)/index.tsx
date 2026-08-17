import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, collectionGroup, doc, DocumentData, getDocs, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CommentModal from "../../components/CommentModal";
import PostThumbnail from "../../components/PostThumbnail";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";
type Post = DocumentData & { id: string };
// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== _layout.web.tsx と同じ、しきい値 =====
const MOBILE_BREAKPOINT = 768;
// ===== ここまでWeb版専用 =====
// 直近1週間で、この件数以上の閲覧記録があれば、「今の興味」を優先する
const RECENT_ACTIVITY_THRESHOLD = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_THUMBNAIL_RATIO = 16 / 9;
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // ===== ここからWeb版専用：画面幅が狭いときは、Web版でもチャットアイコンを表示するために使う =====
  const { width } = useWindowDimensions();
  const isNarrowWidth = width < MOBILE_BREAKPOINT;
  // ===== ここまでWeb版専用 =====
  // ===== ここからWeb版専用：サイドバーから渡される、tabパラメータを受け取る =====
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  // ===== ここまでWeb版専用 =====
  const [posts, setPosts] = useState<Post[]>([]);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [shareMenuPost, setShareMenuPost] = useState<Post | null>(null);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [myChatIds, setMyChatIds] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  // ===== 「おすすめ／フォロー中」タブ関連の状態 =====
  const [feedMode, setFeedMode] = useState<"recommended" | "following">("recommended");
  const [following, setFollowing] = useState<string[]>([]);
  const [interestGenres, setInterestGenres] = useState<string[]>([]);
  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);
  // ===== ここからWeb版専用：tabパラメータが、"following"のときだけ、切り替える =====
  useEffect(() => {
    if (tab === "following") {
      setFeedMode("following");
    } else if (tab === "recommended") {
      setFeedMode("recommended");
    }
  }, [tab]);
  // ===== ここまでWeb版専用 =====
  useEffect(() => {
    const q = query(
      collection(db, "posts"),
      where("status", "==", "published"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Post[];
      setPosts(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
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
    const unsubscribe = onSnapshot(collection(db, "comments"), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((docSnap) => {
        const postId = docSnap.data().postId;
        counts[postId] = (counts[postId] || 0) + 1;
      });
      setCommentCounts(counts);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", myEmail)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMyChatIds(snapshot.docs.map((docSnap) => docSnap.id));
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail || myChatIds.length === 0) {
      setTotalUnreadCount(0);
      return;
    }
    const q = query(collectionGroup(db, "messages"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach((docSnap) => {
        const chatId = docSnap.ref.parent.parent?.id;
        if (!chatId || !myChatIds.includes(chatId)) return;
        const data = docSnap.data();
        const readBy: string[] = data.readBy || [];
        if (data.senderEmail !== myEmail && !readBy.includes(myEmail)) {
          total += 1;
        }
      });
      setTotalUnreadCount(total);
    });
    return unsubscribe;
  }, [myChatIds]);
  // ===== 自分のフォロー中一覧・興味ジャンルを取得 =====
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const unsubscribe = onSnapshot(doc(db, "users", myUid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFollowing(data.following || []);
        setInterestGenres(data.interestGenres || []);
      }
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
  // ===== 「今の興味ジャンル」を、直近1週間の閲覧履歴から割り出す =====
  const getCurrentInterestGenres = useCallback(async (): Promise<string[]> => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return interestGenres;
    const q = query(collection(db, "viewHistory"), where("userId", "==", myUid));
    const snapshot = await getDocs(q);
    const weekAgo = Date.now() - WEEK_MS;
    const recentHashtags: string[] = [];
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const viewedAtMs = data.viewedAt?.toDate ? data.viewedAt.toDate().getTime() : 0;
      if (viewedAtMs >= weekAgo) {
        recentHashtags.push(...(data.hashtags || []));
      }
    });
    // 直近1週間の閲覧件数が、基準（10件）未満のときは、登録時のジャンルを使う
    if (recentHashtags.length < RECENT_ACTIVITY_THRESHOLD) {
      return interestGenres;
    }
    // 基準を超えたときは、直近の閲覧で多かったジャンル順に並べ替えて使う
    const freq: Record<string, number> = {};
    recentHashtags.forEach((tag) => {
      freq[tag] = (freq[tag] || 0) + 1;
    });
    return Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  }, [interestGenres]);
  const [rankedRecommendedPosts, setRankedRecommendedPosts] = useState<Post[]>([]);
  // ===== 「おすすめ」タブのときだけ、投稿に点数をつけて並び替える =====
  useEffect(() => {
    if (feedMode !== "recommended") return;
    const buildRanking = async () => {
      const myEmail = auth.currentUser?.email;
      const genres = await getCurrentInterestGenres();
      const candidates = posts.filter((p) => p.authorEmail !== myEmail);
      const scored = candidates.map((post) => {
        let score = 0;
        const author = userMap[post.authorEmail];
        if (author?.id && following.includes(author.id)) {
          score += 100;
        }
        const matchedGenres = (post.hashtags || []).filter((tag: string) =>
          genres.includes(tag)
        );
        score += matchedGenres.length * 10;
        return { post, score };
      });
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTime = a.post.createdAt?.toDate ? a.post.createdAt.toDate().getTime() : 0;
        const bTime = b.post.createdAt?.toDate ? b.post.createdAt.toDate().getTime() : 0;
        return bTime - aTime;
      });
      setRankedRecommendedPosts(scored.map((s) => s.post));
    };
    buildRanking();
  }, [feedMode, posts, following, userMap, getCurrentInterestGenres]);
  // ===== ストーリーを、投稿者ごとにグループ化し、24時間以内のものだけに絞る =====
  const storyGroups = useMemo(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return { mine: [], others: [] as { authorId: string; items: DocumentData[]; hasUnread: boolean }[] };
    const now = Date.now();
    const relevantIds = new Set([myUid, ...following]);
    const active = stories.filter((s) => {
      const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
      return now - createdMs < DAY_MS && relevantIds.has(s.authorId);
    });
    const grouped: Record<string, DocumentData[]> = {};
    active.forEach((s) => {
      if (!grouped[s.authorId]) grouped[s.authorId] = [];
      grouped[s.authorId].push(s);
    });
    Object.values(grouped).forEach((arr) => {
      arr.sort((a, b) => {
        const aT = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bT = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return aT - bT;
      });
    });
    const mine = grouped[myUid] || [];
    const others = Object.keys(grouped)
      .filter((id) => id !== myUid)
      .map((authorId) => {
        const items = grouped[authorId];
        const hasUnread = items.some((s) => !(s.viewedBy || []).includes(myUid));
        return { authorId, items, hasUnread };
      });
    others.sort((a, b) => {
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      const aLatest = a.items[a.items.length - 1].createdAt?.toDate?.().getTime() || 0;
      const bLatest = b.items[b.items.length - 1].createdAt?.toDate?.().getTime() || 0;
      return bLatest - aLatest;
    });
    return { mine, others };
  }, [stories, following]);
  const myUid = auth.currentUser?.uid;
  // ===== 自分のストーリーに、まだ見ていないもの（自分自身が見ていないもの）があるか =====
  const myHasUnread = storyGroups.mine.some((s) => !(s.viewedBy || []).includes(myUid));
  const openMyStory = () => {
    if (storyGroups.mine.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: myUid } });
    } else {
      router.push("/story-create");
    }
  };
  const openOtherStory = (authorId: string) => {
    router.push({ pathname: "/story-view", params: { authorId } });
  };
  // ===== 任意のユーザーIDから、24時間以内のストーリー一覧を取り出す =====
  const getAuthorStories = useCallback(
    (authorId: string) => {
      const now = Date.now();
      return stories.filter((s) => {
        if (s.authorId !== authorId) return false;
        const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
        return now - createdMs < DAY_MS;
      });
    },
    [stories]
  );
  // ===== 投稿一覧の、投稿者アイコンをタップしたときの動作 =====
  const handlePostAuthorAvatarPress = (authorEmail: string) => {
    const author = userMap[authorEmail];
    if (!author?.id) return;
    const authorStories = getAuthorStories(author.id);
    if (authorStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: author.id } });
    } else {
      goToUserProfile(authorEmail);
    }
  };
  const fetchLatestData = useCallback(async () => {
    const postsQuery = query(
      collection(db, "posts"),
      where("status", "==", "published"),
      orderBy("createdAt", "desc")
    );
    const usersQuery = collection(db, "users");
    const commentsQuery = collection(db, "comments");
    const [postsSnap, usersSnap, commentsSnap] = await Promise.all([
      getDocs(postsQuery),
      getDocs(usersQuery),
      getDocs(commentsQuery),
    ]);
    const postsData = postsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Post[];
    setPosts(postsData);
    const map: Record<string, DocumentData> = {};
    usersSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.email) {
        map[data.email] = { id: docSnap.id, ...data };
      }
    });
    setUserMap(map);
    const counts: Record<string, number> = {};
    commentsSnap.docs.forEach((docSnap) => {
      const postId = docSnap.data().postId;
      counts[postId] = (counts[postId] || 0) + 1;
    });
    setCommentCounts(counts);
    const myEmail = auth.currentUser?.email;
    if (myEmail) {
      const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", myEmail)
      );
      const chatsSnap = await getDocs(chatsQuery);
      setMyChatIds(chatsSnap.docs.map((docSnap) => docSnap.id));
    }
  }, []);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLatestData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchLatestData]);
  const handleHomePress = useCallback(async () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    await handleRefresh();
  }, [handleRefresh]);
  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return "";
    const date = timestamp.toDate();
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };
  const stripHtml = (html: string) => {
    return (html || "").replace(/<[^>]+>/g, "");
  };
  const toggleLike = async (post: Post) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    const postRef = doc(db, "posts", post.id);
    const alreadyLiked = post.likedBy?.includes(myEmail);
    if (alreadyLiked) {
      await updateDoc(postRef, { likedBy: arrayRemove(myEmail) });
    } else {
      await updateDoc(postRef, { likedBy: arrayUnion(myEmail) });
    }
  };
  const toggleSave = async (post: Post) => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;
    const postRef = doc(db, "posts", post.id);
    const alreadySaved = post.savedBy?.includes(myEmail);
    if (alreadySaved) {
      await updateDoc(postRef, { savedBy: arrayRemove(myEmail) });
    } else {
      await updateDoc(postRef, { savedBy: arrayUnion(myEmail) });
    }
  };
  const goToHashtagSearch = (tag: string) => {
    router.push({ pathname: "/(tabs)/explore", params: { initialTag: tag } });
  };
  const goToUserProfile = (authorEmail: string) => {
    const author = userMap[authorEmail];
    if (!author?.id) return;
    router.push({ pathname: "/user/[id]", params: { id: author.id } });
  };
  const getPostLink = (postId: string) => {
    return `https://my-diary-sns.example.com/post/${postId}`;
  };
  const handleCopyLink = async () => {
    if (!shareMenuPost) return;
    await Clipboard.setStringAsync(getPostLink(shareMenuPost.id));
    setShareMenuPost(null);
    Alert.alert(t("home.linkCopiedTitle"), t("home.linkCopiedMessage"));
  };
  const handleShareToChat = () => {
    if (!shareMenuPost) return;
    const postId = shareMenuPost.id;
    setShareMenuPost(null);
    router.push({ pathname: "/chat/share", params: { postId } });
  };
  const handleExternalShare = async () => {
    if (!shareMenuPost) return;
    const post = shareMenuPost;
    setShareMenuPost(null);
    setTimeout(async () => {
      try {
        await Share.share({
          message: `${post.title || t("home.noTitle")}\n${getPostLink(post.id)}`,
        });
      } catch (error: any) {
        console.log("共有エラー:", error.message);
      }
    }, 500);
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  // ===== 表示する投稿一覧を、選択中のタブに応じて切り替える =====
  const displayedPosts =
    feedMode === "recommended"
      ? rankedRecommendedPosts
      : posts.filter((p) => {
          const author = userMap[p.authorEmail];
          return author?.id && following.includes(author.id);
        });
  const myUserData = userMap[auth.currentUser?.email || ""];
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleHomePress}>
            <Text style={styles.header}>{t("home.title")}</Text>
          </TouchableOpacity>
          {/* ===== ここからWeb版専用（パソコン幅のWeb版は、右上に共通の固定ボタンがあるため非表示。
                スマホ幅のWeb版・アプリ版では、ここに表示する） ===== */}
          {(!isWeb || isNarrowWidth) && (
            <TouchableOpacity style={styles.chatIconWrapper} onPress={() => router.push("/chat")}>
              <MaterialIcons name="send" size={24} color="#222" />
              {totalUnreadCount > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          {/* ===== ここまでWeb版専用 ===== */}
        </View>
        <FlatList
          ref={flatListRef}
          data={displayedPosts}
          keyExtractor={(item) => item.id}
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListHeaderComponent={
            <>
              {/* ===== ストーリー一覧行（切手風デザイン） ===== */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.storyRow}
                contentContainerStyle={styles.storyRowContent}
              >
                {/* 自分のストーリー枠：まだ見ていないストーリーがあれば、グラデーション枠を表示 */}
                <View style={styles.storyItem}>
                  <TouchableOpacity onPress={openMyStory} activeOpacity={0.85}>
                    <StampFrame
                      size={90}
                      imageUri={myUserData?.photoUrl || null}
                      borderColor="#888"
                      frameThickness={storyGroups.mine.length > 0 && myHasUnread ? 6 : 2}
                      gradientColors={
                        storyGroups.mine.length > 0 && myHasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
                      }
                    />
                    <TouchableOpacity style={styles.plusBadge} onPress={() => router.push("/story-create")}>
                      <MaterialIcons name="add" size={14} color="#fff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                  <Text style={styles.storyLabel} numberOfLines={1}>
                    あなた
                  </Text>
                </View>
                {/* フォロー中の人のストーリー：常に、その人のプロフィール画像を表示 */}
                {storyGroups.others.map(({ authorId, hasUnread }) => {
                  const author = Object.values(userMap).find((u: any) => u.id === authorId) as
                    | DocumentData
                    | undefined;
                  return (
                    <View key={authorId} style={styles.storyItem}>
                      <TouchableOpacity onPress={() => openOtherStory(authorId)} activeOpacity={0.85}>
                        <StampFrame
                          size={90}
                          imageUri={author?.photoUrl || null}
                          borderColor="#888"
                          gradientColors={hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined}
                        />
                      </TouchableOpacity>
                      <Text style={styles.storyLabel} numberOfLines={1}>
                        {author?.handle || author?.username || "unknown"}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
              {/* ===== おすすめ／フォロー中の切り替えタブ（Web版では、サイドバーから選ぶため、非表示） ===== */}
              {!isWeb && (
                <View style={styles.feedModeRow}>
                  <TouchableOpacity
                    style={[styles.feedModeButton, feedMode === "recommended" && styles.feedModeButtonActive]}
                    onPress={() => setFeedMode("recommended")}
                  >
                    <Text style={feedMode === "recommended" ? styles.feedModeTextActive : styles.feedModeText}>
                      おすすめ
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.feedModeButton, feedMode === "following" && styles.feedModeButtonActive]}
                    onPress={() => setFeedMode("following")}
                  >
                    <Text style={feedMode === "following" ? styles.feedModeTextActive : styles.feedModeText}>
                      フォロー中
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {feedMode === "following" ? "フォロー中の投稿はまだありません" : t("home.empty")}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const author = userMap[item.authorEmail];
            const myEmail = auth.currentUser?.email;
            const likedByMe = !!myEmail && !!item.likedBy?.includes(myEmail);
            const likeCount = item.likedBy?.length || 0;
            const commentCount = commentCounts[item.id] || 0;
            const savedByMe = !!myEmail && !!item.savedBy?.includes(myEmail);
            // ===== この投稿者の、ストーリーの有無・未読状況 =====
            const authorStories = author?.id ? getAuthorStories(author.id) : [];
            const authorHasUnread = authorStories.some(
              (s) => !(s.viewedBy || []).includes(myUid)
            );
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    onPress={() => handlePostAuthorAvatarPress(item.authorEmail)}
                    style={styles.cardHeaderAvatarWrapper}
                  >
                    <StampFrame
                      size={38}
                      imageUri={author?.photoUrl || null}
                      borderColor="#888"
                      frameThickness={authorStories.length > 0 && authorHasUnread ? 3 : 1}
                      gradientColors={
                        authorStories.length > 0 && authorHasUnread
                          ? ["#3D8BFF", "#7B3DFF"]
                          : undefined
                      }
                      notchesPerSide={4}
                      notchRadius={2}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => goToUserProfile(item.authorEmail)}>
                    <Text style={styles.username}>{author?.username || item.authorEmail}</Text>
                    <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
                >
                  {item.thumbnailUrl && (
                    <PostThumbnail
                      url={item.thumbnailUrl}
                      mediaType={item.thumbnailType}
                      style={[
                        styles.thumbnail,
                        { aspectRatio: item.thumbnailAspectRatio || DEFAULT_THUMBNAIL_RATIO },
                      ]}
                    />
                  )}
                  <View style={styles.cardBody}>
                    <Text style={styles.title}>
                      {item.title || t("home.noTitle")}
                    </Text>
                    {item.hashtags && item.hashtags.length > 0 && (
                      <View style={styles.hashtagRow}>
                        {item.hashtags.map((tag: string, index: number) => (
                          <TouchableOpacity key={index} onPress={() => goToHashtagSearch(tag)}>
                            <Text style={styles.hashtagText}>#{tag}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <Text style={styles.bodyPreview} numberOfLines={2} ellipsizeMode="tail">
                      {stripHtml(item.body)}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item)}>
                    <MaterialIcons
                      name={likedByMe ? "favorite" : "favorite-border"}
                      size={20}
                      color={likedByMe ? "#e74c3c" : "#666"}
                    />
                    <Text style={likedByMe ? styles.likedText : styles.metaText}>
                      {likeCount}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => setActiveCommentPost(item)}>
                    <MaterialIcons name="chat-bubble-outline" size={20} color="#666" />
                    <Text style={styles.metaText}>{commentCount}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => setShareMenuPost(item)}>
                    <MaterialIcons name="share" size={20} color="#666" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => toggleSave(item)}>
                    <MaterialIcons
                      name={savedByMe ? "bookmark" : "bookmark-border"}
                      size={20}
                      color={savedByMe ? "#4a90e2" : "#666"}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      </View>
      {activeCommentPost && (
        <CommentModal
          postId={activeCommentPost.id}
          postAuthorEmail={activeCommentPost.authorEmail}
          visible={!!activeCommentPost}
          onClose={() => setActiveCommentPost(null)}
        />
      )}
      <Modal visible={!!shareMenuPost} transparent animationType="fade" onRequestClose={() => setShareMenuPost(null)}>
        <TouchableWithoutFeedback onPress={() => setShareMenuPost(null)}>
          <View style={styles.shareOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.shareMenu}>
                <TouchableOpacity style={styles.shareMenuItem} onPress={handleCopyLink}>
                  <MaterialIcons name="link" size={20} color="#333" />
                  <Text style={styles.shareMenuText}>{t("home.shareCopyLink")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareMenuItem} onPress={handleShareToChat}>
                  <MaterialIcons name="send" size={20} color="#333" />
                  <Text style={styles.shareMenuText}>{t("home.shareToChat")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareMenuItem} onPress={handleExternalShare}>
                  <MaterialIcons name="ios-share" size={20} color="#333" />
                  <Text style={styles.shareMenuText}>{t("home.shareExternal")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareMenuCancel} onPress={() => setShareMenuPost(null)}>
                  <Text style={styles.shareMenuCancelText}>{t("home.shareCancel")}</Text>
                </TouchableOpacity>
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
  list: {
    flex: 1,
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
  },
  chatIconWrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chatBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: "#e74c3c",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  chatBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  // ===== ストーリー一覧行のスタイル =====
  storyRow: {
    flexGrow: 0,
  },
  storyRowContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 14,
  },
  storyItem: {
    alignItems: "center",
    width: 94,
  },
  plusBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  storyLabel: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
    textAlign: "center",
  },
  // ===== おすすめ／フォロー中タブのスタイル =====
  feedModeRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  feedModeButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  feedModeButtonActive: {
    backgroundColor: "#222",
    borderColor: "#222",
  },
  feedModeText: {
    fontSize: 13,
    color: "#333",
  },
  feedModeTextActive: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  // ===== ここからWeb版専用（card内の枠線・角丸のみ） =====
  card: {
    borderWidth: Platform.OS === "web" ? 1 : 0,
    borderColor: "#eee",
    borderRadius: Platform.OS === "web" ? 12 : 0,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    paddingBottom: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  // ===== ここまでWeb版専用 =====
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 10,
    // ===== ここからWeb版専用 =====
    paddingTop: Platform.OS === "web" ? 12 : 0,
    // ===== ここまでWeb版専用 =====
  },
  cardHeaderAvatarWrapper: {
    // StampFrameは、自身のサイズをそのまま使うため、特別な指定は不要
  },
  username: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  date: {
    fontSize: 11,
    color: "#999",
  },
  thumbnail: {
    width: "100%",
    backgroundColor: "#f0f0f0",
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
    marginBottom: 4,
  },
  hashtagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 0,
    marginBottom: 6,
  },
  hashtagText: {
    fontSize: 13,
    lineHeight: 14,
    color: "#4a90e2",
  },
  bodyPreview: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: "#666",
  },
  likedText: {
    fontSize: 14,
    color: "#e74c3c",
    fontWeight: "600",
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  shareMenu: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  shareMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  shareMenuText: {
    fontSize: 15,
    color: "#333",
  },
  shareMenuCancel: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  shareMenuCancelText: {
    fontSize: 15,
    color: "#e74c3c",
    fontWeight: "600",
  },
});