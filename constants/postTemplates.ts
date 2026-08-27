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
          { key: "headline", label: "見出し", type: "text", placeholder: "一言で、何があったか" },
          { key: "category", label: "カテゴリ・分野", type: "text", placeholder: "例：政治、テクノロジー、スポーツ" },
          { key: "whenWhere", label: "いつ・どこで", type: "text", placeholder: "例：8月24日、東京で" },
          { key: "lead", label: "リード文（一言でまとめ）", type: "text", placeholder: "読まなくても、要点が伝わる一文" },
          { key: "summary", label: "出来事の要約", type: "textarea", placeholder: "何があったかを、簡潔に" },
          { key: "opinion", label: "感じたこと・自分の見解", type: "textarea", placeholder: "どう思ったか" },
          { key: "importance", label: "重要度（自分にとって）", type: "rating" },
          { key: "source", label: "情報源（URL）", type: "text", placeholder: "https://" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "theme", label: "今日、気になったテーマ", type: "text", placeholder: "例：週末のニュース" },
          { key: "category", label: "カテゴリ", type: "text", placeholder: "例：政治、テクノロジー、スポーツ" },
          { key: "points", label: "気になったニュース（箇条書き）", type: "repeatableList", placeholder: "ニュースを追加" },
          { key: "comment", label: "それぞれへの一言コメント", type: "textarea", placeholder: "感想や、印象に残ったこと" },
          { key: "sources", label: "情報源（URL）", type: "repeatableList", placeholder: "URLを追加" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "headline", label: "見出し", type: "text", placeholder: "一言で、何があったか" },
          { key: "category", label: "カテゴリ", type: "text", placeholder: "例：政治、テクノロジー、スポーツ" },
          { key: "comment", label: "一言コメント", type: "textarea", placeholder: "短い感想" },
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
          { key: "forWhom", label: "どんな人向けか", type: "text", placeholder: "例：初めて、AIを使う人に" },
          { key: "good", label: "良かった点", type: "textarea" },
          { key: "bad", label: "気になった点", type: "textarea" },
          { key: "rating", label: "おすすめ度", type: "rating" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "theme", label: "比較したいテーマ", type: "text", placeholder: "例：AIチャットツール、比較" },
          { key: "tools", label: "比較したツール（箇条書き）", type: "repeatableList", placeholder: "ツール名と、特徴" },
          { key: "winner", label: "結局、どれが、一番、良かったか", type: "text" },
          { key: "reason", label: "選んだ理由", type: "textarea" },
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
          { key: "theme", label: "テーマ・銘柄", type: "text", placeholder: "例：〇〇株、NISA積立" },
          { key: "action", label: "判断・行動", type: "textarea", placeholder: "買った、売った、様子見した、など" },
          { key: "reason", label: "そう判断した理由", type: "textarea", placeholder: "何を根拠に決めたか" },
          { key: "feeling", label: "その時の感情・心境", type: "textarea", placeholder: "冷静だったか、焦っていたか、など" },
          { key: "reflection", label: "振り返り", type: "textarea", placeholder: "今、振り返って、どう思うか" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "theme", label: "今月のテーマ", type: "text", placeholder: "例：8月の資産、まとめ" },
          { key: "breakdown", label: "内訳（箇条書き）", type: "repeatableList", placeholder: "資産の種類・カテゴリ（金額は書かないのが安心です）" },
          { key: "impression", label: "全体の感想", type: "textarea" },
          { key: "privacyNote", label: "公開時のヒント", type: "text", placeholder: "具体的な金額の公開は、控えめにするのがおすすめです" },
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
          { key: "learning", label: "やってみて、分かったこと", type: "textarea" },
          { key: "struggle", label: "うまくいかなかったこと・つまずき", type: "textarea" },
          { key: "next", label: "次に、試したいこと", type: "text" },
          { key: "result", label: "成果（任意）", type: "text", placeholder: "例：反応が、増えた、続けられた、など" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "theme", label: "今月のテーマ", type: "text", placeholder: "例：8月の、副業、まとめ" },
          { key: "activities", label: "取り組んだこと（箇条書き）", type: "repeatableList" },
          { key: "insight", label: "良かったこと・気づき", type: "textarea" },
          { key: "privacyNote", label: "公開時のヒント", type: "text", placeholder: "具体的な収益額の公開は、控えめにするのがおすすめです" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "成果の画像", type: "photo" },
          { key: "action", label: "取り組んだこと（1行）", type: "text" },
          { key: "feel", label: "手応え", type: "text", placeholder: "例：フォロワー+100、続けられた、など" },
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
          { key: "dishName", label: "料理名", type: "text", placeholder: "例：豚肉と、キャベツの、炒め物" },
          { key: "ingredients", label: "材料（何人分か、書くと親切）", type: "textarea" },
          { key: "steps", label: "手順", type: "textarea" },
          { key: "time", label: "調理時間", type: "text", placeholder: "例：20分" },
          { key: "story", label: "きっかけ・エピソード", type: "textarea", placeholder: "作ろうと思った、理由や、思い出" },
          { key: "arrangement", label: "アレンジ・代用のヒント", type: "text" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "ingredients", label: "材料（リスト）", type: "repeatableList", placeholder: "材料を追加" },
          { key: "steps", label: "手順（番号付き）", type: "repeatableList", placeholder: "手順を追加" },
          { key: "tips", label: "コツ", type: "textarea" },
          { key: "comment", label: "作ってみた感想", type: "text" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "完成写真", type: "photo" },
          { key: "ingredients", label: "材料", type: "textarea" },
          { key: "steps", label: "手順", type: "textarea" },
          { key: "comment", label: "ひとこと感想", type: "text" },
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
          { key: "bestSpot", label: "良かったスポット", type: "text" },
          { key: "highlight", label: "ハイライト", type: "textarea" },
          { key: "nextTime", label: "次に、行くなら", type: "text" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "costBreakdown", label: "費用の内訳", type: "repeatableList", placeholder: "交通費・宿泊費など" },
          { key: "packingList", label: "持ち物リスト", type: "repeatableList", placeholder: "持ち物を追加" },
          { key: "goodToBring", label: "持って行って良かったもの", type: "text" },
          { key: "lesson", label: "次回への教訓", type: "textarea", placeholder: "忘れ物、失敗談など" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "place", label: "場所", type: "text" },
          { key: "schedule", label: "日程", type: "text" },
          { key: "note", label: "一言メモ", type: "text" },
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
          { key: "feeling", label: "その時の気持ち", type: "textarea" },
          { key: "learning", label: "気づき・学び", type: "textarea" },
          { key: "privacyNote", label: "書く時のヒント", type: "text", placeholder: "相手を特定できる、名前・場所・職業などは、書かないのが安心です" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "trigger", label: "きっかけ", type: "textarea" },
          { key: "event", label: "出来事", type: "textarea" },
          { key: "awareness", label: "気づき", type: "textarea" },
          { key: "privacyNote", label: "書く時のヒント", type: "text", placeholder: "相手を特定できる、名前・場所・職業などは、書かないのが安心です" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "comment", label: "ひとこと", type: "textarea", placeholder: "自由に" },
          { key: "privacyNote", label: "書く時のヒント", type: "text", placeholder: "相手を特定できる、名前・場所・職業などは、書かないのが安心です" },
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
          { key: "studyTime", label: "勉強時間", type: "text", placeholder: "例：1時間30分" },
          { key: "reflection", label: "感想・反省点", type: "textarea" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "progressChecklist", label: "今日の進捗（チェックリスト）", type: "repeatableList" },
          { key: "insight", label: "今日の気づき", type: "text" },
          { key: "nextGoal", label: "次の目標", type: "text" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "教材・ノートの写真", type: "photo" },
          { key: "learned", label: "学んだこと（1行）", type: "text" },
          { key: "achievement", label: "今日の達成度", type: "rating" },
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
          { key: "disclaimer", label: "ひとこと", type: "text", placeholder: "個人の感想であり、効果には個人差があります" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "theme", label: "今月試したもの", type: "text", placeholder: "例：8月の、スキンケア、まとめ" },
          { key: "items", label: "使ったアイテム（箇条書き）", type: "repeatableList" },
          { key: "impression", label: "全体の感想", type: "textarea" },
          { key: "disclaimer", label: "ひとこと", type: "text", placeholder: "個人の感想であり、効果には個人差があります" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "beforeAfter", label: "ビフォーアフター写真", type: "photoPair" },
          { key: "itemName", label: "商品名", type: "text" },
          { key: "disclaimer", label: "ひとこと", type: "text", placeholder: "個人の感想であり、効果には個人差があります" },
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
          { key: "spoiler", label: "ネタバレの有無", type: "text", placeholder: "例：ネタバレなし、ネタバレあり" },
          { key: "comment", label: "感想", type: "textarea" },
          { key: "favoritePoint", label: "好きなポイント", type: "text" },
          { key: "rating", label: "評価", type: "rating" },
        ],
      },
      {
        id: "B",
        name: "リスト・要約型",
        fields: [
          { key: "theme", label: "今月観た・読んだテーマ", type: "text", placeholder: "例：8月に観た作品、まとめ" },
          { key: "titles", label: "作品リスト（箇条書き）", type: "repeatableList" },
          { key: "bestOne", label: "一番心に残った作品", type: "text" },
          { key: "recommendFor", label: "こんな人におすすめ", type: "text" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "写真", type: "photo" },
          { key: "title", label: "作品名", type: "text" },
          { key: "spoiler", label: "ネタバレの有無", type: "text", placeholder: "例：ネタバレなし" },
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
          { key: "trigger", label: "きっかけ", type: "text", placeholder: "なぜ、やろうと思ったか" },
          { key: "detail", label: "内容", type: "textarea" },
          { key: "effort", label: "工夫した点", type: "textarea" },
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
          { key: "next", label: "次にやりたいこと", type: "text" },
        ],
      },
      {
        id: "C",
        name: "写真メイン型",
        fields: [
          { key: "photo", label: "部屋・道具の写真", type: "photo" },
          { key: "theme", label: "テーマ（1行）", type: "text" },
          { key: "comment", label: "ひとこと", type: "text" },
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
          { key: "feeling", label: "その時の気持ち", type: "textarea" },
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
// ===== プレビュー画面で、それっぽく見せるための、サンプル入力データ（ジャンルID → レイアウトID → フィールドキー → 値） =====
export const TEMPLATE_SAMPLE_DATA: Record<string, Record<string, Record<string, any>>> = {
  business: {
    A: {
      action: "副業として、ハンドメイド作品の、販売を、始めてみた",
      learning: "写真の、撮り方一つで、見え方が、全然、違うことに、気づいた",
      struggle: "最初の、1週間は、まったく、反応が、なくて、心が、折れそうになった",
      next: "写真を、撮り直して、説明文も、見直してみたい",
      result: "少しずつ、見てくれる人が、増えてきた",
    },
    B: {
      theme: "8月の、副業、まとめ",
      activities: ["ハンドメイド作品を、3点、出品", "SNSでの、発信を、開始", "梱包資材を、見直した"],
      insight: "地道な、積み重ねが、大事だと、実感。焦らず、続けたい。",
      privacyNote: "具体的な、収益額の、公開は、控えめにしています",
    },
    C: {
      action: "新しく作った、作品を、初めて、出品",
      feel: "初めて、コメントを、もらえて、嬉しかった",
    },
  },
  money: {
    A: {
      theme: "〇〇株、買い増し",
      action: "含み損が、出ていたが、追加で、購入した",
      reason: "業績自体は、悪くないと、判断し、下がったタイミングで、買い増す方針だったため",
      feeling: "少し、不安だったが、事前に、決めていた、ルール通りに、動けた",
      reflection: "感情に、流されず、決めていた、ルールを、守れたのは、良かった",
    },
    B: {
      theme: "8月の、資産、まとめ",
      breakdown: ["国内株式", "投資信託（積立NISA）", "普通預金"],
      impression: "先月より、投資信託の、比率を、少し、増やした。無理のない、範囲で、続けたい。",
      privacyNote: "具体的な、金額の、公開は、控えめにしています",
    },
    C: {
      theme: "今月の、資産推移グラフ",
      conclusion: "コツコツ、積み立てるのが、一番、性に合う、と、実感。",
    },
  },
  tech: {
    A: {
      tool: "Claude(AIチャット)",
      forWhom: "長い文章の、要約や、相談ごとを、じっくり、したい人に",
      good: "文章の、読解力が高く、長い、資料を、渡しても、的確に、まとめてくれる。会話も、自然。",
      bad: "画像生成は、できないので、その用途には、向かない。",
      rating: 4,
    },
    B: {
      theme: "AIチャットツール、比較",
      tools: ["ChatGPT：幅広い用途に、強い", "Claude：長文の、読解・要約に、強い", "Gemini：Googleサービスとの、連携が、便利"],
      winner: "Claude",
      reason: "普段、長い文章を、扱うことが、多いので、読解力の、高さが、決め手に、なった。",
    },
    C: {
      toolName: "新しい、メモアプリ",
      comment: "UIが、シンプルで、使いやすそう。しばらく、試してみる。",
    },
  },
  news: {
    A: {
      headline: "〇〇市、新しい公共交通サービスを発表",
      category: "地域・行政",
      whenWhere: "8月24日、〇〇市で",
      lead: "市内の、交通の便が、大きく、改善される見通し",
      summary: "〇〇市が、来年から、新しい、バスの、路線を、増やすと、発表した。高齢者や、子育て世帯の、移動の、負担を、軽くすることが、狙い。",
      opinion: "自分の、住む、地域にも、広がってほしい取り組みだと、感じた。",
      importance: 4,
      source: "https://example.com/news/12345",
    },
    B: {
      theme: "週末に、気になった、ニュース",
      category: "テクノロジー・社会",
      points: ["新しい、AIサービスが、発表された", "電気代の、値上げが、決定", "地元の、お祭りが、3年ぶりに、開催"],
      comment: "特に、電気代の、値上げは、生活に、直結するので、要チェック。",
      sources: ["https://example.com/news/1", "https://example.com/news/2"],
    },
    C: {
      headline: "〇〇の、新商品が、話題に",
      category: "経済",
      comment: "発売前から、SNSで、注目されていた、商品。実際に、見てみたい。",
      source: "https://example.com/news/67890",
    },
  },
  essay: {
    A: {
      trigger: "電車の中で、偶然、目にした、小さな、出来事",
      event: "席を、譲る、少年の、姿を、見かけた",
      feeling: "何気ない、優しさに、心が、温かくなった",
      awareness: "小さな、親切が、周りの、雰囲気を、変える力を、持つと、実感した",
    },
    B: {
      freeText: "今日は、特に、何も、なかった、けれど、こんな、日常も、悪くないと、思えた",
    },
    C: {
      poem: "何気ない、日々の、中にこそ、大切なものが、ある",
    },
  },
  life: {
    A: {
      theme: "キッチンの、収納見直し",
      trigger: "調味料が、いつも、ごちゃごちゃしていて、探すのが、大変だったため",
      detail: "引き出しの中を、仕切りで、区切り、調味料を、種類ごとに、まとめた",
      effort: "使う、頻度が、高いものを、手前に、配置した",
      tips: "100円ショップの、仕切りケースが、意外と、便利だった",
    },
    B: {
      action: "リビングの、収納を、見直した",
      tips: "使う場所の、近くに、収納を、作ると、片付けやすい",
      next: "次は、寝室の、クローゼットも、整理したい",
    },
    C: {
      theme: "新しく、買った、収納ボックス",
      comment: "見た目も、すっきりして、お気に入り",
    },
  },
  entertainment: {
    A: {
      title: "〇〇（映画）",
      spoiler: "ネタバレなし",
      comment: "映像の、美しさに、圧倒された。テンポも、良く、最後まで、飽きずに、観られた。",
      favoritePoint: "主人公の、成長を、描く、シーンが、特に、印象的だった",
      rating: 5,
    },
    B: {
      theme: "8月に、観た作品、まとめ",
      titles: ["〇〇（映画）", "〇〇（ドラマ）", "〇〇（アニメ）"],
      bestOne: "〇〇（映画）",
      recommendFor: "映像美が、好きな人に、おすすめ",
    },
    C: {
      title: "〇〇（映画）",
      spoiler: "ネタバレなし",
      rating: 4,
    },
  },
  beauty: {
    A: {
      item: "保湿クリーム",
      period: "2週間",
      good: "肌が、しっとりする、感覚が、あった",
      bad: "香りが、少し、強めに、感じた",
      rating: 4,
      disclaimer: "個人の、感想であり、効果には、個人差が、あります",
    },
    B: {
      theme: "8月の、スキンケア、まとめ",
      items: ["保湿クリーム", "日焼け止め", "洗顔料"],
      impression: "夏の、間は、特に、保湿を、意識して、使ってみた",
      disclaimer: "個人の、感想であり、効果には、個人差が、あります",
    },
    C: {
      itemName: "新しい、日焼け止め",
      disclaimer: "個人の、感想であり、効果には、個人差が、あります",
    },
  },
  study: {
    A: {
      learned: "英語の、過去完了形について、学んだ",
      material: "文法書、第5章",
      studyTime: "1時間30分",
      reflection: "問題演習の、正答率は、6割ほど。間違えた、箇所は、明日、復習したい。",
    },
    B: {
      progressChecklist: ["単語帳、1周", "リスニング、30分", "過去問、1年分"],
      insight: "朝の、時間帯の方が、集中できると、気づいた",
      nextGoal: "明日は、過去問を、もう1年分、解く",
    },
    C: {
      learned: "リスニングの、コツを、掴めてきた",
      achievement: 3,
    },
  },
  relationship: {
    A: {
      event: "友人と、久しぶりに、話す、機会が、あり、悩みを、打ち明けられた",
      feeling: "力に、なりたいと、思う、反面、どう、声をかけて良いか、分からず、戸惑った",
      learning: "無理に、解決しようとせず、話を、聞くことが、一番の、支えになると、気づいた",
      privacyNote: "相手を、特定できる、名前・場所・職業などは、書かないのが、安心です",
    },
    B: {
      trigger: "些細な、すれ違いから、少し、気まずい、空気になった",
      event: "後日、思い切って、自分の、気持ちを、伝えてみた",
      awareness: "早めに、素直に、伝えることの、大切さを、実感した",
      privacyNote: "相手を、特定できる、名前・場所・職業などは、書かないのが、安心です",
    },
    C: {
      comment: "何気ない、日常の、一コマが、実は、一番、大切だと、感じた瞬間",
      privacyNote: "相手を、特定できる、名前・場所・職業などは、書かないのが、安心です",
    },
  },
  travel: {
    A: {
      place: "京都",
      schedule: "8月20日〜22日（2泊3日）",
      cost: "約5万円",
      bestSpot: "嵐山の、竹林の道",
      highlight: "早朝の、嵐山は、人が、少なく、静かで、とても、良かった。",
      nextTime: "次は、紅葉の、季節に、行ってみたい",
    },
    B: {
      costBreakdown: ["交通費：2万円", "宿泊費：2万円", "食費・観光：1万円"],
      packingList: ["歩きやすい靴", "モバイルバッテリー", "折りたたみ傘"],
      goodToBring: "モバイルバッテリーは、写真を撮り続けて、大活躍だった",
      lesson: "歩く距離が、思ったより、多かったので、靴選びは、大事だと、実感",
    },
    C: {
      place: "嵐山、竹林の道",
      schedule: "8月21日、早朝",
      note: "朝の、光が、差し込んで、幻想的だった",
    },
  },
  recipe: {
    A: {
      dishName: "豚肉と、キャベツの、炒め物",
      ingredients: "（2人分）豚バラ肉 200g、キャベツ 1/4玉、卵 2個、醤油 大さじ2",
      steps: "1. 野菜を切る\n2. 豚肉を炒める\n3. 野菜を加えて炒める\n4. 卵でとじる",
      time: "20分",
      story: "冷蔵庫に、余っていた、食材で、作った、思い出の、一品",
      arrangement: "豚肉は、鶏肉でも、代用できます",
    },
    B: {
      ingredients: ["豚バラ肉 200g", "キャベツ 1/4玉", "卵 2個"],
      steps: ["野菜を切る", "炒める", "卵でとじる"],
      tips: "強火で、一気に、炒めるのが、ポイント",
      comment: "思ったより、簡単で、また、作りたい",
    },
    C: {
      ingredients: "豚バラ肉、キャベツ、卵、醤油",
      steps: "炒めて、卵でとじるだけの、簡単レシピ",
      comment: "見た目より、あっさりしていて、美味しかった",
    },
  },
};
// ===== サンプルデータを、取り出す（見つからなければ、空を返す） =====
export const getSampleData = (genreId: string, layoutId: "A" | "B" | "C") => {
  return TEMPLATE_SAMPLE_DATA[genreId]?.[layoutId] || {};
};