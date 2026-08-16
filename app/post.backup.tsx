import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PostScreen() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const pickImages = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      alert("写真ライブラリへのアクセスが許可されていません");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      const uris = result.assets.map((asset) => asset.uri);
      setImages(uris);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>下書き保存</Text>
        <TouchableOpacity style={styles.publishButton}>
          <Text style={styles.publishButtonText}>公開</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <TextInput
          placeholder="タイトルを入力"
          value={title}
          onChangeText={setTitle}
          style={styles.titleInput}
        />

        <TouchableOpacity style={styles.imagePickerButton} onPress={pickImages}>
          <Text style={styles.imagePickerButtonText}>＋ 画像を追加</Text>
        </TouchableOpacity>

        {images.length > 0 && (
          <ScrollView horizontal style={styles.imagePreviewRow}>
            {images.map((uri, index) => (
              <Image key={index} source={{ uri }} style={styles.previewImage} />
            ))}
          </ScrollView>
        )}

        <TextInput
          placeholder="本文を入力してください..."
          value={body}
          onChangeText={setBody}
          style={styles.bodyInput}
          multiline
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
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
  headerLabel: {
    color: "#999",
    fontSize: 13,
  },
  publishButton: {
    backgroundColor: "#222",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  publishButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    color: "#222",
  },
  imagePickerButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  imagePickerButtonText: {
    color: "#999",
    fontSize: 14,
  },
  imagePreviewRow: {
    marginBottom: 16,
  },
  previewImage: {
    width: 90,
    height: 90,
    borderRadius: 8,
    marginRight: 8,
  },
  bodyInput: {
    fontSize: 15,
    lineHeight: 24,
    color: "#333",
    minHeight: 200,
    textAlignVertical: "top",
  },
});