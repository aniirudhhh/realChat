import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase, User } from '../../src/config/supabase';
import { useTheme } from '../../src/context/ThemeContext';

export default function AppLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasCheckedProfile = useRef(false);
  const { colors } = useTheme();

  useEffect(() => {
    const checkProfile = async () => {
      const currentRoute = segments[segments.length - 1];
      console.log('AppLayout Effect:', { currentRoute, hasChecked: hasCheckedProfile.current });
      
      // Skip if already on setup-profile or already checked
      if (currentRoute === 'setup-profile' || hasCheckedProfile.current) {
        setChecking(false);
        return;
      }

      try {
        // Get current user from Supabase
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.log('No user in session');
          setChecking(false);
          return;
        }

        console.log('Checking profile for user:', user.id);

        // Check if user has completed profile
        const { data: userData, error: fetchError } = await supabase
          .from('users')
          .select('username, is_profile_complete')
          .eq('id', user.id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.log('Error fetching profile:', fetchError);
        }

        console.log('Profile data from DB:', userData);
        hasCheckedProfile.current = true;

        if (!userData || !userData.username || !userData.is_profile_complete) {
          console.log('Profile incomplete, redirecting to setup. Details:', {
            hasData: !!userData,
            username: userData?.username,
            isComplete: userData?.is_profile_complete
          });
          router.replace('/(app)/setup-profile');
        } else {
          console.log('Profile complete');
        }
      } catch (e: any) {
        console.error('Profile check error:', e);
        setError(e.message);
      } finally {
        setChecking(false);
      }
    };

    const timer = setTimeout(checkProfile, 200);
    return () => clearTimeout(timer);
  }, [segments]);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.textMuted, marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 10, textAlign: 'center' }}>
          Something went wrong
        </Text>
        <Text style={{ color: colors.textMuted, marginBottom: 20, textAlign: 'center' }}>
          {error}
        </Text>
        <TouchableOpacity 
          onPress={() => {
            hasCheckedProfile.current = false;
            setError(null);
            setChecking(true);
          }} 
          style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 8 }}
        >
          <Text style={{ color: 'white' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
        animationDuration: 200,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="chat/[id]" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="profile" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="setup-profile" 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
        }} 
      />
      <Stack.Screen 
        name="new-chat" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
