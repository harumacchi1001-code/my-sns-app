import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, deleteDoc, doc, DocumentData, getDoc, getDocs, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PostThumbnail from "../../components/PostThumbnail";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";
type Post = DocumentData & { id: string };
const SNS_LIST = [
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
];
// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== ここまでWeb版専用 =====
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_THUMBNAIL_RATIO = 16 / 9;
export default function ProfileScreen() {
  const router = useRouter();
  const [userData, setUserData] = useState<DocumentData | null>(null);
  const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);
  const [privatePosts, setPrivatePosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"published" | "draft" | "private">("published");
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  // ===== ここからWeb版専用 =====
  const [webMenuVisible, setWebMenuVisible] = useState(false);
  const [followRequestCount, setFollowRequestCount] = useState(0);
  const [postMenuPosition, setPostMenuPosition] = useState({ top: 100, left: 100 });
  // ===== ここまでWeb版専用 =====
  // ===== 自分の、24時間以内のストーリー一覧 =====
  const [myStories, setMyStories] = useState<DocumentData[]>([]);
  useEffect(() => {
    // ログイン状態の復元が完了するのを、確実に待ってからデータ取得を始める
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      const uid = user.uid;
      const myEmail = user.email;
      const unsubscribeUser = onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
          setUserData(docSnap.data());
          // ===== ここからWeb版専用 =====
          setFollowRequestCount((docSnap.data().followRequests || []).length);
          // ===== ここまでWeb版専用 =====
        }
      });
      const publishedQuery = query(
        collection(db, "posts"),
        where("authorEmail", "==", myEmail),
        where("status", "==", "published"),
        orderBy("createdAt", "desc")
      );
      const unsubscribePublished = onSnapshot(publishedQuery, (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Post[];
        setPublishedPosts(data);
        setLoading(false);
      });
      const draftQuery = query(
        collection(db, "posts"),
        where("authorEmail", "==", myEmail),
        where("status", "==", "draft"),
        orderBy("createdAt", "desc")
      );
      const unsubscribeDraft = onSnapshot(draftQuery, (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Post[];
        setDraftPosts(data);
      });
      const privateQuery = query(
        collection(db, "posts"),
        where("authorEmail", "==", myEmail),
        where("status", "==", "private"),
        orderBy("createdAt", "desc")
      );
      const unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Post[];
        setPrivatePosts(data);
      });
      // ===== 自分のストーリーを取得（24時間以内のもののみ） =====
      const storiesQuery = query(collection(db, "stories"), where("authorId", "==", uid));
      const unsubscribeStories = onSnapshot(storiesQuery, (snapshot) => {
        const now = Date.now();
        const active = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((s: any) => {
            const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
            return now - createdMs < DAY_MS;
          });
        setMyStories(active);
      });
      return () => {
        unsubscribeUser();
        unsubscribePublished();
        unsubscribeDraft();
        unsubscribePrivate();
        unsubscribeStories();
      };
    });
    return () => unsubscribeAuth();
  }, []);
  const fetchLatestData = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    const myEmail = auth.currentUser?.email;
    if (!uid || !myEmail) return;
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      setUserData(userSnap.data());
    }
    const publishedQuery = query(
      collection(db, "posts"),
      where("authorEmail", "==", myEmail),
      where("status", "==", "published"),
      orderBy("createdAt", "desc")
    );
    const draftQuery = query(
      collection(db, "posts"),
      where("authorEmail", "==", myEmail),
      where("status", "==", "draft"),
      orderBy("createdAt", "desc")
    );
    const privateQuery = query(
      collection(db, "posts"),
      where("authorEmail", "==", myEmail),
      where("status", "==", "private"),
      orderBy("createdAt", "desc")
    );
    const [publishedSnap, draftSnap, privateSnap] = await Promise.all([
      getDocs(publishedQuery),
      getDocs(draftQuery),
      getDocs(privateQuery),
    ]);
    setPublishedPosts(
      publishedSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Post[]
    );
    setDraftPosts(
      draftSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Post[]
    );
    setPrivatePosts(
      privateSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Post[]
    );
  }, []);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLatestData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchLatestData]);
  const openLink = (url: string) => {
    if (url) Linking.openURL(url);
  };
  const goToFollowersList = (mode: "followers" | "following") => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    router.push({ pathname: "/followers-list", params: { userId: myUid, mode } });
  };
  const handleEditPost = (post: Post) => {
    setMenuPost(null);
    router.push({ pathname: "/(tabs)/post", params: { draftId: post.id } });
  };
  const handleMakePrivate = async (post: Post) => {
    setMenuPost(null);
    await updateDoc(doc(db, "posts", post.id), { status: "private" });
  };
  const handleMakePublic = async (post: Post) => {
    setMenuPost(null);
    await updateDoc(doc(db, "posts", post.id), { status: "published" });
  };
  const handleDeletePost = (post: Post) => {
    setMenuPost(null);
    if (isWeb) {
      const confirmed = window.confirm("この投稿を削除しますか？この操作は取り消せません。");
      if (confirmed) {
        deleteDoc(doc(db, "posts", post.id));
      }
      return;
    }
    Alert.alert("投稿を削除", "この投稿を削除しますか？この操作は取り消せません。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "posts", post.id));
        },
      },
    ]);
  };
  const handlePostMenuButtonPress = (post: Post, event: any) => {
    if (isWeb) {
      const pageX = event?.nativeEvent?.pageX ?? 100;
      const pageY = event?.nativeEvent?.pageY ?? 100;
      setPostMenuPosition({ top: pageY + 10, left: pageX - 10 });
    }
    setMenuPost(post);
  };
  const handleMenuButtonPress = () => {
    if (isWeb) {
      setWebMenuVisible(true);
    } else {
      router.push("/menu");
    }
  };
  const handleWebMenuNavigate = (path: string) => {
    setWebMenuVisible(false);
    router.push(path as any);
  };
  const performLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };
  const handleWebLogout = () => {
    setWebMenuVisible(false);
    if (isWeb) {
      const confirmed = window.confirm("ログアウトしますか？");
      if (confirmed) {
        performLogout();
      }
      return;
    }
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: performLogout,
      },
    ]);
  };
  // ===== 自分のストーリーがあれば、タップで閲覧画面を開く =====
  const handleAvatarPress = () => {
    const myUid = auth.currentUser?.uid;
    if (myStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: myUid } });
    }
  };
  // ===== 自分のストーリーに、まだ見ていないものがあるか =====
  const myUid = auth.currentUser?.uid;
  const myHasUnread = myStories.some((s) => !(s.viewedBy || []).includes(myUid));
  const displayedPosts =
    activeTab === "published" ? publishedPosts : activeTab === "draft" ? draftPosts : privatePosts;
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
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRefresh}>
            <Text style={styles.handleHeader}>{userData?.handle || ""}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenuButtonPress}>
            <MaterialIcons name="menu" size={26} color="#222" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={displayedPosts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListHeaderComponent={
            <View>
              <View style={styles.profileTopRow}>
                <View style={styles.avatarWrapper}>
                  <TouchableOpacity
                    onPress={handleAvatarPress}
                    activeOpacity={myStories.length > 0 ? 0.8 : 1}
                  >
                    <StampFrame
                      size={100}
                      imageUri={userData?.photoUrl || null}
                      borderColor="#888"
                      frameThickness={myStories.length > 0 && myHasUnread ? 6 : 2}
                      gradientColors={
                        myStories.length > 0 && myHasUnread ? ["#3D8BFF", "#7B3DFF"] : undefined
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.avatarPlusBadge}
                    onPress={() => router.push("/story-create")}
                  >
                    <MaterialIcons name="add" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{publishedPosts.length}</Text>
                    <Text style={styles.statLabel}>投稿</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => goToFollowersList("followers")}
                  >
                    <Text style={styles.statNumber}>{userData?.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>フォロワー</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={() => goToFollowersList("following")}
                  >
                    <Text style={styles.statNumber}>{userData?.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>フォロー中</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text
                style={[
                  styles.usernameText,
                  { color: userData?.usernameColor || "#222" },
                ]}
              >
                {userData?.username || "ユーザー"}
              </Text>
              {userData?.bio ? (
                <Text style={styles.bio}>{userData.bio}</Text>
              ) : (
                <Text style={styles.bioPlaceholder}>自己紹介文はまだありません</Text>
              )}
              <View style={styles.snsRow}>
                {SNS_LIST.map((sns) =>
                  userData?.snsLinks?.[sns.key] ? (
                    <TouchableOpacity
                      key={sns.key}
                      style={styles.snsButton}
                      onPress={() => openLink(userData.snsLinks[sns.key])}
                    >
                      <Text style={styles.snsButtonText}>{sns.label}</Text>
                    </TouchableOpacity>
                  ) : null
                )}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push("/profile-edit")}
                >
                  <Text style={styles.actionButtonText}>プロフィールを編集</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push("/my-card-edit")}
                >
                  <Text style={styles.actionButtonText}>マイカードを編集</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === "published" && styles.tabButtonActive]}
                  onPress={() => setActiveTab("published")}
                >
                  <Text style={activeTab === "published" ? styles.tabTextActive : styles.tabText}>
                    投稿
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === "draft" && styles.tabButtonActive]}
                  onPress={() => setActiveTab("draft")}
                >
                  <Text style={activeTab === "draft" ? styles.tabTextActive : styles.tabText}>
                    下書き
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === "private" && styles.tabButtonActive]}
                  onPress={() => setActiveTab("private")}
                >
                  <Text style={activeTab === "private" ? styles.tabTextActive : styles.tabText}>
                    非公開
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {activeTab === "published"
                  ? "まだ投稿がありません"
                  : activeTab === "draft"
                  ? "下書きはありません"
                  : "非公開の投稿はありません"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.menuButton}
                onPress={(event) => handlePostMenuButtonPress(item, event)}
              >
                <MaterialIcons name="more-horiz" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  activeTab === "published"
                    ? router.push({ pathname: "/post/[id]", params: { id: item.id } })
                    : router.push({ pathname: "/(tabs)/post", params: { draftId: item.id } })
                }
              >
                <View style={styles.thumbnailWrapper}>
                  {item.thumbnailUrl ? (
                    <PostThumbnail
                      url={item.thumbnailUrl}
                      mediaType={item.thumbnailType}
                      style={[
                        styles.thumbnail,
                        { aspectRatio: item.thumbnailAspectRatio || DEFAULT_THUMBNAIL_RATIO },
                      ]}
                    />
                  ) : (
                    <View style={styles.thumbnailPlaceholder} />
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title || "（無題）"}
                  </Text>
                  {activeTab === "published" && (
                    <Text style={styles.metaText}>♥ {item.likedBy?.length || 0}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
      <Modal
        visible={!!menuPost}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuPost(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuPost(null)}>
          <View style={isWeb ? styles.webPostMenuOverlay : styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={
                  isWeb
                    ? [styles.webMenuPopup, styles.webPostMenuPopup, { top: postMenuPosition.top, left: postMenuPosition.left }]
                    : styles.menuSheet
                }
              >
                <TouchableOpacity
                  style={isWeb ? styles.webMenuItem : styles.menuItem}
                  onPress={() => menuPost && handleEditPost(menuPost)}
                >
                  <MaterialIcons name="edit" size={20} color="#333" />
                  <Text style={isWeb ? styles.webMenuItemText : styles.menuItemText}>編集</Text>
                </TouchableOpacity>
                {menuPost?.status === "private" ? (
                  <TouchableOpacity
                    style={isWeb ? styles.webMenuItem : styles.menuItem}
                    onPress={() => menuPost && handleMakePublic(menuPost)}
                  >
                    <MaterialIcons name="public" size={20} color="#333" />
                    <Text style={isWeb ? styles.webMenuItemText : styles.menuItemText}>公開する</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={isWeb ? styles.webMenuItem : styles.menuItem}
                    onPress={() => menuPost && handleMakePrivate(menuPost)}
                  >
                    <MaterialIcons name="lock-outline" size={20} color="#333" />
                    <Text style={isWeb ? styles.webMenuItemText : styles.menuItemText}>非公開にする</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={isWeb ? styles.webMenuItem : styles.menuItem}
                  onPress={() => menuPost && handleDeletePost(menuPost)}
                >
                  <MaterialIcons name="delete-outline" size={20} color="#e74c3c" />
                  <Text style={[isWeb ? styles.webMenuItemText : styles.menuItemText, { color: "#e74c3c" }]}>削除</Text>
                </TouchableOpacity>
                {!isWeb && (
                  <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuPost(null)}>
                    <Text style={styles.menuCancelText}>キャンセル</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* ===== ここからWeb版専用：≡ボタンのポップアップメニュー ===== */}
      <Modal
        visible={webMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWebMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setWebMenuVisible(false)}>
          <View style={styles.webMenuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.webMenuPopup}>
                <TouchableOpacity
                  style={styles.webMenuItem}
                  onPress={() => handleWebMenuNavigate("/follow-requests")}
                >
                  <MaterialIcons name="person-add" size={20} color="#333" />
                  <Text style={styles.webMenuItemText}>フォローリクエスト</Text>
                  {followRequestCount > 0 && (
                    <View style={styles.webMenuBadge}>
                      <Text style={styles.webMenuBadgeText}>
                        {followRequestCount > 99 ? "99+" : followRequestCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.webMenuItem}
                  onPress={() => handleWebMenuNavigate("/liked-posts")}
                >
                  <MaterialIcons name="favorite-border" size={20} color="#333" />
                  <Text style={styles.webMenuItemText}>いいねした投稿</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.webMenuItem}
                  onPress={() => handleWebMenuNavigate("/saved-posts")}
                >
                  <MaterialIcons name="bookmark-border" size={20} color="#333" />
                  <Text style={styles.webMenuItemText}>保存した投稿</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.webMenuItem}
                  onPress={() => handleWebMenuNavigate("/comment-history")}
                >
                  <MaterialIcons name="chat-bubble-outline" size={20} color="#333" />
                  <Text style={styles.webMenuItemText}>コメント履歴</Text>
                </TouchableOpacity>
                <View style={styles.webMenuDivider} />
                <TouchableOpacity style={styles.webMenuItem} onPress={handleWebLogout}>
                  <MaterialIcons name="logout" size={20} color="#e74c3c" />
                  <Text style={[styles.webMenuItemText, { color: "#e74c3c" }]}>ログアウト</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {/* ===== ここまでWeb版専用 ===== */}
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
    paddingVertical: 30,
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  handleHeader: {
    fontSize: 22,
    fontWeight: "700",
    color: "#222",
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 12,
    gap: 20,
  },
  // ===== アイコンと「＋」バッジの、位置合わせ用 =====
  avatarWrapper: {
    position: "relative",
  },
  avatarPlusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 17,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  usernameText: {
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  bio: {
    fontSize: 14,
    color: "#333",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  bioPlaceholder: {
    fontSize: 13,
    color: "#bbb",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  snsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  snsButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  snsButtonText: {
    fontSize: 12,
    color: "#333",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  tabRow: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: "#222",
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
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 10,
  },
  card: {
    width: "48%",
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
    position: "relative",
  },
  menuButton: {
    position: "absolute",
    top: 6,
    left: 6,
    zIndex: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailWrapper: {
    width: "100%",
    backgroundColor: "#f0f0f0",
  },
  thumbnail: {
    width: "100%",
  },
  thumbnailPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#eee",
  },
  cardBody: {
    padding: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
    marginBottom: 6,
  },
  metaText: {
    fontSize: 11,
    color: "#666",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  menuItemText: {
    fontSize: 15,
    color: "#333",
  },
  menuCancel: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  menuCancelText: {
    fontSize: 15,
    color: "#999",
    fontWeight: "600",
  },
  webPostMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  webPostMenuPopup: {
    position: "absolute",
    marginRight: 0,
  },
  webMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: Platform.OS === "web" ? undefined : 0,
  },
  webMenuPopup: {
    width: 260,
    marginRight: "10%" as any,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  webMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  webMenuItemText: {
    fontSize: 14,
    color: "#222",
    flex: 1,
  },
  webMenuBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  webMenuBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  webMenuDivider: {
    height: 0.5,
    backgroundColor: "#eee",
    marginVertical: 6,
    marginHorizontal: 16,
  },
});