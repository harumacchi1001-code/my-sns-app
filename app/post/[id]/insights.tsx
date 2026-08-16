import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, DocumentData, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../../firebaseConfig";

// 今日の日付を、記録用のキー（例："2026-8-9"）に変換する
const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

const getTodayLabel = () => {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}`;
};

export default function PostInsightsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    const postRef = doc(db, "posts", id);
    const unsubscribe = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "comments"), where("postId", "==", id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCommentCount(snapshot.size);
    });
    return unsubscribe;
  }, [id]);

  // ===== インサイト画面を開くたびに、その日のスナップショットを記録する =====
  useEffect(() => {
    if (!id || !post) return;

    const todayKey = getTodayKey();
    const dailyStatsRef = doc(db, "posts", id, "dailyStats", todayKey);

    setDoc(
      dailyStatsRef,
      {
        dateLabel: getTodayLabel(),
        likes: post.likedBy?.length || 0,
        comments: commentCount,
        saves: post.savedBy?.length || 0,
        shares: post.shareCount || 0,
        reach: post.viewedBy?.length || 0,
        impressions: post.impressionCount || 0,
        recordedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {
      // 記録に失敗しても、画面表示自体には影響させない
    });
  }, [id, post, commentCount]);

  const goToDetailChart = (metric: string) => {
    router.push({ pathname: "/insight-detail", params: { postId: id, metric } });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const likeCount = post?.likedBy?.length || 0;
  const savedCount = post?.savedBy?.length || 0;
  const reachCount = post?.viewedBy?.length || 0;
  const impressionCount = post?.impressionCount || 0;
  const shareCount = post?.shareCount || 0;
  const followsFromPost = post?.followsFromPost || 0;
  const interactionsTotal = likeCount + commentCount + savedCount + shareCount;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("insights.headerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {/* ===== リーチのヒーローカード：タップでグラフに移動できるように ===== */}
          <TouchableOpacity
            style={styles.heroCard}
            activeOpacity={0.8}
            onPress={() => goToDetailChart("reach")}
          >
            <Text style={styles.heroNumber}>{reachCount}</Text>
            <Text style={styles.heroLabel}>{t("insights.reach")}</Text>

            <View style={styles.heroDivider} />

            <View style={styles.heroSubRow}>
              {/* ===== インプレッション：タップでグラフに移動できるように ===== */}
              <TouchableOpacity
                style={styles.heroSubItem}
                onPress={() => goToDetailChart("impressions")}
              >
                <Text style={styles.heroSubNumber}>{impressionCount}</Text>
                <Text style={styles.heroSubLabel}>{t("insights.impressions")}</Text>
              </TouchableOpacity>
              <View style={styles.heroSubDivider} />
              {/* ===== エンゲージメント：タップでグラフに移動できるように ===== */}
              <TouchableOpacity
                style={styles.heroSubItem}
                onPress={() => goToDetailChart("engagement")}
              >
                <Text style={styles.heroSubNumber}>{interactionsTotal}</Text>
                <Text style={styles.heroSubLabel}>エンゲージメント</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* アクションセクション（タップで、詳細グラフに移動） */}
          <Text style={styles.sectionTitle}>アクション</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => goToDetailChart("likes")}>
              <MaterialIcons name="favorite-border" size={20} color="#e74c3c" />
              <Text style={styles.actionNumber}>{likeCount}</Text>
              <Text style={styles.actionLabel}>{t("insights.likes")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => goToDetailChart("comments")}>
              <MaterialIcons name="chat-bubble-outline" size={20} color="#4a90e2" />
              <Text style={styles.actionNumber}>{commentCount}</Text>
              <Text style={styles.actionLabel}>{t("insights.comments")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => goToDetailChart("saves")}>
              <MaterialIcons name="bookmark-border" size={20} color="#f39c12" />
              <Text style={styles.actionNumber}>{savedCount}</Text>
              <Text style={styles.actionLabel}>{t("insights.saves")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => goToDetailChart("shares")}>
              <MaterialIcons name="share" size={20} color="#2ecc71" />
              <Text style={styles.actionNumber}>{shareCount}</Text>
              <Text style={styles.actionLabel}>{t("insights.shares")}</Text>
            </TouchableOpacity>
          </View>

          {/* プロフィールへのアクティビティ */}
          <Text style={styles.sectionTitle}>プロフィールへのアクティビティ</Text>
          <View style={styles.profileActivityCard}>
            <View style={styles.profileActivityIconWrapper}>
              <MaterialIcons name="person-add" size={20} color="#4a90e2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileActivityLabel}>この投稿からのフォロー</Text>
              <Text style={styles.profileActivityHint}>
                この投稿をきっかけにフォローされた人数
              </Text>
            </View>
            <Text style={styles.profileActivityNumber}>{followsFromPost}</Text>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
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
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  heroCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#f7f7f7",
    alignItems: "center",
  },
  heroNumber: {
    fontSize: 40,
    fontWeight: "700",
    color: "#222",
  },
  heroLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    marginTop: 2,
  },
  heroDivider: {
    width: "100%",
    height: 0.5,
    backgroundColor: "#ddd",
    marginVertical: 16,
  },
  heroSubRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
  },
  heroSubItem: {
    flex: 1,
    alignItems: "center",
  },
  heroSubDivider: {
    width: 0.5,
    height: 34,
    backgroundColor: "#ddd",
  },
  heroSubNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
  heroSubLabel: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    width: "47%",
    backgroundColor: "#f7f7f7",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  actionNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
  actionLabel: {
    fontSize: 12,
    color: "#999",
  },
  profileActivityCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f7f7f7",
    gap: 12,
  },
  profileActivityIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e8f1fc",
    justifyContent: "center",
    alignItems: "center",
  },
  profileActivityLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  profileActivityHint: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  profileActivityNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
});