// ===== テンプレート機能：ジャンル・レイアウト・配色テーマの、すべてのデータを、ここにまとめる =====

// ===== 入力欄の種類 =====
export type FieldType =
  | "text" // 1行のテキスト
  | "textarea" // 複数行のテキスト
  | "rating" // 星評価（1〜5）
  | "repeatableList" // 「＋追加」で、いくつでも増やせる、名前＋値のリスト（メニュー一覧、材料など）
  | "photo" // 写真1枚
  | "photoPair"; // 写真2枚（ビフォーアフターなど）

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
}

export interface TemplateLayout {
  id: "A" | "B" | "C";
  name: string;
  fields: TemplateField[];
}

export interface GenreTemplate {
  id: string;
  label: string;
  icon: string; // MaterialIconsの名前
  layouts: TemplateLayout[];
}

// ===== 配色テーマ（全ジャンル共通） =====
export const COLOR_THEMES = [
  {
    id: "simple",
    name: "シンプル",
    background: "#ffffff",
    surface: "#ffffff",
    accent: "#222222",
    text: "#222222",
    muted: "#999999",
    placeholder: "#bbbbbb",
    border: "#e2e2e2",
  },
  {
    id: "mono",
    name: "モノトーン",
    background: "#111111",
    surface: "#1c1c1c",
    accent: "#ffffff",
    text: "#eeeeee",
    muted: "#888888",
    placeholder: "#555555",
    border: "#333333",
  },
  {
    id: "pastel",
    name: "パステル",
    background: "#fff8f2",
    surface: "#ffffff",
    accent: "#c17a3d",
    text: "#8a5a2c",
    muted: "#c99a6b",
    placeholder: "#d9b892",
    border: "#f4ddc9",
  },
] as const;

export type ColorThemeId = (typeof COLOR_THEMES)[number]["id"];

