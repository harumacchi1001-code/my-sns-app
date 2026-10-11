// ===== ここからWeb版専用ファイル =====
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import ChatPanel from "../../components/ChatPanel";
import WebSidebar from "../../components/WebSidebar";

// ===== ここからWeb版専用：モバイルブラウザ判定のしきい値 =====
const MOBILE_BREAKPOINT = 768;
// ===== ここまでWeb版専用 =====
// ===== サイドバーの、折りたたみ時・展開時の幅と同じ値。中身と重ならないよう、左に余白として使う =====
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_EXPANDED_TOTAL_WIDTH = 200;

// ===== チャットパネルの、幅の決め方（ブラウザの幅に合わせて変える） =====
const CHAT_PANEL_MIN_WIDTH = 300;
const CHAT_PANEL_MAX_WIDTH = 400;
const CHAT_PANEL_WIDTH_RATIO = 0.28; // ブラウザの幅の28%
const CHAT_PANEL_PUSH_BREAKPOINT = 1100; // この幅以上なら、画面の中身を左に寄せて、重ならないようにする
const CHAT_PANEL_SIDE_MARGIN = 24; // パネルの右の余白
const CHAT_PANEL_CONTENT_GAP = 16; // パネルと、画面の中身との、すき間

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

// ===== 右下の「チャット」ボタン（押すと、メッセージのパネルが開く） =====
function FloatingChatButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.floatingChatButton} onPress={onPress}>
      <Text style={styles.floatingChatLabel}>チャット</Text>
      <MaterialIcons name="send" size={18} color="#ffffff" />
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

  // ===== チャットパネルの、開閉・幅・画面を寄せる量 =====
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
  const chatPanelWidth = Math.round(
    Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, width * CHAT_PANEL_WIDTH_RATIO))
  );
  // 画面が広いときだけ、中身を左に寄せる（狭いときは、パネルが上に重なる）
  const canPushContent = width >= CHAT_PANEL_PUSH_BREAKPOINT;
  const rightReserve =
    isChatPanelOpen && canPushContent
      ? chatPanelWidth + CHAT_PANEL_SIDE_MARGIN + CHAT_PANEL_CONTENT_GAP
      : 0;
  const paddingRightAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(paddingRightAnim, {
      toValue: rightReserve,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [rightReserve]);

  return (
    <View style={isMobileWidth ? styles.rootColumn : styles.rootRow}>
      {/* ===== ここからWeb版専用：共通サイドバー（幅が狭いときは、自動的に非表示になる） ===== */}
      <WebSidebar onExpandChange={setIsSidebarExpanded} />
      {/* ===== ここまでWeb版専用 ===== */}
      <Animated.View
        style={[
          styles.tabsContent,
          { backgroundColor: "transparent" } as any,
          !isMobileWidth && { paddingLeft: paddingAnim, paddingRight: paddingRightAnim },
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
      {/* ===== ここからWeb版専用（スマホ幅のときは、チャットボタンとパネルを出さない） ===== */}
      {!isMobileWidth && !isChatPanelOpen && (
        <FloatingChatButton onPress={() => setIsChatPanelOpen(true)} />
      )}
      {!isMobileWidth && isChatPanelOpen && (
        <ChatPanel width={chatPanelWidth} onClose={() => setIsChatPanelOpen(false)} />
      )}
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
    backgroundColor: "transparent",
  } as any,
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
  // 右下に置く、ガラス風の「チャット」ボタン
  floatingChatButton: {
    position: "fixed" as any,
    top: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: "rgba(24,26,44,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    zIndex: 20,
    ...({
      backdropFilter: "blur(24px) saturate(180%)",
      boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
    } as any),
  },
  floatingChatLabel: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "700",
  },
    panel: {
    position: "fixed" as any,
    top: 24,
    right: 24,
    },
});
// ===== ここまでWeb版専用ファイル =====