import {
    DEFAULT_TOOLBAR_ITEMS,
    RichText,
    Toolbar,
    useBridgeState,
    useEditorBridge,
} from "@10play/tentap-editor";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export type TextBlockEditorHandle = {
  getHTML: () => Promise<string>;
};

type Props = {
  initialContent?: string;
  onFocus?: () => void;
};

const HIGHLIGHT_COLORS = [
  { label: "黄", color: "#ffeb3b" },
  { label: "緑", color: "#a5d6a7" },
  { label: "青", color: "#90caf9" },
  { label: "桃", color: "#f48fb1" },
  { label: "橙", color: "#ffcc80" },
];

const TEXT_COLORS = [
  { label: "黒", color: "#222222" },
  { label: "赤", color: "#e74c3c" },
  { label: "青", color: "#4a90e2" },
  { label: "緑", color: "#2ecc71" },
  { label: "紫", color: "#9b59b6" },
  { label: "橙", color: "#f39c12" },
];

// ===== ここからWeb版専用 =====
const isWeb = Platform.OS === "web";
// ===== ここまでWeb版専用 =====

// ===== 斜め文字（イタリック）ボタンを、標準ツールバーから取り除く =====
// 日本語では斜体が安定して表示できないため、機能自体を削除する
// DEFAULT_TOOLBAR_ITEMSの実際のソースコードを確認したところ、
// 斜め文字ボタンは、必ず2番目（インデックス1）に配置されているため、
// その位置だけを、確実に取り除く
const TOOLBAR_ITEMS_WITHOUT_ITALIC = DEFAULT_TOOLBAR_ITEMS.filter(
  (_, index) => index !== 1
);

