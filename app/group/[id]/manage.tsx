import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    addDoc,
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
} from "firebase/firestore";
import { useEffect, useState } from "react";
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
import { auth, db } from "../../../firebaseConfig";
type MemberItem = DocumentData & { id: string };
type RequestItem = DocumentData & { id: string };
export default function GroupManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<DocumentData | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const myUid = auth.currentUser?.uid;
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
    if (!id) return;
    const q = query(collection(db, "groups", id, "members"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as MemberItem[];
      setMembers(data);
    });
    return unsubscribe;
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "groups", id, "joinRequests"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as RequestItem[];
      setRequests(data);
    });
    return unsubscribe;
  }, [id]);
  // ===== 自分が、オーナー・管理者かどうかを、確認する =====
  const myMembership = members.find((m) => m.id === myUid);
  const isOwnerOrAdmin = myMembership?.role === "owner" || myMembership?.role === "admin";
    const handleApprove = async (request: RequestItem) => {
    if (!id) return;
    await setDoc(doc(db, "groups", id, "members", request.id), {
      email: request.email,
      role: "member",
      joinedAt: new Date(),
    });
    await deleteDoc(doc(db, "groups", id, "joinRequests", request.id));
    await updateDoc(doc(db, "groups", id), { memberCount: increment(1) });
    await updateDoc(doc(db, "users", request.id), { joinedGroupIds: arrayUnion(id) });
    // ===== 申請者に、承認されたことを、通知する =====
    await addDoc(collection(db, "notifications"), {
      toUserEmail: request.email,
      fromUserEmail: auth.currentUser?.email,
      type: "groupApproved",
      groupId: id,
      groupName: group?.name || "グループ",
      read: false,
      createdAt: serverTimestamp(),
    });
  };
  const handleReject = async (request: RequestItem) => {
    if (!id) return;
    await deleteDoc(doc(db, "groups", id, "joinRequests", request.id));
  };
  const handleRemoveMember = async (member: MemberItem) => {
    if (!id) return;
    if (member.role === "owner") {
      alert("オーナーは、削除できません");
      return;
    }
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`${member.email}を、グループから、削除しますか？`);
      if (!confirmed) return;
    }
    await deleteDoc(doc(db, "groups", id, "members", member.id));
    await updateDoc(doc(db, "groups", id), { memberCount: increment(-1) });
    await updateDoc(doc(db, "users", member.id), { joinedGroupIds: arrayRemove(id) });
  };
  const handleToggleAdmin = async (member: MemberItem) => {
    if (!id) return;
    const newRole = member.role === "admin" ? "member" : "admin";
    await updateDoc(doc(db, "groups", id, "members", member.id), { role: newRole });
  };
  const handleDeleteGroup = async () => {
    if (!id) return;
    if (Platform.OS === "web") {
      const confirmed = window.confirm("このグループを、削除しますか？この操作は、取り消せません。");
      if (!confirmed) return;
    }
    await deleteDoc(doc(db, "groups", id));
    router.replace("/(tabs)/explore");
  };
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!isOwnerOrAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text>この、画面を、見る、権限が、ありません</Text>
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
          <Text style={styles.headerTitle}>グループの管理</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ===== 参加申請の、承認待ち一覧 ===== */}
          {requests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>参加申請（{requests.length}件）</Text>
              {requests.map((req) => (
                <View key={req.id} style={styles.requestRow}>
                  <Text style={styles.memberEmail}>{req.email}</Text>
                  <View style={styles.requestButtonsRow}>
                    <TouchableOpacity style={styles.approveButton} onPress={() => handleApprove(req)}>
                      <Text style={styles.approveButtonText}>承認</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(req)}>
                      <Text style={styles.rejectButtonText}>却下</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
          {/* ===== メンバー一覧 ===== */}
          <Text style={styles.sectionTitle}>メンバー（{members.length}人）</Text>
          {members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberEmail}>{member.email}</Text>
                <Text style={styles.memberRoleText}>
                  {member.role === "owner" ? "オーナー" : member.role === "admin" ? "管理者" : "メンバー"}
                </Text>
              </View>
              {member.role !== "owner" && (
                <View style={styles.memberActionsRow}>
                  <TouchableOpacity style={styles.smallActionButton} onPress={() => handleToggleAdmin(member)}>
                    <Text style={styles.smallActionButtonText}>
                      {member.role === "admin" ? "管理者を解除" : "管理者にする"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveMember(member)}>
                    <MaterialIcons name="close" size={18} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {/* ===== オーナーのみ：グループの削除 ===== */}
          {myMembership?.role === "owner" && (
            <TouchableOpacity style={styles.deleteGroupButton} onPress={handleDeleteGroup}>
              <Text style={styles.deleteGroupButtonText}>グループを削除する</Text>
            </TouchableOpacity>
          )}
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
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  requestButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  approveButton: {
    backgroundColor: "#222",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  approveButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  rejectButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rejectButtonText: {
    color: "#666",
    fontSize: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  memberEmail: {
    fontSize: 14,
    color: "#222",
  },
  memberRoleText: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  memberActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smallActionButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallActionButtonText: {
    fontSize: 11,
    color: "#333",
  },
  deleteGroupButton: {
    marginTop: 30,
    borderWidth: 1,
    borderColor: "#e74c3c",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteGroupButtonText: {
    color: "#e74c3c",
    fontWeight: "600",
    fontSize: 14,
  },
});