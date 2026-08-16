import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { collection, doc, DocumentData, getDoc, getDocs, orderBy, query, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db, storage } from "../firebaseConfig";

const MAX_PHOTOS = 5;
const MAX_POSTS = 3;

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
const needsUpload = (uri: string) => uri.startsWith("file://") || uri.startsWith("blob:");
// ===== ここまでWeb版専用 =====

// 興味のあるジャンルの一覧（新規登録画面と共通）
const INTEREST_GENRES = [
  "旅行", "グルメ・料理", "ファッション", "美容・コスメ", "スポーツ・フィットネス",
  "写真・カメラ", "ペット・動物", "音楽", "映画・ドラマ", "読書・本",
  "アート・イラスト", "ゲーム", "車・バイク", "インテリア・暮らし", "育児・子育て",
];

let otherGenreIdCounter = 0;
const newOtherGenreId = () => `other-${Date.now()}-${otherGenreIdCounter++}`;

type OtherGenreEntry = {
  id: string;
  text: string;
};

type Post = DocumentData & { id: string };

export default function DiscoveryCardEditScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);

  // プレビュー表示に必要な、自分自身のプロフィール情報
  const [previewUserData, setPreviewUserData] = useState<DocumentData | null>(null);

  // ===== 興味のあるジャンル関連の状態 =====
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [otherGenreEntries, setOtherGenreEntries] = useState<OtherGenreEntry[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const uid = auth.currentUser?.uid;
      const myEmail = auth.currentUser?.email;
      if (!uid || !myEmail) return;

      const docSnap = await getDoc(doc(db, "users", uid));
      if (docSnap.exists()) {
        const data: DocumentData = docSnap.data();
        const card = data.discoveryCard || {};
        setPhotos(card.photos || []);
        setSelectedPostIds(card.selectedPostIds || []);
        setPreviewUserData(data);

        // ===== 既存の興味ジャンルを、選択肢とその他自由記入に振り分ける =====
        const existingGenres: string[] = data.interestGenres || [];
        const matchedGenres = existingGenres.filter((g) => INTEREST_GENRES.includes(g));
        const unmatchedGenres = existingGenres.filter((g) => !INTEREST_GENRES.includes(g));
        setSelectedGenres(matchedGenres);
        setOtherGenreEntries(unmatchedGenres.map((text) => ({ id: newOtherGenreId(), text })));
      }

      const q = query(
        collection(db, "posts"),
        where("authorEmail", "==", myEmail),
        where("status", "==", "published"),
        orderBy("createdAt", "desc")
      );
      const postsSnap = await getDocs(q);
      const postsData = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Post[];
      setMyPosts(postsData);

      setLoading(false);
    };
    loadData();
  }, []);

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      alert(`写真は最大${MAX_PHOTOS}枚までです`);
      return;
    }

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
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds((prev) => {
      if (prev.includes(postId)) {
        return prev.filter((id) => id !== postId);
      }
      if (prev.length >= MAX_POSTS) {
        alert(`投稿は最大${MAX_POSTS}件までです`);
        return prev;
      }
      return [...prev, postId];
    });
  };

  // ===== 興味のあるジャンル関連の操作 =====
  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const addOtherGenreEntry = () => {
    setOtherGenreEntries((prev) => [...prev, { id: newOtherGenreId(), text: "" }]);
  };

  const updateOtherGenreEntry = (id: string, text: string) => {
    setOtherGenreEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, text } : entry))
    );
  };

  const removeOtherGenreEntry = (id: string) => {
    setOtherGenreEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);

    try {
      // マイカード専用写真のうち、まだアップロードされていないものを、Firebase Storageにアップロードする
      const uploadedPhotos: string[] = [];
      for (const photoUri of photos) {
        if (needsUpload(photoUri)) {
          const response = await fetch(photoUri);
          const blob = await response.blob();
          const fileName = `discoveryCardPhotos/${uid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, blob);
          const downloadUrl = await getDownloadURL(storageRef);
          uploadedPhotos.push(downloadUrl);
        } else {
          uploadedPhotos.push(photoUri);
        }
      }

      // ===== 興味のあるジャンルを、最終的な一覧としてまとめる =====
      const otherGenreTexts = otherGenreEntries
        .map((entry) => entry.text.trim())
        .filter((text) => text.length > 0);
      const finalGenres = [...selectedGenres, ...otherGenreTexts];

      await setDoc(
        doc(db, "users", uid),
        {
          discoveryCard: {
            photos: uploadedPhotos,
            selectedPostIds: selectedPostIds,
          },
          interestGenres: finalGenres,
        },
        { merge: true }
      );

      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // プレビューに表示する、選択中の投稿（最大3件、選んだ順）
  const previewSelectedPosts = selectedPostIds
    .map((id) => myPosts.find((p) => p.id === id))
    .filter(Boolean) as Post[];

  // プレビューに表示する、興味のあるジャンル（編集中の内容をそのまま反映）
  const previewGenres = [
    ...selectedGenres,
    ...otherGenreEntries.map((e) => e.text.trim()).filter((t) => t.length > 0),
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>マイカードを編集</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={styles.saveText}>{saving ? "保存中..." : "保存"}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={myPosts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.postRow}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              {/* ===== マイカードのプレビュー ===== */}
              <Text style={styles.sectionTitle}>プレビュー</Text>
              <Text style={styles.sectionHint}>実際にこのように表示されます</Text>

              <View style={styles.previewCard}>
                <View style={styles.previewPhotoArea}>
                  {photos.length > 0 ? (
                    <Image source={{ uri: photos[0] }} style={styles.previewPhoto} />
                  ) : (
                    <View style={styles.previewPhotoPlaceholder}>
                      <MaterialIcons name="image" size={36} color="#ccc" />
                    </View>
                  )}
                  {photos.length > 1 && (
                    <View style={styles.previewPhotoCountBadge}>
                      <MaterialIcons name="photo-library" size={12} color="#fff" />
                      <Text style={styles.previewPhotoCountText}>{photos.length}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.previewBody}>
                  <View style={styles.previewHeaderRow}>
                    {previewUserData?.photoUrl ? (
                      <Image source={{ uri: previewUserData.photoUrl }} style={styles.previewAvatar} />
                    ) : (
                      <View style={styles.previewAvatarPlaceholder}>
                        <Text style={styles.previewAvatarPlaceholderText}>👤</Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.previewUsername}>
                        @{previewUserData?.handle || "your_handle"}
                      </Text>
                      <Text style={styles.previewStats}>
                        投稿 {myPosts.length} ・ フォロワー {previewUserData?.followers?.length || 0}
                      </Text>
                    </View>
                  </View>

                  {previewUserData?.bio ? (
                    <Text style={styles.previewBio} numberOfLines={2}>
                      {previewUserData.bio}
                    </Text>
                  ) : (
                    <Text style={styles.previewBioPlaceholder}>自己紹介文はまだありません</Text>
                  )}

                  {previewGenres.length > 0 && (
                    <>
                      <Text style={styles.previewGenreLabel}>興味のあるジャンル</Text>
                      <View style={styles.previewGenreRow}>
                        {previewGenres.slice(0, 4).map((genre: string, index: number) => (
                          <View
                            key={genre}
                            style={index === 0 ? styles.previewGenreChipMain : styles.previewGenreChip}
                          >
                            <Text
                              style={
                                index === 0 ? styles.previewGenreChipMainText : styles.previewGenreChipText
                              }
                            >
                              {genre}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {previewSelectedPosts.length > 0 && (
                    <>
                      <Text style={styles.previewGenreLabel}>掲載する投稿</Text>
                      <View style={styles.previewPostRow}>
                        {previewSelectedPosts.map((post) => (
                          <View key={post.id} style={styles.previewPostThumbWrapper}>
                            {post.thumbnailUrl ? (
                              <Image source={{ uri: post.thumbnailUrl }} style={styles.previewPostThumb} />
                            ) : (
                              <View style={styles.previewPostThumbPlaceholder} />
                            )}
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              </View>
              {/* ===== プレビューここまで ===== */}

              {/* ===== 興味のあるジャンル編集セクション ===== */}
              <Text style={styles.sectionTitle}>興味のあるジャンル</Text>
              <Text style={styles.sectionHint}>気になるものを、いくつでも選んでください</Text>

              <View style={styles.genreGrid}>
                {INTEREST_GENRES.map((genre) => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <TouchableOpacity
                      key={genre}
                      style={[styles.genreChip, isSelected && styles.genreChipSelected]}
                      onPress={() => toggleGenre(genre)}
                    >
                      <Text style={isSelected ? styles.genreChipTextSelected : styles.genreChipText}>
                        {genre}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={styles.genreChip} onPress={addOtherGenreEntry}>
                  <Text style={styles.genreChipText}>＋ その他</Text>
                </TouchableOpacity>
              </View>

              {otherGenreEntries.map((entry) => (
                <View key={entry.id} style={styles.otherGenreRow}>
                  <TextInput
                    value={entry.text}
                    onChangeText={(text) => updateOtherGenreEntry(entry.id, text)}
                    style={styles.otherGenreInput}
                    placeholder="興味のあるジャンルを入力"
                  />
                  <TouchableOpacity
                    style={styles.otherGenreRemoveButton}
                    onPress={() => removeOtherGenreEntry(entry.id)}
                  >
                    <Text style={styles.otherGenreRemoveButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {/* ===== 興味のあるジャンル編集セクションここまで ===== */}

              <Text style={styles.sectionTitle}>マイカード専用の写真（最大{MAX_PHOTOS}枚）</Text>
              <Text style={styles.sectionHint}>投稿とは別に、マイカードだけに表示される写真です</Text>

              <View style={styles.photoGrid}>
                {photos.map((photo, index) => (
                  <View key={index} style={styles.photoItem}>
                    <Image source={{ uri: photo }} style={styles.photoImage} />
                    <TouchableOpacity
                      style={styles.photoRemoveButton}
                      onPress={() => removePhoto(index)}
                    >
                      <MaterialIcons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <TouchableOpacity style={styles.photoAddButton} onPress={pickPhoto}>
                    <MaterialIcons name="add" size={24} color="#999" />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.sectionTitle}>
                カードに載せる投稿（最大{MAX_POSTS}件・{selectedPostIds.length}/{MAX_POSTS}）
              </Text>
              <Text style={styles.sectionHint}>公開中の投稿から、選んでください</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>公開中の投稿がありません</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selectedPostIds.includes(item.id);
            return (
              <TouchableOpacity
                style={styles.postCard}
                onPress={() => togglePostSelection(item.id)}
              >
                {item.thumbnailUrl ? (
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.postThumbnail} />
                ) : (
                  <View style={styles.postThumbnailPlaceholder} />
                )}
                {isSelected && (
                  <View style={styles.postSelectedOverlay}>
                    <View style={styles.postCheckCircle}>
                      <MaterialIcons name="check" size={16} color="#fff" />
                    </View>
                  </View>
                )}
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
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelText: {
    color: "#999",
    fontSize: 14,
  },
  saveText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    marginTop: 20,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
  },
  // ===== プレビューカードのスタイル =====
  previewCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  previewPhotoArea: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: "#f7f7f7",
    position: "relative",
  },
  previewPhoto: {
    width: "100%",
    height: "100%",
  },
  previewPhotoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  previewPhotoCountBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewPhotoCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  previewBody: {
    padding: 14,
  },
  previewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  previewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0f0f0",
  },
  previewAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  previewAvatarPlaceholderText: {
    fontSize: 14,
  },
  previewUsername: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  previewStats: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
  previewBio: {
    fontSize: 12,
    color: "#555",
    lineHeight: 18,
    marginBottom: 10,
  },
  previewBioPlaceholder: {
    fontSize: 12,
    color: "#bbb",
    marginBottom: 10,
  },
  previewGenreLabel: {
    fontSize: 10,
    color: "#999",
    marginBottom: 6,
  },
  previewGenreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  previewGenreChipMain: {
    backgroundColor: "#e8f1fc",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  previewGenreChipMainText: {
    fontSize: 11,
    color: "#4a90e2",
    fontWeight: "600",
  },
  previewGenreChip: {
    borderWidth: 0.5,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  previewGenreChipText: {
    fontSize: 11,
    color: "#666",
  },
  previewPostRow: {
    flexDirection: "row",
    gap: 6,
  },
  previewPostThumbWrapper: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: "hidden",
  },
  previewPostThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f0f0f0",
  },
  previewPostThumbPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#eee",
  },
  // ===== 興味のあるジャンル編集セクションのスタイル =====
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fafafa",
  },
  genreChipSelected: {
    backgroundColor: "#4a90e2",
    borderColor: "#4a90e2",
  },
  genreChipText: {
    fontSize: 13,
    color: "#333",
  },
  genreChipTextSelected: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  otherGenreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  otherGenreInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fafafa",
  },
  otherGenreRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  otherGenreRemoveButtonText: {
    fontSize: 16,
    color: "#e74c3c",
    fontWeight: "700",
  },
  // ===== 写真グリッド =====
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoItem: {
    width: 72,
    height: 72,
    borderRadius: 8,
    position: "relative",
  },
  photoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  photoRemoveButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoAddButton: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  postRow: {
    justifyContent: "flex-start",
    gap: 4,
  },
  postCard: {
    width: "32%",
    aspectRatio: 1,
    marginBottom: 4,
    marginRight: 4,
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
  },
  postThumbnail: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f0f0f0",
  },
  postThumbnailPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#eee",
  },
  postSelectedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(74,144,226,0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    padding: 6,
  },
  postCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
  },
});