import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StampFrame from "../../components/StampFrame";
import { auth, db } from "../../firebaseConfig";
type Post = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  likedBy?: string[];
};
const SNS_LIST = [
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export default function UserDetailScreen() {
  const { t } = useTranslation();
  const { id, fromPostId } = useLocalSearchParams<{ id: string; fromPostId?: string }>();
  const router = useRouter();
  const [userData, setUserData] = useState<DocumentData | null>(null);
  const [myData, setMyData] = useState<DocumentData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  // ===== このユーザーの、24時間以内のストーリー一覧 =====
  const [userStories, setUserStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    if (!id) return;
    const unsubscribeUser = onSnapshot(doc(db, "users", id), (docSnap) => {
      if (docSnap.exists()) {
        setUserData({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    const myUid = auth.currentUser?.uid;
    const unsubscribeMe = myUid
      ? onSnapshot(doc(db, "users", myUid), (docSnap) => {
          if (docSnap.exists()) {
            setMyData(docSnap.data());
          }
        })
      : () => {};
    return () => {
      unsubscribeUser();
      unsubscribeMe();
    };
  }, [id]);

  // ===== このユーザーの、ストーリーを取得（24時間以内のもののみ） =====
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "stories"), where("authorId", "==", id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const active = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((s: any) => {
          const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
          return now - createdMs < DAY_MS;
        });
      setUserStories(active);
    });
    return unsubscribe;
  }, [id]);

  const isFollowing = myData?.following?.includes(id);
  const isMyself = auth.currentUser?.uid === id;
  const hasRequestedFollow = userData?.followRequests?.includes(auth.currentUser?.uid);
  const canSeePosts = isMyself || !userData?.isPrivate || isFollowing;

  useEffect(() => {
    if (!userData?.email || !canSeePosts) {
      setPosts([]);
      return;
    }
    const q = query(
      collection(db, "posts"),
      where("authorEmail", "==", userData.email),
      where("status", "==", "published"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Post[];
      setPosts(data);
    });
    return unsubscribe;
  }, [userData?.email, canSeePosts]);

  const recordFollowFromPost = async () => {
    if (!fromPostId) return;
    await updateDoc(doc(db, "posts", fromPostId), {
      followsFromPost: increment(1),
    });
  };
  const toggleFollow = async () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !id) return;
    const myRef = doc(db, "users", myUid);
    const theirRef = doc(db, "users", id);
    if (isFollowing) {
      await updateDoc(myRef, { following: arrayRemove(id) });
      await updateDoc(theirRef, { followers: arrayRemove(myUid) });
      return;
    }
    if (userData?.isPrivate) {
      if (hasRequestedFollow) {
        await updateDoc(theirRef, { followRequests: arrayRemove(myUid) });
      } else {
        await updateDoc(theirRef, { followRequests: arrayUnion(myUid) });
        const myDoc = await getDoc(myRef);
        const myUsername = myDoc.exists() ? myDoc.data().username : auth.currentUser?.email;
        await addDoc(collection(db, "notifications"), {
          toUserEmail: userData?.email,
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
    await updateDoc(myRef, { following: arrayUnion(id) });
    await updateDoc(theirRef, { followers: arrayUnion(myUid) });
    await recordFollowFromPost();
    const myDoc = await getDoc(myRef);
    const myUsername = myDoc.exists() ? myDoc.data().username : auth.currentUser?.email;
    await addDoc(collection(db, "notifications"), {
      toUserEmail: userData?.email,
      fromUserEmail: auth.currentUser?.email,
      fromUsername: myUsername,
      type: "follow",
      postId: null,
      read: false,
      createdAt: serverTimestamp(),
    });
  };
  const handleMessage = async () => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail || !userData?.email) return;
    setMessaging(true);
    try {
      const q = query(
        collection(db, "chats"),
        where("participants", "array-contains", myEmail),
        where("isGroup", "==", false)
      );
      const snapshot = await getDocs(q);
      const existingChat = snapshot.docs.find((docSnap) => {
        const participants: string[] = docSnap.data().participants || [];
        return participants.includes(userData.email) && participants.length === 2;
      });
      if (existingChat) {
        router.push({ pathname: "/chat/[id]", params: { id: existingChat.id } });
      } else {
        const newChat = await addDoc(collection(db, "chats"), {
          participants: [myEmail, userData.email],
          isGroup: false,
          groupName: null,
          lastMessage: "",
          lastMessageAt: serverTimestamp(),
        });
        router.push({ pathname: "/chat/[id]", params: { id: newChat.id } });
      }
    } finally {
      setMessaging(false);
    }
  };
  const openLink = (url: string) => {
    if (url) Linking.openURL(url);
  };
  const getFollowButtonText = () => {
    if (isFollowing) return t("userDetail.followingButton");
    if (userData?.isPrivate) return hasRequestedFollow ? t("userDetail.requestSentButton") : t("userDetail.requestFollowButton");
    return t("userDetail.followButton");
  };

  // ===== ストーリーがある場合は、アイコンタップで閲覧画面を開く =====
  const handleAvatarPress = () => {
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: id } });
    }
  };

  if (loading || !userData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const myUid = auth.currentUser?.uid;
  const hasUnreadStory = userStories.some((s) => !(s.viewedBy || []).includes(myUid));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>{t("userDetail.backButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.usernameHeader}>{userData.handle || userData.username}</Text>
          <View style={{ width: 40 }} />
        </View>
        <FlatList
          data={canSeePosts ? posts : []}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <View style={styles.profileTopRow}>
                <TouchableOpacity onPress={handleAvatarPress} activeOpacity={userStories.length > 0 ? 0.8 : 1}>
                  <StampFrame
                    size={100}
                    imageUri={userData.photoUrl || null}
                    borderColor="#888"
                    frameThickness={userStories.length > 0 && hasUnreadStory ? 6 : 2}
                    gradientColors={
                      userStories.length > 0 && hasUnreadStory ? ["#3D8BFF", "#7B3DFF"] : undefined
                    }
                  />
                </TouchableOpacity>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{canSeePosts ? posts.length : "-"}</Text>
                    <Text style={styles.statLabel}>{t("userDetail.postsCount")}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{userData.followers?.length || 0}</Text>
                    <Text style={styles.statLabel}>{t("userDetail.followersCount")}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{userData.following?.length || 0}</Text>
                    <Text style={styles.statLabel}>{t("userDetail.followingCount")}</Text>
                  </View>
                </View>
              </View>
              <Text
                style={[
                  styles.usernameText,
                  { color: userData.usernameColor || "#222" },
                ]}
              >
                {userData.username}
              </Text>
              {userData.bio ? (
                <Text style={styles.bio}>{userData.bio}</Text>
              ) : null}
              <View style={styles.snsRow}>
                {SNS_LIST.map((sns) =>
                  userData.snsLinks?.[sns.key] ? (
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
              {!isMyself && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={isFollowing || hasRequestedFollow ? styles.followingButton : styles.followButton}
                    onPress={toggleFollow}
                  >
                    <Text
                      style={
                        isFollowing || hasRequestedFollow
                          ? styles.followingButtonText
                          : styles.followButtonText
                      }
                    >
                      {getFollowButtonText()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.messageButton}
                    onPress={handleMessage}
                    disabled={messaging}
                  >
                    {messaging ? (
                      <ActivityIndicator size="small" color="#333" />
                    ) : (
                      <Text style={styles.messageButtonText}>{t("userDetail.messageButton")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {!canSeePosts && (
                <View style={styles.privateNotice}>
                  <Text style={styles.privateNoticeIcon}>🔒</Text>
                  <Text style={styles.privateNoticeText}>{t("userDetail.privateNoticeTitle")}</Text>
                  <Text style={styles.privateNoticeSubText}>{t("userDetail.privateNoticeSubtitle")}</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            canSeePosts ? (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>{t("userDetail.empty")}</Text>
              </View>
            ) : null
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
                  {item.title || t("userDetail.noTitle")}
                </Text>
                <Text style={styles.metaText}>♥ {item.likedBy?.length || 0}</Text>
              </View>
            </TouchableOpacity>
          )}
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
  usernameHeader: {
    fontSize: 16,
    fontWeight: "700",
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 12,
    gap: 20,
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
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  followButton: {
    flex: 1,
    backgroundColor: "#4a90e2",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  followButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  followingButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  followingButtonText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },
  messageButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  messageButtonText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },
  privateNotice: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  privateNoticeIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  privateNoticeText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    marginBottom: 6,
  },
  privateNoticeSubText: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
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
    marginBottom: 6,
  },
  metaText: {
    fontSize: 11,
    color: "#666",
  },
});