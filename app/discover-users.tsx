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
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
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

// 右スワイプ時のエフェクトを、何ミリ秒表示してから次のカードに進むか
const MATCH_EFFECT_DURATION = 750;

const DAY_MS = 24 * 60 * 60 * 1000;
// ===== Web版・スマホ幅かどうかの判定に使う、しきい値 =====
const MOBILE_BREAKPOINT = 768;

type Candidate = DocumentData & { id: string };

// 今日の日付を、"2026-8-7" のような文字列にする（1日ごとの上限管理に使う）
const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

export default function DiscoverUsersScreen() {
  const router = useRouter();
  // ===== Web版・スマホ幅のときだけ、カードをコンパクトにするための判定 =====
  const { width } = useWindowDimensions();
  const isCompactWeb = Platform.OS === "web" && width < MOBILE_BREAKPOINT;
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [swipeCountToday, setSwipeCountToday] = useState(0);
  const [processing, setProcessing] = useState(false);

  // ===== 右スワイプ時の演出（エフェクト）関連の状態 =====
  const [showMatchEffect, setShowMatchEffect] = useState(false);
  const matchEffectOpacity = useRef(new Animated.Value(0)).current;
  const matchEffectScale = useRef(new Animated.Value(0.7)).current;

  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const myUid = auth.currentUser?.uid;
      if (!myUid) return;

      // 今日、すでに何回スワイプしたかを確認する
      const todayKey = getTodayKey();
      const limitDocSnap = await getDoc(doc(db, "swipeLimits", `${myUid}_${todayKey}`));
      const countSoFar = limitDocSnap.exists() ? limitDocSnap.data().count || 0 : 0;
      setSwipeCountToday(countSoFar);

      // 自分のフォロー中一覧を取得
      const myDocSnap = await getDoc(doc(db, "users", myUid));
      const following: string[] = myDocSnap.exists() ? myDocSnap.data().following || [] : [];

      // 今日、左スワイプ済みの相手一覧を取得（優先順位を下げるために使う）
      const swipesSnap = await getDocs(collection(db, "swipes"));
      const leftSwipedToday: string[] = [];
      swipesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          data.fromUid === myUid &&
          data.targetType === "user" &&
          data.direction === "left" &&
          data.dayKey === todayKey
        ) {
          leftSwipedToday.push(data.targetId);
        }
      });

      // 候補となる全ユーザーを取得し、自分自身・フォロー中を除外
      const usersSnap = await getDocs(collection(db, "users"));
      const allCandidates = usersSnap.docs
        .filter((docSnap) => docSnap.id !== myUid && !following.includes(docSnap.id))
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Candidate[];

      // 「まだ見ていない人」と「今日、左スワイプ済みの人」に分け、
      // それぞれシャッフルしてから、未見の人を優先して繋げる
      const notYetSeen = allCandidates.filter((c) => !leftSwipedToday.includes(c.id));
      const alreadySeenToday = allCandidates.filter((c) => leftSwipedToday.includes(c.id));

      const shuffle = (arr: Candidate[]) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const orderedCandidates = [...shuffle(notYetSeen), ...shuffle(alreadySeenToday)];

      setCandidates(orderedCandidates);
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

    // スワイプの記録（同じ相手への最新のスワイプで上書き）
    await setDoc(doc(db, "swipes", `${myUid}_${targetId}`), {
      fromUid: myUid,
      targetType: "user",
      targetId,
      direction,
      dayKey: todayKey,
      createdAt: serverTimestamp(),
    });

    // 1日ごとのスワイプ回数を更新
    const newCount = swipeCountToday + 1;
    await setDoc(doc(db, "swipeLimits", `${myUid}_${todayKey}`), {
      count: newCount,
    });
    setSwipeCountToday(newCount);
  };

  const getFollowingList = async (uid: string) => {
    const docSnap = await getDoc(doc(db, "users", uid));
    return docSnap.exists() ? docSnap.data().following || [] : [];
  };

  const handleFollow = async (targetUser: Candidate) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;

    const myRef = doc(db, "users", myUid);
    const theirRef = doc(db, "users", targetUser.id);

    if (targetUser.isPrivate) {
      const alreadyRequested = targetUser.followRequests?.includes(myUid);
      if (!alreadyRequested) {
        await updateDoc(theirRef, {
          followRequests: [...(targetUser.followRequests || []), myUid],
        });

        const myDoc = await getDoc(myRef);
        const myUsername = myDoc.exists() ? myDoc.data().username : auth.currentUser?.email;

        await addDoc(collection(db, "notifications"), {
          toUserEmail: targetUser.email,
          fromUserEmail: auth.currentUser?.email,
          fromUsername: myUsername,
          type: "follow_request",
          postId: null,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      return;
    }

    // ===== 重複フォロー防止：すでにフォロー中なら、何もしない =====
    const currentFollowing = await getFollowingList(myUid);
    if (currentFollowing.includes(targetUser.id)) {
      return;
    }

    await updateDoc(myRef, { following: [...currentFollowing, targetUser.id] });

    // ===== 相手側のfollowersも、重複しないよう確認してから追加 =====
    const theirLatestDoc = await getDoc(theirRef);
    const theirCurrentFollowers: string[] = theirLatestDoc.exists()
      ? theirLatestDoc.data().followers || []
      : [];
    if (!theirCurrentFollowers.includes(myUid)) {
      await updateDoc(theirRef, {
        followers: [...theirCurrentFollowers, myUid],
      });
    }

    const myDoc = await getDoc(myRef);
    const myUsername = myDoc.exists() ? myDoc.data().username : auth.currentUser?.email;

    await addDoc(collection(db, "notifications"), {
      toUserEmail: targetUser.email,
      fromUserEmail: auth.currentUser?.email,
      fromUsername: myUsername,
      type: "follow",
      postId: null,
      read: false,
      createdAt: serverTimestamp(),
    });
  };

  // ===== 右スワイプ時のエフェクトを再生する処理 =====
  const playMatchEffect = () => {
    return new Promise<void>((resolve) => {
      setShowMatchEffect(true);
      matchEffectOpacity.setValue(0);
      matchEffectScale.setValue(0.7);

      Animated.parallel([
        Animated.timing(matchEffectOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(matchEffectScale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        Animated.timing(matchEffectOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setShowMatchEffect(false);
          resolve();
        });
      }, MATCH_EFFECT_DURATION);
    });
  };

  const handleSwipe = async (direction: "left" | "right") => {
    if (processing) return;
    if (swipeCountToday >= DAILY_SWIPE_LIMIT) return;

    const current = candidates[cardIndex];
    if (!current) return;

    setProcessing(true);
    try {
      if (direction === "right") {
        await handleFollow(current);
        await recordSwipe(current.id, direction);
        // ===== 右スワイプのときだけ、エフェクトを再生してから次に進む =====
        await playMatchEffect();
      } else {
        await recordSwipe(current.id, direction);
      }
      setCardIndex((prev) => prev + 1);
    } finally {
      setProcessing(false);
    }
  };

  const goToProfile = (userId: string) => {
    router.push({ pathname: "/user/[id]", params: { id: userId } });
  };

  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAvatarPress = (userId: string) => {
    const userStories = getUserStories(userId);
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: userId } });
    } else {
      goToProfile(userId);
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
          <Text style={styles.headerTitle}>ユーザーで探す</Text>
          <Text style={styles.countText}>
            {swipeCountToday}/{DAILY_SWIPE_LIMIT}
          </Text>
        </View>

        <View style={styles.cardArea}>
          {hasReachedLimit ? (
            <View style={styles.centerContainer}>
              <MaterialIcons name="check-circle-outline" size={48} color="#ccc" />
              <Text style={styles.emptyTitle}>本日の発見は終わりです</Text>
              <Text style={styles.emptyText}>また明日、新しい出会いが待っています</Text>
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
                  <UserCardContent
                    key={nextCard.id}
                    user={nextCard}
                    onViewProfile={goToProfile}
                    userStories={getUserStories(nextCard.id)}
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
                  <UserCardContent
                    key={currentCard.id}
                    user={currentCard}
                    onViewProfile={goToProfile}
                    userStories={getUserStories(currentCard.id)}
                    onAvatarPress={handleAvatarPress}
                    isCompactWeb={isCompactWeb}
                  />
                </View>
              </SwipeableCard>

              {/* ===== 右スワイプ時のマッチエフェクト ===== */}
              {showMatchEffect && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.matchOverlay,
                    {
                      opacity: matchEffectOpacity,
                      transform: [{ scale: matchEffectScale }],
                    },
                  ]}
                >
                  <View style={styles.matchIconCircle}>
                    <MaterialIcons name="person-add" size={40} color="#4a90e2" />
                  </View>
                  <Text style={styles.matchText}>フォロー！</Text>
                </Animated.View>
              )}
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
              style={styles.followButton}
              onPress={() => handleSwipe("right")}
              disabled={processing}
            >
              <MaterialIcons name="person-add" size={24} color="#4a90e2" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function UserCardContent({
  user,
  onViewProfile,
  userStories,
  onAvatarPress,
  isCompactWeb,
}: {
  user: Candidate;
  onViewProfile: (userId: string) => void;
  userStories: DocumentData[];
  onAvatarPress: (userId: string) => void;
  isCompactWeb: boolean;
}) {
  const card = user.discoveryCard || {};
  const photos: string[] = card.photos || [];
  const selectedPostIds: string[] = card.selectedPostIds || [];

  const myUid = auth.currentUser?.uid;
  const hasUnread = userStories.some((s) => !(s.viewedBy || []).includes(myUid));

  // ===== カード写真を、左右タップで切り替えるための状態 =====
  const [photoIndex, setPhotoIndex] = useState(0);

  const goPrevPhoto = () => {
    setPhotoIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goNextPhoto = () => {
    setPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : prev));
  };

  const displayedPhoto = photos[photoIndex] || photos[0];

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
        <View style={styles.cardHeaderRow}>
          <TouchableOpacity onPress={() => onAvatarPress(user.id)}>
            <StampFrame
              size={42}
              imageUri={user.photoUrl || null}
              borderColor="#888"
              frameThickness={userStories.length > 0 && hasUnread ? 3 : 1.5}
              gradientColors={
                userStories.length > 0 && hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
              }
              notchesPerSide={4}
              notchRadius={2}
            />
          </TouchableOpacity>
          <View>
            <Text style={styles.cardUsername}>@{user.handle || "unknown"}</Text>
            <Text style={styles.cardStats}>
              フォロワー {user.followers?.length || 0}
            </Text>
          </View>
        </View>

        {/* ===== 自己紹介文：省略せず、全て表示する ===== */}
        {user.bio ? (
          <Text style={styles.cardBio}>{user.bio}</Text>
        ) : null}

        {user.interestGenres && user.interestGenres.length > 0 && (
          <View style={styles.genreRow}>
            {user.interestGenres.slice(0, 4).map((genre: string, index: number) => (
              <View key={genre} style={index === 0 ? styles.genreChipMain : styles.genreChip}>
                <Text style={index === 0 ? styles.genreChipMainText : styles.genreChipText}>
                  {genre}
                </Text>
              </View>
            ))}
          </View>
        )}

        {selectedPostIds.length > 0 && (
          <Text style={styles.postCountHint}>{selectedPostIds.length}件の投稿を紹介中</Text>
        )}

        {/* ===== プロフィールを見るボタン ===== */}
        <TouchableOpacity
          style={styles.viewProfileButton}
          onPress={() => onViewProfile(user.id)}
        >
          <MaterialIcons name="person-outline" size={16} color="#666" />
          <Text style={styles.viewProfileButtonText}>プロフィールを見る</Text>
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
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  cardUsername: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  cardStats: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  cardBio: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
    marginBottom: 12,
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  genreChipMain: {
    backgroundColor: "#e8f1fc",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  genreChipMainText: {
    fontSize: 12,
    color: "#4a90e2",
    fontWeight: "600",
  },
  genreChip: {
    borderWidth: 0.5,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  genreChipText: {
    fontSize: 12,
    color: "#666",
  },
  postCountHint: {
    fontSize: 11,
    color: "#999",
    marginBottom: 10,
  },
  // ===== プロフィールを見るボタンのスタイル =====
  viewProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4,
  },
  viewProfileButtonText: {
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
  followButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  // ===== マッチエフェクトのスタイル =====
  matchOverlay: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    backgroundColor: "rgba(74,144,226,0.9)",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  matchIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  matchText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
  },
});