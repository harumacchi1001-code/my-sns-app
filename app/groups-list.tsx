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
type GroupItem = DocumentData & { id: string };
const isWeb = Platform.OS === "web";
export default function GroupsListScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(collection(db, "groups"), where("isPublic", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as GroupItem[];
      data.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
      setGroups(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  const filteredGroups = searchText.trim()
    ? groups.filter((g) => {
        const text = searchText.toLowerCase();
        const name = (g.name || "").toLowerCase();
        const description = (g.description || "").toLowerCase();
        return name.includes(text) || description.includes(text);
      })
    : groups;
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
          <Text style={styles.headerTitle}>グループ</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.searchBarRow}>
          <View style={styles.searchInputWrapper}>
            <MaterialIcons name="search" size={18} color="#999" />
            <TextInput
              placeholder="グループを検索"
              value={searchText}
              onChangeText={setSearchText}
              style={styles.searchInputField}
              autoCapitalize="none"
            />
          </View>
        </View>
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <TouchableOpacity style={styles.createGroupRow} onPress={() => router.push("/group/create")}>
              <View style={styles.createGroupIconWrapper}>
                <MaterialIcons name="add" size={20} color="#4a90e2" />
              </View>
              <Text style={styles.createGroupText}>新しい、グループを作成</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {searchText ? "見つかりませんでした" : "まだ、公開グループが、ありません"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.groupRow}
              onPress={() => router.push({ pathname: "/group/[id]", params: { id: item.id } })}
            >
              <View style={styles.groupIconWrapper}>
                {item.iconUrl ? (
                  <Image source={{ uri: item.iconUrl }} style={styles.groupIcon} />
                ) : (
                  <MaterialIcons name="groups" size={22} color="#bbb" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupRowName} numberOfLines={1}>
                  {item.name || "無題のグループ"}
                </Text>
                <Text style={styles.groupRowMeta} numberOfLines={1}>
                  メンバー {item.memberCount || 0}人
                  {item.description ? ` ・ ${item.description}` : ""}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#ccc" />
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
  createGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
    marginBottom: 4,
  },
  createGroupIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eaf2fc",
    justifyContent: "center",
    alignItems: "center",
  },
  createGroupText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a90e2",
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  groupIconWrapper: {
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
  groupIcon: {
    width: "100%",
    height: "100%",
  },
  groupRowName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  groupRowMeta: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
});