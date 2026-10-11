import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { collection, doc, DocumentData, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { db } from "../firebaseConfig";
import {
    accentColor,
    pick,
    textFaint,
    textMain,
    textSub,
    webGlassBox,
    webSelected,
} from "./glass";

// 今日の日付を、記録用のキー（例："2026-8-9"）に変換する
const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};
const getTodayLabel = () => {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}`;
};
// ===== 現在の、時間帯を、記録用のキーに変換する（例："2026-8-27-14"） =====
const getHourKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`;
};
// ===== 時間帯のラベル（例："14:00"） =====
const getHourLabel = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:00`;
};

type DailyStat = {
  dateLabel: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  impressions: number;
  recordedAt: Date;
};
type HourlyStat = {
  hourLabel: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  impressions: number;
  recordedAt: Date;
};

// ===== 各指標ごとの、グラフの色（リーチは、Web版の暗い背景で見えるよう白） =====
const METRIC_COLORS: Record<string, string> = {
  likes: "#e74c3c",
  comments: "#4a90e2",
  saves: "#f39c12",
  shares: "#2ecc71",
  reach: pick("#ffffff", "#222222"),
  impressions: "#9b59b6",
};
// 内訳グラフで使う、各項目の色
const BREAKDOWN_COLORS: Record<string, string> = {
  likes: "#e74c3c",
  comments: "#4a90e2",
  saves: "#f39c12",
  shares: "#2ecc71",
};
const BREAKDOWN_LABELS: Record<string, string> = {
  likes: "いいね",
  comments: "コメント",
  saves: "保存",
  shares: "共有",
};

// ===== 各カードの、下に表示する、小さな折れ線グラフ（タップ・ホバーで、数値が出る） =====
function MiniTrendChart({
  labels,
  values,
  color,
  chartWidth,
  suffix,
}: {
  labels: string[];
  values: number[];
  color: string;
  chartWidth: number;
  suffix?: string;
}) {
  const data = labels.map((label, index) => ({
    value: values[index],
    label,
    dataPointText: `${values[index]}${suffix || ""}`,
  }));
  return (
    <LineChart
      data={data}
      width={chartWidth - 30}
      height={110}
      color={color}
      thickness={2}
      dataPointsColor={color}
      dataPointsRadius={4}
      curved
      hideRules
      hideYAxisText
      yAxisThickness={0}
      xAxisThickness={0.5}
      xAxisColor={pick("rgba(255,255,255,0.2)", "#ddd")}
      xAxisLabelTextStyle={{ color: textFaint, fontSize: 10 }}
      areaChart
      startFillColor={color}
      endFillColor={color}
      startOpacity={0.15}
      endOpacity={0.02}
      // ===== タップ／ホバーで、その点の、数値を、吹き出しで、表示 =====
      pointerConfig={{
        pointerStripHeight: 100,
        pointerStripColor: pick("rgba(255,255,255,0.3)", "#ccc"),
        pointerStripWidth: 1,
        pointerColor: color,
        radius: 5,
        pointerLabelWidth: 80,
        pointerLabelHeight: 36,
        activatePointersOnLongPress: false,
        autoAdjustPointerLabelPosition: true,
        pointerLabelComponent: (items: any) => (
          <View style={styles.pointerLabel}>
            <Text style={styles.pointerLabelText}>{items[0]?.label}</Text>
            <Text style={[styles.pointerLabelValue, { color }]}>
              {items[0]?.value}
              {suffix || ""}
            </Text>
          </View>
        ),
      }}
    />
  );
}

// ===== データが、まだ、たまっていない場合の、案内 =====
function ChartPlaceholder() {
  return (
    <View style={styles.chartPlaceholder}>
      <MaterialIcons name="show-chart" size={22} color={pick("rgba(255,255,255,0.4)", "#ccc")} />
      <Text style={styles.chartPlaceholderText}>データがたまり次第、グラフが表示されます</Text>
    </View>
  );
}

// ===== 投稿詳細に、組み込んで使う、インサイトの表示（自分の投稿のときだけ、使う） =====
export default function PostInsightsPanel({
  postId,
  post,
  commentCount,
  width,
}: {
  postId: string;
  post: DocumentData;
  commentCount: number;
  width: number;
}) {
  const { t } = useTranslation();
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStat[]>([]);
  // ===== 選択中の、期間（今日・週・月・年） =====
  const [selectedRange, setSelectedRange] = useState<"today" | "week" | "month" | "year">("week");

  // ===== インサイトを表示するたびに、その日のスナップショットを記録する =====
  useEffect(() => {
    if (!postId || !post) return;
    const todayKey = getTodayKey();
    const dailyStatsRef = doc(db, "posts", postId, "dailyStats", todayKey);
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
    // ===== あわせて、今の、時間帯の、スナップショットも記録する（「今日」の、グラフ用） =====
    const hourKey = getHourKey();
    const hourlyStatsRef = doc(db, "posts", postId, "hourlyStats", hourKey);
    setDoc(
      hourlyStatsRef,
      {
        hourLabel: getHourLabel(),
        likes: post.likedBy?.length || 0,
        comments: commentCount,
        saves: post.savedBy?.length || 0,
        shares: post.shareCount || 0,
        reach: post.viewedBy?.length || 0,
        impressions: post.impressionCount || 0,
        recordedAt: new Date(),
      },
      { merge: true }
    ).catch(() => {});
  }, [postId, post, commentCount]);

  // ===== 今日の、時間ごとの記録（hourlyStats）を、グラフ用に取得する =====
  useEffect(() => {
    const loadHourlyStats = async () => {
      if (!postId) return;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const q = query(collection(db, "posts", postId, "hourlyStats"), orderBy("recordedAt", "asc"));
      const snapshot = await getDocs(q);
      const stats: HourlyStat[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            hourLabel: data.hourLabel || docSnap.id,
            likes: data.likes || 0,
            comments: data.comments || 0,
            saves: data.saves || 0,
            shares: data.shares || 0,
            reach: data.reach || 0,
            impressions: data.impressions || 0,
            recordedAt: data.recordedAt?.toDate ? data.recordedAt.toDate() : new Date(),
          };
        })
        .filter((s) => s.recordedAt >= todayStart);
      setHourlyStats(stats);
    };
    loadHourlyStats();
  }, [postId, post, commentCount]);

  // ===== 日ごとの記録（dailyStats）を、グラフ用に取得する =====
  useEffect(() => {
    const loadDailyStats = async () => {
      if (!postId) return;
      const q = query(collection(db, "posts", postId, "dailyStats"), orderBy("recordedAt", "asc"));
      const snapshot = await getDocs(q);
      const stats: DailyStat[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          dateLabel: data.dateLabel || docSnap.id,
          likes: data.likes || 0,
          comments: data.comments || 0,
          saves: data.saves || 0,
          shares: data.shares || 0,
          reach: data.reach || 0,
          impressions: data.impressions || 0,
          recordedAt: data.recordedAt?.toDate ? data.recordedAt.toDate() : new Date(),
        };
      });
      setDailyStats(stats);
    };
    loadDailyStats();
  }, [postId, post, commentCount]);

  const likeCount = post?.likedBy?.length || 0;
  const savedCount = post?.savedBy?.length || 0;
  const reachCount = post?.viewedBy?.length || 0;
  const impressionCount = post?.impressionCount || 0;
  const shareCount = post?.shareCount || 0;
  const followsFromPost = post?.followsFromPost || 0;
  const interactionsTotal = likeCount + commentCount + savedCount + shareCount;

  const chartWidth = Math.min(width, 630) - 64;

  // ===== 「今日」が、選ばれている時は、時間ごとの記録を、それ以外は、日ごとの記録を、期間で、絞り込んで使う =====
  const now = new Date();
  const rangeStart = new Date(now);
  if (selectedRange === "week") {
    rangeStart.setDate(now.getDate() - 7);
  } else if (selectedRange === "month") {
    rangeStart.setMonth(now.getMonth() - 1);
  } else if (selectedRange === "year") {
    rangeStart.setFullYear(now.getFullYear() - 1);
  }
  const filteredStats: (DailyStat | HourlyStat)[] =
    selectedRange === "today"
      ? hourlyStats
      : dailyStats.filter((d) => d.recordedAt >= rangeStart);
  const hasEnoughData = filteredStats.length >= 2;
  const labels = filteredStats.map((d) =>
    selectedRange === "today" ? (d as HourlyStat).hourLabel : (d as DailyStat).dateLabel
  );

  // ===== エンゲージ率（リーチに対する、反応の割合）を、日ごとに計算する =====
  const engagementRateValues = filteredStats.map((d) => {
    const total = d.likes + d.comments + d.saves + d.shares;
    return d.reach > 0 ? Math.round((total / d.reach) * 1000) / 10 : 0;
  });

  // ===== 各指標の、グラフを、まとめて描く、共通の見せ方 =====
  const renderMetricChart = (
    metricKey: "likes" | "comments" | "saves" | "shares" | "reach" | "impressions",
    suffix?: string
  ) => {
    if (!hasEnoughData) return <ChartPlaceholder />;
    const values = filteredStats.map((d) => Number((d as any)[metricKey]) || 0);
    return (
      <MiniTrendChart
        labels={labels}
        values={values}
        color={METRIC_COLORS[metricKey as string] || "#4a90e2"}
        chartWidth={chartWidth}
        suffix={suffix}
      />
    );
  };

  return (
    <View style={styles.root}>
      <Text style={styles.panelTitle}>{t("insights.headerTitle")}</Text>

      {/* ===== 期間切り替えのタブ ===== */}
      <View style={styles.rangeTabRow}>
        {([
          { key: "today", label: "1日" },
          { key: "week", label: "1週間" },
          { key: "month", label: "1ヶ月" },
          { key: "year", label: "1年" },
        ] as const).map((r) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.rangeTabButton, selectedRange === r.key && styles.rangeTabButtonActive]}
            onPress={() => setSelectedRange(r.key)}
          >
            <Text style={selectedRange === r.key ? styles.rangeTabTextActive : styles.rangeTabText}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ===== リーチのヒーローカード ===== */}
      <View style={styles.heroCard}>
        <Text style={styles.heroNumber}>{reachCount}</Text>
        <Text style={styles.heroLabel}>{t("insights.reach")}</Text>
        {renderMetricChart("reach")}
        <View style={styles.heroDivider} />
        <View style={styles.heroSubRow}>
          <View style={styles.heroSubItem}>
            <Text style={styles.heroSubNumber}>{impressionCount}</Text>
            <Text style={styles.heroSubLabel}>{t("insights.impressions")}</Text>
          </View>
          <View style={styles.heroSubDivider} />
          <View style={styles.heroSubItem}>
            <Text style={styles.heroSubNumber}>{interactionsTotal}</Text>
            <Text style={styles.heroSubLabel}>エンゲージメント</Text>
          </View>
        </View>
      </View>

      {/* ===== インプレッションのグラフ ===== */}
      <Text style={styles.sectionTitle}>{t("insights.impressions")}</Text>
      <View style={styles.chartCard}>{renderMetricChart("impressions")}</View>

      {/* ===== エンゲージメントのグラフ（エンゲージ率＋内訳） ===== */}
      <Text style={styles.sectionTitle}>エンゲージメント</Text>
      <View style={styles.chartCard}>
        {!hasEnoughData ? (
          <ChartPlaceholder />
        ) : (
          <>
            <Text style={styles.chartSubTitle}>エンゲージ率の推移</Text>
            <Text style={styles.chartSectionHint}>リーチした人のうち、何％がアクションしたか</Text>
            <MiniTrendChart
              labels={labels}
              values={engagementRateValues}
              color="#4a90e2"
              chartWidth={chartWidth}
              suffix="%"
            />
            <Text style={[styles.chartSubTitle, { marginTop: 14 }]}>内訳の推移</Text>
            <Text style={styles.chartSectionHint}>いいね・コメント・保存・共有、それぞれの推移</Text>
            <View style={styles.legendRow}>
              {(["likes", "comments", "saves", "shares"] as const).map((key) => (
                <View key={key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: BREAKDOWN_COLORS[key] }]} />
                  <Text style={styles.legendText}>{BREAKDOWN_LABELS[key]}</Text>
                </View>
              ))}
            </View>
            {(["likes", "comments", "saves", "shares"] as const).map((key) => (
              <View key={key} style={{ marginBottom: 6 }}>
                <MiniTrendChart
                  labels={labels}
                  values={filteredStats.map((d) => (d as any)[key])}
                  color={BREAKDOWN_COLORS[key]}
                  chartWidth={chartWidth}
                />
              </View>
            ))}
          </>
        )}
      </View>

      {/* ===== アクションセクション（各カード＋グラフ） ===== */}
      <Text style={styles.sectionTitle}>アクション</Text>
      <View style={styles.chartCard}>
        <View style={styles.actionCardHeader}>
          <MaterialIcons name="favorite-border" size={18} color="#e74c3c" />
          <Text style={styles.actionNumber}>{likeCount}</Text>
          <Text style={styles.actionLabel}>{t("insights.likes")}</Text>
        </View>
        {renderMetricChart("likes")}
      </View>
      <View style={styles.chartCard}>
        <View style={styles.actionCardHeader}>
          <MaterialIcons name="chat-bubble-outline" size={18} color="#4a90e2" />
          <Text style={styles.actionNumber}>{commentCount}</Text>
          <Text style={styles.actionLabel}>{t("insights.comments")}</Text>
        </View>
        {renderMetricChart("comments")}
      </View>
      <View style={styles.chartCard}>
        <View style={styles.actionCardHeader}>
          <MaterialIcons name="bookmark-border" size={18} color="#f39c12" />
          <Text style={styles.actionNumber}>{savedCount}</Text>
          <Text style={styles.actionLabel}>{t("insights.saves")}</Text>
        </View>
        {renderMetricChart("saves")}
      </View>
      <View style={styles.chartCard}>
        <View style={styles.actionCardHeader}>
          <MaterialIcons name="share" size={18} color="#2ecc71" />
          <Text style={styles.actionNumber}>{shareCount}</Text>
          <Text style={styles.actionLabel}>{t("insights.shares")}</Text>
        </View>
        {renderMetricChart("shares")}
      </View>

      {/* プロフィールへのアクティビティ */}
      <Text style={styles.sectionTitle}>プロフィールへのアクティビティ</Text>
      <View style={styles.profileActivityCard}>
        <View style={styles.profileActivityIconWrapper}>
          <MaterialIcons name="person-add" size={20} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileActivityLabel}>この投稿からのフォロー</Text>
          <Text style={styles.profileActivityHint}>この投稿をきっかけにフォローされた人数</Text>
        </View>
        <Text style={styles.profileActivityNumber}>{followsFromPost}</Text>
      </View>
      <View style={{ height: 30 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: textMain,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  rangeTabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  rangeTabButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: pick("rgba(255,255,255,0.06)", "#f0f0f0"),
  },
  rangeTabButtonActive: {
    backgroundColor: "#222",
    // ===== Web版：選ばれているタブは、浮き上がったガラス =====
    ...webSelected,
  },
  rangeTabText: {
    fontSize: 13,
    color: textSub,
  },
  rangeTabTextActive: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  heroCard: {
    margin: 16,
    padding: 20,
    borderRadius: pick(24, 16),
    backgroundColor: "#f7f7f7",
    alignItems: "center",
    ...webGlassBox,
  },
  heroNumber: {
    fontSize: 40,
    fontWeight: "700",
    color: textMain,
  },
  heroLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: textMain,
    marginTop: 2,
  },
  heroDivider: {
    width: "100%",
    height: 0.5,
    backgroundColor: pick("rgba(255,255,255,0.15)", "#ddd"),
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
    backgroundColor: pick("rgba(255,255,255,0.15)", "#ddd"),
  },
  heroSubNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: textMain,
  },
  heroSubLabel: {
    fontSize: 11,
    color: textFaint,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: textSub,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: pick(20, 12),
    backgroundColor: "#f7f7f7",
    alignItems: "center",
    ...webGlassBox,
  },
  chartPlaceholder: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 6,
  },
  chartPlaceholderText: {
    fontSize: 11,
    color: textFaint,
    textAlign: "center",
  },
  chartSubTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: textMain,
    alignSelf: "flex-start",
  },
  chartSectionHint: {
    fontSize: 11,
    color: textFaint,
    alignSelf: "flex-start",
    marginTop: 2,
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
    alignSelf: "flex-start",
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
    fontSize: 11,
    color: textSub,
  },
  actionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  actionNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: textMain,
  },
  actionLabel: {
    fontSize: 13,
    color: textSub,
  },
  profileActivityCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    padding: 14,
    borderRadius: pick(20, 12),
    backgroundColor: "#f7f7f7",
    gap: 12,
    ...webGlassBox,
  },
  profileActivityIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: pick("rgba(157,180,255,0.18)", "#e8f1fc"),
    justifyContent: "center",
    alignItems: "center",
  },
  profileActivityLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: textMain,
  },
  profileActivityHint: {
    fontSize: 11,
    color: textFaint,
    marginTop: 2,
  },
  profileActivityNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: textMain,
  },
  // ===== タップ・ホバーで出る、数値の吹き出し =====
  pointerLabel: {
    backgroundColor: pick("rgba(24,26,44,0.95)", "#fff"),
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: pick("rgba(255,255,255,0.18)", "#eee"),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  pointerLabelText: {
    fontSize: 10,
    color: textFaint,
  },
  pointerLabelValue: {
    fontSize: 14,
    fontWeight: "700",
  },
});