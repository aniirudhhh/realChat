import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';

export default function TermsPrivacyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Terms & Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy Policy</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Your privacy is important to us. It is OnlyChats' policy to respect your privacy regarding any information we may collect from you across our application.
          {'\n\n'}
          We only ask for personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent.
          {'\n\n'}
          We only retain collected information for as long as necessary to provide you with your requested service. What data we store, we’ll protect within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure, copying, use or modification.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Terms of Service</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          1. Terms
          {'\n'}
          By accessing OnlyChats, you are agreeing to be bound by these terms of service, all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws.
          {'\n\n'}
          2. Use License
          {'\n'}
          Permission is granted to temporarily download one copy of the materials (information or software) on OnlyChats for personal, non-commercial transitory viewing only.
          {'\n\n'}
          3. Disclaimer
          {'\n'}
          The materials on OnlyChats are provided on an 'as is' basis. OnlyChats makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
        </Text>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  text: {
    fontSize: 14,
    lineHeight: 22,
  },
});