// ===== 12ジャンル分、それぞれ3レイアウトのデータ ===== 
export const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    id: "news",
    label: "ニュース",
    icon: "newspaper",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "summary", label: "出来事の要約", type: "textarea", placeholder: "何があったかを、簡潔に" },
          { key: "source", label: "情報源（URL）", type: "text", placeholder: "https://" },
          { key: "opinion", label: "自分の見解", type: "textarea", placeholder: "どう思ったか" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "headline", label: "見出し（結論）", type: "text", placeholder: "一言で言うと" },
          { key: "points", label: "ポイント（箇条書き）", type: "repeatableList", placeholder: "ポイントを追加" },
          { key: "detail", label: "詳細", type: "textarea", placeholder: "詳しく説明する" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "summary", label: "出来事の要約（1〜2行）", type: "textarea", placeholder: "短くまとめる" },
          { key: "source", label: "情報源", type: "text", placeholder: "https://" },
        ],
      },
    ],
  },
  {
    id: "tech",
    label: "AI・テクノロジー",
    icon: "smart-toy",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "tool", label: "使ったツール・技術", type: "text", placeholder: "ツール名" },
          { key: "good", label: "良かった点", type: "textarea" },
          { key: "bad", label: "気になった点", type: "textarea" },
          { key: "rating", label: "おすすめ度", type: "rating" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "toolName", label: "ツール名", type: "text" },
          { key: "pros", label: "メリット", type: "textarea" },
          { key: "cons", label: "デメリット", type: "textarea" },
          { key: "overall", label: "総合評価", type: "rating" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真（画面キャプチャなど）", type: "photo" },
          { key: "toolName", label: "ツール名", type: "text" },
          { key: "comment", label: "ひとこと感想", type: "textarea", placeholder: "短く一言" },
        ],
      },
    ],
  },
  {
    id: "money",
    label: "お金・投資",
    icon: "attach-money",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "theme", label: "テーマ", type: "text", placeholder: "例：NISA" },
          { key: "detail", label: "詳細", type: "textarea" },
          { key: "risk", label: "注意点・リスク", type: "textarea" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "conclusion", label: "結論（先出し）", type: "textarea", placeholder: "まず結論から" },
          { key: "reason", label: "理由", type: "textarea" },
          { key: "example", label: "具体例", type: "textarea" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真・グラフ", type: "photo" },
          { key: "theme", label: "テーマ", type: "text" },
          { key: "conclusion", label: "結論のみ", type: "textarea", placeholder: "一言で" },
        ],
      },
    ],
  },
  {
    id: "business",
    label: "ビジネス・副業",
    icon: "work",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "action", label: "取り組んだこと", type: "textarea" },
          { key: "learning", label: "学び", type: "textarea" },
          { key: "result", label: "成果（任意）", type: "text" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "before", label: "Before", type: "textarea" },
          { key: "after", label: "After", type: "textarea" },
          { key: "learning", label: "学び", type: "textarea" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "成果の画像", type: "photo" },
          { key: "action", label: "取り組んだこと（1行）", type: "text" },
          { key: "resultNumber", label: "結果の数字", type: "text", placeholder: "例：フォロワー+100" },
        ],
      },
    ],
  },
  {
    id: "recipe",
    label: "レシピ・料理",
    icon: "restaurant",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "ingredients", label: "材料", type: "textarea" },
          { key: "steps", label: "手順", type: "textarea" },
          { key: "time", label: "調理時間", type: "text", placeholder: "例：20分" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "ingredients", label: "材料（リスト）", type: "repeatableList", placeholder: "材料を追加" },
          { key: "steps", label: "手順（番号付き）", type: "repeatableList", placeholder: "手順を追加" },
          { key: "tips", label: "コツ", type: "textarea" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "完成写真", type: "photo" },
          { key: "ingredients", label: "材料", type: "textarea" },
          { key: "steps", label: "手順", type: "textarea" },
        ],
      },
    ],
  },
  {
    id: "travel",
    label: "旅行",
    icon: "flight",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "place", label: "場所", type: "text" },
          { key: "schedule", label: "日程", type: "text" },
          { key: "cost", label: "費用", type: "text" },
          { key: "highlight", label: "ハイライト", type: "textarea" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "costBreakdown", label: "費用の内訳", type: "repeatableList", placeholder: "交通費・宿泊費など" },
          { key: "packingList", label: "持ち物リスト", type: "repeatableList", placeholder: "持ち物を追加" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "place", label: "場所", type: "text" },
          { key: "schedule", label: "日程", type: "text" },
        ],
      },
    ],
  },
  {
    id: "relationship",
    label: "恋愛・人間関係",
    icon: "favorite-border",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "event", label: "できごと", type: "textarea" },
          { key: "learning", label: "気づき・学び", type: "textarea" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "trigger", label: "きっかけ", type: "textarea" },
          { key: "event", label: "出来事", type: "textarea" },
          { key: "awareness", label: "気づき", type: "textarea" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "comment", label: "ひとこと", type: "textarea", placeholder: "自由に" },
        ],
      },
    ],
  },
  {
    id: "study",
    label: "学習・資格",
    icon: "school",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "learned", label: "学んだこと", type: "textarea" },
          { key: "material", label: "使った教材", type: "text" },
          { key: "progress", label: "進捗", type: "text" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "progressChecklist", label: "今日の進捗（チェックリスト）", type: "repeatableList" },
          { key: "nextGoal", label: "次の目標", type: "text" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "教材・ノートの写真", type: "photo" },
          { key: "learned", label: "学んだこと（1行）", type: "text" },
        ],
      },
    ],
  },
  {
    id: "beauty",
    label: "美容・健康",
    icon: "spa",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "item", label: "試したもの", type: "text" },
          { key: "period", label: "使用期間", type: "text" },
          { key: "good", label: "良かった点", type: "textarea" },
          { key: "bad", label: "気になった点", type: "textarea" },
          { key: "rating", label: "おすすめ度", type: "rating" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "beforeAfter", label: "ビフォーアフター", type: "photoPair" },
          { key: "period", label: "使用期間", type: "text" },
          { key: "effect", label: "効果", type: "textarea" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "beforeAfter", label: "ビフォーアフター写真", type: "photoPair" },
          { key: "itemName", label: "商品名", type: "text" },
        ],
      },
    ],
  },
  {
    id: "entertainment",
    label: "エンタメ",
    icon: "movie",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "title", label: "作品名", type: "text" },
          { key: "comment", label: "感想（ネタバレなし）", type: "textarea" },
          { key: "rating", label: "評価", type: "rating" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "title", label: "作品名", type: "text" },
          { key: "rating", label: "おすすめ度", type: "rating" },
          { key: "recommendFor", label: "こんな人におすすめ", type: "text" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "title", label: "作品名", type: "text" },
          { key: "rating", label: "評価", type: "rating" },
        ],
      },
    ],
  },
  {
    id: "life",
    label: "暮らし",
    icon: "home",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "theme", label: "テーマ", type: "text" },
          { key: "detail", label: "内容", type: "textarea" },
          { key: "tips", label: "ポイント・コツ", type: "textarea" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "action", label: "やったこと", type: "textarea" },
          { key: "beforeAfter", label: "ビフォーアフター", type: "photoPair" },
          { key: "tips", label: "ポイント", type: "textarea" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "部屋・道具の写真", type: "photo" },
          { key: "theme", label: "テーマ（1行）", type: "text" },
        ],
      },
    ],
  },
  {
    id: "essay",
    label: "エッセイ・体験談",
    icon: "edit-note",
    layouts: [
      {
        id: "A",
        name: "定番型",
        fields: [
          { key: "trigger", label: "きっかけ", type: "textarea" },
          { key: "event", label: "出来事", type: "textarea" },
          { key: "awareness", label: "気づき", type: "textarea" },
        ],
      },
      {
        id: "B",
        name: "自由記述型",
        fields: [{ key: "freeText", label: "自由に書く", type: "textarea", placeholder: "型なし・長文向け" }],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "poem", label: "短い一言", type: "textarea", placeholder: "ポエム風に" },
        ],
      },
    ],
  },
];

// ===== ジャンルIDから、該当のテンプレートデータを取り出す =====
export const getGenreTemplate = (genreId: string) => {
  return GENRE_TEMPLATES.find((g) => g.id === genreId);
};

// ===== ジャンルID・レイアウトIDから、該当のレイアウトデータを取り出す =====
export const getLayout = (genreId: string, layoutId: "A" | "B" | "C") => {
  const genre = getGenreTemplate(genreId);
  return genre?.layouts.find((l) => l.id === layoutId);
};

// ===== 配色テーマIDから、該当のテーマデータを取り出す =====
export const getColorTheme = (themeId: ColorThemeId) => {
  return COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES[0];
};