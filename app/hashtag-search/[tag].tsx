import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, DocumentData, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CardsIcon from "../../components/CardsIcon";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";

type UserItem = {
  id: string;
  username?: string;
  handle?: string;
  photoUrl?: string;
};

type PostItem = {
  id: string;
  title?: string;
  thumbnailUrl?: string | null;
  thumbnailAspectRatio?: number;
  hashtags?: string[];
  authorEmail?: string;
};

type HashtagCandidate = {
  tag: string;
  count: number;
};

const TABS = ["user", "post", "hashtag"] as const;
type TabMode = (typeof TABS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const isWeb = Platform.OS === "web";

const getHashtagCandidates = (allPosts: PostItem[], text: string): HashtagCandidate[] => {
  const keyword = text.trim().toLowerCase();
  if (!keyword) return [];
  const counts: Record<string, number> = {};
  allPosts.forEach((p) => {
    (p.hashtags || []).forEach((tag) => {
      if (tag.toLowerCase().includes(keyword)) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    });
  });
  return Object.keys(counts)
    .map((tag) => ({ tag, count: counts[tag] }))
    .sort((a, b) => b.count - a.count);
};

export default function HashtagSearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // ===== URLから、最初の検索ワードを受け取る（#は付いていない） =====
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const initialWord = tag ? decodeURIComponent(tag) : "";

  const [mode, setMode] = useState<TabMode>("hashtag");
  const [searchText, setSearchText] = useState(initialWord);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [discoverMenuVisible, setDiscoverMenuVisible] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // ===== スワイプ中の位置を、なめらかに追いかける、下線用のアニメーション値 =====
  const scrollX = useRef(new Animated.Value(0)).current;

  const [stories, setStories] = useState<DocumentData[]>([]);

  // ===== 開いた直後は、「タグ」タブ（一番右）から始める =====
  useEffect(() => {
    if (containerWidth > 0) {
      scrollRef.current?.scrollTo({ x: containerWidth * 2, animated: false });
      scrollX.setValue(containerWidth * 2);
    }
  }, [containerWidth]);

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const data = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((u) => u.id !== auth.currentUser?.uid) as UserItem[];
      setUsers(data);
    });

    const q = query(collection(db, "posts"), where("status", "==", "published"));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as PostItem[];
      setPosts(data);
      setLoading(false);
    });

    const unsubscribeStories = onSnapshot(collection(db, "stories"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setStories(data);
    });

    return () => {
      unsubscribeUsers();
      unsubscribePosts();
      unsubscribeStories();
    };
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

  const handleUserAvatarPress = (userId: string) => {
    const userStories = getUserStories(userId);
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: userId } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: userId } });
    }
  };

  const filteredUsers = searchText.trim()
    ? users.filter((u) => {
        const text = searchText.toLowerCase();
        const username = (u.username || "").toLowerCase();
        const handle = (u.handle || "").toLowerCase();
        return username.includes(text) || handle.includes(text);
      })
    : [];

  const filteredPosts = posts.filter((p) => {
    const text = searchText.toLowerCase();
    const titleMatch = (p.title || "").toLowerCase().includes(text);
    const hashtagMatch = (p.hashtags || []).some((t2) => t2.toLowerCase().includes(text));
    return titleMatch || hashtagMatch;
  });

  const hashtagCandidates = getHashtagCandidates(posts, searchText);

  // ===== ハッシュタグ候補をタップしたら、この画面自身を、さらに重ねて開く（無限に繰り返せる） =====
  const handleSelectHashtagCandidate = (nextTag: string) => {
    router.push(`/hashtag-search/${encodeURIComponent(nextTag)}` as any);
  };

  const handleTabPress = (index: number) => {
    setMode(TABS[index]);
    scrollRef.current?.scrollTo({ x: containerWidth * index, animated: true });
  };

  const handleMomentumScrollEnd = (e: any) => {
    if (containerWidth === 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    setMode(TABS[Math.max(0, Math.min(page, TABS.length - 1))]);
  };
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const getTabLabel = (key: TabMode) => {
    if (key === "user") return t("search.modeUser");
    if (key === "post") return t("search.modePost");
    return t("search.modeHashtag");
  };

  const getPlaceholder = () => {
    if (mode === "user") return t("search.placeholderUser");
    if (mode === "post") return t("search.placeholderPost");
    return t("search.placeholderHashtag");
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        {/* ===== 戻るボタン＋検索ワード ===== */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#222" />
          </TouchableOpacity>
          <Text style={styles.header} numberOfLines={1}>
            #{initialWord}
          </Text>
        </View>

        {/* ===== 検索バー（常時表示）＋発見アイコン ===== */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchInputWrapper}>
            <MaterialIcons name="search" size={18} color="#999" />
            <TextInput
              placeholder={getPlaceholder()}
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchInputField}
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity
            style={styles.discoverIconButton}
            onPress={() => setDiscoverMenuVisible(true)}
          >
            <CardsIcon size={20} color="#333" />
          </TouchableOpacity>
        </View>

        {/* ===== アカウント／投稿／タグ：下線タブ ===== */}
        <View style={styles.tabsRow}>
          {TABS.map((key, index) => (
            <TouchableOpacity
              key={key}
              style={styles.tabItem}
              onPress={() => handleTabPress(index)}
            >
              <Text style={mode === key ? styles.tabTextActive : styles.tabText}>
                {getTabLabel(key)}
              </Text>
            </TouchableOpacity>
          ))}
          {/* ===== スワイプに合わせて、なめらかに動く、1本の下線 ===== */}
          {containerWidth > 0 && (
            <Animated.View
              style={[
                styles.tabUnderlineMoving,
                {
                  width: containerWidth / TABS.length,
                  transform: [
                    {
                      translateX: scrollX.interpolate({
                        inputRange: [0, containerWidth * (TABS.length - 1)],
                        outputRange: [0, (containerWidth * (TABS.length - 1)) / TABS.length],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
        </View>

        {/* ===== 横スワイプで切り替わる、3つの結果ページ ===== */}
        <View
          style={styles.swipeContainer}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {containerWidth > 0 && (
            <Animated.ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              {/* ===== アカウント ===== */}
              <View style={[styles.tabPage, { width: containerWidth }]}>
                <FlatList
                  data={filteredUsers}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={
                    <View style={styles.centerContainer}>
                      <Text style={styles.emptyText}>
                        {searchText.trim() ? t("search.userEmptyResult") : t("search.userEmptySearch")}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const userStories = getUserStories(item.id);
                    const hasUnread = userStories.some(
                      (s) => !(s.viewedBy || []).includes(myUid)
                    );

                    return (
                      <View style={styles.userRow}>
                        <TouchableOpacity onPress={() => handleUserAvatarPress(item.id)}>
                          <StampFrame
                            size={44}
                            imageUri={item.photoUrl || null}
                            borderColor="#888"
                            frameThickness={userStories.length > 0 && hasUnread ? 3 : 1.5}
                            gradientColors={
                              userStories.length > 0 && hasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
                            }
                            notchesPerSide={4}
                            notchRadius={2}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.userTextWrapper}
                          onPress={() => router.push({ pathname: "/user/[id]", params: { id: item.id } })}
                        >
                          <Text style={styles.username}>{item.username || t("search.noName")}</Text>
                          {item.handle ? <Text style={styles.handle}>{item.handle}</Text> : null}
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              </View>

              {/* ===== 投稿：横並びリスト（16:9サムネイル＋タイトル全文＋ハッシュタグ全部） ===== */}
              <View style={[styles.tabPage, { width: containerWidth }]}>
                <FlatList
                  data={filteredPosts}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={
                    <View style={styles.centerContainer}>
                      <Text style={styles.emptyText}>{t("search.postEmptyResult")}</Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.postListRow}
                      onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
                    >
                      <View style={styles.postListThumbnailWrapper}>
                        {item.thumbnailUrl ? (
                          <Image
                            source={{ uri: item.thumbnailUrl }}
                            style={styles.postListThumbnail}
                            resizeMode="contain"
                          />
                        ) : (
                          <MaterialIcons name="image" size={20} color="#ccc" />
                        )}
                      </View>
                      <View style={styles.postListTextWrapper}>
                        <Text style={styles.postListTitle}>{item.title || t("search.noTitle")}</Text>
                        {item.hashtags && item.hashtags.length > 0 && (
                          <View style={styles.postListHashtagsRow}>
                            {item.hashtags.map((tag, index) => (
                              <Text key={`${tag}-${index}`} style={styles.postListHashtagChip}>
                                #{tag}
                              </Text>
                            ))}
                          </View>
                        )}
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color="#ccc" />
                    </TouchableOpacity>
                  )}
                />
              </View>

              {/* ===== タグ：ハッシュタグ候補の一覧（タップで、さらに深く検索） ===== */}
              <View style={[styles.tabPage, { width: containerWidth }]}>
                <FlatList
                  data={hashtagCandidates}
                  keyExtractor={(item) => item.tag}
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={
                    <View style={styles.centerContainer}>
                      <Text style={styles.emptyText}>
                        {searchText ? t("search.hashtagEmptyResult") : t("search.hashtagEmptySearch")}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.hashtagCandidateRow}
                      onPress={() => handleSelectHashtagCandidate(item.tag)}
                    >
                      <View style={styles.hashtagCandidateIconWrapper}>
                        <Text style={styles.hashtagCandidateIconText}>#</Text>
                      </View>
                      <View style={styles.hashtagCandidateTextWrapper}>
                        <Text style={styles.hashtagCandidateTag}>#{item.tag}</Text>
                        <Text style={styles.hashtagCandidateCount}>投稿 {item.count}件</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color="#ccc" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </Animated.ScrollView>
          )}
        </View>
      </View>

      {/* ===== 発見（ユーザー／投稿を選ぶ）中央カードメニュー ===== */}
      <Modal
        visible={discoverMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscoverMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDiscoverMenuVisible(false)}>
          <View style={styles.discoverMenuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.discoverMenuCard}>
                <TouchableOpacity
                  style={styles.discoverMenuCloseButton}
                  onPress={() => setDiscoverMenuVisible(false)}
                >
                  <MaterialIcons name="close" size={22} color="#999" />
                </TouchableOpacity>
                <Text style={styles.discoverMenuCardTitle}>発見</Text>
                <TouchableOpacity
                  style={styles.discoverMenuItem}
                  onPress={() => {
                    setDiscoverMenuVisible(false);
                    router.push("/discover-users");
                  }}
                >
                  <MaterialIcons name="people-outline" size={22} color="#4a90e2" />
                  <Text style={styles.discoverMenuItemText}>ユーザーで探す</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.discoverMenuItem}
                  onPress={() => {
                    setDiscoverMenuVisible(false);
                    router.push("/discover-posts");
                  }}
                >
                  <MaterialIcons name="photo-library" size={22} color="#e74c3c" />
                  <Text style={styles.discoverMenuItemText}>投稿で探す</Text>
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
  pageWrapper: Platform.select({
    web: {
      flex: 1,
      width: "100%",
      maxWidth: 1000,
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
  emptyText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  // ===== 戻るボタン＋検索ワードのヘッダー =====
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    fontSize: 18,
    fontWeight: "600",
    flexShrink: 1,
  },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fafafa",
  },
  searchInputField: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  discoverIconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
  },
  tabsRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    marginTop: 14,
    position: "relative",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 10,
  },
  tabText: {
    fontSize: 13,
    color: "#999",
  },
  tabTextActive: {
    fontSize: 13,
    color: "#222",
    fontWeight: "600",
  },
  tabUnderlineMoving: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
    backgroundColor: "#222",
    borderRadius: 1,
  },
  swipeContainer: {
    flex: 1,
  },
  tabPage: {
    flex: 1,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  userTextWrapper: {
    flex: 1,
  },
  username: {
    fontSize: 15,
    fontWeight: "500",
  },
  handle: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 12,
  },
  postListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  postListThumbnailWrapper: {
    width: 90,
    aspectRatio: 16 / 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  postListThumbnail: {
    width: "100%",
    height: "100%",
  },
  postListTextWrapper: {
    flex: 1,
  },
  postListTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#222",
    lineHeight: 19,
    marginBottom: 5,
  },
  postListHashtagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 2,
  },
  postListHashtagChip: {
    fontSize: 11,
    color: "#4a90e2",
  },
  hashtagCandidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  hashtagCandidateIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  hashtagCandidateIconText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  hashtagCandidateTextWrapper: {
    flex: 1,
  },
  hashtagCandidateTag: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  hashtagCandidateCount: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  discoverMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  discoverMenuCard: {
    width: "80%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  discoverMenuCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
  },
  discoverMenuCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
    textAlign: "center",
    marginBottom: 16,
  },
  discoverMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  discoverMenuItemText: {
    fontSize: 15,
    color: "#333",
  },
});