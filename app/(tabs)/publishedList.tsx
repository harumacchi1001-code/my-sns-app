import { useRouter } from "expo-router";
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";

type Post = {
  id: string;
  title: string;
  body: string;
  thumbnailUrl: string | null;
  authorEmail: string;
  createdAt: Timestamp | null;
  likedBy?: string[];
};

export default function PublishedListScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.header}>公開リスト</Text>

      {posts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>まだ投稿がありません</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const myEmail = auth.currentUser?.email;
            const likedByMe = !!myEmail && !!item.likedBy?.includes(myEmail);
            const likeCount = item.likedBy?.length || 0;

            return (
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
                    {item.title || "（無題）"}
                  </Text>
                  <View style={styles.metaRow}>
                    <TouchableOpacity
                      style={styles.metaItem}
                      onPress={() => toggleLike(item)}
                    >
                      <Text style={likedByMe ? styles.likedText : styles.metaText}>
                        ♥ {likeCount}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaText}>💬 0</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  header: {
    fontSize: 20,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  metaRow: {
    flexDirection: "row",
    gap: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 11,
    color: "#666",
  },
  likedText: {
    fontSize: 11,
    color: "#e74c3c",
    fontWeight: "600",
  },
});