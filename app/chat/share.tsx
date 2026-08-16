import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, doc, DocumentData, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { auth, db } from "../../firebaseConfig";

type Chat = DocumentData & { id: string };

export default function ShareToChatScreen() {
  const { t } = useTranslation();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [loading, setLoading] = useState(true);
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);

  useEffect(() => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail) return;

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", myEmail),
      orderBy("lastMessageAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Chat[];
      setChats(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, DocumentData> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email) {
          map[data.email] = { id: docSnap.id, ...data };
        }
      });
      setUserMap(map);
    });
    return unsubscribe;
  }, []);

  const getChatDisplayInfo = (chat: Chat) => {
    const myEmail = auth.currentUser?.email;

    if (chat.isGroup) {
      return { name: chat.groupName || t("chatDetail.group"), photoUrl: null };
    }

    const otherEmail = chat.participants.find((p: string) => p !== myEmail);
    const otherUser = userMap[otherEmail];
    return {
      name: otherUser?.username || otherEmail || t("chatDetail.unknownUser"),
      photoUrl: otherUser?.photoUrl || null,
    };
  };

  const handleSendToChat = async (chatId: string) => {
    if (!postId) return;
    setSendingChatId(chatId);

    const myEmail = auth.currentUser?.email;

    await addDoc(collection(db, "chats", chatId, "messages"), {
      senderEmail: myEmail,
      text: "",
      sharedPostId: postId,
      createdAt: new Date(),
    });

    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: t("chatShare.sharedMessage"),
      lastMessageAt: new Date(),
    });

    setSendingChatId(null);
    router.replace({ pathname: "/chat/[id]", params: { id: chatId } });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>{t("chatShare.cancelButton")}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("chatShare.headerTitle")}</Text>
          <View style={{ width: 60 }} />
        </View>

        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>{t("chatShare.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const info = getChatDisplayInfo(item);
            const isSending = sendingChatId === item.id;
            return (
              <TouchableOpacity
                style={styles.chatRow}
                onPress={() => handleSendToChat(item.id)}
                disabled={!!sendingChatId}
              >
                {info.photoUrl ? (
                  <Image source={{ uri: info.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderText}>
                      {item.isGroup ? "👥" : "👤"}
                    </Text>
                  </View>
                )}
                <Text style={styles.chatName}>{info.name}</Text>
                {isSending && <ActivityIndicator size="small" style={{ marginLeft: "auto" }} />}
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
  // ===== ここからWeb版専用 =====
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
  // ===== ここまでWeb版専用 =====
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
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  backText: {
    color: "#4a90e2",
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: "#f0f0f0",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderText: {
    fontSize: 18,
  },
  chatName: {
    fontSize: 15,
    fontWeight: "500",
  },
});