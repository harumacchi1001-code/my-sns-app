import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
const isWeb = Platform.OS === "web";
export type LightboxItem = { url: string; isVideo: boolean };
type Props = {
  visible: boolean;
  items: LightboxItem[];
  startIndex: number;
  onClose: () => void;
};
export default function MediaLightbox({ visible, items, startIndex, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (visible) {
      setCurrentIndex(startIndex);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: startIndex * width, animated: false });
      });
    }
  }, [visible, startIndex, width]);
  const handleDownload = async () => {
    if (!isWeb || downloading) return;
    const current = items[currentIndex];
    if (!current) return;
    setDownloading(true);
    try {
      const response = await fetch(current.url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const extension = current.isVideo ? "mp4" : "jpg";
      link.download = `download_${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.log("ダウンロードエラー:", error);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <TouchableOpacity onPress={onClose} style={styles.lightboxCloseButton}>
          <MaterialIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {isWeb && (
          <TouchableOpacity onPress={handleDownload} style={styles.lightboxDownloadButton} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="download" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(newIndex);
          }}
        >
          {items.map((item, index) => (
            <View key={index} style={{ width, height, justifyContent: "center", alignItems: "center" }}>
              {item.isVideo ? (
                <LightboxVideo url={item.url} width={width} height={height} />
              ) : (
                <Image source={{ uri: item.url }} style={{ width, height }} resizeMode="contain" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
function LightboxVideo({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      style={{ width, height }}
      player={player}
      contentFit="contain"
      nativeControls={true}
      allowsFullscreen={false}
    />
  );
}
const styles = StyleSheet.create({
  lightboxCloseButton: {
    position: "absolute",
    top: 44,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxDownloadButton: {
    position: "absolute",
    top: 44,
    right: 62,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
});