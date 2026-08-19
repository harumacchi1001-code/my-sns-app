import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    COLOR_THEMES,
    ColorThemeId,
    getColorTheme,
    getGenreTemplate,
    TemplateField,
} from "../constants/postTemplates";

export default function TemplateFormatSelectScreen() {
  const router = useRouter();
  const { genreId } = useLocalSearchParams<{ genreId: string }>();
  const genre = getGenreTemplate(genreId || "");

  const [selectedLayoutId, setSelectedLayoutId] = useState<"A" | "B" | "C">("A");
  const [selectedThemeId, setSelectedThemeId] = useState<ColorThemeId>("simple");

  if (!genre) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text>ジャンルが見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedLayout = genre.layouts.find((l) => l.id === selectedLayoutId)!;
  const theme = getColorTheme(selectedThemeId);

  // ===== 選んだ、レイアウト＋配色で、実際に書き始める =====
  const handleConfirm = () => {
    router.push({
      pathname: "/(tabs)/post",
      params: { genreId, layoutId: selectedLayoutId, themeId: selectedThemeId },
    });
  };

  // ===== 入力欄の種類ごとに、プレビュー表示を分ける =====
  const renderFieldPreview = (field: TemplateField) => {
    switch (field.type) {
      case "text":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View style={[styles.previewInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={{ color: theme.placeholder, fontSize: 13 }}>
                {field.placeholder || field.label}
              </Text>
            </View>
          </View>
        );
      case "textarea":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View
              style={[
                styles.previewInputBox,
                styles.previewTextarea,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text style={{ color: theme.placeholder, fontSize: 13 }}>
                {field.placeholder || field.label}
              </Text>
            </View>
          </View>
        );
      case "rating":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View style={{ flexDirection: "row", gap: 3 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <MaterialIcons key={n} name="star-border" size={18} color={theme.placeholder} />
              ))}
            </View>
          </View>
        );
      case "repeatableList":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View style={[styles.previewInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={{ color: theme.placeholder, fontSize: 13 }}>
                {field.placeholder || "項目を追加"}
              </Text>
            </View>
            <Text style={{ color: theme.accent, fontSize: 12, marginTop: 4 }}>＋ 追加</Text>
          </View>
        );
      case "photo":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View
              style={[
                styles.previewPhotoBox,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <MaterialIcons name="image" size={26} color={theme.placeholder} />
            </View>
          </View>
        );
      case "photoPair":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                style={[
                  styles.previewPhotoBox,
                  { flex: 1, borderColor: theme.border, backgroundColor: theme.surface },
                ]}
              >
                <Text style={{ color: theme.placeholder, fontSize: 11 }}>Before</Text>
              </View>
              <View
                style={[
                  styles.previewPhotoBox,
                  { flex: 1, borderColor: theme.border, backgroundColor: theme.surface },
                ]}
              >
                <Text style={{ color: theme.placeholder, fontSize: 11 }}>After</Text>
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{genre.label}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ===== レイアウトの選択 ===== */}
          <Text style={styles.sectionTitle}>構成を選ぶ</Text>
          <View style={styles.layoutRow}>
            {genre.layouts.map((layout) => (
              <TouchableOpacity
                key={layout.id}
                style={[
                  styles.layoutButton,
                  selectedLayoutId === layout.id && styles.layoutButtonActive,
                ]}
                onPress={() => setSelectedLayoutId(layout.id)}
              >
                <Text
                  style={
                    selectedLayoutId === layout.id
                      ? styles.layoutButtonTextActive
                      : styles.layoutButtonText
                  }
                >
                  {layout.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ===== 配色テーマの選択 ===== */}
          <Text style={styles.sectionTitle}>配色を選ぶ</Text>
          <View style={styles.themeRow}>
            {COLOR_THEMES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.themeSwatch,
                  { backgroundColor: t.background, borderColor: t.border },
                  selectedThemeId === t.id && styles.themeSwatchActive,
                ]}
                onPress={() => setSelectedThemeId(t.id)}
              >
                <View style={[styles.themeSwatchDot, { backgroundColor: t.accent }]} />
                <Text style={[styles.themeSwatchText, { color: t.text }]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ===== プレビュー ===== */}
          <Text style={styles.sectionTitle}>プレビュー</Text>
          <View
            style={[
              styles.previewCard,
              { backgroundColor: theme.background, borderColor: theme.border, overflow: "hidden", padding: 0 },
            ]}
          >
            {/* ===== サムネイルの見た目（プレビューのみ） ===== */}
            <View style={[styles.previewThumbnail, { backgroundColor: theme.surface }]}>
              <MaterialIcons name="image" size={28} color={theme.placeholder} />
            </View>
            <View style={{ padding: 16 }}>
              {/* ===== タイトルの見た目（プレビューのみ） ===== */}
              <Text style={[styles.previewTitle, { color: theme.placeholder }]}>投稿のタイトル</Text>
              <Text style={[styles.previewGenreTitle, { color: theme.text }]}>{genre.label}</Text>
              {selectedLayout.fields.map((field) => renderFieldPreview(field))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmButtonText}>この形式で書き始める</Text>
          </TouchableOpacity>
        </View>
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
    paddingVertical: 12,
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
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    marginTop: 16,
  },
  layoutRow: {
    flexDirection: "row",
    gap: 8,
  },
  layoutButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  layoutButtonActive: {
    backgroundColor: "#222",
    borderColor: "#222",
  },
  layoutButtonText: {
    fontSize: 13,
    color: "#333",
  },
  layoutButtonTextActive: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
  },
  themeSwatch: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
  },
  themeSwatchActive: {
    borderWidth: 2,
    borderColor: "#4a90e2",
  },
  themeSwatchDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  themeSwatchText: {
    fontSize: 12,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  previewThumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    justifyContent: "center",
    alignItems: "center",
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  previewGenreTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  previewFieldBlock: {
    marginBottom: 12,
  },
  previewLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  previewInputBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  previewTextarea: {
    minHeight: 50,
  },
  previewPhotoBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    padding: 16,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
  },
  confirmButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});