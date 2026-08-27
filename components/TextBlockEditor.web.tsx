import { Extension, mergeAttributes, Node } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import ImageExtension from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLOR_THEMES, getColorTheme } from "../constants/postTemplates";

// ===== 画像・動画と、キャプションを、結びつけるための、ランダムな合言葉を作る =====
const generateMediaId = () => Math.random().toString(36).slice(2);

// ===== 画像に、実際の縦横比・合言葉を、記録できるよう、標準の機能を、拡張する =====
const ImageWithRatio = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ratio: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-ratio"),
        renderHTML: (attributes) => {
          if (!attributes.ratio) return {};
          return { "data-ratio": attributes.ratio };
        },
      },
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {};
          return { "data-media-id": attributes.mediaId };
        },
      },
    };
  },
});

// ===== 段落に、「これは、キャプションです」「どの画像・動画の、キャプションか」の、目印を、付けられるようにする =====
const ParagraphCaptionAttribute = Extension.create({
  name: "paragraphCaptionAttribute",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          caption: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-caption"),
            renderHTML: (attributes) => {
              if (!attributes.caption) return {};
              return { "data-caption": "true", class: "diary-caption" };
            },
          },
          captionFor: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-caption-for"),
            renderHTML: (attributes) => {
              if (!attributes.captionFor) return {};
              return { "data-caption-for": attributes.captionFor };
            },
          },
        },
      },
    ];
  },
  // ===== キャプション欄の中で、Enter・Backspaceキーが、押されたときの、専用の動き =====
  addKeyboardShortcuts() {
    return {
      // ===== キャプション欄が、完全に空っぽのときだけ、Backspaceで、行自体が消えるのを、防ぐ =====
      Backspace: ({ editor }) => {
        const { selection, doc } = editor.state;
        const { $from, empty } = selection;
        const currentNode = $from.parent;

        // ===== 今、いる場所が、キャプション欄でなければ、通常どおりのBackspaceに、任せる =====
        if (!currentNode.attrs?.caption) return false;

        // ===== カーソルが、キャプション欄の、一番、はじめに、なければ、通常どおり、1文字、消す =====
        const isAtStart = empty && $from.parentOffset === 0;
        if (!isAtStart) return false;

        // ===== このキャプション（複数行に、またがっている場合も、含めて）全体が、完全に空かを、確認する =====
        const captionStart = $from.start(-1);
        const captionEnd = $from.end(-1);
        const wholeCaptionText = doc.textBetween(
          Math.min(captionStart, $from.before()),
          $from.after() > captionEnd ? captionEnd : $from.after()
        );

        // ===== 何か、文字が、残っていれば、通常どおりのBackspaceに、任せる（前の行と、くっつく、など） =====
        if (wholeCaptionText.trim() !== "") return false;

        // ===== 完全に、空っぽのときだけ、何もしない（行が、消えるのを、防ぐ） =====
        return true;
      },
      Enter: ({ editor }) => {
        const { selection, doc } = editor.state;
        const { $from } = selection;
        const currentNode = $from.parent;

        // ===== 今、いる場所が、キャプション欄でなければ、通常どおりのEnterに、任せる =====
        if (!currentNode.attrs?.caption) return false;

        // ===== 今の行（段落）が、空っぽかどうかを、判定する =====
        const isCurrentLineEmpty = $from.parent.textContent.trim() === "";

        if (!isCurrentLineEmpty) {
          // ===== 何か、書かれていれば、キャプション欄の中で、自由に、改行させる =====
          return editor.commands.splitBlock();
        }

        // ===== 空っぽの、行で、Enterが、押されたら、キャプション欄を抜けて、本文（普通の段落）に、移動する =====
        const endOfCaption = $from.after();
        const insertPos = endOfCaption;
        editor
          .chain()
          .insertContentAt(insertPos, { type: "paragraph" })
          .setTextSelection(insertPos + 1)
          .run();
        return true;
      },
    };
  },
});

