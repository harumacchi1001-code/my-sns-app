// ===== メールアドレスに紛れ込みやすい、全角文字・見えない空白を、自動で整える共通処理 =====

// 全角の英数字・記号（＠を含む）を、半角に変換し、空白をすべて取り除く
export function normalizeEmail(input: string): string {
  if (!input) return input;
  // 全角文字（Unicodeの「全角英数記号」の範囲）を、半角に変換する
  let normalized = input.replace(/[\uFF01-\uFF5E]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
  );
  // 半角スペース・全角スペース・タブなど、空白文字をすべて取り除く
  normalized = normalized.replace(/[\s\u3000]/g, "");
  return normalized;
}

// メールアドレスの形式として、最低限の妥当性があるか確認する
export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}