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
import { getColorTheme } from "../../../constants/postTemplates";
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
  ul: {
    marginTop: 0,
    marginBottom: 14,
    paddingLeft: 4,
  },
  li: {
    fontSize: 15,
    lineHeight: 26,
    marginBottom: 4,
    color: "#222",
  },
};
const bodyRenderersProps = {
  p: {
    enableExperimentalMarginCollapsing: false,
  },
};
const customHTMLElementModels = {
  mark: HTMLElementModel.fromCustomModel({
    tagName: "mark",
    contentModel: HTMLContentModel.textual,
  }),
  video: HTMLElementModel.fromCustomModel({
    tagName: "video",
    contentModel: HTMLContentModel.block,
  }),
};
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
  // ===== 保険：古い形式の投稿など、単独の<video>タグが、そのまま残っている場合の、表示 =====
  video: ({ tnode }: any) => {
    const src = tnode.attributes?.src || "";
    const player = useVideoPlayer(src, (p) => {
      p.loop = true;
      p.muted = true;
    });
    useEffect(() => {
      if (!player) return;
      player.play();
    }, [player]);
    return (
      <VideoView
        style={{ width: "100%", height: "100%" }}
        player={player}
        contentFit="cover"
        nativeControls={true}
      />
    );
  },
};
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IMAGE_RATIO = 4 / 3;
const DEFAULT_VIDEO_RATIO = 16 / 9;
const DEFAULT_THUMBNAIL_RATIO = 16 / 9;
const isWeb = Platform.OS === "web";
const CONTENT_MAX_WIDTH = 630;

// ===== ここから：本文HTMLの中から、画像・動画グループを、あらかじめ、取り出す仕組み =====
type BodySegment =
  | { type: "html"; content: string }
  | { type: "imageGroup"; items: { url: string; ratio: number; isVideo: boolean }[] }
  | { type: "video"; url: string; ratio: number };

// ===== 開いたタグと、対応する閉じタグの、位置を、深さを数えながら、正確に見つける =====
function findMatchingDivEnd(html: string, searchStartIndex: number): number {
  let depth = 1;
  let pos = searchStartIndex;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<div", pos);
    const nextClose = html.indexOf("</div>", pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      pos = nextClose + 6;
    }
  }
  return pos;
}

function splitBodyIntoSegments(html: string): BodySegment[] {
  if (!html) return [];
  const segments: BodySegment[] = [];
  let cursor = 0;
  const openRegex = /<div[^>]*data-(image-group|video-block)="true"[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(html))) {
    const startTag = match[0];
    const startIndex = match.index;
    const endIndex = findMatchingDivEnd(html, openRegex.lastIndex);

    const beforeText = html.slice(cursor, startIndex);
    if (beforeText.trim()) {
      segments.push({ type: "html", content: beforeText });
    }

    const getAttr = (name: string) => {
      const m = startTag.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : "";
    };

    if (match[1] === "image-group") {
      const urls = getAttr("data-urls").split(",").filter(Boolean);
      const ratios = getAttr("data-ratios").split(",").map((r) => parseFloat(r) || 1);
      const types = getAttr("data-types").split(",");
      segments.push({
        type: "imageGroup",
        items: urls.map((url, idx) => ({
          url,
          ratio: ratios[idx] || 1,
          isVideo: types[idx] === "v",
        })),
      });
    } else {
      segments.push({
        type: "video",
        url: getAttr("data-url"),
        ratio: parseFloat(getAttr("data-ratio")) || DEFAULT_VIDEO_RATIO,
      });
    }

    cursor = endIndex;
    openRegex.lastIndex = endIndex;
  }
  const rest = html.slice(cursor);
  if (rest.trim()) {
    segments.push({ type: "html", content: rest });
  }
  return segments;
}
// ===== ここまで =====