// ===== 動画を、文章の中の、1つの要素として、新しく定義する =====
const VideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-url"),
        renderHTML: (attributes) => ({ "data-url": attributes.url }),
      },
      ratio: {
        default: 16 / 9,
        parseHTML: (element) => parseFloat(element.getAttribute("data-ratio") || "") || 16 / 9,
        renderHTML: (attributes) => ({ "data-ratio": attributes.ratio }),
      },
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {};
          return { "data-media-id": attributes.mediaId };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-video-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const url = HTMLAttributes.url || HTMLAttributes["data-url"] || "";
    const ratio = HTMLAttributes.ratio || HTMLAttributes["data-ratio"] || 16 / 9;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-video-block": "true",
        class: "diary-video-block",
        style: `aspect-ratio: ${ratio};`,
      }),
      ["video", { src: url, controls: "true" }],
    ];
  },
});
// ===== 「画像グループ」を、文章の中の、1つの要素として、新しく定義する =====
const ImageGroup = Node.create({
  name: "imageGroup",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      urls: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-urls"),
        renderHTML: (attributes) => ({ "data-urls": attributes.urls }),
      },
      ratios: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ratios"),
        renderHTML: (attributes) => ({ "data-ratios": attributes.ratios }),
      },
      types: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-types"),
        renderHTML: (attributes) => ({ "data-types": attributes.types }),
      },
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-media-id"),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {};
          return { "data-media-id": attributes.mediaId };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-image-group]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const urls: string = HTMLAttributes.urls || HTMLAttributes["data-urls"] || "";
    const ratios: string = HTMLAttributes.ratios || HTMLAttributes["data-ratios"] || "";
    const types: string = HTMLAttributes.types || HTMLAttributes["data-types"] || "";
    const urlList = urls.split(",").filter(Boolean);
    const ratioList = ratios.split(",").map((r) => parseFloat(r) || 1);
    const typeList = types.split(",");
    const displayUrls = urlList.slice(0, 4);
    const remainingCount = urlList.length - displayUrls.length;
    const rows: { url: string; ratio: number; isVideo: boolean; isMore?: boolean }[][] = [];
    for (let i = 0; i < displayUrls.length; i += 2) {
      const row = [];
      row.push({ url: displayUrls[i], ratio: ratioList[i] || 1, isVideo: typeList[i] === "v" });
      if (displayUrls[i + 1]) {
        const isLastAndHasMore = i + 1 === displayUrls.length - 1 && remainingCount > 0;
        row.push({
          url: displayUrls[i + 1],
          ratio: ratioList[i + 1] || 1,
          isVideo: typeList[i + 1] === "v",
          isMore: isLastAndHasMore,
        });
      }
      rows.push(row);
    }
    if (displayUrls.length % 2 === 1 && remainingCount > 0) {
      rows[rows.length - 1][0].isMore = true;
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-image-group": "true",
        class: "diary-image-group",
        ...(HTMLAttributes.mediaId ? { "data-media-id": HTMLAttributes.mediaId } : {}),
      }),
      ...rows.map((row) => [
        "div",
        { class: "diary-image-row" },
        ...row.map((item) => {
          const style = `aspect-ratio: ${item.ratio}; height: 100%; flex-grow: 0; flex-shrink: 0;`;
          const mediaTag = item.isVideo
            ? ["video", { src: item.url, muted: "true", playsinline: "true", controls: "true" }]
            : ["img", { src: item.url }];
          if (item.isMore) {
            return ["div", { class: "diary-image-group-more", style, "data-more": `+${remainingCount}` }, mediaTag];
          }
          return item.isVideo
            ? ["div", { class: "diary-image-group-video-wrapper", style }, mediaTag]
            : ["img", { src: item.url, style }];
        }),
      ]),
    ];
  },
});
// ===== 画像・動画が、削除されたら、対応するキャプションも、自動で、削除する、見張り番 =====
const CaptionSync = Extension.create({
  name: "captionSync",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // ===== 今、文章の中に、実際に、存在している、画像・動画の、合言葉、一覧を作る =====
          const existingIds = new Set<string>();
          newState.doc.descendants((node) => {
            if (["image", "videoBlock", "imageGroup"].includes(node.type.name) && node.attrs.mediaId) {
              existingIds.add(node.attrs.mediaId);
            }
          });
          // ===== 対応する、画像・動画が、もう、存在しない、キャプションを、探して、削除する =====
          let tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === "paragraph" && node.attrs.captionFor && !existingIds.has(node.attrs.captionFor)) {
              const mappedPos = tr.mapping.map(pos);
              tr.delete(mappedPos, mappedPos + node.nodeSize);
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});

