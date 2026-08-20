import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { addDoc, arrayRemove, arrayUnion, collection, doc, DocumentData, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
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
// ===== キャプション（画像・動画の説明文）の、投稿詳細画面での、見た目 =====
const bodyClassesStyles = {
  "diary-caption": {
    fontSize: 12,
    lineHeight: 1,
    color: "#999",
    marginTop: 4,
    marginBottom: 14,
    textAlign: "center" as const,
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
        allowsFullscreen={false}
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
type BodySegment =
  | { type: "html"; content: string }
  | { type: "imageGroup"; items: { url: string; ratio: number; isVideo: boolean }[] }
  | { type: "video"; url: string; ratio: number };
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
function MediaGroupBlock({
  items,
  containerWidth,
  onOpenLightbox,
}: {
  items: { url: string; ratio: number; isVideo: boolean }[];
  containerWidth: number;
  onOpenLightbox: (items: { url: string; isVideo: boolean }[], index: number) => void;
}) {
  const displayItems = items.slice(0, 4);
  const remaining = items.length - displayItems.length;
  const rows: (typeof displayItems)[] = [];
  for (let i = 0; i < displayItems.length; i += 2) {
    rows.push(displayItems.slice(i, i + 2));
  }
  const GAP = 3;
  const MAX_ROW_HEIGHT = 260;
  return (
    <View style={{ gap: GAP, borderRadius: 8, overflow: "hidden", marginVertical: 10 }}>
      {rows.map((row, rowIndex) => {
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
                <TouchableOpacity
                  key={globalIndex}
                  activeOpacity={0.9}
                  style={{ width: itemWidth, height: rowHeight }}
                  onPress={() =>
                    onOpenLightbox(
                      items.map((i) => ({ url: i.url, isVideo: i.isVideo })),
                      globalIndex
                    )
                  }
                >
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
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
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
      contentFit="contain"
      nativeControls={true}
      allowsFullscreen={false}
    />
  );
}
function SegmentVideo({
  url,
  ratio,
  onOpenLightbox,
}: {
  url: string;
  ratio: number;
  onOpenLightbox: (items: { url: string; isVideo: boolean }[], index: number) => void;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (!player) return;
    player.play();
  }, [player]);
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={{
        width: "100%",
        aspectRatio: ratio,
        borderRadius: 8,
        overflow: "hidden",
        marginVertical: 10,
        backgroundColor: "#000",
      }}
      onPress={() => onOpenLightbox([{ url, isVideo: true }], 0)}
    >
      <VideoView
        style={{ width: "100%", height: "100%" }}
        player={player}
        contentFit="cover"
        nativeControls={true}
        allowsFullscreen={false}
      />
    </TouchableOpacity>
  );
}
function RenderBody({
  html,
  tagsStyles,
  contentWidth,
  onOpenLightbox,
}: {
  html: string;
  tagsStyles: any;
  contentWidth: number;
  onOpenLightbox: (items: { url: string; isVideo: boolean }[], index: number) => void;
}) {
  const segments = splitBodyIntoSegments(html || "");
  const renderers = {
    ...customRenderers,
    img: ({ tnode }: any) => {
      const src = tnode.attributes?.src || "";
      const ratio = parseFloat(tnode.attributes?.["data-ratio"]) || DEFAULT_IMAGE_RATIO;
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => onOpenLightbox([{ url: src, isVideo: false }], 0)}>
          <Image
            source={{ uri: src }}
            style={{ width: contentWidth, aspectRatio: ratio, borderRadius: 8, marginVertical: 10 }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    },
  };
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "imageGroup") {
          return (
            <MediaGroupBlock
              key={index}
              items={segment.items}
              containerWidth={contentWidth}
              onOpenLightbox={onOpenLightbox}
            />
          );
        }
        if (segment.type === "video") {
          return (
            <SegmentVideo key={index} url={segment.url} ratio={segment.ratio} onOpenLightbox={onOpenLightbox} />
          );
        }
        return (
          <RenderHtml
            key={index}
            contentWidth={contentWidth}
            source={{ html: segment.content }}
            tagsStyles={tagsStyles}
            classesStyles={bodyClassesStyles}
            renderersProps={bodyRenderersProps}
            customHTMLElementModels={customHTMLElementModels}
            enableCSSInlineProcessing={true}
            renderers={renderers}
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
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxItems, setLightboxItems] = useState<{ url: string; isVideo: boolean }[]>([]);
  const [lightboxStartIndex, setLightboxStartIndex] = useState(0);
  const openLightbox = (items: { url: string; isVideo: boolean }[], startIndex: number) => {
    setLightboxItems(items);
    setLightboxStartIndex(startIndex);
    setLightboxVisible(true);
  };
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
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() =>
                  openLightbox(
                    [{ url: post.thumbnailUrl, isVideo: post.thumbnailType === "video" }],
                    0
                  )
                }
              >
                {post.thumbnailType === "video" ? (
                  <ThumbnailVideo url={post.thumbnailUrl} aspectRatio={thumbnailAspectRatio} />
                ) : (
                  <Image
                    source={{ uri: post.thumbnailUrl }}
                    style={[styles.thumbnail, { aspectRatio: thumbnailAspectRatio }]}
                  />
                )}
              </TouchableOpacity>
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
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.9}
                        onPress={() => openLightbox([{ url: block.url, isVideo: false }], 0)}
                      >
                        <Image
                          source={{ uri: block.url }}
                          style={[
                            styles.blockImage,
                            { aspectRatio: block.aspectRatio || DEFAULT_IMAGE_RATIO },
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  }
                  if (block.type === "video") {
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.9}
                        onPress={() => openLightbox([{ url: block.url, isVideo: true }], 0)}
                      >
                        <BlockVideo
                          url={block.url}
                          aspectRatio={block.aspectRatio || DEFAULT_VIDEO_RATIO}
                        />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <RenderBody
                      key={index}
                      html={block.html || ""}
                      tagsStyles={dynamicBodyTagsStyles}
                      contentWidth={renderHtmlWidth}
                      onOpenLightbox={openLightbox}
                    />
                  );
                })
              ) : (
                <RenderBody
                  html={post.body || ""}
                  tagsStyles={dynamicBodyTagsStyles}
                  contentWidth={renderHtmlWidth}
                  onOpenLightbox={openLightbox}
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
        <MediaLightbox
          visible={lightboxVisible}
          items={lightboxItems}
          startIndex={lightboxStartIndex}
          onClose={() => setLightboxVisible(false)}
        />
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
      allowsFullscreen={false}
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
      allowsFullscreen={false}
    />
  );
}
function MediaLightbox({
  visible,
  items,
  startIndex,
  onClose,
}: {
  visible: boolean;
  items: { url: string; isVideo: boolean }[];
  startIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (visible) {
      setCurrentIndex(startIndex);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: startIndex * width, animated: false });
      });
    }
  }, [visible, startIndex, width]);
  const handleDownload = async () => {
    if (!isWeb || downloading) return;
    const current = items[currentIndex];
    if (!current) return;
    setDownloading(true);
    try {
      const response = await fetch(current.url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const extension = current.isVideo ? "mp4" : "jpg";
      link.download = `download_${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.log("ダウンロードエラー:", error);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <TouchableOpacity onPress={onClose} style={styles.lightboxCloseButton}>
          <MaterialIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {isWeb && (
          <TouchableOpacity onPress={handleDownload} style={styles.lightboxDownloadButton} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="download" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(newIndex);
          }}
        >
          {items.map((item, index) => (
            <View key={index} style={{ width, height, justifyContent: "center", alignItems: "center" }}>
              {item.isVideo ? (
                <LightboxVideo url={item.url} width={width} height={height} />
              ) : (
                <Image source={{ uri: item.url }} style={{ width, height }} resizeMode="contain" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
function LightboxVideo({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      style={{ width, height }}
      player={player}
      contentFit="contain"
      nativeControls={true}
      allowsFullscreen={false}
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
  lightboxCloseButton: {
    position: "absolute",
    top: 44,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxDownloadButton: {
    position: "absolute",
    top: 44,
    right: 62,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
});