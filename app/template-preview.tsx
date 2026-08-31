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
import WebSidebar from "../components/WebSidebar";
import {
    getColorTheme,
    getGenreTemplate,
    getSampleData,
    TemplateField,
} from "../constants/postTemplates";
export default function TemplatePreviewScreen() {
  const router = useRouter();
  const { genreId, layoutId } = useLocalSearchParams<{ genreId: string; layoutId: "A" | "B" | "C" }>();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const genre = getGenreTemplate(genreId || "");
  const theme = getColorTheme("simple");
  if (!genre || !layoutId) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text>テンプレートが見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }
  const layout = genre.layouts.find((l) => l.id === layoutId);
  if (!layout) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text>テンプレートが見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }
  const sampleData = getSampleData(genreId, layoutId);
  // ===== ×ボタン：テンプレート選択画面に、戻る =====
  const handleClose = () => {
    router.back();
  };
  // ===== 「この形式で、書き始める」：編集画面へ（配色は渡さず、編集画面の初期値のまま） =====
  const handleConfirm = () => {
    router.push({
      pathname: "/post-editor",
      params: { genreId, layoutId },
    });
  };
  // ===== 入力欄の種類ごとに、サンプル値を、それっぽく、表示する =====
  const renderFieldPreview = (field: TemplateField) => {
    const value = sampleData[field.key];
    switch (field.type) {
      case "text":
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            <View style={[styles.previewInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={{ color: theme.text, fontSize: 13 }}>
                {value || field.placeholder || field.label}
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
              <Text style={{ color: theme.text, fontSize: 13 }}>
                {value || field.placeholder || field.label}
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
                <MaterialIcons
                  key={n}
                  name={value && n <= value ? "star" : "star-border"}
                  size={18}
                  color={value && n <= value ? theme.accent : theme.placeholder}
                />
              ))}
            </View>
          </View>
        );
      case "repeatableList": {
        const items: string[] = Array.isArray(value) ? value : [];
        return (
          <View key={field.key} style={styles.previewFieldBlock}>
            <Text style={[styles.previewLabel, { color: theme.muted }]}>{field.label}</Text>
            {items.length > 0 ? (
              items.map((item, index) => (
                <Text key={index} style={{ color: theme.text, fontSize: 13, marginBottom: 2 }}>
                  ・{item}
                </Text>
              ))
            ) : (
              <View style={[styles.previewInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={{ color: theme.placeholder, fontSize: 13 }}>
                  {field.placeholder || "項目を追加"}
                </Text>
              </View>
            )}
          </View>
        );
      }
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
      {Platform.OS === "web" && <WebSidebar onExpandChange={setIsSidebarExpanded} />}
      <View style={[styles.pageWrapper, Platform.OS === "web" && { paddingLeft: isSidebarExpanded ? 200 : 64 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {genre.label}・{layout.name}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={22} color="#333" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.previewCard,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <View style={[styles.previewThumbnail, { backgroundColor: theme.surface }]}>
              <MaterialIcons name="image" size={28} color={theme.placeholder} />
            </View>
            <View style={{ padding: 16 }}>
              <Text style={[styles.previewGenreTitle, { color: theme.text }]}>
                {genre.label}のタイトル例
              </Text>
              {layout.fields.map((field) => renderFieldPreview(field))}
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
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  previewThumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    justifyContent: "center",
    alignItems: "center",
  },
  previewGenreTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
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