export type TextBlockEditorHandle = {
  getHTML: () => Promise<string>;
};
type Props = {
  initialContent?: string;
  onFocus?: () => void;
  onPickMedia?: () => Promise<{ type: "image" | "video"; url: string; ratio: number }[]>;
  onInsertVideo?: () => void;
  onContentChange?: (html: string) => void;
  // ===== 記事全体の、配色テーマ（未選択なら、null） =====
  themeId?: string | null;
  onThemeChange?: (themeId: string) => void;
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
  { label: "白", color: "#eeeeee" },
  { label: "茶", color: "#8a5a2c" },
  { label: "グレー", color: "#757575" },
  { label: "ネイビー", color: "#34495e" },
  { label: "ワインレッド", color: "#8e3b46" },
  { label: "ダークグレー", color: "#3d3d3d" },
  { label: "ローズ", color: "#5c3a4a" },
  { label: "スカイブルー", color: "#5ac8fa" },
];
// ===== 選ばれた配色テーマに応じて、見出し・引用・リスト・キャプション・リンクの色を、組み立てる =====
const buildThemeCss = (themeId?: string | null) => {
  if (!themeId) return "";
  const theme = getColorTheme(themeId as any);
  const textColor = theme.text;
  const mutedColor = theme.muted;
  const captionColor = theme.muted;
  const accentColor = theme.accent;
  const borderColor = theme.border;
  return `
    .diary-tiptap-content.diary-tiptap-content, .diary-tiptap-content.diary-tiptap-content p { color: ${textColor} !important; }
    .diary-tiptap-content.diary-tiptap-content h1, .diary-tiptap-content.diary-tiptap-content h2 { color: ${textColor} !important; }
    .diary-tiptap-content.diary-tiptap-content blockquote { color: ${mutedColor} !important; border-left-color: ${borderColor} !important; }
    .diary-tiptap-content.diary-tiptap-content li { color: ${textColor} !important; }
    .diary-tiptap-content.diary-tiptap-content a { color: ${accentColor} !important; }
    .diary-tiptap-content.diary-tiptap-content p[data-caption] { color: ${captionColor} !important; }
  `;
};

