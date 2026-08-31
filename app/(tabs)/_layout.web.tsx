// ===== ここからWeb版専用ファイル =====
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import WebSidebar from "../../components/WebSidebar";

// ===== ここからWeb版専用：モバイルブラウザ判定のしきい値 =====
const MOBILE_BREAKPOINT = 768;
// ===== ここまでWeb版専用 =====
// ===== サイドバーの、折りたたみ時・展開時の幅と同じ値。中身と重ならないよう、左に余白として使う =====
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_EXPANDED_TOTAL_WIDTH = 200;

// ===== ここからWeb版専用：タブの名前とアイコンの対応（下タブバー用） =====
const MOBILE_TAB_ITEMS = [
  { name: "index", icon: "home" as const },
  { name: "explore", icon: "search" as const },
  { name: "post", icon: "add-box" as const },
  { name: "notifications", icon: "favorite" as const },
  { name: "profile", icon: "person" as const },
];
// ===== ここまでWeb版専用 =====

// ===== ここからWeb版専用：スマホブラウザ幅のときに使う、画面下部のタブバー =====
function MobileBottomTabBar({ state, navigation }: any) {
  const activeRouteName = state.routes[state.index].name;
  return (
    <View style={styles.mobileTabBar}>
      {MOBILE_TAB_ITEMS.map((item) => {
        const isActive = activeRouteName === item.name;
        return (
          <TouchableOpacity
            key={item.name}
            style={styles.mobileTabItem}
            onPress={() => navigation.navigate(item.name)}
          >
            <MaterialIcons
              name={item.icon}
              size={24}
              color={isActive ? "#222" : "#999"}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
// ===== ここまでWeb版専用 =====

function FloatingChatButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.floatingChatButton}
      onPress={() => router.push("/chat")}
    >
      <Text style={styles.floatingChatLabel}>チャット</Text>
      <MaterialIcons name="send" size={20} color="#222" />
    </TouchableOpacity>
  );
}

export default function WebTabLayout() {
  // ===== ここからWeb版専用：画面幅に応じたレイアウト切り替え =====
  const { width } = useWindowDimensions();
  const isMobileWidth = width < MOBILE_BREAKPOINT;
  // ===== ここまでWeb版専用 =====
  // ===== サイドバーが、展開されているかどうか（展開時は、中身の余白も広げて、重ならないようにする） =====
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // ===== paddingLeftを、急に変えるのではなく、なめらかに、アニメーションさせる（Tabsの再マウントを防ぐため） =====
  const paddingAnim = useRef(new Animated.Value(SIDEBAR_COLLAPSED_WIDTH)).current;
  useEffect(() => {
    Animated.timing(paddingAnim, {
      toValue: isSidebarExpanded ? SIDEBAR_EXPANDED_TOTAL_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isSidebarExpanded]);
  return (
    <View style={isMobileWidth ? styles.rootColumn : styles.rootRow}>
      {/* ===== ここからWeb版専用：共通サイドバー（幅が狭いときは、自動的に非表示になる） ===== */}
      <WebSidebar onExpandChange={setIsSidebarExpanded} />
      {/* ===== ここまでWeb版専用 ===== */}
      <Animated.View
        style={[
          styles.tabsContent,
          !isMobileWidth && { paddingLeft: paddingAnim },
        ]}
      >
        <Tabs
          tabBar={(props) => (isMobileWidth ? <MobileBottomTabBar {...props} /> : null)}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="explore" />
          <Tabs.Screen name="post" />
          <Tabs.Screen name="notifications" />
          <Tabs.Screen name="profile" />
          <Tabs.Screen name="publishedList" options={{ href: null }} />
        </Tabs>
      </Animated.View>
      {/* ===== ここからWeb版専用（スマホ幅のときは、右上ボタンを出さない） ===== */}
      {!isMobileWidth && <FloatingChatButton />}
      {/* ===== ここまでWeb版専用 ===== */}
    </View>
  );
}

const styles = StyleSheet.create({
  rootRow: {
    flex: 1,
    flexDirection: "row",
  },
  // ===== ここからWeb版専用：スマホ幅のときの全体レイアウト =====
  rootColumn: {
    flex: 1,
  },
  // ===== ここまでWeb版専用 =====
  tabsContent: {
    flex: 1,
  },
  // ===== ここからWeb版専用：スマホ幅の下タブバーのスタイル =====
  mobileTabBar: {
    position: "fixed" as any,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    height: 56,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
    zIndex: 10,
  },
  mobileTabItem: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // ===== ここまでWeb版専用 =====
  floatingChatButton: {
    position: "fixed" as any,
    top: 20,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  floatingChatLabel: {
    fontSize: 14,
    color: "#222",
    fontWeight: "600",
  },
});
// ===== ここまでWeb版専用ファイル =====