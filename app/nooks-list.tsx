import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { collection, DocumentData, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebSidebar from "../components/WebSidebar";
import { db } from "../firebaseConfig";
type NookItem = DocumentData & { id: string };
const isWeb = Platform.OS === "web";
export default function NooksListScreen() {
  const router = useRouter();
  const [nooks, setNooks] = useState<NookItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, "nooks"), where("isPublic", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as NookItem[];
      data.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
      setNooks(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  const filteredNooks = searchText.trim()
    ? nooks.filter((n) => {
        const text = searchText.toLowerCase();
        const name = (n.name || "").toLowerCase();
        const description = (n.description || "").toLowerCase();
        return name.includes(text) || description.includes(text);
      })
    : nooks;
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isWeb && <WebSidebar />}
      <View style={[styles.pageWrapper, isWeb && { paddingLeft: 64 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nook</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.searchBarRow}>
          <View style={styles.searchInputWrapper}>
            <MaterialIcons name="search" size={18} color="#999" />
            <TextInput
              placeholder="Nookを検索"
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchInputField}
              autoCapitalize="none"
            />
          </View>
        </View>
        <FlatList
          data={filteredNooks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <TouchableOpacity style={styles.createNookRow} onPress={() => router.push("/nook/create")}>
              <View style={styles.createNookIconWrapper}>
                <MaterialIcons name="add" size={20} color="#4a90e2" />
              </View>
              <Text style={styles.createNookText}>新しい、Nookを作成</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {searchText ? "見つかりませんでした" : "まだ、公開Nookが、ありません"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isFull = !!(item.memberLimit && (item.memberCount || 0) >= item.memberLimit);
            return (
              <TouchableOpacity
                style={styles.nookRow}
                onPress={() => router.push({ pathname: "/nook/[id]", params: { id: item.id } })}
              >
                <View style={styles.nookIconWrapper}>
                  {item.iconUrl ? (
                    <Image source={{ uri: item.iconUrl }} style={styles.nookIcon} />
                  ) : (
                    <MaterialIcons name="groups" size={22} color="#bbb" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.nookRowName} numberOfLines={1}>
                      {item.name || "無題のNook"}
                    </Text>
                    {isFull && (
                      <View style={styles.fullBadge}>
                        <Text style={styles.fullBadgeText}>満員</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.nookRowMeta} numberOfLines={1}>
                    メンバー {item.memberCount || 0}人{item.memberLimit ? ` / ${item.memberLimit}人` : ""}
                    {item.description ? ` ・ ${item.description}` : ""}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>
            );
          }}
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
  searchBarRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fafafa",
  },
  searchInputField: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  createNookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
    marginBottom: 4,
  },
  createNookIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eaf2fc",
    justifyContent: "center",
    alignItems: "center",
  },
  createNookText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a90e2",
  },
  nookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  nookIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f7f7f7",
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  nookIcon: {
    width: "100%",
    height: "100%",
  },
  nookRowName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  nookRowMeta: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  fullBadge: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fullBadgeText: {
    fontSize: 10,
    color: "#c0392b",
    fontWeight: "600",
  },
});