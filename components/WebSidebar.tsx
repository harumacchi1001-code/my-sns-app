// ===== ここからWeb版専用：どのページからも使える、共通のサイドバー部品 =====
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { auth, db } from "../firebaseConfig";

const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_EXPANDED_WIDTH = 200;
const MOBILE_BREAKPOINT = 768;
// 一体型：カプセルの右側に伸びる第二パネルの幅
const HOME_SUB_WIDTH = 160;
const SETTINGS_SUB_WIDTH = 210;

const NAV_ITEMS = [
  { name: "index", title: "ホーム", icon: "home" as const, route: "/" },
  { name: "explore", title: "検索", icon: "search" as const, route: "/explore" },
  { name: "post", title: "作成", icon: "add-box" as const, route: "/post" },
  { name: "chat", title: "チャット", icon: "send" as const, route: "/chat" },
  { name: "nooks-list", title: "Nook", icon: "groups" as const, route: "/nooks-list" },
  { name: "notifications", title: "お知らせ", icon: "favorite" as const, route: "/notifications" },
  { name: "profile", title: "プロフィール", icon: "person" as const, route: "/profile" },
];

const SETTINGS_ITEM = {
  name: "settings",
  title: "設定",
  icon: "menu" as const,
  route: "/settings",
};

const SETTINGS_SUB_ITEMS = [
  { key: "followRequests", label: "フォローリクエスト", path: "/follow-requests", showBadge: true },
  { key: "likedPosts", label: "いいねした投稿", path: "/liked-posts" },
  { key: "savedPosts", label: "保存した投稿", path: "/saved-posts" },
  { key: "commentHistory", label: "コメント履歴", path: "/comment-history" },
  { key: "logout", label: "ログアウト", path: null, danger: true },
];

const HOME_SUB_ITEMS = [
  { key: "recommended", label: "おすすめ" },
  { key: "following", label: "フォロー中" },
];

