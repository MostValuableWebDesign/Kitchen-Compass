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
import { KitchenProvider, useKitchen } from '@/context/KitchenContext';
import OnboardingScreen from '@/components/OnboardingScreen';
import { createScanAccessTokenGetter, SCAN_ACCESS_TOKEN_STORAGE_KEY } from '@/lib/scanAccessToken';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);
const getScanAccessToken = createScanAccessTokenGetter({
  storage: AsyncStorage,
  storageKey: SCAN_ACCESS_TOKEN_STORAGE_KEY,
  domain: process.env.EXPO_PUBLIC_DOMAIN,
});
setAuthTokenGetter(getScanAccessToken);

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { hydrated, onboardingComplete } = useKitchen();
  if (!hydrated) return null;
  if (!onboardingComplete) return <OnboardingScreen />;
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="shopping" options={{ headerShown: false }} />
      <Stack.Screen name="inventory/[id]" options={{ headerShown: false }} />
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
