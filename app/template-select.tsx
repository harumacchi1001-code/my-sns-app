import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import {
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GENRE_TEMPLATES } from "../constants/postTemplates";

export default function TemplateSelectScreen() {
  const router = useRouter();

  // ===== 「自由に書く」を選んだら、これまでどおりの投稿作成画面へ =====
  const handleFreeWrite = () => {
    router.push("/(tabs)/post");
  };

  // ===== ジャンルを選んだら、そのジャンルの、レイアウト選択画面へ =====
  const handleSelectGenre = (genreId: string) => {
    router.push({ pathname: "/template-format-select", params: { genreId } });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>どう書きますか？</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={GENRE_TEMPLATES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <TouchableOpacity style={styles.card} onPress={handleFreeWrite}>
              <MaterialIcons name="edit" size={24} color="#222" />
              <View style={styles.cardTextWrapper}>
                <Text style={styles.cardTitle}>自由に書く</Text>
                <Text style={styles.cardHint}>これまでどおり、自由に構成</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleSelectGenre(item.id)}>
              <MaterialIcons name={item.icon as any} size={24} color="#222" />
              <View style={styles.cardTextWrapper}>
                <Text style={styles.cardTitle}>{item.label}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#ccc" />
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
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#fafafa",
    marginBottom: 10,
  },
  cardTextWrapper: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  cardHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
});