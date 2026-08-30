// ===== ここからWeb版専用：どのページからも使える、共通のサイドバー部品 =====
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { usePathname, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { auth, db } from "../firebaseConfig";
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_EXPANDED_WIDTH = 200;
const MOBILE_BREAKPOINT = 768;
const SUB_SIDEBAR_WIDTH = 140;
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
export default function WebSidebar() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredItemName, setHoveredItemName] = useState<string | null>(null);
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
    }).start(() => setIsExpanded(false));
    setHoveredItemName(null);
    setShowHomeSubMenu(false);
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
            color={isActive || isHovered ? "#222" : "#555"}
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
  return (
    <View
      style={[
        styles.wholeAreaWrapper,
        { width: isExpanded ? SIDEBAR_EXPANDED_WIDTH + SUB_SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH },
      ]}
      {...({
        onMouseEnter: handleWholeAreaMouseEnter,
        onMouseLeave: handleWholeAreaMouseLeave,
      } as any)}
    >
      {/* ===== ここからWeb版専用：ナビゲーション項目＋設定を、1つの連続した白い箱にまとめる ===== */}
      <Animated.View style={[styles.sidebarColumn, { width: widthAnim }]}>
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
      {/* ===== ここまでWeb版専用 ===== */}
      {showSettingsSubMenu && (
        <View
          style={styles.settingsSubSidebar}
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
          {SETTINGS_SUB_ITEMS.map((sub) => (
            <TouchableOpacity
              key={sub.key}
              style={styles.settingsSubMenuItem}
              onPress={() => handleSelectSettingsItem(sub)}
            >
              <Text
                style={[
                  styles.settingsSubMenuText,
                  sub.danger && styles.settingsSubMenuTextDanger,
                ]}
              >
                {sub.label}
              </Text>
              {sub.showBadge && followRequestCount > 0 && (
                <View style={styles.settingsSubMenuBadge}>
                  <Text style={styles.settingsSubMenuBadgeText}>
                    {followRequestCount > 99 ? "99+" : followRequestCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showHomeSubMenu && (
        <View style={styles.homeSubSidebar}>
          {HOME_SUB_ITEMS.map((sub) => (
            <TouchableOpacity
              key={sub.key}
              style={styles.homeSubMenuItem}
              onPress={() => handleSelectHomeTab(sub.key)}
            >
              <Text style={styles.homeSubMenuText}>{sub.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  wholeAreaWrapper: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 10,
  },
  // ===== ここからWeb版専用：ナビゲーション＋設定をまとめる、1つの白い縦長の箱 =====
  sidebarColumn: {
    position: "absolute" as any,
    top: 0,
    left: 0,
    bottom: 0,
    borderRightWidth: 1,
    borderRightColor: "#eee",
    backgroundColor: "#fff",
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: "flex-start",
    justifyContent: "space-between",
    overflow: "hidden",
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
    borderRadius: 8,
    marginBottom: 6,
    width: "100%",
  },
  navItemActive: {
    backgroundColor: "#f0f0f0",
  },
  navItemHovered: {
    backgroundColor: "#f7f7f7",
  },
  iconWrapper: {
    width: SIDEBAR_COLLAPSED_WIDTH,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  navLabel: {
    fontSize: 14,
    color: "#555",
    fontWeight: "400",
    paddingRight: 16,
  },
  navLabelEmphasis: {
    color: "#222",
    fontWeight: "700",
  },
  homeSubSidebar: {
    position: "absolute" as any,
    left: SIDEBAR_EXPANDED_WIDTH,
    top: 76,
    width: SUB_SIDEBAR_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 30,
  },
  homeSubMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  homeSubMenuText: {
    fontSize: 14,
    color: "#333",
  },
  settingsSubSidebar: {
    position: "fixed" as any,
    left: SIDEBAR_EXPANDED_WIDTH,
    bottom: 20,
    width: 200,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 30,
  },
  settingsSubMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  settingsSubMenuText: {
    fontSize: 14,
    color: "#333",
  },
  settingsSubMenuTextDanger: {
    color: "#e74c3c",
  },
  settingsSubMenuBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsSubMenuBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
// ===== ここまでWeb版専用 =====