import { useVideoPlayer, VideoView } from "expo-video";
import { Image, StyleSheet, View } from "react-native";

type Props = {
  url?: string | null;
  mediaType?: "image" | "video" | null;
  style: any;
};

export default function PostThumbnail({ url, mediaType, style }: Props) {
  if (!url) {
    return <View style={[style, styles.placeholder]} />;
  }

  if (mediaType === "video") {
    return <VideoThumbnail url={url} style={style} />;
  }

  return <Image source={{ uri: url }} style={style} />;
}

// ===== 動画を、自動再生・ループ・消音で表示する部品 =====
function VideoThumbnail({ url, style }: { url: string; style: any }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      style={style}
      player={player}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#f0f0f0",
  },
});