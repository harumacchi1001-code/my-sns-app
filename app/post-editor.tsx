import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { addDoc, collection, doc, DocumentData, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PostPreviewPanel from "../components/PostPreviewPanel";
import TextBlockEditor, { TextBlockEditorHandle } from "../components/TextBlockEditor";
import WebSidebar from "../components/WebSidebar";
import { COLOR_THEMES, ColorThemeId, getColorTheme, getLayout, TemplateField } from "../constants/postTemplates";
import { auth, db, storage } from "../firebaseConfig";
// ===== 動画は、まだ文章の中に埋め込めないため、エディタの下に、別枠で持つ =====
type VideoBlock = { id: string; uri: string; aspectRatio: number };
let blockIdCounter = 0;
const newBlockId = () => `block-${Date.now()}-${blockIdCounter++}`;
// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== ここまでWeb版専用 =====
// ===== ここからWeb版専用（Webでもアップロードが必要かの判定に、blob:も含める） =====
const needsUpload = (uri: string) => uri.startsWith("file://") || uri.startsWith("blob:");
// ===== ここまでWeb版専用 =====
const DEFAULT_IMAGE_RATIO = 4 / 3;
const DEFAULT_VIDEO_RATIO = 16 / 9;
const DEFAULT_THUMBNAIL_RATIO = 16 / 9;
// ===== 動画の、最初の1コマだけを、静止画のように表示する部品 =====
function VideoPreview({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
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
  const { draftId, genreId, layoutId, themeId } = useLocalSearchParams<{
    draftId?: string;
    genreId?: string;
    layoutId?: "A" | "B" | "C";
    themeId?: ColorThemeId;
  }>();
  const templateLayout = genreId ? getLayout(genreId, layoutId || "A") : null;
  const templateTheme = themeId ? getColorTheme(themeId) : null;
  const [templateValues, setTemplateValues] = useState<Record<string, any>>({});
  // ===== テンプレートの項目のうち、ユーザーが「いらない」と削除した、項目のkey一覧 =====
  const [removedFieldKeys, setRemovedFieldKeys] = useState<Set<string>>(new Set());
  const removeTemplateField = (fieldKey: string) => {
    setRemovedFieldKeys((prev) => new Set(prev).add(fieldKey));
  };
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailType, setThumbnailType] = useState<"image" | "video">("image");
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState(DEFAULT_THUMBNAIL_RATIO);
  const [uploading, setUploading] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [currentTagInput, setCurrentTagInput] = useState("");
  const [isTagging, setIsTagging] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  // ===== 本文（見出し・画像なども含む、1つの、連続した文章）は、ここで管理する =====
  const mainEditorRef = useRef<TextBlockEditorHandle | null>(null);
  const [initialBodyContent, setInitialBodyContent] = useState("");
  // ===== 自由入力モードでの、記事全体の、配色テーマ（ツールバーから、選ぶ。必ず、いずれかのテーマが、選ばれた状態にする） =====
  const [freeWriteThemeId, setFreeWriteThemeId] = useState<string>("simple");
  // ===== 自分が、参加している、グループの一覧（投稿先として、選べるように） =====
  const [myGroups, setMyGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMenuVisible, setGroupMenuVisible] = useState(false);
  // ===== 自由入力モードで、選ばれている、配色の、実際のデータ =====
  const freeWriteTheme = freeWriteThemeId ? getColorTheme(freeWriteThemeId as ColorThemeId) : null;
  // ===== テンプレート使用時、配色が、まだ、指定されていなければ、自由入力モードの、配色（初期値）を、代わりに、使う =====
  const effectiveTemplateTheme = templateTheme || freeWriteTheme;
  // ===== プレビューパネルに、リアルタイムで反映するための、本文の中身 =====
  const [previewBodyHtml, setPreviewBodyHtml] = useState("");
  // ===== 下書き読み込み・リセットのたびに、エディタを、まっさらに作り直すための、キー =====
  const [editorKey, setEditorKey] = useState(0);
  // ===== 動画だけは、まだ本文の中に埋め込めないため、別枠のリストとして持つ =====
  const [videoBlocks, setVideoBlocks] = useState<VideoBlock[]>([]);
  const lastLoadedDraftId = useRef<string | null>(null);
  // ===== 自分が、参加している、グループの一覧を、取得する（collectionGroupで、自分のuidを持つmembersを検索） =====
  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const loadMyGroups = async () => {
      const allGroupsSnap = await getDocs(collection(db, "groups"));
      const groups: { id: string; name: string }[] = [];
      await Promise.all(
        allGroupsSnap.docs.map(async (groupDoc) => {
          const memberSnap = await getDoc(doc(db, "groups", groupDoc.id, "members", myUid));
          if (memberSnap.exists()) {
            groups.push({ id: groupDoc.id, name: groupDoc.data()?.name || "無題のグループ" });
          }
        })
      );
      setMyGroups(groups);
    };
    loadMyGroups();
  }, []);
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
    setInitialBodyContent("");
    setVideoBlocks([]);
    setEditorKey((k) => k + 1);
    setTemplateValues({});
    setRemovedFieldKeys(new Set());
    setFreeWriteThemeId("simple");
    setSelectedGroupId(null);
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
          // ===== 過去の投稿（文章・画像が、別々のブロックだった形式）も、開けるように変換する =====
          let mergedHtml = "";
          const loadedVideos: VideoBlock[] = [];
          if (data.contentBlocks && data.contentBlocks.length > 0) {
            data.contentBlocks.forEach((b: any) => {
              if (b.type === "text") {
                mergedHtml += b.html || "";
              } else if (b.type === "image") {
                mergedHtml += `<img src="${b.url}">`;
              } else if (b.type === "video") {
                loadedVideos.push({
                  id: newBlockId(),
                  uri: b.url,
                  aspectRatio: b.aspectRatio || DEFAULT_VIDEO_RATIO,
                });
              }
            });
          } else if (data.body) {
            mergedHtml = data.body;
          }
          setInitialBodyContent(mergedHtml);
          setVideoBlocks(loadedVideos);
          setEditorKey((k) => k + 1);
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
  // ===== 「＋」メニューから、画像を追加：選んで、アップロードして、URLを返す（本文の中に、そのまま埋め込まれる） =====
  // ===== Web版専用：画像・動画を、まとめて選び、それぞれの場所に、直接、埋め込むための、アップロード処理 =====
  const handlePickMedia = async (): Promise<{ type: "image" | "video"; url: string; ratio: number }[]> => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真・動画ライブラリへのアクセスが許可されていません");
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (result.canceled) return [];
    const items: { type: "image" | "video"; url: string; ratio: number }[] = [];
    for (const asset of result.assets) {
      const mediaType: "image" | "video" = asset.type === "video" ? "video" : "image";
      const ratio =
        asset.width && asset.height
          ? asset.width / asset.height
          : mediaType === "video"
          ? DEFAULT_VIDEO_RATIO
          : DEFAULT_IMAGE_RATIO;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const folder = mediaType === "video" ? "postVideos" : "postImages";
      const fileName = `${folder}/${auth.currentUser?.uid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      items.push({ type: mediaType, url, ratio });
    }
    return items;
  };
  // ===== 「＋」メニューから、動画を追加：まだ本文には埋め込めないため、下に、別枠で追加する =====
  const handleInsertVideo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("動画ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const aspectRatio = asset.width && asset.height ? asset.width / asset.height : DEFAULT_VIDEO_RATIO;
    setVideoBlocks((prev) => [...prev, { id: newBlockId(), uri: asset.uri, aspectRatio }]);
  };
  const removeVideoBlock = (id: string) => {
    setVideoBlocks((prev) => prev.filter((v) => v.id !== id));
  };
  const updateTemplateValue = (fieldKey: string, value: any) => {
    setTemplateValues((prev) => ({ ...prev, [fieldKey]: value }));
  };
  const addTemplateListItem = (fieldKey: string, text: string) => {
    if (!text.trim()) return;
    setTemplateValues((prev) => ({
      ...prev,
      [fieldKey]: [...(prev[fieldKey] || []), text.trim()],
    }));
  };
  const removeTemplateListItem = (fieldKey: string, index: number) => {
    setTemplateValues((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] || []).filter((_: any, i: number) => i !== index),
    }));
  };
  const pickTemplatePhoto = async (fieldKey: string) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      updateTemplateValue(fieldKey, result.assets[0].uri);
    }
  };
  const pickTemplatePhotoPair = async (fieldKey: string, which: "before" | "after") => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      setTemplateValues((prev) => ({
        ...prev,
        [fieldKey]: { ...(prev[fieldKey] || {}), [which]: result.assets[0].uri },
      }));
    }
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
  // ===== 本文（1つのエディタ）＋動画一覧を、これまでと同じcontentBlocksの形にする =====
  const buildContentBlocks = async () => {
    const result: { type: "text" | "image" | "video"; html?: string; url?: string; aspectRatio?: number }[] = [];
    const html = mainEditorRef.current ? await mainEditorRef.current.getHTML() : "";
    result.push({ type: "text", html });
    for (const vb of videoBlocks) {
      let url = vb.uri;
      if (needsUpload(url)) {
        const response = await fetch(url);
        const blob = await response.blob();
        const fileName = `postVideos/${auth.currentUser?.uid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        url = await getDownloadURL(storageRef);
      }
      result.push({ type: "video", url, aspectRatio: vb.aspectRatio });
    }
    return result;
  };
  const buildTemplateContentBlocks = async () => {
    if (!templateLayout) return [];
    const result: { type: "text" | "image" | "video"; html?: string; url?: string; aspectRatio?: number }[] = [];
    const uploadIfNeeded = async (uri: string, folder: string) => {
      if (!needsUpload(uri)) return uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = `${folder}/${auth.currentUser?.uid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    };
    for (const field of templateLayout.fields) {
      if (removedFieldKeys.has(field.key)) continue;
      const value = templateValues[field.key];
      if (field.type === "text" || field.type === "textarea") {
        if (value && String(value).trim()) {
          const valueWithLineBreaks = String(value).replace(/\n/g, "<br>");
          result.push({ type: "text", html: `<p><strong>${field.label}</strong>：${valueWithLineBreaks}</p>` });
        }
      } else if (field.type === "rating") {
        if (value) {
          result.push({ type: "text", html: `<p><strong>${field.label}</strong>：${"★".repeat(value)}${"☆".repeat(5 - value)}</p>` });
        }
      } else if (field.type === "repeatableList") {
        const items: string[] = value || [];
        if (items.length > 0) {
          const listHtml = items.map((item) => `<li>${item}</li>`).join("");
          result.push({ type: "text", html: `<p><strong>${field.label}</strong></p><ul>${listHtml}</ul>` });
        }
      } else if (field.type === "photo") {
        if (value) {
          const url = await uploadIfNeeded(value, "postImages");
          result.push({ type: "image", url, aspectRatio: DEFAULT_IMAGE_RATIO });
        }
      } else if (field.type === "photoPair") {
        const pair = value || {};
        if (pair.before) {
          const url = await uploadIfNeeded(pair.before, "postImages");
          result.push({ type: "image", url, aspectRatio: DEFAULT_IMAGE_RATIO });
        }
        if (pair.after) {
          const url = await uploadIfNeeded(pair.after, "postImages");
          result.push({ type: "image", url, aspectRatio: DEFAULT_IMAGE_RATIO });
        }
      }
    }
    return result;
  };
  const hasAnyContent = async () => {
    if (title.trim() || thumbnail) return true;
    if (templateLayout) {
      const templateHasValue = Object.values(templateValues).some((v) => {
        if (Array.isArray(v)) return v.length > 0;
        if (v && typeof v === "object") return !!v.before || !!v.after;
        return !!v;
      });
      if (templateHasValue) return true;
    }
    if (videoBlocks.length > 0) return true;
    const html = mainEditorRef.current ? await mainEditorRef.current.getHTML() : "";
    if (html && html.replace(/<p>\s*<\/p>/g, "").trim()) return true;
    return false;
  };
  const buildPostData = async (status: "draft" | "published") => {
    const contentBlocks = templateLayout
      ? [...(await buildTemplateContentBlocks()), ...(await buildContentBlocks())]
      : await buildContentBlocks();
    let thumbnailUrl = thumbnail;
    if (thumbnail && needsUpload(thumbnail)) {
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
    // ===== テンプレート使用時に、配色が、まだ、選ばれていなければ、実際に、画面に表示していた配色（自由入力モードの初期値）を、そのまま保存する =====
    const finalThemeId = templateLayout ? (themeId || freeWriteThemeId) : freeWriteThemeId;
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
      templateGenreId: genreId || null,
      templateLayoutId: layoutId || null,
      // ===== テンプレートの、配色か、自由入力モードの、配色か、どちらか、実際に選ばれた方を、保存する =====
      templateThemeId: finalThemeId || null,
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
      let newPostId = loadedDraftId;
      if (loadedDraftId) {
        await updateDoc(doc(db, "posts", loadedDraftId), postData);
      } else {
        const newPostRef = await addDoc(collection(db, "posts"), {
          ...postData,
          createdAt: serverTimestamp(),
        });
        newPostId = newPostRef.id;
      }
      // ===== グループを、選んでいれば、そのグループのチャットに、投稿を、共有カードとして送る =====
      if (selectedGroupId && newPostId) {
        const myEmail = auth.currentUser?.email;
        await addDoc(collection(db, "groups", selectedGroupId, "messages"), {
          senderEmail: myEmail,
          sharedPostId: newPostId,
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
  // ===== 本文（1つのエディタ）＋動画一覧を、まとめて表示する部分（テンプレート・自由入力、両方で共通） =====
  const renderMainEditor = () => (
    <>
      <TextBlockEditor
        key={editorKey}
        ref={mainEditorRef}
        initialContent={initialBodyContent}
        onPickMedia={handlePickMedia}
        onInsertVideo={handleInsertVideo}
        onContentChange={setPreviewBodyHtml}
        themeId={templateLayout ? (themeId || freeWriteThemeId) : freeWriteThemeId}
      />
      {videoBlocks.map((vb) => (
        <View key={vb.id} style={styles.imageBlockWrapper}>
          <VideoPreview uri={vb.uri} style={[styles.blockImage, { aspectRatio: vb.aspectRatio }]} />
          <TouchableOpacity style={styles.imageRemoveButton} onPress={() => removeVideoBlock(vb.id)}>
            <Text style={styles.imageRemoveButtonText}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
    </>
  );
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {isWeb && <WebSidebar />}
      {/* ===== Web版・広い画面のときだけ、右側に表示される、プレビューパネル ===== */}
      <PostPreviewPanel
        thumbnail={thumbnail || null}
        thumbnailType={thumbnailType}
        title={title}
        hashtags={hashtags}
        bodyHtml={previewBodyHtml}
        theme={effectiveTemplateTheme}
      />
      <View style={[styles.pageWrapper, isWeb && { paddingLeft: 64 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDeleteAll}>
            <Text style={styles.deleteLabel}>{t("post.deleteButton")}</Text>
          </TouchableOpacity>
          {/* ===== 記事全体の、配色テーマを、選ぶ、丸いボタンの、列 ===== */}
          <View style={styles.headerThemeRow}>
            {COLOR_THEMES.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setFreeWriteThemeId(t.id)}
                style={[
                  styles.headerThemeDot,
                  // ===== 丸の中身は、そのテーマの、実際の背景色。枠は、そのテーマの、文字色 =====
                  { backgroundColor: t.background, borderColor: t.text },
                  freeWriteThemeId === t.id && styles.headerThemeDotSelected,
                ]}
              />
            ))}
          </View>
          {/* ===== グループへの、投稿を、選べる、ボタン（参加している、グループが、あるときだけ、表示） ===== */}
          {myGroups.length > 0 && (
            <TouchableOpacity style={styles.groupSelectButton} onPress={() => setGroupMenuVisible(true)}>
              <MaterialIcons name="groups" size={16} color={selectedGroupId ? "#4a90e2" : "#999"} />
              <Text style={[styles.groupSelectButtonText, selectedGroupId && { color: "#4a90e2" }]} numberOfLines={1}>
                {selectedGroupId
                  ? myGroups.find((g) => g.id === selectedGroupId)?.name || "グループ"
                  : "グループに投稿"}
              </Text>
            </TouchableOpacity>
          )}
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
        {/* ===== グループ選択、モーダル ===== */}
        <Modal visible={groupMenuVisible} transparent animationType="fade" onRequestClose={() => setGroupMenuVisible(false)}>
          <TouchableOpacity style={styles.groupMenuOverlay} activeOpacity={1} onPress={() => setGroupMenuVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.groupMenuCard}>
              <Text style={styles.groupMenuTitle}>投稿先の、グループ</Text>
              <TouchableOpacity
                style={styles.groupMenuItem}
                onPress={() => {
                  setSelectedGroupId(null);
                  setGroupMenuVisible(false);
                }}
              >
                <Text style={!selectedGroupId ? styles.groupMenuItemTextActive : styles.groupMenuItemText}>
                  グループに、投稿しない
                </Text>
              </TouchableOpacity>
              {myGroups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.groupMenuItem}
                  onPress={() => {
                    setSelectedGroupId(g.id);
                    setGroupMenuVisible(false);
                  }}
                >
                  <Text style={selectedGroupId === g.id ? styles.groupMenuItemTextActive : styles.groupMenuItemText}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flex: 1 }}
          >
            {templateLayout && effectiveTemplateTheme ? (
              <View
                style={[
                  styles.templateArea,
                  { backgroundColor: effectiveTemplateTheme.background, borderColor: effectiveTemplateTheme.border },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.thumbnailArea,
                    styles.templateThumbnailArea,
                    { aspectRatio: thumbnail ? thumbnailAspectRatio : DEFAULT_THUMBNAIL_RATIO },
                  ]}
                  onPress={pickThumbnail}
                >
                  {thumbnail ? (
                    thumbnailType === "video" ? (
                      <VideoPreview uri={thumbnail} style={styles.thumbnailImage} />
                    ) : (
                      <Image source={{ uri: thumbnail }} style={styles.thumbnailImage} resizeMode="contain" />
                    )
                  ) : (
                    <Text style={[styles.thumbnailPlaceholder, { color: effectiveTemplateTheme.placeholder }]}>
                      {t("post.thumbnailPlaceholder")}
                    </Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  placeholder={t("post.titlePlaceholder")}
                  placeholderTextColor={effectiveTemplateTheme.placeholder}
                  value={title}
                  onChangeText={setTitle}
                  style={[styles.titleInput, { color: effectiveTemplateTheme.text }]}
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
                <View style={styles.templateDivider} />
                {templateLayout.fields
                  .filter((field) => !removedFieldKeys.has(field.key))
                  .map((field) => (
                    <TemplateFieldInput
                      key={field.key}
                      field={field}
                      value={templateValues[field.key]}
                      theme={effectiveTemplateTheme}
                      onChangeText={(text) => updateTemplateValue(field.key, text)}
                      onSetRating={(n) => updateTemplateValue(field.key, n)}
                      onAddListItem={(text) => addTemplateListItem(field.key, text)}
                      onRemoveListItem={(index) => removeTemplateListItem(field.key, index)}
                      onPickPhoto={() => pickTemplatePhoto(field.key)}
                      onPickPhotoPair={(which) => pickTemplatePhotoPair(field.key, which)}
                      onRemoveField={() => removeTemplateField(field.key)}
                    />
                  ))}
                <View style={styles.templateDivider} />
                <Text style={[styles.additionalSectionLabel, { color: effectiveTemplateTheme.muted }]}>
                  写真・動画や、自由な文章を追加
                </Text>
                {renderMainEditor()}
              </View>
            ) : freeWriteTheme ? (
              // ===== 自由入力モードで、配色が、選ばれているとき =====
              <View
                style={[
                  styles.templateArea,
                  { backgroundColor: freeWriteTheme.background, borderColor: freeWriteTheme.border },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.thumbnailArea,
                    styles.templateThumbnailArea,
                    { aspectRatio: thumbnail ? thumbnailAspectRatio : DEFAULT_THUMBNAIL_RATIO },
                  ]}
                  onPress={pickThumbnail}
                >
                  {thumbnail ? (
                    thumbnailType === "video" ? (
                      <VideoPreview uri={thumbnail} style={styles.thumbnailImage} />
                    ) : (
                      <Image source={{ uri: thumbnail }} style={styles.thumbnailImage} resizeMode="contain" />
                    )
                  ) : (
                    <Text style={[styles.thumbnailPlaceholder, { color: freeWriteTheme.placeholder }]}>
                      {t("post.thumbnailPlaceholder")}
                    </Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  placeholder={t("post.titlePlaceholder")}
                  placeholderTextColor={freeWriteTheme.placeholder}
                  value={title}
                  onChangeText={setTitle}
                  style={[styles.titleInput, { color: freeWriteTheme.text }]}
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
                {renderMainEditor()}
              </View>
            ) : (
              // ===== 自由入力モードで、配色が、選ばれていないとき（これまでどおり） =====
              <>
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
                      <Image source={{ uri: thumbnail }} style={styles.thumbnailImage} resizeMode="contain" />
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
                {renderMainEditor()}
              </>
            )}
            <View style={{ height: 700 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
function TemplateFieldInput({
  field,
  value,
  theme,
  onChangeText,
  onSetRating,
  onAddListItem,
  onRemoveListItem,
  onPickPhoto,
  onPickPhotoPair,
  onRemoveField,
}: {
  field: TemplateField;
  value: any;
  theme: ReturnType<typeof getColorTheme>;
  onChangeText: (text: string) => void;
  onSetRating: (n: number) => void;
  onAddListItem: (text: string) => void;
  onRemoveListItem: (index: number) => void;
  onPickPhoto: () => void;
  onPickPhotoPair: (which: "before" | "after") => void;
  onRemoveField: () => void;
}) {
  const [listInput, setListInput] = useState("");
  // ===== ラベルと、削除（×）ボタンを、横並びで、表示する、共通の部品 =====
  const renderLabelRow = () => (
    <View style={styles.templateLabelRow}>
      <Text style={[styles.templateLabel, { color: theme.muted, marginBottom: 0 }]}>{field.label}</Text>
      <TouchableOpacity onPress={onRemoveField} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <MaterialIcons name="close" size={16} color={theme.muted} />
      </TouchableOpacity>
    </View>
  );
  if (field.type === "text") {
    return (
      <View style={styles.templateFieldBlock}>
        {renderLabelRow()}
        <TextInput
          value={value || ""}
          onChangeText={onChangeText}
          placeholder={field.placeholder || field.label}
          placeholderTextColor={theme.placeholder}
          style={[styles.templateInput, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
        />
      </View>
    );
  }
  if (field.type === "textarea") {
    return (
      <View style={styles.templateFieldBlock}>
        {renderLabelRow()}
        <TextInput
          value={value || ""}
          onChangeText={onChangeText}
          placeholder={field.placeholder || field.label}
          placeholderTextColor={theme.placeholder}
          style={[
            styles.templateInput,
            styles.templateTextarea,
            { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
          ]}
          multiline
        />
      </View>
    );
  }
  if (field.type === "rating") {
    const current = value || 0;
    return (
      <View style={styles.templateFieldBlock}>
        {renderLabelRow()}
        <View style={{ flexDirection: "row", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => onSetRating(n)}>
              <MaterialIcons
                name={n <= current ? "star" : "star-border"}
                size={24}
                color={n <= current ? theme.accent : theme.placeholder}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }
  if (field.type === "repeatableList") {
    const items: string[] = value || [];
    return (
      <View style={styles.templateFieldBlock}>
        {renderLabelRow()}
        {items.map((item, index) => (
          <View key={index} style={styles.templateListRow}>
            <Text style={{ color: theme.text, fontSize: 13, flex: 1 }}>・{item}</Text>
            <TouchableOpacity onPress={() => onRemoveListItem(index)}>
              <MaterialIcons name="close" size={16} color={theme.muted} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <TextInput
            value={listInput}
            onChangeText={setListInput}
            placeholder={field.placeholder || "項目を追加"}
            placeholderTextColor={theme.placeholder}
            style={[
              styles.templateInput,
              { flex: 1, borderColor: theme.border, backgroundColor: theme.surface, color: theme.text },
            ]}
            onSubmitEditing={() => {
              onAddListItem(listInput);
              setListInput("");
            }}
          />
          <TouchableOpacity
            onPress={() => {
              onAddListItem(listInput);
              setListInput("");
            }}
          >
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "600" }}>追加</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  if (field.type === "photo") {
    return (
      <View style={styles.templateFieldBlock}>
        {renderLabelRow()}
        <TouchableOpacity
          style={[styles.templatePhotoBox, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={onPickPhoto}
        >
          {value ? (
            <Image source={{ uri: value }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
          ) : (
            <MaterialIcons name="add-a-photo" size={26} color={theme.placeholder} />
          )}
        </TouchableOpacity>
      </View>
    );
  }
  if (field.type === "photoPair") {
    const pair = value || {};
    return (
      <View style={styles.templateFieldBlock}>
        {renderLabelRow()}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.templatePhotoBox, { flex: 1, borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => onPickPhotoPair("before")}
          >
            {pair.before ? (
              <Image source={{ uri: pair.before }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
            ) : (
              <Text style={{ color: theme.placeholder, fontSize: 11 }}>Before</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.templatePhotoBox, { flex: 1, borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => onPickPhotoPair("after")}
          >
            {pair.after ? (
              <Image source={{ uri: pair.after }} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
            ) : (
              <Text style={{ color: theme.placeholder, fontSize: 11 }}>After</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return null;
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    gap: 8,
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
  // ===== ヘッダーの、配色選択の、丸ボタンの、列 =====
  headerThemeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerThemeDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  groupSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 120,
  },
  groupSelectButtonText: {
    fontSize: 12,
    color: "#999",
  },
  groupMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  groupMenuCard: {
    width: "80%",
    maxWidth: 320,
    maxHeight: "60%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
  groupMenuTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 10,
  },
  groupMenuItem: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  groupMenuItemText: {
    fontSize: 14,
    color: "#333",
  },
  groupMenuItemTextActive: {
    fontSize: 14,
    color: "#4a90e2",
    fontWeight: "600",
  },
  headerThemeDotSelected: {
    // ===== 選択中は、外側に、青いラインを、もう1本、足す（枠の、外側に、影のような形で、表現） =====
    borderWidth: 1.5,
    shadowColor: "#4a90e2",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
    outlineWidth: 2,
    outlineColor: "#4a90e2",
    outlineStyle: "solid",
    outlineOffset: 2,
  } as any,
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
  templateArea: {
    marginHorizontal: 18,
    marginTop: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    paddingBottom: 400,
    overflow: "hidden",
  },
  templateThumbnailArea: {
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 12,
    width: "auto",
  },
  templateDivider: {
    height: 1,
    backgroundColor: "rgba(128,128,128,0.2)",
    marginVertical: 14,
  },
  additionalSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  templateFieldBlock: {
    marginBottom: 14,
  },
  templateLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  templateLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  templateInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  templateTextarea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  templateListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  templatePhotoBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});