const TextBlockEditor = forwardRef<TextBlockEditorHandle, Props>(
  ({ initialContent = "", onFocus }, ref) => {
    const [colorMenuVisible, setColorMenuVisible] = useState(false);
    const [textColorMenuVisible, setTextColorMenuVisible] = useState(false);
    const [linkMenuVisible, setLinkMenuVisible] = useState(false);
    const [linkInput, setLinkInput] = useState("");

    const editor = useEditorBridge({
      autofocus: false,
      avoidIosKeyboard: false,
      initialContent,
      theme: {
        webview: {
          backgroundColor: "#fff",
        },
        toolbar: {
          toolbarBody: {
            borderTopColor: "#eee",
          },
        },
      },
    });

    const editorState = useBridgeState(editor);

    useImperativeHandle(ref, () => ({
      getHTML: async () => {
        return await editor.getHTML();
      },
    }));

    const applyHighlight = (color: string) => {
      editor.toggleHighlight(color);
      setColorMenuVisible(false);
    };

    const applyTextColor = (color: string) => {
      editor.setColor(color);
      setTextColorMenuVisible(false);
    };

    const openLinkMenu = () => {
      setLinkInput(editorState.activeLink || "");
      setLinkMenuVisible(true);
    };

    const applyLink = () => {
      const trimmed = linkInput.trim();
      if (trimmed) {
        const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        editor.setLink(finalUrl);
      }
      setLinkMenuVisible(false);
      setLinkInput("");
    };

    const removeLink = () => {
      editor.setLink(null);
      setLinkMenuVisible(false);
      setLinkInput("");
    };

    const activeHighlightColor = editorState.activeHighlight;
    const activeTextColor = editorState.activeColor;
    const hasActiveLink = !!editorState.activeLink;

    // ===== ここからWeb版専用 =====
    const shouldShowToolbar = isWeb || editorState.isFocused;
    // ===== ここまでWeb版専用 =====

    return (
      <View style={styles.container}>
        <RichText editor={editor} style={styles.richText} />

        {shouldShowToolbar && (
          <View style={styles.toolbarRow}>
            <View style={styles.toolbarWrapper}>
              <Toolbar editor={editor} items={TOOLBAR_ITEMS_WITHOUT_ITALIC} />
            </View>

            <TouchableOpacity
              style={styles.extraButton}
              onPress={() => setTextColorMenuVisible(true)}
            >
              <Text
                style={[
                  styles.extraButtonTextColor,
                  { color: activeTextColor || "#222" },
                ]}
              >
                A
              </Text>
              <View
                style={[
                  styles.colorIndicator,
                  { backgroundColor: activeTextColor || "transparent" },
                ]}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.extraButton}
              onPress={() => setColorMenuVisible(true)}
            >
              <Text style={styles.extraButtonText}>🖍️</Text>
              <View
                style={[
                  styles.colorIndicator,
                  { backgroundColor: activeHighlightColor || "transparent" },
                ]}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.extraButton}
              onPress={openLinkMenu}
            >
              <Text style={styles.extraButtonText}>🔗</Text>
              <View
                style={[
                  styles.colorIndicator,
                  { backgroundColor: hasActiveLink ? "#4a90e2" : "transparent" },
                ]}
              />
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={colorMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setColorMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.colorMenuOverlay}
            activeOpacity={1}
            onPress={() => setColorMenuVisible(false)}
          >
            <View style={styles.colorMenu}>
              <Text style={styles.colorMenuTitle}>マーカー</Text>
              <View style={styles.colorSwatchRow}>
                {HIGHLIGHT_COLORS.map((item) => (
                  <TouchableOpacity
                    key={item.color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: item.color },
                      activeHighlightColor === item.color && styles.colorSwatchSelected,
                    ]}
                    onPress={() => applyHighlight(item.color)}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={styles.colorMenuCancel}
                onPress={() => {
                  editor.unsetHighlight();
                  setColorMenuVisible(false);
                }}
              >
                <Text style={styles.colorMenuCancelText}>マーカーを消す</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={textColorMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTextColorMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.colorMenuOverlay}
            activeOpacity={1}
            onPress={() => setTextColorMenuVisible(false)}
          >
            <View style={styles.colorMenu}>
              <Text style={styles.colorMenuTitle}>文字色</Text>
              <View style={styles.colorSwatchRow}>
                {TEXT_COLORS.map((item) => (
                  <TouchableOpacity
                    key={item.color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: item.color },
                      activeTextColor === item.color && styles.colorSwatchSelected,
                    ]}
                    onPress={() => applyTextColor(item.color)}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={styles.colorMenuCancel}
                onPress={() => {
                  editor.unsetColor();
                  setTextColorMenuVisible(false);
                }}
              >
                <Text style={styles.colorMenuCancelText}>文字色を消す</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={linkMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLinkMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.colorMenuOverlay}
            activeOpacity={1}
            onPress={() => setLinkMenuVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.colorMenu}>
              <Text style={styles.colorMenuTitle}>リンクを挿入</Text>
              <TextInput
                value={linkInput}
                onChangeText={setLinkInput}
                placeholder="https://example.com"
                style={styles.linkInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <TouchableOpacity style={styles.linkApplyButton} onPress={applyLink}>
                <Text style={styles.linkApplyButtonText}>設定する</Text>
              </TouchableOpacity>
              {hasActiveLink && (
                <TouchableOpacity style={styles.colorMenuCancel} onPress={removeLink}>
                  <Text style={styles.colorMenuCancelText}>リンクを解除</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }
);

TextBlockEditor.displayName = "TextBlockEditor";

export default TextBlockEditor;

const styles = StyleSheet.create({
  container: {
    minHeight: 150,
  },
  richText: {
    minHeight: 120,
    paddingHorizontal: 18,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  toolbarWrapper: {
    flex: 1,
    height: 30,
    overflow: "hidden",
  },
  extraButton: {
    width: 40,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#eee",
  },
  extraButtonText: {
    fontSize: 18,
  },
  extraButtonTextColor: {
    fontSize: 18,
    fontWeight: "700",
  },
  colorIndicator: {
    position: "absolute",
    bottom: 4,
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  colorMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  colorMenu: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  colorMenuTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
  },
  colorSwatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "#000",
  },
  colorMenuCancel: {
    width: "100%",
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  colorMenuCancelText: {
    fontSize: 14,
    color: "#e74c3c",
    fontWeight: "600",
  },
  linkInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#fafafa",
  },
  linkApplyButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  linkApplyButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});