export default function WebSidebar({ onExpandChange }: { onExpandChange?: (expanded: boolean) => void } = {}) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  // 現在のホームのタブ（?tab=...）を読み取る：第二パネルの選択中表示に使う
  const globalParams = useGlobalSearchParams();
  const currentHomeTab = typeof globalParams.tab === "string" ? globalParams.tab : "recommended";
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredItemName, setHoveredItemName] = useState<string | null>(null);
  const [hoveredSubKey, setHoveredSubKey] = useState<string | null>(null);
  const widthAnim = useRef(new Animated.Value(SIDEBAR_COLLAPSED_WIDTH)).current;
  const labelOpacityAnim = useRef(new Animated.Value(0)).current;
  const [showHomeSubMenu, setShowHomeSubMenu] = useState(false);
  const [showSettingsSubMenu, setShowSettingsSubMenu] = useState(false);
  const [followRequestCount, setFollowRequestCount] = useState(0);
  const settingsCloseTimerRef = useRef<any>(null);
  const closeTimerRef = useRef<any>(null);

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

  if (width < MOBILE_BREAKPOINT) {
    return null;
  }

  const handleMouseEnter = () => {
    setIsExpanded(true);
    onExpandChange?.(true);
    Animated.timing(widthAnim, {
      toValue: SIDEBAR_EXPANDED_WIDTH,
      duration: 200,
      useNativeDriver: false,
    }).start();
    Animated.timing(labelOpacityAnim, {
      toValue: 1,
      duration: 220,
      delay: 60,
      useNativeDriver: false,
    }).start();
  };

  const collapseSidebarNow = () => {
    Animated.timing(widthAnim, {
      toValue: SIDEBAR_COLLAPSED_WIDTH,
      duration: 180,
      useNativeDriver: false,
    }).start();
    Animated.timing(labelOpacityAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: false,
    }).start(() => {
      setIsExpanded(false);
      onExpandChange?.(false);
    });
    setHoveredItemName(null);
    setHoveredSubKey(null);
    setShowHomeSubMenu(false);
    setShowSettingsSubMenu(false);
  };

  const handleWholeAreaMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    handleMouseEnter();
  };

  const handleWholeAreaMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      collapseSidebarNow();
    }, 100);
  };

  const handleSelectHomeTab = (tabKey: string) => {
    router.push({ pathname: "/", params: { tab: tabKey } });
  };

  const handleSettingsMouseEnter = () => {
    if (settingsCloseTimerRef.current) {
      clearTimeout(settingsCloseTimerRef.current);
      settingsCloseTimerRef.current = null;
    }
    setShowSettingsSubMenu(true);
  };

  const handleSettingsMouseLeave = () => {
    settingsCloseTimerRef.current = setTimeout(() => {
      setShowSettingsSubMenu(false);
    }, 100);
  };

  const performLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleSelectSettingsItem = (sub: { key: string; path: string | null }) => {
    if (sub.key === "logout") {
      if (Platform.OS === "web") {
        const confirmed = window.confirm("ログアウトしますか？");
        if (confirmed) performLogout();
      }
      return;
    }
    if (sub.path) {
      router.push(sub.path as any);
    }
  };

  const isItemActive = (route: string) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  };

  const renderNavItem = (item: any, options?: { disablePress?: boolean }) => {
    const isActive = isItemActive(item.route);
    const isHovered = hoveredItemName === item.name;
    return (
      <TouchableOpacity
        key={item.name}
        style={[
          styles.navItem,
          isActive && styles.navItemActive,
          !isActive && isHovered && styles.navItemHovered,
        ]}
        onPress={options?.disablePress ? undefined : () => router.push(item.route)}
        {...({
          onMouseEnter: () => {
            setHoveredItemName(item.name);
            setShowHomeSubMenu(item.name === "index");
          },
          onMouseLeave: () => setHoveredItemName(null),
        } as any)}
      >
        <View style={styles.iconWrapper}>
          <MaterialIcons
            name={item.icon}
            size={22}
            color={isActive || isHovered ? "#ffffff" : "rgba(255,255,255,0.55)"}
          />
        </View>
        {isExpanded && (
          <Animated.Text
            style={[
              styles.navLabel,
              { opacity: labelOpacityAnim },
              (isActive || isHovered) && styles.navLabelEmphasis,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Animated.Text>
        )}
      </TouchableOpacity>
    );
  };

  // ===== 第二パネル：設定が優先、なければホーム =====
  const activeSub: "settings" | "home" | null =
    isExpanded && showSettingsSubMenu ? "settings" : isExpanded && showHomeSubMenu ? "home" : null;
  const subWidth = activeSub === "settings" ? SETTINGS_SUB_WIDTH : activeSub === "home" ? HOME_SUB_WIDTH : 0;

  const renderSubItem = (opts: {
    key: string;
    label: string;
    selected: boolean;
    danger?: boolean;
    badge?: number;
    onPress: () => void;
  }) => {
    const isHovered = hoveredSubKey === opts.key;
    return (
      <TouchableOpacity
        key={opts.key}
        style={[
          styles.subItem,
          opts.selected && styles.navItemActive,
          !opts.selected && isHovered && styles.navItemHovered,
        ]}
        onPress={opts.onPress}
        {...({
          onMouseEnter: () => setHoveredSubKey(opts.key),
          onMouseLeave: () => setHoveredSubKey(null),
        } as any)}
      >
        <Text
          style={[
            styles.subItemText,
            (opts.selected || isHovered) && styles.subItemTextEmphasis,
            opts.danger && styles.subItemTextDanger,
          ]}
          numberOfLines={1}
        >
          {opts.label}
        </Text>
        {!!opts.badge && opts.badge > 0 && (
          <View style={styles.subItemBadge}>
            <Text style={styles.subItemBadgeText}>{opts.badge > 99 ? "99+" : opts.badge}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.wholeAreaWrapper,
        { width: isExpanded ? SIDEBAR_EXPANDED_WIDTH + subWidth : SIDEBAR_COLLAPSED_WIDTH },
      ]}
      {...({
        onMouseEnter: handleWholeAreaMouseEnter,
        onMouseLeave: handleWholeAreaMouseLeave,
      } as any)}
    >
      {/* ===== ここからWeb版専用：ナビゲーション＋第二パネルを、1つの連続したガラスのカプセルにまとめる ===== */}
      <View style={styles.sidebarColumn}>
        <Animated.View style={[styles.navColumn, { width: widthAnim }]}>
          <View style={styles.topNavGroup}>
            <View style={styles.logoWrapper}>
              <Image
                source={require("../assets/images/logo.png")}
                style={{ width: 28, height: 28 }}
                resizeMode="contain"
              />
            </View>
            {NAV_ITEMS.map((item) => renderNavItem(item))}
          </View>
          <View
            {...({
              onMouseEnter: handleSettingsMouseEnter,
              onMouseLeave: handleSettingsMouseLeave,
            } as any)}
          >
            {renderNavItem(SETTINGS_ITEM, { disablePress: true })}
          </View>
        </Animated.View>

        {activeSub === "settings" && (
          <View
            style={[styles.subPanel, styles.subPanelBottom, { width: SETTINGS_SUB_WIDTH }]}
            {...({
              onMouseEnter: () => {
                handleWholeAreaMouseEnter();
                handleSettingsMouseEnter();
              },
              onMouseLeave: () => {
                handleWholeAreaMouseLeave();
                handleSettingsMouseLeave();
              },
            } as any)}
          >
            {SETTINGS_SUB_ITEMS.map((sub) =>
              renderSubItem({
                key: sub.key,
                label: sub.label,
                selected: !!sub.path && pathname.startsWith(sub.path),
                danger: (sub as any).danger,
                badge: sub.showBadge ? followRequestCount : undefined,
                onPress: () => handleSelectSettingsItem(sub),
              })
            )}
          </View>
        )}

        {activeSub === "home" && (
          <View style={[styles.subPanel, styles.subPanelTop, { width: HOME_SUB_WIDTH }]}>
            {HOME_SUB_ITEMS.map((sub) =>
              renderSubItem({
                key: sub.key,
                label: sub.label,
                selected: pathname === "/" && currentHomeTab === sub.key,
                onPress: () => handleSelectHomeTab(sub.key),
              })
            )}
          </View>
        )}
      </View>
      {/* ===== ここまでWeb版専用 ===== */}
    </View>
  );
}

const styles = StyleSheet.create({
  wholeAreaWrapper: {
    position: "fixed" as any,
    top: 16,
    left: 16,
    bottom: 16,
    zIndex: 10,
  },
  // ===== ここからWeb版専用：ナビゲーション＋第二パネルをまとめる、1つのガラスのカプセル =====
  sidebarColumn: Platform.select({
    web: {
      position: "absolute" as any,
      top: 0,
      left: 0,
      bottom: 0,
      flexDirection: "row",
      borderRadius: 32,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      backgroundColor: "rgba(20,20,26,0.55)",
      backdropFilter: "blur(28px) saturate(180%)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      overflow: "hidden",
    } as any,
    default: {
      position: "absolute" as any,
      top: 0,
      left: 0,
      bottom: 0,
      flexDirection: "row",
      borderRightWidth: 1,
      borderRightColor: "#333",
      backgroundColor: "#12172a",
      overflow: "hidden",
    },
  }),
  // カプセルの左側（アイコン＋ラベル）の列
  navColumn: {
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  topNavGroup: {
    alignItems: "flex-start",
    width: "100%",
  },
  // ===== ここまでWeb版専用 =====
  logoWrapper: {
    height: 44,
    width: SIDEBAR_COLLAPSED_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 22,
    marginBottom: 6,
    width: "100%",
    ...(Platform.OS === "web" ? ({ transition: "all 0.18s ease" } as any) : {}),
  },
  navItemActive: Platform.select({
    web: {
      backgroundColor: "rgba(255,255,255,0.16)",
      boxShadow:
        "0 3px 10px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.15)",
    } as any,
    default: {
      backgroundColor: "rgba(255,255,255,0.15)",
    },
  }),
  navItemHovered: Platform.select({
    web: {
      backgroundColor: "rgba(255,255,255,0.14)",
      transform: "translateY(-2px)",
      boxShadow:
        "0 6px 14px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.15)",
    } as any,
    default: {
      backgroundColor: "rgba(255,255,255,0.08)",
    },
  }),
  iconWrapper: {
    width: SIDEBAR_COLLAPSED_WIDTH,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  navLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "400",
    paddingRight: 16,
  },
  navLabelEmphasis: {
    color: "#ffffff",
    fontWeight: "700",
  },
  // ===== 第二パネル（カプセルの右側に一体化。背景・枠・影は持たず、左に薄い区切り線だけ） =====
  subPanel: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    marginVertical: 20,
  },
  // ホーム用：ホーム項目と同じ高さから並べる（上の余白 = ロゴ44 + 余白12 - marginVertical分の調整）
  subPanelTop: {
    justifyContent: "flex-start",
    marginTop: 28,
  },
  // 設定用：設定ボタンと同じ高さ（下側）に並べる
  subPanelBottom: {
    justifyContent: "flex-end",
    marginBottom: 16,
  },
  subItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    marginBottom: 4,
    ...(Platform.OS === "web" ? ({ transition: "all 0.18s ease" } as any) : {}),
  },
  subItemText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "400",
  },
  subItemTextEmphasis: {
    color: "#ffffff",
    fontWeight: "700",
  },
  subItemTextDanger: {
    color: "#ff7a7a",
  },
  subItemBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  subItemBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
// ===== ここまでWeb版専用 =====