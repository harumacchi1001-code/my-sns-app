import { Redirect } from "expo-router";
// ===== 「作成」タブを押すと、まず、テンプレート選択画面に、案内する =====
export default function PostTabRedirect() {
  return <Redirect href="/template-select" />;
}