const EDITOR_CSS = `
  .diary-image-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-radius: 8px;
    overflow: hidden;
    margin: 10px -18px;
    width: calc(100% + 36px);
  }
  .diary-image-row {
    display: flex;
    gap: 3px;
    height: 200px;
    justify-content: center;
  }
  .diary-image-group img {
    height: 100%;
    object-fit: cover;
    margin: 0 !important;
    border-radius: 0 !important;
    display: block;
  }
  .diary-image-group-more {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .diary-image-group-more img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .diary-image-group-more::after {
    content: attr(data-more);
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.45);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 600;
  }
  .diary-image-group-video-wrapper {
    overflow: hidden;
  }
  .diary-image-group-video-wrapper video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .diary-video-block {
    width: calc(100% + 36px);
    border-radius: 8px;
    overflow: hidden;
    margin: 10px -18px;
    background: #000;
  }
  .diary-video-block video {
    width: 100%;
    height: 100%;
    display: block;
  }
  .diary-tiptap-content {
    outline: none;
    border: none;
    box-shadow: none;
    padding: 0 18px;
    font-size: 15px;
    line-height: 1.7;
    color: #222;
    min-height: 60px;
  }
  .diary-tiptap-content h1 { font-size: 26px; font-weight: 700; margin: 20px 0 10px; line-height: 1.3; }
  .diary-tiptap-content h2 { font-size: 20px; font-weight: 700; margin: 16px 0 8px; line-height: 1.3; }
  .diary-tiptap-content blockquote { border-left: 4px solid #ccc; padding-left: 12px; margin: 12px 0; color: #666; font-style: italic; }
  .diary-tiptap-content ul, .diary-tiptap-content ol { padding-left: 20px; margin: 8px 0; }
  .diary-tiptap-content li { margin: 4px 0; }
  .diary-tiptap-content hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
  .diary-tiptap-content ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
  .diary-tiptap-content > img { max-width: none; width: calc(100% + 36px); margin: 10px -18px; border-radius: 8px; display: block; }
  .diary-tiptap-content p.is-empty::before,
  .diary-tiptap-content p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: #bbb;
    pointer-events: none;
    height: 0;
  }
  /* ===== キャプション欄だけは、案内文も、中央揃えにする ===== */
  .diary-tiptap-content p[data-caption].is-empty::before {
    float: none;
    display: block;
    text-align: center;
  }
  /* ===== キャプション（画像・動画の説明文）の、見た目：本文より、小さく、グレーに、中央揃え ===== */
  .diary-tiptap-content p[data-caption] {
    font-size: 12px;
    line-height: 0.3;
    color: #999;
    margin: 4px 0 14px;
    text-align: center;
  }
`;
const TextBlockEditor = forwardRef<TextBlockEditorHandle, Props>(
  ({ initialContent = "", onFocus, onPickMedia, onInsertVideo, onContentChange, themeId, onThemeChange }, ref) => {
    const [insertMenuVisible, setInsertMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 100, left: 50 });
    const [colorMenuVisible, setColorMenuVisible] = useState(false);
    const [colorMenuPosition, setColorMenuPosition] = useState({ top: 100, left: 50 });
    const [textColorMenuVisible, setTextColorMenuVisible] = useState(false);
    const [textColorMenuPosition, setTextColorMenuPosition] = useState({ top: 100, left: 50 });
    const [linkMenuVisible, setLinkMenuVisible] = useState(false);
    const [linkMenuPosition, setLinkMenuPosition] = useState({ top: 100, left: 50 });
    const [linkInput, setLinkInput] = useState("");
    const [themeMenuVisible, setThemeMenuVisible] = useState(false);
    const [themeMenuPosition, setThemeMenuPosition] = useState({ top: 100, left: 50 });
    const [, forceUpdate] = useState(0);
    const [toolbarColors, setToolbarColors] = useState<{ text: string | null; highlight: string | null }>({
      text: null,
      highlight: null,
    });
    const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);

    const TOOLBAR_OFFSET_X = 56;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
          // ===== 標準の、link機能は、無効にする（下で、別途、詳しい設定の、Linkを、使うため） =====
          link: false,
          // ===== 標準のunderlineも、無効にする（下で、別途、Underlineを、使うため。重複登録を防ぐ） =====
          underline: false,
        }),
        Underline,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        Link.configure({ openOnClick: false }),
        ImageWithRatio,
        ImageGroup,
        VideoBlock,
        TaskList,
        TaskItem.configure({ nested: true }),
        ParagraphCaptionAttribute,
        CaptionSync,
        Placeholder.configure({
          // ===== キャプション欄と、通常の文章とで、表示される、案内文を、変える =====
          placeholder: ({ node }: any) => {
            if (node.attrs?.caption) return "キャプション文を入力";
            return "Write something …";
          },
        }),
      ],
      content: initialContent,
      editorProps: {
        attributes: { class: "diary-tiptap-content" },
      },
      onUpdate: ({ editor: currentEditor }) => {
        onContentChange?.(currentEditor.getHTML());
      },
      onTransaction: ({ editor: currentEditor }) => {
        forceUpdate((n) => n + 1);
        setToolbarColors({
          text: currentEditor.getAttributes("textStyle").color || null,
          highlight: currentEditor.getAttributes("highlight").color || null,
        });
        try {
          const { from } = currentEditor.state.selection;
          const coords = currentEditor.view.coordsAtPos(from);
          const editorRect = currentEditor.view.dom.getBoundingClientRect();
          setToolbarPosition({
            top: coords.top - editorRect.top,
            left: -TOOLBAR_OFFSET_X,
          });
        } catch (e) {}
      },
      onCreate: ({ editor: currentEditor }) => {
        try {
          const coords = currentEditor.view.coordsAtPos(0);
          const editorRect = currentEditor.view.dom.getBoundingClientRect();
          setToolbarPosition({ top: coords.top - editorRect.top, left: -TOOLBAR_OFFSET_X });
        } catch (e) {}
        onContentChange?.(currentEditor.getHTML());
      },
    });
    useEffect(() => {
      if (document.getElementById("diary-tiptap-css")) return;
      const styleTag = document.createElement("style");
      styleTag.id = "diary-tiptap-css";
      styleTag.innerHTML = EDITOR_CSS;
      document.head.appendChild(styleTag);
    }, []);

    // ===== 配色テーマが、変わるたびに、専用のCSSを、注入し直す =====
    useEffect(() => {
      let themeStyleTag = document.getElementById("diary-tiptap-theme-css") as HTMLStyleElement | null;
      if (!themeStyleTag) {
        themeStyleTag = document.createElement("style");
        themeStyleTag.id = "diary-tiptap-theme-css";
        document.head.appendChild(themeStyleTag);
      }
      themeStyleTag.innerHTML = buildThemeCss(themeId);
    }, [themeId]);
    useImperativeHandle(ref, () => ({
      getHTML: async () => {
        return editor ? editor.getHTML() : "";
      },
    }));
    if (!editor) {
      return null;
    }
    const applyHighlight = (color: string) => {
      editor.chain().focus().extendMarkRange("highlight").setHighlight({ color }).run();
      setToolbarColors((prev) => ({ ...prev, highlight: color }));
      setColorMenuVisible(false);
    };
    const applyTextColor = (color: string) => {
      editor.chain().focus().extendMarkRange("textStyle").setColor(color).run();
      setToolbarColors((prev) => ({ ...prev, text: color }));
      setTextColorMenuVisible(false);
    };
    const openLinkMenu = (event?: any) => {
      const pageY = event?.nativeEvent?.pageY ?? 100;
      const pageX = event?.nativeEvent?.pageX ?? 50;
      setLinkMenuPosition({ top: pageY - 10, left: pageX - 200 });
      setLinkInput(editor.getAttributes("link").href || "");
      setLinkMenuVisible(true);
    };
    const applyLink = () => {
      const trimmed = linkInput.trim();
      if (trimmed) {
        const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        editor.chain().focus().extendMarkRange("link").setLink({ href: finalUrl }).run();
      }
      setLinkMenuVisible(false);
      setLinkInput("");
    };
    const removeLink = () => {
      editor.chain().focus().unsetLink().run();
      setLinkMenuVisible(false);
      setLinkInput("");
    };
    const runInsertAction = (action: () => void) => {
      setInsertMenuVisible(false);
      setTimeout(() => {
        editor.commands.focus();
        setTimeout(() => {
          action();
        }, 30);
      }, 30);
    };
    const insertMenuItems = [
      ...(onPickMedia
        ? [
            {
              icon: "🖼️",
              label: "画像・動画を追加（複数選択可）",
              action: async () => {
                const items = await onPickMedia();
                if (!items || items.length === 0) return;
                // ===== この、画像・動画専用の、合言葉を、1つ、発行する =====
                const mediaId = generateMediaId();
                const captionParagraph = { type: "paragraph", attrs: { caption: true, captionFor: mediaId } };
                if (items.length === 1) {
                  const item = items[0];
                  if (item.type === "video") {
                    (editor.chain().focus() as any)
                      .insertContent([
                        { type: "videoBlock", attrs: { url: item.url, ratio: item.ratio, mediaId } },
                        captionParagraph,
                      ])
                      .run();
                  } else {
                    (editor.chain().focus() as any)
                      .insertContent([
                        { type: "image", attrs: { src: item.url, ratio: item.ratio, mediaId } },
                        captionParagraph,
                      ])
                      .run();
                  }
                } else {
                  (editor.chain().focus() as any)
                    .insertContent([
                      {
                        type: "imageGroup",
                        attrs: {
                          urls: items.map((i) => i.url).join(","),
                          ratios: items.map((i) => i.ratio.toFixed(3)).join(","),
                          types: items.map((i) => (i.type === "video" ? "v" : "i")).join(","),
                          mediaId,
                        },
                      },
                      captionParagraph,
                    ])
                    .run();
                }
                // ===== 挿入後、確実に、カーソルを、キャプション欄の中に、移動させる =====
                editor.commands.setTextSelection(editor.state.doc.content.size);
              },
            },
          ]
        : onInsertVideo
        ? [{ icon: "🎬", label: "動画を追加（下に追加されます）", action: () => onInsertVideo() }]
        : []),
      { icon: "H1", label: "見出し（大）", action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
      { icon: "H2", label: "見出し（小）", action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { icon: "❝", label: "引用", action: () => editor.chain().focus().toggleBlockquote().run() },
      { icon: "•", label: "箇条書きリスト", action: () => editor.chain().focus().toggleBulletList().run() },
      { icon: "1.", label: "番号付きリスト", action: () => editor.chain().focus().toggleOrderedList().run() },
      { icon: "☑", label: "チェックリスト", action: () => editor.chain().focus().toggleTaskList().run() },
      { icon: "―", label: "区切り線", action: () => editor.chain().focus().setHorizontalRule().run() },
      { icon: "B", label: "太字", action: () => editor.chain().focus().toggleBold().run() },
      { icon: "U", label: "下線", action: () => editor.chain().focus().toggleUnderline().run() },
      { icon: "S", label: "打ち消し線", action: () => editor.chain().focus().toggleStrike().run() },
    ];
    // ===== ユーザーが、まだ、何も文字色を選んでいなければ、今の配色テーマの、初期文字色を、代わりに使う =====
    const themeDefaultTextColor = themeId ? getColorTheme(themeId as any).text : null;
    const activeTextColor = toolbarColors.text ?? themeDefaultTextColor;
    const activeHighlightColor = toolbarColors.highlight;
    const hasActiveLink = editor.isActive("link");
    console.log("画面が描かれた瞬間の色:", activeTextColor);
    console.log("今の文字色:", activeTextColor);
    return (
      <View style={styles.container}>
        <View style={styles.richTextWrapper}>
          {toolbarPosition && (
            <View
              style={[
                styles.floatingToolbar,
                { top: toolbarPosition.top, left: toolbarPosition.left, position: "absolute" },
              ]}
            >
              <TouchableOpacity
                style={styles.plusButton}
                onPress={(event: any) => {
                  const pageY = event?.nativeEvent?.pageY ?? 100;
                  const pageX = event?.nativeEvent?.pageX ?? 50;
                  setMenuPosition({ top: pageY - 10, left: pageX + 16 });
                  setInsertMenuVisible(true);
                }}
              >
                <Text style={styles.plusButtonText}>＋</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallIconButton}
                onPress={(event: any) => {
                  const pageY = event?.nativeEvent?.pageY ?? 100;
                  const pageX = event?.nativeEvent?.pageX ?? 50;
                  setTextColorMenuPosition({ top: pageY - 10, left: pageX + 16 });
                  setTextColorMenuVisible(true);
                }}
              >
                <Text style={[styles.smallIconButtonTextColor, { color: activeTextColor || "#222" }]}>A</Text>
                {!!activeTextColor && (
                  <View style={[styles.colorIndicatorBar, { backgroundColor: activeTextColor }]} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallIconButton}
                onPress={(event: any) => {
                  const pageY = event?.nativeEvent?.pageY ?? 100;
                  const pageX = event?.nativeEvent?.pageX ?? 50;
                  setColorMenuPosition({ top: pageY - 10, left: pageX + 16 });
                  setColorMenuVisible(true);
                }}
              >
                <Text style={styles.smallIconButtonText}>🖍️</Text>
                {!!activeHighlightColor && (
                  <View style={[styles.colorIndicatorBar, { backgroundColor: activeHighlightColor }]} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallIconButton} onPress={(event) => openLinkMenu(event)}>
                <Text style={styles.smallIconButtonText}>🔗</Text>
              </TouchableOpacity>
            </View>
          )}
          <EditorContent editor={editor} />
        </View>
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
              <View>
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
              </View>
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
            style={styles.insertMenuOverlay}
            activeOpacity={1}
            onPress={() => setColorMenuVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.smallPanel, { top: colorMenuPosition.top, left: colorMenuPosition.left }]}
            >
              <Text style={styles.colorMenuTitle}>マーカー</Text>
              <View style={styles.colorSwatchRow}>
                {HIGHLIGHT_COLORS.map((item) => {
                  const isActive = activeHighlightColor === item.color;
                  return (
                    <TouchableOpacity
                      key={item.color}
                      style={[styles.colorSwatch, { backgroundColor: item.color }, isActive && styles.colorSwatchActive]}
                      onPress={() => applyHighlight(item.color)}
                    >
                      {isActive && <Text style={styles.colorSwatchCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.colorMenuCancel}
                onPress={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setToolbarColors((prev) => ({ ...prev, highlight: null }));
                  setColorMenuVisible(false);
                }}
              >
                <Text style={styles.colorMenuCancelText}>マーカーを消す</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <Modal
          visible={textColorMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTextColorMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.insertMenuOverlay}
            activeOpacity={1}
            onPress={() => setTextColorMenuVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.smallPanel, { top: textColorMenuPosition.top, left: textColorMenuPosition.left }]}
            >
              <Text style={styles.colorMenuTitle}>文字色</Text>
              <View style={styles.colorSwatchRow}>
                {TEXT_COLORS.map((item) => {
                  const isActive = activeTextColor === item.color;
                  return (
                    <TouchableOpacity
                      key={item.color}
                      style={[styles.colorSwatch, { backgroundColor: item.color }, isActive && styles.colorSwatchActive]}
                      onPress={() => applyTextColor(item.color)}
                    >
                      {isActive && <Text style={styles.colorSwatchCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.colorMenuCancel}
                onPress={() => {
                  editor.chain().focus().unsetColor().run();
                  setToolbarColors((prev) => ({ ...prev, text: null }));
                  setTextColorMenuVisible(false);
                }}
              >
                <Text style={styles.colorMenuCancelText}>文字色を消す</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <Modal
          visible={linkMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLinkMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.insertMenuOverlay}
            activeOpacity={1}
            onPress={() => setLinkMenuVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.smallPanel, { top: linkMenuPosition.top, left: linkMenuPosition.left }]}
            >
              <Text style={styles.colorMenuTitle}>リンクを挿入</Text>
              <TextInput
                value={linkInput}
                onChangeText={setLinkInput}
                placeholder="https://example.com"
                style={styles.linkInput}
                autoCapitalize="none"
                autoCorrect={false}
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
        <Modal
          visible={themeMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setThemeMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.insertMenuOverlay}
            activeOpacity={1}
            onPress={() => setThemeMenuVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.smallPanel, { top: themeMenuPosition.top, left: themeMenuPosition.left }]}
            >
              <Text style={styles.colorMenuTitle}>配色</Text>
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={styles.themeOptionRow}
                  onPress={() => {
                    onThemeChange?.("");
                    setThemeMenuVisible(false);
                  }}
                >
                  <View style={[styles.themeOptionDot, { backgroundColor: "#fff", borderColor: "#ddd" }]} />
                  <Text style={styles.themeOptionLabel}>なし</Text>
                </TouchableOpacity>
                {COLOR_THEMES.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.themeOptionRow}
                    onPress={() => {
                      onThemeChange?.(t.id);
                      setThemeMenuVisible(false);
                    }}
                  >
                    <View style={[styles.themeOptionDot, { backgroundColor: t.accent }]} />
                    <Text style={styles.themeOptionLabel}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
  },
  richTextWrapper: {
    flex: 1,
    minWidth: 0,
    position: "relative",
    marginLeft: 56,
  },
  floatingToolbar: {
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
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
    borderRadius: 15,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  colorIndicatorBar: {
    position: "absolute",
    bottom: 3,
    width: 14,
    height: 3,
    borderRadius: 2,
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
  smallPanel: {
    position: "absolute",
    width: 220,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
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
    justifyContent: "center",
    alignItems: "center",
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: "#222",
    transform: [{ scale: 1.1 }],
  },
  colorSwatchCheck: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  themeOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  themeOptionDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  themeOptionLabel: {
    fontSize: 14,
    color: "#333",
  },
});