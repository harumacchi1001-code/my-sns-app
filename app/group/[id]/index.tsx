import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    DocumentData,
    increment,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../../firebaseConfig";
type PostItem = DocumentData & { id: string };
export default function GroupDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const myUid = auth.currentUser?.uid;
  const myEmail = auth.currentUser?.email;
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "groups", id), (docSnap) => {
      if (docSnap.exists()) {
        setGroup({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);
  useEffect(() => {
    if (!id || !myUid) return;
    const unsubscribe = onSnapshot(doc(db, "groups", id, "members", myUid), (docSnap) => {
      setMemberRole(docSnap.exists() ? docSnap.data().role : null);
    });
    return unsubscribe;
  }, [id, myUid]);
  useEffect(() => {
    if (!id || !myUid) return;
    const unsubscribe = onSnapshot(doc(db, "groups", id, "joinRequests", myUid), (docSnap) => {
      setHasPendingRequest(docSnap.exists());
    });
    return unsubscribe;
  }, [id, myUid]);
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "posts"), where("groupId", "==", id), where("status", "==", "published"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as PostItem[];
      // ===== 新しい投稿が上に来るよう並び替え（クライアント側で行い、複合インデックスを避ける） =====
      data.sort((a, b) => {
        const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bt - at;
      });
      setPosts(data);
    });
    return unsubscribe;
  }, [id]);
  const isMember = !!memberRole;
  const isOwnerOrAdmin = memberRole === "owner" || memberRole === "admin";
    const handleJoin = async () => {
    if (!id || !myUid || !myEmail || !group) return;
    // ===== すでに、メンバーなら、何もしない（二重の、参加を、防ぐ） =====
    if (memberRole) return;
    if (group.requireApproval) {
      await setDoc(doc(db, "groups", id, "joinRequests", myUid), {
        email: myEmail,
        requestedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, "groups", id, "members", myUid), {
        email: myEmail,
        role: "member",
        joinedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "groups", id), { memberCount: increment(1) });
      await updateDoc(doc(db, "users", myUid), { joinedGroupIds: arrayUnion(id) });
    }
  };
  const handleLeave = async () => {
    if (!id || !myUid) return;
    // ===== オーナーは、退会できない（グループの管理者が、いなくなってしまうため） =====
    if (memberRole === "owner") {
      alert("オーナーは、退会できません。先に、グループを、削除するか、管理画面から、他のメンバーに、権限を、譲ってください。");
      return;
    }
    if (Platform.OS === "web") {
      const confirmed = window.confirm("このグループを、退会しますか？");
      if (!confirmed) return;
    }
    await deleteDoc(doc(db, "groups", id, "members", myUid));
    await updateDoc(doc(db, "groups", id), { memberCount: increment(-1) });
    await updateDoc(doc(db, "users", myUid), { joinedGroupIds: arrayRemove(id) });
  };
  const handleCancelRequest = async () => {
    if (!id || !myUid) return;
    await deleteDoc(doc(db, "groups", id, "joinRequests", myUid));
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!group) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text>グループが、見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group.name}
          </Text>
          {isOwnerOrAdmin ? (
            <TouchableOpacity onPress={() => router.push({ pathname: "/group/[id]/manage", params: { id } })}>
              <MaterialIcons name="settings" size={22} color="#333" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.groupHeader}>
              <View style={styles.groupIconWrapper}>
                {group.iconUrl ? (
                  <Image source={{ uri: group.iconUrl }} style={styles.groupIcon} />
                ) : (
                  <MaterialIcons name="groups" size={30} color="#bbb" />
                )}
              </View>
              <Text style={styles.groupName}>{group.name}</Text>
              {group.description ? <Text style={styles.groupDescription}>{group.description}</Text> : null}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>メンバー {group.memberCount || 0}人</Text>
                {!group.isPublic && (
                  <View style={styles.privateBadge}>
                    <MaterialIcons name="lock" size={11} color="#999" />
                    <Text style={styles.privateBadgeText}>非公開</Text>
                  </View>
                )}
              </View>
              {isMember && memberRole !== "owner" ? (
                <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
                  <Text style={styles.leaveButtonText}>グループを退会する</Text>
                </TouchableOpacity>
              ) : hasPendingRequest ? (
                <TouchableOpacity style={styles.pendingButton} onPress={handleCancelRequest}>
                  <Text style={styles.pendingButtonText}>承認待ち（タップで、取り消し）</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.joinButton} onPress={handleJoin}>
                  <Text style={styles.joinButtonText}>
                    {group.requireApproval ? "参加を申請する" : "参加する"}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.divider} />
              <Text style={styles.feedSectionTitle}>投稿</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>まだ、投稿が、ありません</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.postRow}
              onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
            >
              <View style={styles.postThumbnailWrapper}>
                {item.thumbnailUrl ? (
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.postThumbnail} resizeMode="cover" />
                ) : (
                  <MaterialIcons name="image" size={20} color="#ccc" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.postTitle} numberOfLines={2}>
                  {item.title || "無題"}
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
    gap: 10,
  },
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 30,
  },
  groupHeader: {
    alignItems: "center",
    padding: 20,
  },
  groupIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f7f7f7",
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  groupIcon: {
    width: "100%",
    height: "100%",
  },
  groupName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
  },
  groupDescription: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  metaText: {
    fontSize: 12,
    color: "#999",
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  privateBadgeText: {
    fontSize: 10,
    color: "#999",
  },
  joinButton: {
    backgroundColor: "#222",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 16,
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  pendingButton: {
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 16,
  },
  pendingButtonText: {
    color: "#666",
    fontSize: 13,
    fontWeight: "600",
  },
  leaveButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 16,
  },
  leaveButtonText: {
    color: "#e74c3c",
    fontSize: 13,
    fontWeight: "600",
  },
  divider: {
    width: "100%",
    height: 0.5,
    backgroundColor: "#eee",
    marginTop: 20,
    marginBottom: 12,
  },
  feedSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  postRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f5f5f5",
  },
  postThumbnailWrapper: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  postThumbnail: {
    width: "100%",
    height: "100%",
  },
  postTitle: {
    fontSize: 14,
    color: "#222",
    lineHeight: 19,
  },
});