import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  dangerColor,
  isWeb,
  pick,
  textMain,
  webGlassBox,
  webScreenBackground,
} from "../components/glass";
import { auth, db } from "../firebaseConfig";

// ===== 設定画面：プロフィール画面の三本線メニューの中身を、独立ページ化したもの =====
type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  path: string;
  danger?: boolean;
  badgeCount?: number;
};

export default function SettingsScreen() {
  const router = useRouter();
  const [followRequestCount, setFollowRequestCount] = useState(0);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      const unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
        if (docSnap.exists()) {
          setFollowRequestCount((docSnap.data().followRequests || []).length);
        }
      });
      return () => unsubscribeUser();
    });
    return () => unsubscribeAuth();
  }, []);

  const performLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleLogout = () => {
    if (isWeb) {
      const confirmed = window.confirm("ログアウトしますか？");
      if (confirmed) {
        performLogout();
      }
      return;
    }
    Alert.alert("ログアウト", "ログアウトしますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: performLogout,
      },
    ]);
  };

  const menuItems: MenuItem[] = [
    {
      key: "followRequests",
      label: "フォローリクエスト",
      icon: "person-add",
      path: "/follow-requests",
      badgeCount: followRequestCount,
    },
    {
      key: "likedPosts",
      label: "いいねした投稿",
      icon: "favorite-border",
      path: "/liked-posts",
    },
    {
      key: "savedPosts",
      label: "保存した投稿",
      icon: "bookmark-border",
      path: "/saved-posts",
    },
    {
      key: "commentHistory",
      label: "コメント履歴",
      icon: "chat-bubble-outline",
      path: "/comment-history",
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.pageWrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>設定</Text>
        </View>
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* ===== Web版：メニューを、1枚のガラスのカードにまとめる（スマホでは枠なし） ===== */}
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.menuItem, isWeb && index === menuItems.length - 1 && styles.menuItemLast]}
                onPress={() => router.push(item.path as any)}
              >
                <MaterialIcons name={item.icon} size={22} color={pick("#ffffff", "#333")} />
                <Text style={styles.menuItemText}>{item.label}</Text>
                {!!item.badgeCount && item.badgeCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {item.badgeCount > 99 ? "99+" : item.badgeCount}
                    </Text>
                  </View>
                )}
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={pick("rgba(255,255,255,0.35)", "#ccc")}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* ===== ログアウトは、別のガラスのカード ===== */}
          <View style={styles.menuCard}>
            <TouchableOpacity style={[styles.menuItem, isWeb && styles.menuItemLast]} onPress={handleLogout}>
              <MaterialIcons name="logout" size={22} color={dangerColor} />
              <Text style={[styles.menuItemText, { color: dangerColor }]}>ログアウト</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    // ===== Web版：暗いオーロラ風の背景 =====
    ...webScreenBackground,
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: pick(0, 0.5),
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: textMain,
  },
  listContent: {
    paddingVertical: 8,
    ...(isWeb ? { paddingHorizontal: 12 } : {}),
  },
  // ===== メニューをまとめる箱：Web版はガラスのカード =====
  menuCard: isWeb
    ? ({
        ...webGlassBox,
        borderRadius: 28,
        overflow: "hidden",
      } as any)
    : {},
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: pick(1, 0.5),
    borderBottomColor: pick("rgba(255,255,255,0.08)", "#f2f2f2"),
  },
  // カードの、いちばん下の項目は、区切り線を出さない（Web版のみ）
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 15,
    color: pick("#ffffff", "#333"),
    flex: 1,
  },
  badge: {
    backgroundColor: "#e74c3c",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  // 区切り：Web版は透明なすき間、スマホは今までの薄い灰色の帯
  divider: {
    height: pick(16, 8),
    backgroundColor: pick("transparent", "#f7f7f7"),
    marginVertical: pick(0, 8),
  },
});