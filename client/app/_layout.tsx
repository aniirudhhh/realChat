import { useEffect, useState, useRef } from 'react';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { supabase } from '../src/config/supabase';
import { Session } from '@supabase/supabase-js';
import { View, ActivityIndicator } from 'react-native';
import { ToastProvider } from '../src/components/Toast';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

function ThemedRoot() {
  const { colors } = useTheme();
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Slot />
    </View>
  );
}

function RootLayoutContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);
  const { colors } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session?.user?.id || 'null');
      setSession(session);
      setIsReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', session?.user?.id || 'null');
      setSession(session);
      setIsReady(true);
    });

    const timeout = setTimeout(() => {
      console.log('Auth timeout');
      setIsReady(true);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    console.log('Session changed:', session?.user?.id, 'Resetting hasNavigated');
    hasNavigated.current = false;
  }, [session]);

  useEffect(() => {
    console.log('Nav Effect:', {
      isReady,
      hasNavKey: !!navigationState?.key,
      hasNavigated: hasNavigated.current,
      segments,
      userId: session?.user?.id
    });

    if (!isReady || !navigationState?.key || hasNavigated.current) return;
    
    const inAuthGroup = segments[0] === 'auth';
    const inAppGroup = segments[0] === '(app)';
    
    console.log('Nav Check:', { inAuthGroup, inAppGroup, segments });

    if (session && !inAppGroup) {
      console.log('Navigating to /(app)');
      hasNavigated.current = true;
      router.replace('/(app)');
    } else if (!session && !inAuthGroup) {
      console.log('Navigating to /auth/login');
      hasNavigated.current = true;
      router.replace('/auth/login');
    }
  }, [session, isReady, segments, navigationState?.key]);

  if (!isReady || !navigationState?.key) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <ThemedRoot />;
}

import { usePushNotifications } from '../src/hooks/usePushNotifications';

function PushNotificationHandler() {
  usePushNotifications();
  return null;
}

import { useFonts, Lato_400Regular, Lato_700Bold } from '@expo-google-fonts/lato';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lato_400Regular,
    Lato_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <PushNotificationHandler />
        <RootLayoutContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
