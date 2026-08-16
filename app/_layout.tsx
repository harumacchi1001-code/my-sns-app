import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from "react-native-gesture-handler";
import 'react-native-reanimated';
import "../i18n";

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup-details" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="profile-edit" options={{ headerShown: false }} />
          <Stack.Screen name="my-card-edit" options={{ headerShown: false }} />
          <Stack.Screen name="discover-users" options={{ headerShown: false }} />
          <Stack.Screen name="discover-posts" options={{ headerShown: false }} />
          <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="insight-detail" options={{ headerShown: false }} />
          <Stack.Screen name="story-create" options={{ headerShown: false }} />
          <Stack.Screen name="story-view" options={{ headerShown: false }} />
          <Stack.Screen name="story-viewers" options={{ headerShown: false }} />
          <Stack.Screen name="chat/index" options={{ headerShown: false }} />
          <Stack.Screen name="chat/new" options={{ headerShown: false }} />
          <Stack.Screen name="chat/share" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]/index" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]/info" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]/add-member" options={{ headerShown: false }} />
          <Stack.Screen name="followers-list" options={{ headerShown: false }} />
          <Stack.Screen name="drafts" options={{ headerShown: false }} />
          <Stack.Screen name="menu" options={{ headerShown: false }} />
          <Stack.Screen name="liked-posts" options={{ headerShown: false }} />
          <Stack.Screen name="saved-posts" options={{ headerShown: false }} />
          <Stack.Screen name="comment-history" options={{ headerShown: false }} />
          <Stack.Screen name="follow-requests" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}