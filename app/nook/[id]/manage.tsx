import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDocs,
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../../firebaseConfig";
type MemberItem = DocumentData & { id: string };
type RequestItem = DocumentData & { id: string };
export default function NookManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [nook, setNook] = useState<DocumentData | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [limitRequestCount, setLimitRequestCount] = useState(0);
  const [newLimitText, setNewLimitText] = useState("");
  const [loading, setLoading] = useState(true);
  const myUid = auth.currentUser?.uid;
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "nooks", id), (docSnap) => {
      if (docSnap.exists()) {
        setNook({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "nooks", id, "members"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as MemberItem[];
      setMembers(data);
    });
    return unsubscribe;
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "nooks", id, "joinRequests"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as RequestItem[];
      setRequests(data);
    });
    return unsubscribe;
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "nooks", id, "limitIncreaseRequests"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLimitRequestCount(snapshot.size);
    });
    return unsubscribe;
  }, [id]);
  // ===== 自分が、オーナー・管理者かどうかを、確認する =====
  const myMembership = members.find((m) => m.id === myUid);
  const isOwnerOrAdmin = myMembership?.role === "owner" || myMembership?.role === "admin";
  const handleApprove = async (request: RequestItem) => {
    if (!id) return;
    await setDoc(doc(db, "nooks", id, "members", request.id), {
      email: request.email,
      role: "member",
      joinedAt: new Date(),
    });
    await deleteDoc(doc(db, "nooks", id, "joinRequests", request.id));
    await updateDoc(doc(db, "nooks", id), { memberCount: increment(1) });
    // ===== 申請者に、承認されたことを、通知する =====
    try {
      await addDoc(collection(db, "notifications"), {
        toUserEmail: request.email,
        fromUserEmail: auth.currentUser?.email,
        type: "nookApproved",
        nookId: id,
        nookName: nook?.name || "Nook",
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (error: any) {
      console.log("通知の作成に、失敗しました。", error.message);
    }
  };
  const handleReject = async (request: RequestItem) => {
    if (!id) return;
    await deleteDoc(doc(db, "nooks", id, "joinRequests", request.id));
  };
  const handleRemoveMember = async (member: MemberItem) => {
    if (!id) return;
    if (member.role === "owner") {
      alert("オーナーは、削除できません");
      return;
    }
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`${member.email}を、Nookから、削除しますか？`);
      if (!confirmed) return;
    }
    await deleteDoc(doc(db, "nooks", id, "members", member.id));
    await updateDoc(doc(db, "nooks", id), { memberCount: increment(-1) });
  };
  const handleToggleAdmin = async (member: MemberItem) => {
    if (!id) return;
    const newRole = member.role === "admin" ? "member" : "admin";
    await updateDoc(doc(db, "nooks", id, "members", member.id), { role: newRole });
  };
  const handleUpdateLimit = async () => {
    if (!id) return;
    const parsed = parseInt(newLimitText, 10);
    if (!parsed || parsed < 1 || parsed > 500) {
      alert("定員は、1〜500の、範囲で、入力してください");
      return;
    }
    if (parsed < (nook?.memberCount || 0)) {
      alert("現在の、メンバー数より、少ない、定員には、できません");
      return;
    }
    await updateDoc(doc(db, "nooks", id), { memberLimit: parsed });
    // ===== 定員を、更新したら、それまでの、増加リクエストは、役目を終えたとみなし、削除する =====
    await clearLimitIncreaseRequests();
    setNewLimitText("");
    alert("定員を、更新しました");
  };
  // ===== 定員数の、増加リクエストを、すべて、削除する（更新時の、自動リセット、または、手動での確認済み処理、どちらからも呼ばれる） =====
  const clearLimitIncreaseRequests = async () => {
    if (!id) return;
    const snapshot = await getDocs(collection(db, "nooks", id, "limitIncreaseRequests"));
    await Promise.all(snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
  };
  const handleMarkLimitRequestsAsChecked = async () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("定員数の、増加リクエストを、確認済みにしますか？");
      if (!confirmed) return;
    }
    await clearLimitIncreaseRequests();
  };
  const handleDeleteNook = async () => {
    if (!id) return;
    if (Platform.OS === "web") {
      const confirmed = window.confirm("このNookを、削除しますか？この操作は、取り消せません。");
      if (!confirmed) return;
    }
    await deleteDoc(doc(db, "nooks", id));
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
          <Text style={styles.headerTitle}>Nookの管理</Text>
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
          {/* ===== 定員の、管理 ===== */}
          <Text style={styles.sectionTitle}>定員</Text>
          <View style={styles.limitInfoRow}>
            <Text style={styles.limitInfoText}>
              現在：{nook?.memberCount || 0}人 / {nook?.memberLimit || "未設定"}人
            </Text>
            {limitRequestCount > 0 && (
              <View style={styles.limitRequestRow}>
                <View style={styles.limitRequestBadge}>
                  <Text style={styles.limitRequestBadgeText}>
                    定員数の増加リクエスト {limitRequestCount}件
                  </Text>
                </View>
                <TouchableOpacity onPress={handleMarkLimitRequestsAsChecked}>
                  <Text style={styles.limitRequestCheckedText}>確認済みにする</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.limitEditRow}>
            <TextInput
              value={newLimitText}
              onChangeText={setNewLimitText}
              placeholder="新しい定員（1〜500）"
              keyboardType="numeric"
              style={styles.limitInput}
            />
            <TouchableOpacity style={styles.limitUpdateButton} onPress={handleUpdateLimit}>
              <Text style={styles.limitUpdateButtonText}>更新</Text>
            </TouchableOpacity>
          </View>
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
          {/* ===== オーナーのみ：Nookの削除 ===== */}
          {myMembership?.role === "owner" && (
            <TouchableOpacity style={styles.deleteNookButton} onPress={handleDeleteNook}>
              <Text style={styles.deleteNookButtonText}>Nookを削除する</Text>
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
  limitInfoRow: {
    marginBottom: 10,
  },
  limitInfoText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 6,
  },
  limitRequestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  limitRequestBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff8e6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  limitRequestCheckedText: {
    fontSize: 12,
    color: "#4a90e2",
  },
  limitRequestBadgeText: {
    fontSize: 12,
    color: "#8a6d1a",
    fontWeight: "600",
  },
  limitEditRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  limitInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  limitUpdateButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  limitUpdateButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
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
  deleteNookButton: {
    marginTop: 30,
    borderWidth: 1,
    borderColor: "#e74c3c",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteNookButtonText: {
    color: "#e74c3c",
    fontWeight: "600",
    fontSize: 14,
  },
});