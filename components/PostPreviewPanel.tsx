type Props = {
  thumbnail: string | null;
  thumbnailType: "image" | "video";
  title: string;
  hashtags: string[];
  bodyHtml: string;
};

// ===== アプリ版（スマホの実機）では、プレビューパネルは表示しない =====
export default function PostPreviewPanel(_props: Props) {
  return null;
}