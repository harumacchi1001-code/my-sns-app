import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db, storage } from "../firebaseConfig";
const MAX_ITEMS = 10;
type PickedItem = { uri: string; type: "image" | "video" };
export default function StoryCreateScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PickedItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const pickMedia = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真・動画ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (result.canceled) return;
    const newItems: PickedItem[] = result.assets.map((asset) => ({
      uri: asset.uri,
      type: asset.type === "video" ? "video" : "image",
    }));
    setItems((prev) => {
      const combined = [...prev, ...newItems];
      if (combined.length > MAX_ITEMS) {
        alert(`一度に、投稿できるのは、${MAX_ITEMS}枚までです`);
        return combined.slice(0, MAX_ITEMS);
      }
      return combined;
    });
  };
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };
  const handlePost = async () => {
    const uid = auth.currentUser?.uid;
    const myEmail = auth.currentUser?.email;
    if (!uid || !myEmail || items.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: items.length });
    try {
      // ===== 選んだ、順番どおりに、1件ずつ、確実に、アップロード・投稿する =====
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const response = await fetch(item.uri);
        const blob = await response.blob();
        const extension = item.type === "video" ? "mp4" : "jpg";
        const fileName = `stories/${uid}_${Date.now()}_${i}.${extension}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);
        await addDoc(collection(db, "stories"), {
          authorId: uid,
          authorEmail: myEmail,
          mediaUrl: downloadUrl,
          mediaType: item.type,
          createdAt: serverTimestamp(),
          viewedBy: [],
        });
        setUploadProgress({ done: i + 1, total: items.length });
      }
      router.back();
    } finally {
      setUploading(false);
    }
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ストーリーを追加</Text>
          <TouchableOpacity onPress={handlePost} disabled={items.length === 0 || uploading}>
            <Text style={[styles.postText, (items.length === 0 || uploading) && styles.postTextDisabled]}>
              {uploading ? `投稿中 ${uploadProgress.done}/${uploadProgress.total}` : "投稿"}
            </Text>
          </TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <View style={styles.mediaArea}>
            <TouchableOpacity style={styles.pickButton} onPress={pickMedia}>
              <MaterialIcons name="add-photo-alternate" size={48} color="#999" />
              <Text style={styles.pickButtonText}>写真・動画を選ぶ（最大10枚）</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.mediaArea}>
              {items[0].type === "image" ? (
                <Image source={{ uri: items[0].uri }} style={styles.mediaPreview} />
              ) : (
                <View style={styles.videoPlaceholder}>
                  <MaterialIcons name="videocam" size={48} color="#fff" />
                  <Text style={styles.videoPlaceholderText}>動画（1枚目のプレビュー）</Text>
                </View>
              )}
            </View>
            <Text style={styles.orderHint}>
              {items.length}枚、選択中（この順番で、投稿されます）
            </Text>
            <ScrollView horizontal contentContainerStyle={styles.thumbnailRow} showsHorizontalScrollIndicator={false}>
              {items.map((item, index) => (
                <View key={`${item.uri}-${index}`} style={styles.thumbnailWrapper}>
                  {item.type === "image" ? (
                    <Image source={{ uri: item.uri }} style={styles.thumbnailImage} />
                  ) : (
                    <View style={styles.thumbnailVideoPlaceholder}>
                      <MaterialIcons name="videocam" size={18} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.thumbnailOrder}>{index + 1}</Text>
                  <TouchableOpacity style={styles.thumbnailRemoveButton} onPress={() => removeItem(index)}>
                    <MaterialIcons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {items.length < MAX_ITEMS && (
                <TouchableOpacity style={styles.addMoreButton} onPress={pickMedia}>
                  <MaterialIcons name="add" size={22} color="#999" />
                </TouchableOpacity>
              )}
            </ScrollView>
          </>
        )}
        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.uploadingText}>
              {uploadProgress.done} / {uploadProgress.total} 件、投稿しました
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
    paddingVertical: 12,
  },
  cancelText: {
    color: "#fff",
    fontSize: 14,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  postText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "700",
  },
  postTextDisabled: {
    color: "#666",
  },
  mediaArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  mediaPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  videoPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  videoPlaceholderText: {
    color: "#fff",
    fontSize: 13,
  },
  pickButton: {
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  pickButtonText: {
    color: "#999",
    fontSize: 14,
  },
  orderHint: {
    color: "#999",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },
  thumbnailRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  thumbnailWrapper: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#222",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailVideoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnailOrder: {
    position: "absolute",
    bottom: 2,
    left: 4,
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  thumbnailRemoveButton: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  addMoreButton: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#555",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  uploadingText: {
    color: "#fff",
    fontSize: 13,
  },
});