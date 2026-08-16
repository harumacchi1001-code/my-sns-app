import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, DocumentData, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

export default function MenuScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;

    const unsubscribe = onSnapshot(doc(db, "users", myUid), (docSnap) => {
      if (docSnap.exists()) {
        const data: DocumentData = docSnap.data();
        setRequestCount((data.followRequests || []).length);
      }
    });

    return unsubscribe;
  }, []);

  const menuItems = [
    { label: t("menu.followRequests"), icon: "person-add", path: "/follow-requests", badge: requestCount },
    { label: t("menu.likedPosts"), icon: "favorite-border", path: "/liked-posts" },
    { label: t("menu.savedPosts"), icon: "bookmark-border", path: "/saved-posts" },
    { label: t("menu.commentHistory"), icon: "chat-bubble-outline", path: "/comment-history" },
  ];

  const handleLogout = () => {
    Alert.alert(t("menu.logoutConfirmTitle"), t("menu.logoutConfirmMessage"), [
      { text: t("menu.logoutCancel"), style: "cancel" },
      {
        text: t("menu.logoutConfirm"),
        style: "destructive",
        onPress: async () => {
          await signOut(auth);
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>{t("menu.backButton")}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("menu.headerTitle")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.menuList}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.path}
            style={styles.menuItem}
            onPress={() => router.push(item.path as any)}
          >
            <MaterialIcons name={item.icon as any} size={22} color="#333" />
            <Text style={styles.menuItemText}>{item.label}</Text>
            {!!item.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
              </View>
            )}
            <MaterialIcons name="chevron-right" size={22} color="#ccc" style={{ marginLeft: item.badge ? 8 : "auto" }} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <MaterialIcons name="logout" size={22} color="#e74c3c" />
          <Text style={[styles.menuItemText, { color: "#e74c3c" }]}>{t("menu.logout")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  backText: {
    color: "#4a90e2",
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  menuList: {
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  menuItemText: {
    fontSize: 15,
    color: "#222",
  },
  badge: {
    marginLeft: "auto",
    backgroundColor: "#e74c3c",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});