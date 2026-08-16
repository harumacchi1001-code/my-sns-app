import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { addDoc, collection, doc, DocumentData, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TextBlockEditor, { TextBlockEditorHandle } from "../../components/TextBlockEditor";
import { auth, db, storage } from "../../firebaseConfig";
type Block =
  | { id: string; type: "text"; initialContent: string }
  | { id: string; type: "image"; uri: string; aspectRatio: number }
  | { id: string; type: "video"; uri: string; aspectRatio: number };
let blockIdCounter = 0;
const newBlockId = () => `block-${Date.now()}-${blockIdCounter++}`;
// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== ここまでWeb版専用 =====
// ===== ここからWeb版専用（Webでもアップロードが必要かの判定に、blob:も含める） =====
const needsUpload = (uri: string) => uri.startsWith("file://") || uri.startsWith("blob:");
// ===== ここまでWeb版専用 =====
// アスペクト比が、取得できなかった場合の、既定値
const DEFAULT_IMAGE_RATIO = 4 / 3;
const DEFAULT_VIDEO_RATIO = 16 / 9;
const DEFAULT_THUMBNAIL_RATIO = 16 / 9;

// ===== 動画の、最初の1コマだけを、静止画のように表示する部品 =====
function VideoPreview({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    // ここでは、あえてp.play()を呼ばない（最初の1コマだけを表示するため）
  });

  return (
    <VideoView
      style={style}
      player={player}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

export default function PostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailType, setThumbnailType] = useState<"image" | "video">("image");
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState(DEFAULT_THUMBNAIL_RATIO);
  const [uploading, setUploading] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [currentTagInput, setCurrentTagInput] = useState("");
  const [isTagging, setIsTagging] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([
    { id: newBlockId(), type: "text", initialContent: "" },
  ]);
  const editorRefs = useRef<Record<string, TextBlockEditorHandle | null>>({});
  const lastLoadedDraftId = useRef<string | null>(null);
  const resetForm = () => {
    setTitle("");
    setThumbnail(null);
    setThumbnailType("image");
    setThumbnailAspectRatio(DEFAULT_THUMBNAIL_RATIO);
    setHashtags([]);
    setCurrentTagInput("");
    setIsTagging(false);
    setLoadedDraftId(null);
    lastLoadedDraftId.current = null;
    setBlocks([{ id: newBlockId(), type: "text", initialContent: "" }]);
    router.setParams({ draftId: undefined });
  };
  useFocusEffect(
    useCallback(() => {
      const loadDraft = async () => {
        if (!draftId) {
          if (lastLoadedDraftId.current !== null) {
            resetForm();
          }
          return;
        }
        if (lastLoadedDraftId.current === draftId) return;
        const docSnap = await getDoc(doc(db, "posts", draftId));
        if (docSnap.exists()) {
          const data: DocumentData = docSnap.data();
          setTitle(data.title || "");
          setThumbnail(data.thumbnailUrl || null);
          setThumbnailType(data.thumbnailType || "image");
          setThumbnailAspectRatio(data.thumbnailAspectRatio || DEFAULT_THUMBNAIL_RATIO);
          setHashtags(data.hashtags || []);
          setLoadedDraftId(draftId);
          lastLoadedDraftId.current = draftId;
          if (data.contentBlocks && data.contentBlocks.length > 0) {
            const loadedBlocks: Block[] = data.contentBlocks.map((b: any) => {
              if (b.type === "image" || b.type === "video") {
                return {
                  id: newBlockId(),
                  type: b.type,
                  uri: b.url,
                  aspectRatio:
                    b.aspectRatio || (b.type === "image" ? DEFAULT_IMAGE_RATIO : DEFAULT_VIDEO_RATIO),
                };
              }
              return { id: newBlockId(), type: "text", initialContent: b.html || "" };
            });
            setBlocks(loadedBlocks);
          } else if (data.body) {
            setBlocks([{ id: newBlockId(), type: "text", initialContent: data.body }]);
          }
        }
      };
      loadDraft();
    }, [draftId])
  );
  const pickThumbnail = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真・動画ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const mediaType = asset.type === "video" ? "video" : "image";
      setThumbnail(asset.uri);
      setThumbnailType(mediaType);
      if (asset.width && asset.height) {
        setThumbnailAspectRatio(asset.width / asset.height);
      } else {
        setThumbnailAspectRatio(mediaType === "video" ? DEFAULT_VIDEO_RATIO : DEFAULT_IMAGE_RATIO);
      }
    }
  };
  const addImageBlockAfter = async (afterBlockId: string) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真・動画ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mediaType = asset.type === "video" ? "video" : "image";
    const aspectRatio =
      asset.width && asset.height
        ? asset.width / asset.height
        : mediaType === "video"
        ? DEFAULT_VIDEO_RATIO
        : DEFAULT_IMAGE_RATIO;
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === afterBlockId);
      if (index === -1) return prev;
      const newMediaBlock: Block = {
        id: newBlockId(),
        type: mediaType,
        uri: asset.uri,
        aspectRatio,
      };
      const newTextBlock: Block = { id: newBlockId(), type: "text", initialContent: "" };
      const updated = [...prev];
      updated.splice(index + 1, 0, newMediaBlock, newTextBlock);
      return updated;
    });
  };
  const removeImageBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  const handleHashtagButtonPress = () => {
    if (isTagging && currentTagInput.trim()) {
      setHashtags([...hashtags, currentTagInput.trim()]);
      setCurrentTagInput("");
    }
    setIsTagging(true);
  };
  const confirmAndCloseTagInput = () => {
    if (currentTagInput.trim()) {
      setHashtags([...hashtags, currentTagInput.trim()]);
      setCurrentTagInput("");
    }
    setIsTagging(false);
    Keyboard.dismiss();
  };
  const removeHashtag = (index: number) => {
    setHashtags(hashtags.filter((_, i) => i !== index));
  };
  const handleDeleteAll = () => {
    if (isWeb) {
      const confirmed = window.confirm(t("post.deleteConfirmMessage"));
      if (confirmed) {
        resetForm();
      }
      return;
    }
    Alert.alert(
      t("post.deleteConfirmTitle"),
      t("post.deleteConfirmMessage"),
      [
        { text: t("post.deleteCancel"), style: "cancel" },
        {
          text: t("post.deleteConfirm"),
          style: "destructive",
          onPress: () => {
            Keyboard.dismiss();
            resetForm();
          },
        },
      ]
    );
  };
  const buildContentBlocks = async () => {
    const result: { type: "text" | "image" | "video"; html?: string; url?: string; aspectRatio?: number }[] = [];
    for (const block of blocks) {
      if (block.type === "text") {
        const handle = editorRefs.current[block.id];
        const html = handle ? await handle.getHTML() : "";
        result.push({ type: "text", html });
      } else {
        let url = block.uri;
        // ===== ここからWeb版専用（blob:のURLも、アップロード対象に含める） =====
        if (needsUpload(url)) {
        // ===== ここまでWeb版専用 =====
          const response = await fetch(url);
          const blob = await response.blob();
          const folder = block.type === "video" ? "postVideos" : "postImages";
          const fileName = `${folder}/${auth.currentUser?.uid}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, blob);
          url = await getDownloadURL(storageRef);
        }
        result.push({ type: block.type, url, aspectRatio: block.aspectRatio });
      }
    }
    return result;
  };
  const hasAnyContent = async () => {
    if (title.trim() || thumbnail) return true;
    for (const block of blocks) {
      if (block.type === "image" || block.type === "video") return true;
      const handle = editorRefs.current[block.id];
      const html = handle ? await handle.getHTML() : "";
      if (html.trim()) return true;
    }
    return false;
  };
  const buildPostData = async (status: "draft" | "published") => {
    const contentBlocks = await buildContentBlocks();
    let thumbnailUrl = thumbnail;
    // ===== ここからWeb版専用（サムネイルも、blob:のURLをアップロード対象に含める） =====
    if (thumbnail && needsUpload(thumbnail)) {
    // ===== ここまでWeb版専用 =====
      const response = await fetch(thumbnail);
      const blob = await response.blob();
      const folder = thumbnailType === "video" ? "thumbnailVideos" : "thumbnails";
      const fileName = `${folder}/${auth.currentUser?.uid}_${Date.now()}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      thumbnailUrl = await getDownloadURL(storageRef);
    }
    const finalHashtags = currentTagInput.trim()
      ? [...hashtags, currentTagInput.trim()]
      : hashtags;
    const bodyText = contentBlocks
      .filter((b) => b.type === "text")
      .map((b) => b.html)
      .join("");
    return {
      title: title.trim(),
      body: bodyText,
      contentBlocks,
      thumbnailUrl: thumbnailUrl,
      thumbnailType: thumbnailUrl ? thumbnailType : null,
      thumbnailAspectRatio: thumbnailUrl ? thumbnailAspectRatio : null,
      authorEmail: auth.currentUser?.email,
      hashtags: finalHashtags,
      status,
    };
  };
  const handlePublish = async () => {
    if (!(await hasAnyContent())) {
      alert(t("post.requiredFields"));
      return;
    }
    setUploading(true);
    try {
      const postData = await buildPostData("published");
      if (loadedDraftId) {
        await updateDoc(doc(db, "posts", loadedDraftId), postData);
      } else {
        await addDoc(collection(db, "posts"), {
          ...postData,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
      setUploading(false);
      router.push("/(tabs)/profile");
    } catch (error: any) {
      setUploading(false);
      alert(t("post.publishFailed") + error.message);
    }
  };
  const handleSaveDraft = async () => {
    if (!(await hasAnyContent())) {
      alert(t("post.requiredFields"));
      return;
    }
    setUploading(true);
    try {
      const postData = await buildPostData("draft");
      if (loadedDraftId) {
        await updateDoc(doc(db, "posts", loadedDraftId), postData);
      } else {
        await addDoc(collection(db, "posts"), {
          ...postData,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
      setUploading(false);
      router.push("/(tabs)/profile");
    } catch (error: any) {
      setUploading(false);
      alert(t("post.draftSaveFailed") + error.message);
    }
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDeleteAll}>
            <Text style={styles.deleteLabel}>{t("post.deleteButton")}</Text>
          </TouchableOpacity>
          <View style={styles.rightButtonsGroup}>
            <TouchableOpacity onPress={handleSaveDraft} disabled={uploading}>
              <Text style={styles.saveDraftText}>{t("post.saveDraftButton")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.publishButton} onPress={handlePublish} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.publishButtonText}>{t("post.publishButton")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flex: 1 }}
          >
            <TouchableOpacity
              style={[
                styles.thumbnailArea,
                { aspectRatio: thumbnail ? thumbnailAspectRatio : DEFAULT_THUMBNAIL_RATIO },
              ]}
              onPress={pickThumbnail}
            >
              {thumbnail ? (
                thumbnailType === "video" ? (
                  <VideoPreview uri={thumbnail} style={styles.thumbnailImage} />
                ) : (
                  <Image source={{ uri: thumbnail }} style={styles.thumbnailImage} />
                )
              ) : (
                <Text style={styles.thumbnailPlaceholder}>{t("post.thumbnailPlaceholder")}</Text>
              )}
            </TouchableOpacity>
            <TextInput
              placeholder={t("post.titlePlaceholder")}
              value={title}
              onChangeText={setTitle}
              style={styles.titleInput}
              multiline
            />
            <View style={styles.hashtagContainer}>
              <TouchableOpacity style={styles.hashtagButton} onPress={handleHashtagButtonPress}>
                <Text style={styles.hashtagButtonText}>#</Text>
              </TouchableOpacity>
              {hashtags.map((tag, index) => (
                <View key={index} style={styles.hashtagPill}>
                  <Text style={styles.hashtagPillText}>#{tag}</Text>
                  <TouchableOpacity
                    style={styles.hashtagRemoveButton}
                    onPress={() => removeHashtag(index)}
                  >
                    <Text style={styles.hashtagRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {isTagging && (
                <TextInput
                  value={currentTagInput}
                  onChangeText={setCurrentTagInput}
                  style={styles.hashtagTextInput}
                  placeholder={t("post.hashtagPlaceholder")}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmAndCloseTagInput}
                />
              )}
            </View>
            {blocks.map((block) =>
              block.type === "text" ? (
                <View key={block.id}>
                  <TextBlockEditor
                    ref={(handle) => {
                      editorRefs.current[block.id] = handle;
                    }}
                    initialContent={block.initialContent}
                  />
                  <TouchableOpacity
                    style={styles.addImageBlockButton}
                    onPress={() => addImageBlockAfter(block.id)}
                  >
                    <Text style={styles.addImageBlockButtonText}>＋この位置に画像・動画を追加</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View key={block.id} style={styles.imageBlockWrapper}>
                  {block.type === "video" ? (
                    <VideoPreview
                      uri={block.uri}
                      style={[styles.blockImage, { aspectRatio: block.aspectRatio }]}
                    />
                  ) : (
                    <Image
                      source={{ uri: block.uri }}
                      style={[styles.blockImage, { aspectRatio: block.aspectRatio }]}
                    />
                  )}
                  <TouchableOpacity
                    style={styles.imageRemoveButton}
                    onPress={() => removeImageBlock(block.id)}
                  >
                    <Text style={styles.imageRemoveButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              )
            )}
            <View style={{ height: 700 }} />
          </ScrollView>
        </KeyboardAvoidingView>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  deleteLabel: {
    color: "#e74c3c",
    fontSize: 14,
    fontWeight: "600",
  },
  rightButtonsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  saveDraftText: {
    color: "#999",
    fontSize: 13,
  },
  publishButton: {
    backgroundColor: "#222",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    minWidth: 60,
    alignItems: "center",
  },
  publishButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  thumbnailArea: {
    width: "100%",
    backgroundColor: "#f7f7f7",
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailPlaceholder: {
    color: "#999",
    fontSize: 14,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: "600",
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: "#222",
  },
  hashtagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 4,
    gap: 4,
  },
  hashtagButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
  },
  hashtagButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  hashtagPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4a90e2",
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 3,
  },
  hashtagPillText: {
    color: "#4a90e2",
    fontSize: 13,
    fontWeight: "600",
  },
  hashtagRemoveButton: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
  },
  hashtagRemoveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  hashtagTextInput: {
    minWidth: 60,
    fontSize: 13,
    color: "#4a90e2",
    padding: 4,
  },
  imageBlockWrapper: {
    marginHorizontal: 18,
    marginVertical: 10,
    position: "relative",
  },
  blockImage: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  imageRemoveButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageRemoveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  addImageBlockButton: {
    marginHorizontal: 18,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  addImageBlockButtonText: {
    color: "#4a90e2",
    fontSize: 13,
    fontWeight: "600",
  },
});