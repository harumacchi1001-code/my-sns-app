import { Slot } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import WebSidebar from "../../components/WebSidebar";

// ===== サイドバーの、折りたたみ時の幅と同じ値。中身と重ならないよう、左に余白として使う =====
const MOBILE_BREAKPOINT = 768;
const SIDEBAR_COLLAPSED_WIDTH = 64;

export default function ChatWebLayout() {
  const { width } = useWindowDimensions();
  const isMobileWidth = width < MOBILE_BREAKPOINT;
  return (
    <View style={styles.rootRow}>
      <WebSidebar />
      <View style={[styles.content, !isMobileWidth && { paddingLeft: SIDEBAR_COLLAPSED_WIDTH }]}>
        <Slot />
      </View>
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