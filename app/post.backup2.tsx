import {
    RichText,
    Toolbar,
    useEditorBridge,
} from "@10play/tentap-editor";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
    ActivityIndicator,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PostScreen() {
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditorBridge({
    autofocus: false,
    avoidIosKeyboard: false,
    initialContent: "",
  });

  const pickThumbnail = async () => {
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
      setThumbnail(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { Keyboard.dismiss(); editor.blur(); }}>
          <Text style={styles.headerLabel}>完了</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.publishButton} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.publishButtonText}>公開</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.thumbnailArea} onPress={pickThumbnail}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumbnailImage} />
        ) : (
          <Text style={styles.thumbnailPlaceholder}>＋ サムネイル画像を追加</Text>
        )}
      </TouchableOpacity>

      <TextInput
        placeholder="記事タイトル"
        value={title}
        onChangeText={setTitle}
        style={styles.titleInput}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <RichText editor={editor} style={styles.richText} />
        <View style={styles.toolbarWrapper}>
          <Toolbar editor={editor} />
        </View>
      </KeyboardAvoidingView>
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
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
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
    height: 160,
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
  richText: {
    flex: 1,
    paddingHorizontal: 18,
  },
  toolbarWrapper: {
    height: 40,
    overflow: "hidden",
  },
});