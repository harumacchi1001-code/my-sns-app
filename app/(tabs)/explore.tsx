import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, DocumentData, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  hashtags?: string[];
  authorEmail?: string;
};

type SearchMode = "discover" | "user" | "post" | "hashtag";

const DAY_MS = 24 * 60 * 60 * 1000;

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
const GRID_COLUMNS = isWeb ? 5 : 2;
// ===== ここまでWeb版専用 =====

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { initialTag } = useLocalSearchParams<{ initialTag?: string }>();
  const [mode, setMode] = useState<SearchMode>("discover");
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    if (initialTag) {
      setMode("hashtag");
      setSearchText(initialTag);
    }
  }, [initialTag]);

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

    // ===== ストーリー一覧を取得 =====
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

  // ===== 検索結果の、ユーザーアイコンをタップしたときの動作 =====
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

  const filteredPosts = posts.filter((p) =>
    (p.title || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const filteredByHashtag = posts.filter((p) =>
    (p.hashtags || []).some((tag) =>
      tag.toLowerCase().includes(searchText.toLowerCase())
    )
  );

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
        <Text style={styles.header}>{t("search.title")}</Text>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === "discover" && styles.modeButtonActive]}
            onPress={() => setMode("discover")}
          >
            <Text style={mode === "discover" ? styles.modeTextActive : styles.modeText}>
              発見
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "user" && styles.modeButtonActive]}
            onPress={() => setMode("user")}
          >
            <Text style={mode === "user" ? styles.modeTextActive : styles.modeText}>
              {t("search.modeUser")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "post" && styles.modeButtonActive]}
            onPress={() => setMode("post")}
          >
            <Text style={mode === "post" ? styles.modeTextActive : styles.modeText}>
              {t("search.modePost")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "hashtag" && styles.modeButtonActive]}
            onPress={() => setMode("hashtag")}
          >
            <Text style={mode === "hashtag" ? styles.modeTextActive : styles.modeText}>
              {t("search.modeHashtag")}
            </Text>
          </TouchableOpacity>
        </View>

        {mode === "discover" && (
          <View style={styles.discoverContainer}>
            <TouchableOpacity
              style={styles.discoverCard}
              onPress={() => router.push("/discover-users")}
            >
              <View style={styles.discoverIconWrapper}>
                <MaterialIcons name="people-outline" size={28} color="#4a90e2" />
              </View>
              <View style={styles.discoverTextWrapper}>
                <Text style={styles.discoverCardTitle}>ユーザーで探す</Text>
                <Text style={styles.discoverCardHint}>
                  気になる人を、スワイプでフォロー
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discoverCard}
              onPress={() => router.push("/discover-posts")}
            >
              <View style={styles.discoverIconWrapper}>
                <MaterialIcons name="photo-library" size={28} color="#e74c3c" />
              </View>
              <View style={styles.discoverTextWrapper}>
                <Text style={styles.discoverCardTitle}>投稿で探す</Text>
                <Text style={styles.discoverCardHint}>
                  気になる投稿を、スワイプでいいね
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>
          </View>
        )}

        {mode !== "discover" && (
          <TextInput
            placeholder={
              mode === "user" ? t("search.placeholderUser") :
              mode === "post" ? t("search.placeholderPost") :
              t("search.placeholderHashtag")
            }
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        )}

        {mode === "user" && (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
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
        )}

        {mode === "post" && (
          <FlatList
            data={filteredPosts}
            keyExtractor={(item) => item.id}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>{t("search.postEmptyResult")}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
              >
                <View style={styles.thumbnailWrapper}>
                  {item.thumbnailUrl ? (
                    <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder} />
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title || t("search.noTitle")}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {mode === "hashtag" && (
          <FlatList
            data={filteredByHashtag}
            keyExtractor={(item) => item.id}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={styles.row}
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
                style={styles.card}
                onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
              >
                <View style={styles.thumbnailWrapper}>
                  {item.thumbnailUrl ? (
                    <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder} />
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title || t("search.noTitle")}
                  </Text>
                  <Text style={styles.hashtagsText} numberOfLines={1}>
                    {(item.hashtags || []).map((tag) => `#${tag}`).join(" ")}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
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
      maxWidth: 1000,
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
    textAlign: "center",
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 20,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modeRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  modeButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  modeButtonActive: {
    backgroundColor: "#222",
    borderColor: "#222",
  },
  modeText: {
    fontSize: 13,
    color: "#333",
  },
  modeTextActive: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  // ===== 発見モードのスタイル =====
  discoverContainer: {
    padding: 16,
    gap: 12,
  },
  discoverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#fafafa",
  },
  discoverIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
  },
  discoverTextWrapper: {
    flex: 1,
  },
  discoverCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  discoverCardHint: {
    fontSize: 12,
    color: "#999",
  },
  discoverFootnote: {
    fontSize: 12,
    color: "#bbb",
    textAlign: "center",
    marginTop: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: "#fafafa",
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
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  row: {
    justifyContent: isWeb ? "flex-start" : "space-between",
    gap: isWeb ? 12 : 0,
    marginBottom: 10,
  },
  card: {
    width: isWeb ? "18.4%" : "48%",
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  thumbnailWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#f0f0f0",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  thumbnailPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#eee",
  },
  cardBody: {
    padding: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
    marginBottom: 4,
  },
  hashtagsText: {
    fontSize: 11,
    color: "#4a90e2",
  },
});