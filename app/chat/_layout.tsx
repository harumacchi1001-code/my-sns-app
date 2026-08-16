// ===== ここから、アプリ版・スマホ幅のWeb版共通：/chat配下の、最小限のレイアウト =====
// Web版専用の _layout.web.tsx と対になる、無印のファイル。
// サイドバーは付けず、画面をそのまま表示するだけ。
import { Slot } from "expo-router";

export default function ChatLayout() {
  return <Slot />;
}
// ===== ここまで =====