import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { arrayUnion, collection, doc, DocumentData, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
const STORY_DURATION_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
export default function StoryViewScreen() {
  const router = useRouter();
  const { authorId } = useLocalSearchParams<{ authorId: string }>();
  const [stories, setStories] = useState<DocumentData[]>([]);
  const [author, setAuthor] = useState<DocumentData | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    const loadStories = async () => {
      if (!authorId) return;
      const q = query(collection(db, "stories"), where("authorId", "==", authorId));
      const snapshot = await getDocs(q);
      const now = Date.now();
      const active = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((s: any) => {
          const createdMs = s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0;
          return now - createdMs < DAY_MS;
        })
        .sort((a: any, b: any) => {
          const aT = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bT = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return aT - bT;
        });
      setStories(active);
      setLoading(false);
      const authorQuery = query(collection(db, "users"), where("__name__", "==", authorId));
      const authorSnap = await getDocs(authorQuery);
      if (!authorSnap.empty) {
        setAuthor({ id: authorSnap.docs[0].id, ...authorSnap.docs[0].data() });
      }
    };
    loadStories();
  }, [authorId]);
  const currentStory = stories[index];

  // ===== 動画再生用の、プレーヤーを準備する =====
  // （写真のときは、videoSourceがnullになり、プレーヤーは何もしない）
  const videoSource = currentStory?.mediaType === "video" ? currentStory.mediaUrl : null;
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    // Web版のブラウザは、音声付き動画の自動再生を、ブロックすることがあるため、
    // 消音にしてから、自動再生する
    p.muted = true;
    if (videoSource) {
      p.play();
    }
  });

  // ===== 開いたストーリーを、見た記録として残す =====
  useEffect(() => {
    const recordView = async () => {
      const myUid = auth.currentUser?.uid;
      if (!myUid || !currentStory) return;
      const viewedBy: string[] = currentStory.viewedBy || [];
      if (!viewedBy.includes(myUid)) {
        await updateDoc(doc(db, "stories", currentStory.id), {
          viewedBy: arrayUnion(myUid),
        });
      }
    };
    recordView();
  }, [currentStory?.id]);

  const goNext = () => {
    if (index < stories.length - 1) {
      setIndex((prev) => prev + 1);
    } else {
      router.back();
    }
  };
  const goPrev = () => {
    if (index > 0) {
      setIndex((prev) => prev - 1);
    } else {
      router.back();
    }
  };

  // ===== 写真のときだけ、5秒固定の、進み具合バーのタイマーを動かす =====
  useEffect(() => {
    if (!currentStory || currentStory.mediaType === "video") return;

    setProgress(0);
    startTimeRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const ratio = Math.min(elapsed / STORY_DURATION_MS, 1);
      setProgress(ratio);

      if (ratio >= 1) {
        goNext();
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [index, currentStory?.id, currentStory?.mediaType]);

  // ===== 動画のときは、動画自体の再生位置を使って、進み具合バーを動かす =====
  useEffect(() => {
    if (!currentStory || currentStory.mediaType !== "video") return;

    setProgress(0);

    const endSubscription = player.addListener("playToEnd", () => {
      goNext();
    });

    const progressTimer = setInterval(() => {
      if (player.duration > 0) {
        setProgress(Math.min(player.currentTime / player.duration, 1));
      }
    }, 100);

    return () => {
      endSubscription.remove();
      clearInterval(progressTimer);
    };
  }, [currentStory?.id, currentStory?.mediaType]);

  const goToViewersList = () => {
    if (!currentStory) return;
    router.push({ pathname: "/story-viewers", params: { storyId: currentStory.id } });
  };
  const isMyStory = authorId === auth.currentUser?.uid;
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  if (!currentStory) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>表示できるストーリーがありません</Text>
          <TouchableOpacity style={styles.closeTextButton} onPress={() => router.back()}>
            <Text style={styles.closeTextButtonLabel}>閉じる</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        {/* 進み具合バー */}
        <View style={styles.progressRow}>
          {stories.map((_, i) => (
            <View key={i} style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width:
                      i < index ? "100%" : i === index ? `${progress * 100}%` : "0%",
                  },
                ]}
              />
            </View>
          ))}
        </View>
        {/* ヘッダー */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {author?.photoUrl ? (
              <Image source={{ uri: author.photoUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={{ fontSize: 12 }}>👤</Text>
              </View>
            )}
            <Text style={styles.headerUsername}>
              {author?.handle || author?.username || "unknown"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* メディア表示 */}
        <View style={styles.mediaArea}>
          {currentStory.mediaType === "image" ? (
            <Image source={{ uri: currentStory.mediaUrl }} style={styles.media} />
          ) : (
            <VideoView
              key={currentStory.id}
              style={styles.media}
              player={player}
              contentFit="contain"
              nativeControls={false}
            />
          )}
          {/* 左右のタップゾーン */}
          <View style={styles.tapZoneRow} pointerEvents="box-none">
            <TouchableOpacity style={styles.tapZone} activeOpacity={1} onPress={goPrev} />
            <TouchableOpacity style={styles.tapZone} activeOpacity={1} onPress={goNext} />
          </View>
        </View>
        {/* 自分のストーリーのときだけ、閲覧者ボタンを表示 */}
        {isMyStory && (
          <TouchableOpacity style={styles.viewersButton} onPress={goToViewersList}>
            <MaterialIcons name="visibility" size={18} color="#fff" />
            <Text style={styles.viewersButtonText}>
              {(currentStory.viewedBy || []).length}人が閲覧
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  pageWrapper: Platform.select({
    web: {
      flex: 1,
      width: "100%",
      maxWidth: 630,
      alignSelf: "center",
    },
    default: {
      flex: 1,
    },
  }),
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  emptyText: {
    color: "#fff",
    fontSize: 14,
    marginBottom: 16,
  },
  closeTextButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeTextButtonLabel: {
    color: "#4a90e2",
    fontSize: 14,
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#333",
  },
  headerAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  headerUsername: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  mediaArea: {
    flex: 1,
    position: "relative",
  },
  media: {
    flex: 1,
    resizeMode: "contain",
  },
  tapZoneRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  tapZone: {
    flex: 1,
  },
  viewersButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  viewersButtonText: {
    color: "#fff",
    fontSize: 13,
  },
});