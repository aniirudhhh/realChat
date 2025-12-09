import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../src/config/supabase";
import { useTheme } from "../../src/context/ThemeContext";

// Color palette
const COLORS = {
  brightSnow: '#f8f9fa',
  platinum: '#e9ecef',
  alabasterGrey: '#dee2e6',
  paleSlate: '#ced4da',
  paleSlate2: '#adb5bd',
  slateGrey: '#6c757d',
  ironGrey: '#495057',
  gunmetal: '#343a40',
  carbonBlack: '#212529',
  accent: '#3b82f6',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const handleAuth = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      if (isSignUp) {
        // Sign Up
        console.log('Signing up with:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          console.error('Sign up error:', error);
          Alert.alert('Sign Up Failed', error.message);
          return;
        }

        if (data.user) {
          console.log('Sign up successful:', data.user.id);
          
          // Create user record in database
          const { error: insertError } = await supabase
            .from('users')
            .insert({
              id: data.user.id,
              phone_number: email, // Using phone_number field for email
              is_online: true,
            });

          if (insertError && !insertError.message.includes('duplicate')) {
            console.log('Error creating user record:', insertError);
          }
          
          // Check if session exists (email confirmation disabled)
          if (data.session) {
            Alert.alert('Success', 'Account created! You are now logged in.');
          } else {
            // Email confirmation is required
            Alert.alert(
              'Check Your Email',
              'We sent a confirmation link to your email. Please confirm your account, then sign in.',
              [{ text: 'OK', onPress: () => setIsSignUp(false) }]
            );
          }
        }
      } else {
        // Sign In
        console.log('Signing in with:', email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('Sign in error:', error);
          Alert.alert('Sign In Failed', error.message);
          return;
        }

        console.log('Sign in successful:', data.user?.id);
        
        // Update user online status
        if (data.user) {
          await supabase
            .from('users')
            .update({ 
              is_online: true,
              last_login_at: new Date().toISOString()
            })
            .eq('id', data.user.id);
        }
      }
      
      // Navigation will be handled by root layout's auth listener
    } catch (error: any) {
      console.error('Error:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const Wrapper = Platform.OS === 'web' ? React.Fragment : TouchableWithoutFeedback;
  const wrapperProps = Platform.OS === 'web' ? {} : { onPress: Keyboard.dismiss };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <Wrapper {...wrapperProps}>
        <View style={styles.inner}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{isSignUp ? 'Create Account' : 'Welcome back'}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {isSignUp ? 'Sign up to get started' : 'Sign in to continue'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email Address</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Enter your email"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
            </View>

            {/* Password */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                secureTextEntry
                placeholder="Enter your password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            </View>

            {/* Auth Button */}
            <Pressable 
              style={[styles.authButton, loading && styles.authButtonDisabled]} 
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.brightSnow} />
              ) : (
                <Text style={styles.authButtonText}>
                  {isSignUp ? 'Sign Up' : 'Sign In'}
                </Text>
              )}
            </Pressable>

            {/* Toggle Sign Up / Sign In */}
            <Pressable 
              style={styles.toggleButton} 
              onPress={() => setIsSignUp(!isSignUp)}
            >
              <Text style={styles.toggleText}>
                {isSignUp 
                  ? 'Already have an account? Sign In' 
                  : "Don't have an account? Sign Up"}
              </Text>
            </Pressable>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerTitle}>Welcome to HeyLo</Text>
            <Text style={styles.footerText}>Where conversations come alive</Text>
          </View>
        </View>
      </Wrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.carbonBlack,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // Header
  header: {
    marginTop: 80,
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: COLORS.brightSnow,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.slateGrey,
  },

  // Form
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.brightSnow,
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: COLORS.gunmetal,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.ironGrey,
  },
  input: {
    color: COLORS.brightSnow,
    fontSize: 16,
  },

  // Auth Button
  authButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  authButtonDisabled: {
    opacity: 0.7,
  },
  authButtonText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: "600",
  },

  // Toggle Button
  toggleButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleText: {
    color: COLORS.accent,
    fontSize: 14,
  },

  // Footer
  footer: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  footerTitle: {
    fontSize: 16,
    color: COLORS.brightSnow,
    fontWeight: '600',
    marginBottom: 4,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.slateGrey,
  },
});