// ===== 画像・動画グループを、確実に、正しいレイアウトで、表示する、専用の部品 =====
function MediaGroupBlock({
  items,
  containerWidth,
}: {
  items: { url: string; ratio: number; isVideo: boolean }[];
  containerWidth: number;
}) {
  const displayItems = items.slice(0, 4);
  const remaining = items.length - displayItems.length;
  const rows: (typeof displayItems)[] = [];
  for (let i = 0; i < displayItems.length; i += 2) {
    rows.push(displayItems.slice(i, i + 2));
  }
  const GAP = 3;
  // ===== 画像が、極端に縦長のときに、行が、無限に高くならないよう、上限を、決めておく =====
  const MAX_ROW_HEIGHT = 260;
  return (
    <View style={{ gap: GAP, borderRadius: 8, overflow: "hidden", marginVertical: 10 }}>
      {rows.map((row, rowIndex) => {
        // ===== この行の、合計の比率から、画面の幅に、ぴったり収まる「高さ」を、逆算する =====
        const sumRatio = row.reduce((s, it) => s + it.ratio, 0);
        const totalGap = GAP * (row.length - 1);
        const rawHeight = (containerWidth - totalGap) / sumRatio;
        const rowHeight = Math.min(rawHeight, MAX_ROW_HEIGHT);
        return (
          <View
            key={rowIndex}
            style={{
              flexDirection: "row",
              gap: GAP,
              height: rowHeight,
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {row.map((item, itemIndex) => {
              const globalIndex = rowIndex * 2 + itemIndex;
              const isLastWithMore = globalIndex === displayItems.length - 1 && remaining > 0;
              const itemWidth = rowHeight * item.ratio;
              return (
                <View key={globalIndex} style={{ width: itemWidth, height: rowHeight }}>
                {item.isVideo ? (
                  <MediaGroupVideo url={item.url} />
                ) : (
                  <Image source={{ uri: item.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                )}
                {isLastWithMore && (
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "600" }}>+{remaining}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ===== 画像グループの中の、動画（自動再生・操作ボタン付き） =====
function MediaGroupVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!player) return;
    player.play();
  }, [player]);
  return (
    <VideoView
      style={{ width: "100%", height: "100%" }}
      player={player}
      // ===== 切り取らず、動画の全体を、そのまま表示する =====
      contentFit="contain"
      nativeControls={true}
    />
  );
}

// ===== 単体の、動画ブロック（自動再生・操作ボタン付き） =====
function SegmentVideo({ url, ratio }: { url: string; ratio: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!player) return;
    player.play();
  }, [player]);
  return (
    <View
      style={{
        width: "100%",
        aspectRatio: ratio,
        borderRadius: 8,
        overflow: "hidden",
        marginVertical: 10,
        backgroundColor: "#000",
      }}
    >
      <VideoView
        style={{ width: "100%", height: "100%" }}
        player={player}
        contentFit="cover"
        nativeControls={true}
      />
    </View>
  );
}

// ===== 本文（HTML）を、安全に、区切って、表示する、共通の部品 =====
function RenderBody({
  html,
  tagsStyles,
  contentWidth,
}: {
  html: string;
  tagsStyles: any;
  contentWidth: number;
}) {
  const segments = splitBodyIntoSegments(html || "");
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "imageGroup") {
          return <MediaGroupBlock key={index} items={segment.items} containerWidth={contentWidth} />;
        }
        if (segment.type === "video") {
          return <SegmentVideo key={index} url={segment.url} ratio={segment.ratio} />;
        }
        return (
          <RenderHtml
            key={index}
            contentWidth={contentWidth}
            source={{ html: segment.content }}
            tagsStyles={tagsStyles}
            renderersProps={bodyRenderersProps}
            customHTMLElementModels={customHTMLElementModels}
            enableCSSInlineProcessing={true}
            renderers={customRenderers}
          />
        );
      })}
    </>
  );
}

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
  const authorHasUnread = authorStories.some((s) => !(s.viewedBy || []).includes(myUid));
  const renderHtmlWidth = isWeb ? Math.min(width, CONTENT_MAX_WIDTH) - 36 : width - 36;
  const thumbnailAspectRatio = post.thumbnailAspectRatio || DEFAULT_THUMBNAIL_RATIO;
  const templateTheme = post.templateThemeId ? getColorTheme(post.templateThemeId) : null;
  const dynamicBodyTagsStyles = templateTheme
    ? {
        ...bodyTagsStyles,
        p: { ...bodyTagsStyles.p, color: templateTheme.text },
        li: { ...bodyTagsStyles.li, color: templateTheme.text },
      }
    : bodyTagsStyles;
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
              <View
                style={[
                  templateTheme && {
                    backgroundColor: templateTheme.background,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: templateTheme.border,
                  },
                ]}
              >
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
                    <RenderBody
                      key={index}
                      html={block.html || ""}
                      tagsStyles={dynamicBodyTagsStyles}
                      contentWidth={renderHtmlWidth}
                    />
                  );
                })
              ) : (
                <RenderBody
                  html={post.body || ""}
                  tagsStyles={dynamicBodyTagsStyles}
                  contentWidth={renderHtmlWidth}
                />
              )}
              </View>
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