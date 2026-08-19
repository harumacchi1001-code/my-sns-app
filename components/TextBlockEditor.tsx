import {
    RichText,
    useBridgeState,
    useEditorBridge,
} from "@10play/tentap-editor";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
export type TextBlockEditorHandle = {
  getHTML: () => Promise<string>;
};
type Props = {
  initialContent?: string;
  onFocus?: () => void;
  onInsertImage?: () => Promise<{ url: string; ratio: number }[]>;
  onInsertVideo?: () => void;
  onContentChange?: (html: string) => void;
  // ===== Web版専用の機能（型だけ、揃えておく。アプリ版では、使わない） =====
  onPickMedia?: () => Promise<{ type: "image" | "video"; url: string; ratio: number }[]>;
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
const isWeb = Platform.OS === "web";

const EDITOR_CUSTOM_CSS = `
  h1 { font-size: 26px; font-weight: 700; margin: 20px 0 10px; line-height: 1.3; }
  h2 { font-size: 20px; font-weight: 700; margin: 16px 0 8px; line-height: 1.3; }
  blockquote { border-left: 4px solid #ccc; padding-left: 12px; margin: 12px 0; color: #666; font-style: italic; }
  ul, ol { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
  img { max-width: 100%; border-radius: 8px; margin: 10px 0; }
  .ProseMirror, [contenteditable] {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }
`;

const TextBlockEditor = forwardRef<TextBlockEditorHandle, Props>(
  ({ initialContent = "", onFocus, onInsertImage, onInsertVideo, onContentChange }, ref) => {
    const [insertMenuVisible, setInsertMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 100, left: 50 });
    const [colorMenuVisible, setColorMenuVisible] = useState(false);
    const [textColorMenuVisible, setTextColorMenuVisible] = useState(false);
    const [linkMenuVisible, setLinkMenuVisible] = useState(false);
    const [linkInput, setLinkInput] = useState("");
    const editor = useEditorBridge({
      autofocus: false,
      avoidIosKeyboard: false,
      dynamicHeight: true,
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

    useEffect(() => {
      editor.injectCSS(EDITOR_CUSTOM_CSS, "diary-app-custom-css");
    }, []);

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

    const runInsertAction = (action: () => void) => {
      setInsertMenuVisible(false);
      setTimeout(() => {
        editor.focus();
        setTimeout(() => {
          action();
        }, 80);
      }, 80);
    };

    const insertMenuItems = [
      ...(onInsertImage
        ? [
            {
              icon: "🖼️",
              label: "画像を追加",
              action: async () => {
                const items = await onInsertImage();
                if (items && items[0]) {
                  (editor as any).setImage({ src: items[0].url });
                }
              },
            },
          ]
        : []),
      ...(onInsertVideo
        ? [{ icon: "🎬", label: "動画を追加（下に追加されます）", action: () => onInsertVideo() }]
        : []),
      { icon: "H1", label: "見出し（大）", action: () => (editor.toggleHeading as any)({ level: 1 }) },
      { icon: "H2", label: "見出し（小）", action: () => (editor.toggleHeading as any)({ level: 2 }) },
      { icon: "❝", label: "引用", action: () => editor.toggleBlockquote() },
      { icon: "•", label: "箇条書きリスト", action: () => editor.toggleBulletList() },
      { icon: "1.", label: "番号付きリスト", action: () => editor.toggleOrderedList() },
      { icon: "☑", label: "チェックリスト", action: () => editor.toggleTaskList() },
      { icon: "―", label: "区切り線", action: () => (editor as any).setHorizontalRule?.() },
      { icon: "B", label: "太字", action: () => editor.toggleBold() },
      { icon: "U", label: "下線", action: () => editor.toggleUnderline() },
      { icon: "S", label: "打ち消し線", action: () => editor.toggleStrike() },
    ];

    return (
      <View style={styles.container}>
        <RichText editor={editor} style={styles.richText} />

        {(isWeb || editorState.isFocused) && (
          <View style={styles.plusRow}>
            <TouchableOpacity
              style={styles.plusButton}
              onPress={() => setInsertMenuVisible(true)}
            >
              <Text style={styles.plusButtonText}>＋</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallIconButton} onPress={() => setTextColorMenuVisible(true)}>
              <Text style={[styles.smallIconButtonTextColor, { color: activeTextColor || "#222" }]}>A</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallIconButton} onPress={() => setColorMenuVisible(true)}>
              <Text style={styles.smallIconButtonText}>🖍️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallIconButton} onPress={openLinkMenu}>
              <Text style={styles.smallIconButtonText}>🔗</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={insertMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setInsertMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.insertMenuOverlay}
            activeOpacity={1}
            onPress={() => setInsertMenuVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.insertMenu, { top: menuPosition.top, left: menuPosition.left }]}
            >
              <ScrollView style={{ maxHeight: 320 }}>
                {insertMenuItems.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.insertMenuItem}
                    onPress={() => runInsertAction(item.action)}
                  >
                    <View style={styles.insertMenuIconWrapper}>
                      <Text style={styles.insertMenuIconText}>{item.icon}</Text>
                    </View>
                    <Text style={styles.insertMenuLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

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
    minHeight: 60,
    borderWidth: 0,
  },
  richText: {
    minHeight: 420,
    paddingHorizontal: 18,
    borderWidth: 0,
    ...(Platform.OS === "web" && ({ outlineStyle: "none" } as any)),
  },
  plusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  plusButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
  },
  plusButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
  smallIconButton: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  smallIconButtonText: {
    fontSize: 16,
  },
  smallIconButtonTextColor: {
    fontSize: 16,
    fontWeight: "700",
  },
  insertMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  insertMenu: {
    position: "absolute",
    width: 230,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  insertMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  insertMenuIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
  insertMenuIconText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },
  insertMenuLabel: {
    fontSize: 15,
    color: "#222",
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