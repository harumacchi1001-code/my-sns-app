import { useRouter } from "expo-router";
import { collection, deleteDoc, doc, DocumentData, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
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

type Post = DocumentData & { id: string };

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
const GRID_COLUMNS = isWeb ? 5 : 2;
// ===== ここまでWeb版専用 =====

export default function DraftsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [drafts, setDrafts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;

    const q = query(
      collection(db, "posts"),
      where("authorEmail", "==", myEmail),
      where("status", "==", "draft"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Post[];
      setDrafts(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleLongPressDelete = (postId: string) => {
    Alert.alert(t("post.deleteConfirmTitle"), t("post.deleteConfirmMessage"), [
      { text: t("post.deleteCancel"), style: "cancel" },
      {
        text: t("post.deleteConfirm"),
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "posts", postId));
        },
      },
    ]);
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
            <Text style={styles.backText}>{t("drafts.backButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("drafts.headerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("drafts.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: "/(tabs)/post", params: { draftId: item.id } })}
              onLongPress={() => handleLongPressDelete(item.id)}
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
                  {item.title || t("drafts.noTitle")}
                </Text>
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
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
  },
  // ===== ここからWeb版専用 =====
  row: {
    justifyContent: isWeb ? "flex-start" : "space-between",
    gap: isWeb ? 12 : 0,
    marginBottom: 10,
  },
  // ===== ここまでWeb版専用 =====
  // ===== ここからWeb版専用 =====
  card: {
    width: isWeb ? "18.4%" : "48%",
    borderWidth: 1.5,
    borderColor: "#000",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  // ===== ここまでWeb版専用 =====
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
});