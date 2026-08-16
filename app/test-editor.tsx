import { RichText, Toolbar, useEditorBridge } from "@10play/tentap-editor";
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TestEditorScreen() {
  const editor = useEditorBridge({
    autofocus: true,
    avoidIosKeyboard: true,
    initialContent: "<p>ここに文字を入力してみてください</p>",
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.label}>検証用エディタ画面</Text>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <RichText editor={editor} style={styles.richText} />
        <Toolbar editor={editor} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  label: {
    textAlign: "center",
    paddingVertical: 8,
    color: "#999",
    fontSize: 12,
  },
  richText: {
    flex: 1,
    padding: 16,
  },
});