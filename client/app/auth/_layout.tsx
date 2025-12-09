import { Stack } from 'expo-router';
import { useTheme } from '../../src/context/ThemeContext';

export default function AuthLayout() {
  const { colors } = useTheme();
  
  return (
    <Stack screenOptions={{ 
      headerShown: false,
      contentStyle: { backgroundColor: colors.background },
      animation: 'fade',
      animationDuration: 200,
    }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
