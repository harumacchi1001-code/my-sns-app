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
import {
  accentColor,
  isWeb,
  pick,
  textFaint,
  textMain,
  textSub,
  webGlassBox,
  webScreenBackground,
} from "../components/glass";
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
        <ActivityIndicator size="large" color={pick("#ffffff", undefined as any)} />
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
          contentContainerStyle={styles.listContent}
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
    // ===== Web版：暗いオーロラ風の背景 =====
    ...webScreenBackground,
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
    color: textFaint,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: pick(0, 0.5),
    borderBottomColor: "#eee",
  },
  backText: {
    color: accentColor,
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: textMain,
  },
  // ===== Web版：コメントのカードを、少し内側に寄せて、間をあける =====
  listContent: isWeb ? { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 20 } : {},
  // ===== コメント1件：Web版はガラスのカード、スマホは今までの下線 =====
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
    ...(isWeb
      ? ({
          ...webGlassBox,
          borderRadius: 20,
          marginBottom: 10,
        } as any)
      : {}),
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: pick("rgba(255,255,255,0.08)", "#f0f0f0"),
  },
  thumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: pick("rgba(255,255,255,0.08)", "#eee"),
  },
  commentInfo: {
    flex: 1,
  },
  postTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: textSub,
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: textMain,
    marginBottom: 4,
  },
  date: {
    fontSize: 11,
    color: textFaint,
  },
});