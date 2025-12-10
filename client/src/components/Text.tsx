// Custom Text component to apply Lato font globally
// We will use this to replace standard Text imports if needed, 
// or I can inject it via 'react-native-global-props' if installed (likely not).
// Minimal approach: Helper Utility to patch default props?
// React Native has removed setCustomText.
// Strategy: I will overwrite `Text` in a global way? No, dangerous.
// I will create `client/src/components/Text.tsx` and export a wrapping Text.
// Then I'll have to replace `import { Text }` with `import { Text } from '@/components/Text'`.
// OR I can use the 'setDefaultProps' trick on the Text component prototype (polyfilled).

import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import React from 'react';

export function Text(props: TextProps) {
  const { style, ...otherProps } = props;
  const fontFamily = StyleSheet.flatten(style)?.fontWeight === 'bold' || StyleSheet.flatten(style)?.fontWeight === '700' 
    ? 'Lato_700Bold' 
    : 'Lato_400Regular';
    
  return <RNText style={[{ fontFamily }, style]} {...otherProps} />;
}
