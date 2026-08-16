import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../firebaseConfig";

const METRIC_LABELS: Record<string, string> = {
  likes: "いいね",
  comments: "コメント",
  saves: "保存",
  shares: "共有",
  reach: "リーチ",
  impressions: "インプレッション",
  engagement: "エンゲージメント",
};

const METRIC_COLORS: Record<string, string> = {
  likes: "#e74c3c",
  comments: "#4a90e2",
  saves: "#f39c12",
  shares: "#2ecc71",
  reach: "#222222",
  impressions: "#9b59b6",
  engagement: "#4a90e2",
};

// 内訳グラフ（4本重ね）で使う、各項目の色
const BREAKDOWN_COLORS: Record<string, string> = {
  likes: "#e74c3c",
  comments: "#4a90e2",
  saves: "#f39c12",
  shares: "#2ecc71",
};

type DailyStat = {
  dateLabel: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
};

export default function InsightDetailScreen() {
  const router = useRouter();
  const { postId, metric } = useLocalSearchParams<{ postId: string; metric: string }>();
  const [loading, setLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [values, setValues] = useState<number[]>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!postId || !metric) return;

      const q = query(
        collection(db, "posts", postId, "dailyStats"),
        orderBy("recordedAt", "asc")
      );
      const snapshot = await getDocs(q);

      const stats: DailyStat[] = [];
      const dayLabels: string[] = [];
      const dayValues: number[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const dateLabel = data.dateLabel || docSnap.id;
        stats.push({
          dateLabel,
          likes: data.likes || 0,
          comments: data.comments || 0,
          saves: data.saves || 0,
          shares: data.shares || 0,
          reach: data.reach || 0,
        });
        dayLabels.push(dateLabel);
        dayValues.push(data[metric] || 0);
      });

      setDailyStats(stats);
      setLabels(dayLabels);
      setValues(dayValues);
      setLoading(false);
    };
    loadData();
  }, [postId, metric]);

  const metricLabel = METRIC_LABELS[metric] || metric;
  const metricColor = METRIC_COLORS[metric] || "#4a90e2";
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.min(screenWidth, 630) - 32;

  const isEngagement = metric === "engagement";

  // エンゲージ率（リーチに対する、いいね・コメント・保存・共有の合計の割合）を、日ごとに計算する
  const engagementRateValues = dailyStats.map((d) => {
    const total = d.likes + d.comments + d.saves + d.shares;
    return d.reach > 0 ? Math.round((total / d.reach) * 1000) / 10 : 0;
  });

  const hasEnoughData = dailyStats.length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{metricLabel}の推移</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : !hasEnoughData ? (
          <View style={styles.centerContainer}>
            <MaterialIcons name="show-chart" size={40} color="#ccc" />
            <Text style={styles.emptyTitle}>データがたまり次第、グラフが表示されます</Text>
            <Text style={styles.emptyText}>
              この投稿を開いた日から、毎日の記録が少しずつ蓄積されていきます
            </Text>
          </View>
        ) : isEngagement ? (
          // ===== エンゲージメント専用：エンゲージ率＋内訳（4本重ね）の、2つのグラフを表示 =====
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.chartSectionTitle}>エンゲージ率の推移</Text>
            <Text style={styles.chartSectionHint}>リーチした人のうち、何％がアクションしたか</Text>
            <View style={styles.chartWrapper}>
              <LineChart
                data={{
                  labels,
                  datasets: [{ data: engagementRateValues }],
                }}
                width={chartWidth}
                height={220}
                yAxisSuffix="%"
                chartConfig={{
                  backgroundColor: "#fff",
                  backgroundGradientFrom: "#fff",
                  backgroundGradientTo: "#fff",
                  decimalPlaces: 1,
                  color: () => "#4a90e2",
                  labelColor: () => "#666",
                  propsForDots: { r: "4", strokeWidth: "2", stroke: "#4a90e2" },
                }}
                bezier
                style={styles.chart}
              />
            </View>

            <Text style={styles.chartSectionTitle}>内訳の推移</Text>
            <Text style={styles.chartSectionHint}>いいね・コメント・保存・共有、それぞれの推移</Text>

            <View style={styles.legendRow}>
              {(["likes", "comments", "saves", "shares"] as const).map((key) => (
                <View key={key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: BREAKDOWN_COLORS[key] }]} />
                  <Text style={styles.legendText}>{METRIC_LABELS[key]}</Text>
                </View>
              ))}
            </View>

            <View style={styles.chartWrapper}>
              <LineChart
                data={{
                  labels,
                  datasets: [
                    { data: dailyStats.map((d) => d.likes), color: () => BREAKDOWN_COLORS.likes },
                    { data: dailyStats.map((d) => d.comments), color: () => BREAKDOWN_COLORS.comments },
                    { data: dailyStats.map((d) => d.saves), color: () => BREAKDOWN_COLORS.saves },
                    { data: dailyStats.map((d) => d.shares), color: () => BREAKDOWN_COLORS.shares },
                  ],
                }}
                width={chartWidth}
                height={220}
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: "#fff",
                  backgroundGradientFrom: "#fff",
                  backgroundGradientTo: "#fff",
                  decimalPlaces: 0,
                  color: () => "#999",
                  labelColor: () => "#666",
                  propsForDots: { r: "3" },
                }}
                style={styles.chart}
              />
            </View>

            <View style={{ height: 30 }} />
          </ScrollView>
        ) : (
          // ===== それ以外の項目：これまで通り、単一の推移グラフ =====
          <View style={styles.chartWrapper}>
            <LineChart
              data={{
                labels,
                datasets: [{ data: values }],
              }}
              width={chartWidth}
              height={260}
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: "#fff",
                backgroundGradientFrom: "#fff",
                backgroundGradientTo: "#fff",
                decimalPlaces: 0,
                color: () => metricColor,
                labelColor: () => "#666",
                propsForDots: { r: "4", strokeWidth: "2", stroke: metricColor },
              }}
              bezier
              style={styles.chart}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  pageWrapper: Platform.select({
    web: { flex: 1, width: "100%", maxWidth: 630, alignSelf: "center" },
    default: { flex: 1 },
  }),
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
    textAlign: "center",
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
  backText: { color: "#4a90e2", fontSize: 15 },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  scrollContent: {
    paddingBottom: 20,
  },
  chartWrapper: { padding: 16, alignItems: "center" },
  chart: { borderRadius: 12 },
  // ===== エンゲージメント専用グラフのスタイル =====
  chartSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  chartSectionHint: {
    fontSize: 12,
    color: "#999",
    paddingHorizontal: 16,
    marginTop: 2,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: "#666",
  },
});