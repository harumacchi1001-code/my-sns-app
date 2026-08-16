import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, DocumentData, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
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
import { db } from "../firebaseConfig";

type Viewer = DocumentData & { id: string };

export default function StoryViewersScreen() {
  const router = useRouter();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadViewers = async () => {
      if (!storyId) return;

      const storySnap = await getDoc(doc(db, "stories", storyId));
      if (!storySnap.exists()) {
        setLoading(false);
        return;
      }

      const viewedBy: string[] = storySnap.data().viewedBy || [];

      if (viewedBy.length === 0) {
        setViewers([]);
        setLoading(false);
        return;
      }

      const usersSnap = await getDocs(collection(db, "users"));
      const viewerUsers = usersSnap.docs
        .filter((docSnap) => viewedBy.includes(docSnap.id))
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

      setViewers(viewerUsers);
      setLoading(false);
    };
    loadViewers();
  }, [storyId]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>閲覧者</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>まだ誰も見ていません</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => router.push({ pathname: "/user/[id]", params: { id: item.id } })}
              >
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={{ fontSize: 18 }}>👤</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.username}>{item.username || "ユーザー"}</Text>
                  {item.handle ? <Text style={styles.handle}>@{item.handle}</Text> : null}
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
    fontWeight: "600",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f0f0f0",
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
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
});