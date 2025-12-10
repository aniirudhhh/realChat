import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

// Light Theme Colors
const LIGHT_COLORS = {
  background: '#e9ecef',
  surface: '#f8f9fa',
  surfaceSecondary: '#dee2e6',
  text: '#212529',
  textSecondary: '#495057',
  textMuted: '#6c757d',
  border: '#ced4da',
  accent: '#3b82f6',
  online: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  inputBackground: '#f8f9fa',
  headerBackground: '#e9ecef',
  bubbleMe: '#3b82f6',
  bubbleOther: '#f8f9fa',
  bubbleTextMe: '#ffffff',
  bubbleTextOther: '#212529',
};

// Dark Theme Colors
const DARK_COLORS = {
  background: '#101010',
  surface: '#343a40',
  surfaceSecondary: '#495057',
  text: '#f8f9fa',
  textSecondary: '#e9ecef',
  textMuted: '#6c757d',
  border: '#495057',
  accent: '#3b82f6',
  online: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  inputBackground: '#1e1e1e',
  headerBackground: '#101010',
  bubbleMe: '#495057',
  bubbleOther: '#343a40',
  bubbleTextMe: '#f8f9fa',
  bubbleTextOther: '#f8f9fa',
};

export type ThemeColors = typeof DARK_COLORS;

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@realchat_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const systemColorScheme = useColorScheme();

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setModeState(savedTheme as ThemeMode);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      }
    };
    loadTheme();
  }, []);

  // Save theme when it changes
  const setMode = async (newMode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
      setModeState(newMode);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  // Determine if dark mode based on mode and system preference
  const isDark = mode === 'system' 
    ? systemColorScheme === 'dark' 
    : mode === 'dark';

  // Get colors based on current theme
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ mode, colors, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Export color constants for reference
export { LIGHT_COLORS, DARK_COLORS };
