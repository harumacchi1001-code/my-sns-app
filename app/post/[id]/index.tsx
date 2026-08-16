import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { addDoc, arrayRemove, arrayUnion, collection, doc, DocumentData, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import RenderHtml, { HTMLContentModel, HTMLElementModel, TNodeChildrenRenderer } from "react-native-render-html";
import { SafeAreaView } from "react-native-safe-area-context";
import CommentModal from "../../../components/CommentModal";
import StampFrame from "../../../components/StampFrame";
import { auth, db } from "../../../firebaseConfig";

const bodyTagsStyles = {
  p: {
    fontSize: 15,
    lineHeight: 26,
    marginTop: 0,
    marginBottom: 14,
    color: "#222",
  },
  strong: {
    fontWeight: "700" as const,
  },
  b: {
    fontWeight: "700" as const,
  },
};

const bodyRenderersProps = {
  p: {
    enableExperimentalMarginCollapsing: false,
  },
};

// ===== ここから：<mark>タグを、正しく認識させるための設定 =====
const customHTMLElementModels = {
  mark: HTMLElementModel.fromCustomModel({
    tagName: "mark",
    contentModel: HTMLContentModel.textual,
  }),
};
// ===== ここまで =====

// ===== ここから：日本語では専用の斜体書体がないため、
// 文字を機械的に傾けて、疑似的な斜め文字を再現する =====
const ItalicRenderer = ({ tnode }: any) => {
  return (
    <Text style={{ transform: [{ skewX: "-10deg" }] }}>
      <TNodeChildrenRenderer tnode={tnode} />
    </Text>
  );
};

const customRenderers = {
  em: ItalicRenderer,
  i: ItalicRenderer,
};
// ===== ここまで =====

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IMAGE_RATIO = 4 / 3;
const DEFAULT_VIDEO_RATIO = 16 / 9;
const DEFAULT_THUMBNAIL_RATIO = 16 / 9;

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
const CONTENT_MAX_WIDTH = 630;
// ===== ここまでWeb版専用 =====

export default function PostDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [post, setPost] = useState<DocumentData | null>(null);
  const [author, setAuthor] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);

  // ===== 投稿者の、24時間以内のストーリー一覧 =====
  const [authorStories, setAuthorStories] = useState<DocumentData[]>([]);

  useEffect(() => {
    if (!id) return;
    const postRef = doc(db, "posts", id);
    const unsubscribe = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const fetchAuthor = async () => {
      if (!post?.authorEmail) return;
      const q = query(collection(db, "users"), where("email", "==", post.authorEmail));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setAuthor({ id: docSnap.id, ...docSnap.data() });
      }
    };
    fetchAuthor();
  }, [post?.authorEmail]);

  // ===== 投稿者のストーリーを取得（24時間以内のもののみ） =====
  useEffect(() => {
    if (!author?.id) {
      setAuthorStories([]);
      return;
    }
    const q = query(collection(db, "stories"), where("authorId", "==", author.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const active = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((s: any) => {
          const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
          return now - createdMs < DAY_MS;
        });
      setAuthorStories(active);
    });
    return unsubscribe;
  }, [author?.id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, "comments"), where("postId", "==", id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCommentCount(snapshot.size);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const recordView = async () => {
      const myEmail = auth.currentUser?.email;
      if (!myEmail || !id) return;

      const postRef = doc(db, "posts", id);

      await updateDoc(postRef, {
        impressionCount: increment(1),
      });

      const docSnap = await getDoc(postRef);
      if (docSnap.exists()) {
        const viewedBy: string[] = docSnap.data().viewedBy || [];
        if (!viewedBy.includes(myEmail)) {
          await updateDoc(postRef, { viewedBy: arrayUnion(myEmail) });
        }

        const myUid = auth.currentUser?.uid;
        if (myUid) {
          const postData = docSnap.data();
          await addDoc(collection(db, "viewHistory"), {
            userId: myUid,
            postId: id,
            hashtags: postData.hashtags || [],
            viewedAt: serverTimestamp(),
          });
        }
      }
    };
    recordView();
  }, [id]);

  const toggleLike = async () => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail || !post) return;

    const postRef = doc(db, "posts", post.id);
    const alreadyLiked = post.likedBy?.includes(myEmail);

    if (alreadyLiked) {
      await updateDoc(postRef, { likedBy: arrayRemove(myEmail) });
    } else {
      await updateDoc(postRef, { likedBy: arrayUnion(myEmail) });

      if (post.authorEmail && post.authorEmail !== myEmail) {
        const myUid = auth.currentUser?.uid;
        let myUsername = myEmail;
        if (myUid) {
          const myDoc = await getDoc(doc(db, "users", myUid));
          if (myDoc.exists()) {
            myUsername = myDoc.data().username || myEmail;
          }
        }

        await addDoc(collection(db, "notifications"), {
          toUserEmail: post.authorEmail,
          fromUserEmail: myEmail,
          fromUsername: myUsername,
          type: "like",
          postId: post.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    }
  };

  const toggleSave = async () => {
    const myEmail = auth.currentUser?.email;
    if (!myEmail || !post) return;

    const postRef = doc(db, "posts", post.id);
    const alreadySaved = post.savedBy?.includes(myEmail);

    if (alreadySaved) {
      await updateDoc(postRef, { savedBy: arrayRemove(myEmail) });
    } else {
      await updateDoc(postRef, { savedBy: arrayUnion(myEmail) });
    }
  };

  const recordShare = async () => {
    if (!post) return;
    await updateDoc(doc(db, "posts", post.id), {
      shareCount: increment(1),
    });
  };

  const goToHashtagSearch = (tag: string) => {
    router.push({ pathname: "/(tabs)/explore", params: { initialTag: tag } });
  };

  const goToAuthorProfile = () => {
    if (!author?.id) return;
    router.push({ pathname: "/user/[id]", params: { id: author.id, fromPostId: post?.id } });
  };

  // ===== アイコンをタップしたときの動作：ストーリーがあれば閲覧画面、なければプロフィール =====
  const handleAuthorAvatarPress = () => {
    if (!author?.id) return;
    if (authorStories.length > 0) {
      router.push({ pathname: "/story-view", params: { authorId: author.id } });
    } else {
      goToAuthorProfile();
    }
  };

  const getPostLink = () => {
    return `https://my-diary-sns.example.com/post/${post?.id}`;
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(getPostLink());
    setShareMenuVisible(false);
    recordShare();
    Alert.alert(t("postDetail.linkCopiedTitle"), t("postDetail.linkCopiedMessage"));
  };

  const handleShareToChat = () => {
    setShareMenuVisible(false);
    recordShare();
    router.push({ pathname: "/chat/share", params: { postId: post?.id } });
  };

  const handleExternalShare = async () => {
    setShareMenuVisible(false);
    setTimeout(async () => {
      try {
        await Share.share({
          message: `${post?.title || t("postDetail.noTitle")}\n${getPostLink()}`,
        });
        recordShare();
      } catch (error: any) {
        console.log("共有エラー:", error.message);
      }
    }, 500);
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  if (!post) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <Text>{t("postDetail.notFound")}</Text>
        </View>
      </>
    );
  }

  const myEmail = auth.currentUser?.email;
  const myUid = auth.currentUser?.uid;
  const likedByMe = !!myEmail && !!post.likedBy?.includes(myEmail);
  const likeCount = post.likedBy?.length || 0;
  const savedByMe = !!myEmail && !!post.savedBy?.includes(myEmail);
  const isMyPost = !!myEmail && myEmail === post.authorEmail;

  // ===== 投稿者のストーリーに、まだ見ていないものがあるか =====
  const authorHasUnread = authorStories.some((s) => !(s.viewedBy || []).includes(myUid));

  // ===== ここからWeb版専用（本文の描画幅を、中央寄せしたコンテンツ幅に合わせる） =====
  const renderHtmlWidth = isWeb ? Math.min(width, CONTENT_MAX_WIDTH) - 36 : width - 36;
  // ===== ここまでWeb版専用 =====

  const thumbnailAspectRatio = post.thumbnailAspectRatio || DEFAULT_THUMBNAIL_RATIO;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.pageWrapper}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backText}>{t("postDetail.backButton")}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            {post.thumbnailUrl && (
              post.thumbnailType === "video" ? (
                <ThumbnailVideo url={post.thumbnailUrl} aspectRatio={thumbnailAspectRatio} />
              ) : (
                <Image
                  source={{ uri: post.thumbnailUrl }}
                  style={[styles.thumbnail, { aspectRatio: thumbnailAspectRatio }]}
                />
              )
            )}

            <View style={styles.content}>
              <Text style={styles.title}>{post.title || t("postDetail.noTitle")}</Text>

              <View style={styles.metaAndActionsRow}>
                <View style={styles.metaRow}>
                  <TouchableOpacity onPress={handleAuthorAvatarPress}>
                    <StampFrame
                      size={30}
                      imageUri={author?.photoUrl || null}
                      borderColor="#888"
                      frameThickness={authorStories.length > 0 && authorHasUnread ? 3 : 1}
                      gradientColors={
                        authorStories.length > 0 && authorHasUnread
                          ? ["#3D8BFF", "#7B3DFF"]
                          : undefined
                      }
                      notchesPerSide={4}
                      notchRadius={1.5}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={goToAuthorProfile}>
                    <Text style={styles.metaText}>
                      {author?.handle || author?.username || post.authorEmail}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
                    <MaterialIcons
                      name={likedByMe ? "favorite" : "favorite-border"}
                      size={20}
                      color={likedByMe ? "#e74c3c" : "#666"}
                    />
                    <Text style={likedByMe ? styles.likedText : styles.actionText}>
                      {likeCount}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => setCommentModalVisible(true)}
                  >
                    <MaterialIcons name="chat-bubble-outline" size={20} color="#666" />
                    <Text style={styles.actionText}>{commentCount}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionButton} onPress={() => setShareMenuVisible(true)}>
                    <MaterialIcons name="share" size={20} color="#666" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionButton} onPress={toggleSave}>
                    <MaterialIcons
                      name={savedByMe ? "bookmark" : "bookmark-border"}
                      size={20}
                      color={savedByMe ? "#4a90e2" : "#666"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {post.hashtags && post.hashtags.length > 0 && (
                <View style={styles.hashtagRow}>
                  {post.hashtags.map((tag: string, index: number) => (
                    <TouchableOpacity key={index} onPress={() => goToHashtagSearch(tag)}>
                      <Text style={styles.hashtagText}>#{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {post.contentBlocks && post.contentBlocks.length > 0 ? (
                post.contentBlocks.map((block: any, index: number) => {
                  if (block.type === "image") {
                    return (
                      <Image
                        key={index}
                        source={{ uri: block.url }}
                        style={[
                          styles.blockImage,
                          { aspectRatio: block.aspectRatio || DEFAULT_IMAGE_RATIO },
                        ]}
                      />
                    );
                  }
                  if (block.type === "video") {
                    return (
                      <BlockVideo
                        key={index}
                        url={block.url}
                        aspectRatio={block.aspectRatio || DEFAULT_VIDEO_RATIO}
                      />
                    );
                  }
                  return (
                    <RenderHtml
                      key={index}
                      contentWidth={renderHtmlWidth}
                      source={{ html: block.html || "" }}
                      tagsStyles={bodyTagsStyles}
                      renderersProps={bodyRenderersProps}
                      customHTMLElementModels={customHTMLElementModels}
                      enableCSSInlineProcessing={true}
                      renderers={customRenderers}
                    />
                  );
                })
              ) : (
                <RenderHtml
                  contentWidth={renderHtmlWidth}
                  source={{ html: post.body || "" }}
                  tagsStyles={bodyTagsStyles}
                  renderersProps={bodyRenderersProps}
                  customHTMLElementModels={customHTMLElementModels}
                  enableCSSInlineProcessing={true}
                  renderers={customRenderers}
                />
              )}

              {isMyPost && (
                <TouchableOpacity
                  style={styles.insightsButton}
                  onPress={() => router.push({ pathname: "/post/[id]/insights", params: { id: post.id } })}
                >
                  <Text style={styles.insightsButtonText}>{t("postDetail.insightsButton")}</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>

        <CommentModal
          postId={post.id}
          postAuthorEmail={post.authorEmail}
          visible={commentModalVisible}
          onClose={() => setCommentModalVisible(false)}
        />

        <Modal visible={shareMenuVisible} transparent animationType="fade" onRequestClose={() => setShareMenuVisible(false)}>
          <TouchableWithoutFeedback onPress={() => setShareMenuVisible(false)}>
            <View style={styles.shareOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.shareMenu}>
                  <TouchableOpacity style={styles.shareMenuItem} onPress={handleCopyLink}>
                    <MaterialIcons name="link" size={20} color="#333" />
                    <Text style={styles.shareMenuText}>{t("postDetail.shareCopyLink")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shareMenuItem} onPress={handleShareToChat}>
                    <MaterialIcons name="send" size={20} color="#333" />
                    <Text style={styles.shareMenuText}>{t("postDetail.shareToChat")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shareMenuItem} onPress={handleExternalShare}>
                    <MaterialIcons name="ios-share" size={20} color="#333" />
                    <Text style={styles.shareMenuText}>{t("postDetail.shareExternal")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shareMenuCancel} onPress={() => setShareMenuVisible(false)}>
                    <Text style={styles.shareMenuCancelText}>{t("postDetail.shareCancel")}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    </>
  );
}

// ===== サムネイル用の動画（一覧に置かれた、静的な動画）を、再生するための、専用の部品 =====
function ThumbnailVideo({ url, aspectRatio }: { url: string; aspectRatio: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      style={[styles.thumbnail, { aspectRatio }]}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// ===== 本文中の動画ブロックを、再生するための、専用の部品 =====
function BlockVideo({ url, aspectRatio }: { url: string; aspectRatio: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      style={[styles.blockImage, { aspectRatio }]}
      player={player}
      contentFit="contain"
      nativeControls={true}
    />
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
      maxWidth: CONTENT_MAX_WIDTH,
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
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  thumbnail: {
    width: "100%",
    backgroundColor: "#f0f0f0",
  },
  content: {
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 10,
  },
  metaAndActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 14,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    color: "#666",
  },
  likedText: {
    fontSize: 13,
    color: "#e74c3c",
    fontWeight: "600",
  },
  hashtagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 0,
    marginBottom: 12,
  },
  hashtagText: {
    fontSize: 13,
    lineHeight: 14,
    color: "#4a90e2",
  },
  blockImage: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    marginVertical: 10,
  },
  insightsButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  insightsButtonText: {
    color: "#666",
    fontSize: 14,
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  shareMenu: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  shareMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  shareMenuText: {
    fontSize: 15,
    color: "#333",
  },
  shareMenuCancel: {
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  shareMenuCancelText: {
    fontSize: 15,
    color: "#e74c3c",
    fontWeight: "600",
  },
});