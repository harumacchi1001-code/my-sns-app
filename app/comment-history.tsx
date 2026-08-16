import { useRouter } from "expo-router";
import { collection, doc, DocumentData, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

type Comment = DocumentData & { id: string };

export default function CommentHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [postMap, setPostMap] = useState<Record<string, DocumentData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;

    const q = query(
      collection(db, "comments"),
      where("authorEmail", "==", myEmail),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Comment[];
      setComments(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const postIds = Array.from(new Set(comments.map((c) => c.postId)));
    const idsToFetch = postIds.filter((pid) => pid && !postMap[pid]);

    idsToFetch.forEach((postId) => {
      onSnapshot(doc(db, "posts", postId), (docSnap) => {
        if (docSnap.exists()) {
          setPostMap((prev) => ({ ...prev, [postId]: { id: docSnap.id, ...docSnap.data() } }));
        }
      });
    });
  }, [comments]);

  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return "";
    const date = timestamp.toDate();
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
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
            <Text style={styles.backText}>{t("commentHistory.backButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("commentHistory.headerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("commentHistory.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const post = postMap[item.postId];
            return (
              <TouchableOpacity
                style={styles.commentRow}
                onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.postId } })}
              >
                {post?.thumbnailUrl ? (
                  <Image source={{ uri: post.thumbnailUrl }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.thumbnailPlaceholder} />
                )}
                <View style={styles.commentInfo}>
                  <Text style={styles.postTitle} numberOfLines={1}>
                    {post?.title || t("commentHistory.postFallback")}
                  </Text>
                  <Text style={styles.commentText} numberOfLines={2}>
                    {item.text}
                  </Text>
                  <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                </View>
              </TouchableOpacity>
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
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: "#f0f0f0",
  },
  thumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: "#eee",
  },
  commentInfo: {
    flex: 1,
  },
  postTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: "#222",
    marginBottom: 4,
  },
  date: {
    fontSize: 11,
    color: "#999",
  },
});