import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/context/ThemeContext';

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const openLink = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open URL:', err));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* FAQ Section */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Frequently Asked Questions</Text>
        
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.question, { color: colors.text }]}>How do I start a new chat?</Text>
          <Text style={[styles.answer, { color: colors.textMuted }]}>
            Tap the "New Chat" button on the home screen and search for a user by their username.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.question, { color: colors.text }]}>How do group chats work?</Text>
          <Text style={[styles.answer, { color: colors.textMuted }]}>
            Select multiple users when creating a new chat. You can name the group and add a photo. Only admins can add new members.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.question, { color: colors.text }]}>Are my messages private?</Text>
          <Text style={[styles.answer, { color: colors.textMuted }]}>
            Yes! Your messages are stored securely. You can also enable auto-delete in chat settings for extra privacy.
          </Text>
        </View>

        {/* Contact Section */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 30 }]}>Contact Us</Text>
        <TouchableOpacity 
          style={[styles.contactRow, { backgroundColor: colors.surface }]}
          onPress={() => openLink('mailto:iaminsanexdev@gmail.com')}
        >
          <Ionicons name="mail-outline" size={22} color={colors.accent} />
          <Text style={[styles.contactText, { color: colors.text }]}>iaminsanexdev@gmail.com</Text>
        </TouchableOpacity>

        {/* About Developer Section */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 30 }]}>Meet the Developer 👨‍💻</Text>
        <View style={[styles.developerCard, { backgroundColor: colors.surface }]}>
          <Image 
            source={require('../../assets/developer-pic.png')} 
            style={styles.developerImage} 
          />
          <View style={styles.developerInfo}>
            <Text style={[styles.developerName, { color: colors.text }]}>Anirudh</Text>
            <Text style={[styles.developerRole, { color: colors.textMuted }]}>Founder & Developer</Text>
            <Text style={[styles.developerBio, { color: colors.textMuted }]}>
              Passionate about building beautiful, privacy-focused apps. OnlyChats is my vision for what messaging should be — simple, secure, and stylish.
            </Text>
          </View>
        </View>

        <View style={styles.socialLinks}>
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.surface }]}
            onPress={() => openLink('https://github.com/aniirudhhh')}
          >
            <Ionicons name="logo-github" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.surface }]}
            onPress={() => openLink('https://x.com/Spoedrrrrrmon')}
          >
            <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.surface }]}
            onPress={() => openLink('https://www.linkedin.com/in/aniirudhhh')}
          >
            <Ionicons name="logo-linkedin" size={24} color="#0A66C2" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Made with ❤️ in India
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
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  question: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  answer: {
    fontSize: 14,
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
  },
  contactText: {
    fontSize: 16,
  },
  developerCard: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
  },
  developerImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  developerInitials: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  developerInfo: {
    flex: 1,
  },
  developerName: {
    fontSize: 18,
    fontWeight: '700',
  },
  developerRole: {
    fontSize: 13,
    marginTop: 2,
  },
  developerBio: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  socialLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  socialButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 14,
  },
});
