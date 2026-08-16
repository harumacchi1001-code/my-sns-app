import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, doc, DocumentData, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../components/StampFrame";
import { auth, db } from "../firebaseConfig";
type UserItem = DocumentData & { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export default function FollowersListScreen() {
  const { t } = useTranslation();
  const { userId, mode: initialMode } = useLocalSearchParams<{
    userId: string;
    mode: "followers" | "following";
  }>();
  const router = useRouter();
  const [mode, setMode] = useState<"followers" | "following">(initialMode || "followers");
  const [targetUserData, setTargetUserData] = useState<DocumentData | null>(null);
  const [myData, setMyData] = useState<DocumentData | null>(null);
  const [userMap, setUserMap] = useState<Record<string, UserItem>>({});
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const cleanupDoneRef = useRef(false);

  // ===== ストーリー関連の状態 =====
  const [stories, setStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onSnapshot(doc(db, "users", userId), (docSnap) => {
      if (docSnap.exists()) {
        setTargetUserData(docSnap.data());
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [userId]);
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const unsubscribe = onSnapshot(doc(db, "users", myUid), (docSnap) => {
      if (docSnap.exists()) {
        setMyData(docSnap.data());
      }
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, UserItem> = {};
      snapshot.docs.forEach((docSnap) => {
        map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setUserMap(map);
      setUsersLoaded(true);
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

  // ===== ここから自動クリーンアップ：自分自身の一覧を見ているとき、
  // followers/followingの中に、実在しないユーザーIDが混ざっていたら、
  // 自動的に取り除く =====
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    if (myUid !== userId) return; // 自分自身の一覧を見ているときだけ実行
    if (!usersLoaded) return; // 全ユーザー一覧の取得が終わってから判定する
    if (!targetUserData) return;
    if (cleanupDoneRef.current) return; // 1回の画面表示につき、1度だけ実行
    const followingIds: string[] = targetUserData.following || [];
    const followerIds: string[] = targetUserData.followers || [];
    const invalidFollowing = followingIds.filter((uid) => !userMap[uid]);
    const invalidFollowers = followerIds.filter((uid) => !userMap[uid]);
    if (invalidFollowing.length === 0 && invalidFollowers.length === 0) {
      cleanupDoneRef.current = true;
      return;
    }
    cleanupDoneRef.current = true;
    const cleanedFollowing = followingIds.filter((uid) => userMap[uid]);
    const cleanedFollowers = followerIds.filter((uid) => userMap[uid]);
    updateDoc(doc(db, "users", myUid), {
      following: cleanedFollowing,
      followers: cleanedFollowers,
    }).catch(() => {
      // クリーンアップに失敗しても、画面の表示自体には影響しないため、静かに無視する
    });
  }, [userId, usersLoaded, userMap, targetUserData]);
  // ===== ここまで自動クリーンアップ =====

  // ===== 任意のユーザーIDから、24時間以内のストーリー一覧を取り出す =====
  const getUserStories = (uid: string) => {
    const now = Date.now();
    return stories.filter((s) => {
      if (s.authorId !== uid) return false;
      const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
      return now - createdMs < DAY_MS;
    });
  };

  const myUid = auth.currentUser?.uid;

  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAvatarPress = (uid: string) => {
    const userStories = getUserStories(uid);
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: uid } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: uid } });
    }
  };

  const listIds: string[] =
    mode === "followers" ? targetUserData?.followers || [] : targetUserData?.following || [];
  const listUsers = listIds.map((uid) => userMap[uid]).filter(Boolean);
  const filteredUsers = listUsers.filter((u) =>
    (u.username || "").toLowerCase().includes(searchText.toLowerCase())
  );
  const isMyFollowing = (uid: string) => myData?.following?.includes(uid);
  const handleFollowBack = async (targetUid: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    await updateDoc(doc(db, "users", myUid), { following: arrayUnion(targetUid) });
    await updateDoc(doc(db, "users", targetUid), { followers: arrayUnion(myUid) });
  };
  const handleRemoveFollowing = async (targetUid: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    await updateDoc(doc(db, "users", myUid), { following: arrayRemove(targetUid) });
    await updateDoc(doc(db, "users", targetUid), { followers: arrayRemove(myUid) });
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>{t("followersList.backButton")}</Text>
          </TouchableOpacity>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === "followers" && styles.modeButtonActive]}
            onPress={() => setMode("followers")}
          >
            <Text style={mode === "followers" ? styles.modeTextActive : styles.modeText}>
              {t("followersList.followersTab")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "following" && styles.modeButtonActive]}
            onPress={() => setMode("following")}
          >
            <Text style={mode === "following" ? styles.modeTextActive : styles.modeText}>
              {t("followersList.followingTab")}
            </Text>
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder={t("followersList.searchPlaceholder")}
          value={searchText}
          onChangeText={setSearchText}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {mode === "followers" ? t("followersList.emptyFollowers") : t("followersList.emptyFollowing")}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMyself = item.id === auth.currentUser?.uid;
            const followingThisUser = isMyFollowing(item.id);
            const userStories = getUserStories(item.id);
            const hasUnread = userStories.some((s) => !(s.viewedBy || []).includes(myUid));

            return (
              <View style={styles.userRow}>
                <TouchableOpacity onPress={() => handleAvatarPress(item.id)}>
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
                  <Text style={styles.username}>{item.username || item.email}</Text>
                </TouchableOpacity>
                {!isMyself && mode === "followers" && !followingThisUser && (
                  <TouchableOpacity
                    style={styles.followBackButton}
                    onPress={() => handleFollowBack(item.id)}
                  >
                    <Text style={styles.followBackButtonText}>{t("followersList.followBackButton")}</Text>
                  </TouchableOpacity>
                )}
                {!isMyself && mode === "followers" && followingThisUser && (
                  <View style={styles.followingBadge}>
                    <Text style={styles.followingBadgeText}>{t("followersList.followingBadge")}</Text>
                  </View>
                )}
                {!isMyself && mode === "following" && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveFollowing(item.id)}
                  >
                    <Text style={styles.removeButtonText}>{t("followersList.removeButton")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
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
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  modeRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
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
  followBackButton: {
    backgroundColor: "#4a90e2",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  followBackButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  followingBadge: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  followingBadgeText: {
    fontSize: 12,
    color: "#999",
  },
  removeButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeButtonText: {
    fontSize: 12,
    color: "#666",
  },
});