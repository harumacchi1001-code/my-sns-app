import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
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
import { GENRE_TEMPLATES, getSampleData, TemplateLayout } from "../constants/postTemplates";
// ===== 実際のレイアウトの、フィールド構成を、縮小した見た目で、それぞれ、それらしく、表示する =====
function MiniLayoutPreview({ genreId, layout }: { genreId: string; layout: TemplateLayout }) {
  const sampleData = getSampleData(genreId, layout.id);
  const isPhotoMain = layout.fields[0]?.type === "photo" || layout.fields[0]?.type === "photoPair";
  const renderField = (field: any) => {
    const value = sampleData[field.key];
    switch (field.type) {
      case "text":
      case "textarea":
        return (
          <View key={field.key} style={styles.miniFieldBlock}>
            <Text style={styles.miniFieldLabel} numberOfLines={1}>{field.label}</Text>
            <Text style={styles.miniFieldValue} numberOfLines={2}>
              {value || field.placeholder || field.label}
            </Text>
          </View>
        );
      case "rating":
        return (
          <View key={field.key} style={styles.miniFieldBlock}>
            <Text style={styles.miniFieldLabel} numberOfLines={1}>{field.label}</Text>
            <View style={{ flexDirection: "row", gap: 1 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <MaterialIcons
                  key={n}
                  name={value && n <= value ? "star" : "star-border"}
                  size={9}
                  color={value && n <= value ? "#e8a33d" : "#ccc"}
                />
              ))}
            </View>
          </View>
        );
      case "repeatableList": {
        const items: string[] = Array.isArray(value) ? value : [];
        return (
          <View key={field.key} style={styles.miniFieldBlock}>
            <Text style={styles.miniFieldLabel} numberOfLines={1}>{field.label}</Text>
            {(items.length > 0 ? items : [field.placeholder || "項目"]).slice(0, 3).map((item, index) => (
              <Text key={index} style={styles.miniFieldValue} numberOfLines={1}>
                ・{item}
              </Text>
            ))}
          </View>
        );
      }
      case "photo":
        return (
          <View key={field.key} style={styles.miniFieldBlock}>
            <Text style={styles.miniFieldLabel} numberOfLines={1}>{field.label}</Text>
            <View style={styles.miniPhotoBox}>
              <MaterialIcons name="image" size={12} color="#bbb" />
            </View>
          </View>
        );
      case "photoPair":
        return (
          <View key={field.key} style={styles.miniFieldBlock}>
            <Text style={styles.miniFieldLabel} numberOfLines={1}>{field.label}</Text>
            <View style={{ flexDirection: "row", gap: 3 }}>
              <View style={[styles.miniPhotoBox, { flex: 1 }]} />
              <View style={[styles.miniPhotoBox, { flex: 1 }]} />
            </View>
          </View>
        );
      default:
        return null;
    }
  };
  return (
    <View style={styles.miniPreviewCard}>
      <View style={[styles.miniPreviewThumb, isPhotoMain && styles.miniPreviewThumbLarge]}>
        <MaterialIcons name="image" size={isPhotoMain ? 20 : 14} color="#bbb" />
      </View>
      <View style={styles.miniPreviewBody}>
        <Text style={styles.miniTitleText} numberOfLines={1}>投稿のタイトル</Text>
        {layout.fields.map((field) => renderField(field))}
      </View>
    </View>
  );
}
export default function TemplateSelectScreen() {
  const router = useRouter();
  // ===== 「自由に書く」を選んだら、これまでどおりの投稿作成画面へ =====
  const handleFreeWrite = () => {
    router.push("/post-editor");
  };
  // ===== ジャンル・レイアウトを選んだら、プレビュー画面へ =====
  const handleSelectLayout = (genreId: string, layoutId: "A" | "B" | "C") => {
    router.push({ pathname: "/template-preview", params: { genreId, layoutId } });
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {Platform.OS === "web" && <WebSidebar />}
      <View style={[styles.pageWrapper, Platform.OS === "web" && { paddingLeft: 64 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>どう書きますか？</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.listContent}>
          <TouchableOpacity style={styles.freeWriteCard} onPress={handleFreeWrite}>
            <MaterialIcons name="edit" size={24} color="#222" />
            <View style={styles.cardTextWrapper}>
              <Text style={styles.freeWriteTitle}>自由に書く</Text>
              <Text style={styles.cardHint}>これまでどおり、自由に構成</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#ccc" />
          </TouchableOpacity>
          {GENRE_TEMPLATES.map((genre) => (
            <View key={genre.id} style={styles.genreSection}>
              <View style={styles.genreHeaderRow}>
                <MaterialIcons name={genre.icon as any} size={18} color="#444" />
                <Text style={styles.genreHeaderText}>{genre.label}</Text>
              </View>
              <View style={styles.layoutRow}>
                {genre.layouts.map((layout) => (
                  <TouchableOpacity
                    key={layout.id}
                    style={styles.layoutCardWrapper}
                    onPress={() => handleSelectLayout(genre.id, layout.id)}
                  >
                    <MiniLayoutPreview genreId={genre.id} layout={layout} />
                    <Text style={styles.layoutCardText}>{layout.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
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
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  freeWriteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#fafafa",
    marginBottom: 20,
  },
  cardTextWrapper: {
    flex: 1,
  },
  freeWriteTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  cardHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  genreSection: {
    marginBottom: 24,
  },
  genreHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  genreHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  layoutRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  layoutCardWrapper: {
    flex: 1,
  },
  layoutCardText: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
  },
  miniPreviewCard: {
    width: "100%",
    height: 144,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    backgroundColor: "#fafafa",
    overflow: "hidden",
  },
  miniPreviewThumb: {
    height: 28,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  miniPreviewThumbLarge: {
    height: 48,
  },
  miniPreviewBody: {
    flex: 1,
    padding: 6,
  },
  miniTitleText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  miniFieldBlock: {
    marginBottom: 4,
  },
  miniFieldLabel: {
    fontSize: 7,
    color: "#999",
    marginBottom: 1,
  },
  miniFieldValue: {
    fontSize: 8,
    color: "#444",
    lineHeight: 10,
  },
  miniPhotoBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
});