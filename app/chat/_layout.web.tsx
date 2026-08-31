import { Slot } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import WebSidebar from "../../components/WebSidebar";

// ===== サイドバーの、折りたたみ時・展開時の幅と同じ値。中身と重ならないよう、左に余白として使う =====
const MOBILE_BREAKPOINT = 768;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_EXPANDED_TOTAL_WIDTH = 200;

export default function ChatWebLayout() {
  const { width } = useWindowDimensions();
  const isMobileWidth = width < MOBILE_BREAKPOINT;
  // ===== サイドバーが、展開されているかどうか（展開時は、中身の余白も広げて、重ならないようにする） =====
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // ===== paddingLeftを、急に変えるのではなく、なめらかに、アニメーションさせる（再マウントを防ぐため） =====
  const paddingAnim = useRef(new Animated.Value(SIDEBAR_COLLAPSED_WIDTH)).current;
  useEffect(() => {
    Animated.timing(paddingAnim, {
      toValue: isSidebarExpanded ? SIDEBAR_EXPANDED_TOTAL_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isSidebarExpanded]);
  return (
    <View style={styles.rootRow}>
      <WebSidebar onExpandChange={setIsSidebarExpanded} />
      <Animated.View style={[styles.content, !isMobileWidth && { paddingLeft: paddingAnim }]}>
        <Slot />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootRow: {
    flex: 1,
    flexDirection: "row",
  },
  content: {
    flex: 1,
  },
});