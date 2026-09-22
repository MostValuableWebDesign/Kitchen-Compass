import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { KitchenProvider } from '@/context/KitchenContext';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);
const SCAN_ACCESS_TOKEN_KEY = 'kitchen-compass-scan-access-token-v1';
let scanAccessTokenPromise: Promise<string | null> | null = null;
function getScanAccessToken() {
  if (!scanAccessTokenPromise) {
    scanAccessTokenPromise = AsyncStorage.getItem(SCAN_ACCESS_TOKEN_KEY).then(async (stored) => {
      const storedExpiry = stored ? Number(stored.split('.')[2]) : 0;
      if (stored && Number.isFinite(storedExpiry) && storedExpiry > Date.now() + 60_000) return stored;
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!domain) return null;
      const response = await fetch(`https://${domain}/api/scan/access`, { method: 'POST' });
      if (!response.ok) return null;
      const payload = await response.json() as { accessToken?: string };
      if (!payload.accessToken) return null;
      await AsyncStorage.setItem(SCAN_ACCESS_TOKEN_KEY, payload.accessToken);
      return payload.accessToken;
    }).catch(() => null);
  }
  return scanAccessTokenPromise;
}
setAuthTokenGetter(getScanAccessToken);

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="shopping" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Web previews can keep a native font promise pending even though the
  // browser has a usable fallback. Do not leave the whole app blank there.
  if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KitchenProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </KitchenProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
