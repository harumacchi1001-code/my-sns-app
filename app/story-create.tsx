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
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db, storage } from "../firebaseConfig";

export default function StoryCreateScreen() {
  const router = useRouter();
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickMedia = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert("写真・動画ライブラリへのアクセスが許可されていません");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === "video" ? "video" : "image");
    }
  };

  const handlePost = async () => {
    const uid = auth.currentUser?.uid;
    const myEmail = auth.currentUser?.email;
    if (!uid || !myEmail || !mediaUri || !mediaType) return;

    setUploading(true);

    try {
      const response = await fetch(mediaUri);
      const blob = await response.blob();
      const extension = mediaType === "video" ? "mp4" : "jpg";
      const fileName = `stories/${uid}_${Date.now()}.${extension}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "stories"), {
        authorId: uid,
        authorEmail: myEmail,
        mediaUrl: downloadUrl,
        mediaType: mediaType,
        createdAt: serverTimestamp(),
        viewedBy: [],
      });

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
          <TouchableOpacity onPress={handlePost} disabled={!mediaUri || uploading}>
            <Text style={[styles.postText, (!mediaUri || uploading) && styles.postTextDisabled]}>
              {uploading ? "投稿中..." : "投稿"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mediaArea}>
          {mediaUri ? (
            mediaType === "image" ? (
              <Image source={{ uri: mediaUri }} style={styles.mediaPreview} />
            ) : (
              <View style={styles.videoPlaceholder}>
                <MaterialIcons name="videocam" size={48} color="#fff" />
                <Text style={styles.videoPlaceholderText}>動画が選択されました</Text>
              </View>
            )
          ) : (
            <TouchableOpacity style={styles.pickButton} onPress={pickMedia}>
              <MaterialIcons name="add-photo-alternate" size={48} color="#999" />
              <Text style={styles.pickButtonText}>写真・動画を選ぶ</Text>
            </TouchableOpacity>
          )}
        </View>

        {mediaUri && (
          <TouchableOpacity style={styles.changeButton} onPress={pickMedia}>
            <Text style={styles.changeButtonText}>別の写真・動画を選び直す</Text>
          </TouchableOpacity>
        )}

        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
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
  changeButton: {
    paddingVertical: 16,
    alignItems: "center",
  },
  changeButtonText: {
    color: "#4a90e2",
    fontSize: 14,
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});