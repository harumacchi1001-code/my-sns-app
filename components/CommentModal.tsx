import { useRouter } from "expo-router";
import { addDoc, collection, doc, DocumentData, getDoc, onSnapshot, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { auth, db } from "../firebaseConfig";
import StampFrame from "./StampFrame";

type Comment = {
  id: string;
  authorEmail: string;
  text: string;
  createdAt: any;
};
type Props = {
  postId: string;
  postAuthorEmail: string;
  visible: boolean;
  onClose: () => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default function CommentModal({ postId, postAuthorEmail, visible, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const translateY = useSharedValue(0);

  // ===== コメント投稿者のユーザー情報・ストーリー関連の状態 =====
  const [userMap, setUserMap] = useState<Record<string, DocumentData>>({});
  const [stories, setStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    if (!visible || !postId) return;
    const q = query(
      collection(db, "comments"),
      where("postId", "==", postId),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Comment[];
      setComments(data);
    });
    return unsubscribe;
  }, [visible, postId]);

  // ===== ユーザー情報・ストーリー一覧を取得 =====
  useEffect(() => {
    if (!visible) return;

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const map: Record<string, DocumentData> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email) {
          map[data.email] = { id: docSnap.id, ...data };
        }
      });
      setUserMap(map);
    });

    const unsubscribeStories = onSnapshot(collection(db, "stories"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setStories(data);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeStories();
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible]);

  // ===== 任意のユーザーIDから、24時間以内のストーリー一覧を取り出す =====
  const getUserStories = (userId: string) => {
    const now = Date.now();
    return stories.filter((s) => {
      if (s.authorId !== userId) return false;
      const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
      return now - createdMs < DAY_MS;
    });
  };

  const myUid = auth.currentUser?.uid;

  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAvatarPress = (userId: string) => {
    const userStories = getUserStories(userId);
    onClose();
    if (userStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: userId } });
    } else {
      router.push({ pathname: "/user/[id]", params: { id: userId } });
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !postId) return;
    const myEmail = auth.currentUser?.email;
    await addDoc(collection(db, "comments"), {
      postId: postId,
      authorEmail: myEmail,
      text: commentText.trim(),
      createdAt: new Date(),
    });
    if (postAuthorEmail && postAuthorEmail !== myEmail) {
      const myUid = auth.currentUser?.uid;
      let myUsername = myEmail;
      if (myUid) {
        const myDoc = await getDoc(doc(db, "users", myUid));
        if (myDoc.exists()) {
          myUsername = myDoc.data().username || myEmail;
        }
      }
      await addDoc(collection(db, "notifications"), {
        toUserEmail: postAuthorEmail,
        fromUserEmail: myEmail,
        fromUsername: myUsername,
        type: "comment",
        postId: postId,
        read: false,
        createdAt: serverTimestamp(),
      });
    }
    setCommentText("");
    Keyboard.dismiss();
  };
  const closeModal = () => {
    Keyboard.dismiss();
    onClose();
  };
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 120) {
        translateY.value = withTiming(600, { duration: 200 }, () => {
          runOnJS(closeModal)();
        });
      } else {
        translateY.value = withSpring(0);
      }
    });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeModal}>
      <TouchableWithoutFeedback onPress={closeModal}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingWrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.modalContainer, animatedStyle]}>
            <View style={styles.dragHandle} />
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={{ flex: 1 }}>
                <Text style={styles.header}>
                  {t("commentModal.headerTitle")}（{comments.length}）
                </Text>
                <View style={styles.commentList}>
                  {comments.length === 0 ? (
                    <Text style={styles.noCommentsText}>{t("commentModal.empty")}</Text>
                  ) : (
                    comments.map((comment) => {
                      const author = userMap[comment.authorEmail];
                      const authorStories = author?.id ? getUserStories(author.id) : [];
                      const hasUnread = authorStories.some(
                        (s) => !(s.viewedBy || []).includes(myUid)
                      );

                      return (
                        <View key={comment.id} style={styles.commentItem}>
                          <TouchableOpacity
                            onPress={() => author?.id && handleAvatarPress(author.id)}
                          >
                            <StampFrame
                              size={30}
                              imageUri={author?.photoUrl || null}
                              borderColor="#888"
                              frameThickness={authorStories.length > 0 && hasUnread ? 2.5 : 1}
                              gradientColors={
                                authorStories.length > 0 && hasUnread
                                  ? ["#3D8BFF", "#7B3DFF"]
                                  : undefined
                              }
                              notchesPerSide={4}
                              notchRadius={1.5}
                            />
                          </TouchableOpacity>
                          <View style={styles.commentBody}>
                            <Text style={styles.commentAuthor}>
                              {author?.username || comment.authorEmail}
                            </Text>
                            <Text style={styles.commentText}>{comment.text}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
            <View style={styles.commentInputRow}>
              <TextInput
                placeholder={t("commentModal.placeholder")}
                value={commentText}
                onChangeText={setCommentText}
                style={styles.commentInput}
                multiline
              />
              <TouchableOpacity onPress={handleSendComment} style={styles.commentSendButton}>
                <Text style={styles.commentSendButtonText}>{t("commentModal.sendButton")}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  keyboardAvoidingWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalContainer: {
    height: "85%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#ddd",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  commentList: {
    flex: 1,
    paddingHorizontal: 18,
  },
  noCommentsText: {
    fontSize: 13,
    color: "#999",
    marginTop: 20,
  },
  commentItem: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    color: "#333",
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  commentSendButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentSendButtonText: {
    color: "#4a90e2",
    fontWeight: "600",
  },
});