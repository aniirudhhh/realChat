import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, User, Chat } from '../../../src/config/supabase';
import { useTheme } from '../../../src/context/ThemeContext';
import { useToast } from '../../../src/components/Toast';

export default function ChatDetailsScreen() {
  const { chatId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [autoDeletePref, setAutoDeletePref] = useState<'off' | 'close' | '24h' | '7d'>('off');

  useEffect(() => {
    loadDetails();
  }, [chatId]);

  const loadDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Chat Settings
      const { data: chatData } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single();
        
      if (chatData) {
        setAutoDeletePref(chatData.auto_delete_preference || 'off');
      }

      // Fetch Other Participant
      const { data: participantData } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chatId)
        .neq('user_id', user.id)
        .single();

      if (participantData) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', participantData.user_id)
          .single();
        setOtherUser(userData);
      }
    } catch (error) {
      console.error('Error loading details:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAutoDelete = async (value: 'off' | 'close' | '24h' | '7d') => {
    // Optimistic update
    const previous = autoDeletePref;
    setAutoDeletePref(value);

    try {
      const { error } = await supabase
        .from('chats')
        .update({ 
          auto_delete_preference: value,
          auto_delete_updated_at: new Date().toISOString()
        })
        .eq('id', chatId);

      if (error) throw error;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Insert System Message
        await supabase.from('messages').insert({
          chat_id: chatId,
          user_id: user.id,
          text: `changed disappearing messages to ${value === 'close' ? 'Close' : value === 'off' ? 'Off' : value}`,
          type: 'system',
          is_read: false
        });
      }

      showToast('Settings updated', 'success');
    } catch (error) {
      console.error('Error updating settings:', error);
      setAutoDeletePref(previous);
      showToast('Failed to update settings', 'error');
    }
  };

  const Option = ({ label, value, icon }: { label: string, value: 'off' | 'close' | '24h' | '7d', icon: string }) => (
    <TouchableOpacity 
      style={[styles.option, { borderBottomColor: colors.border }]} 
      onPress={() => updateAutoDelete(value)}
    >
      <View style={styles.optionLeft}>
        <Ionicons name={icon as any} size={24} color={colors.text} />
        <Text style={[styles.optionText, { color: colors.text }]}>{label}</Text>
      </View>
      {autoDeletePref === value && (
        <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
             <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                 <Ionicons name="arrow-back" size={24} color={colors.text} />
             </TouchableOpacity>
        </View>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 20 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Contact Info</Text>
            <View style={{ width: 24 }} /> 
        </View>

      <View style={styles.profileSection}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
          {otherUser?.photo_url ? (
            <Image source={{ uri: otherUser.photo_url }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarText, { color: colors.text }]}>
              {otherUser?.display_name?.[0] || 'U'}
            </Text>
          )}
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{otherUser?.display_name || 'User'}</Text>
        <Text style={[styles.username, { color: colors.textMuted }]}>@{otherUser?.username || 'username'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>DISAPPEARING MESSAGES</Text>
        <View style={[styles.optionsContainer, { backgroundColor: colors.surface }]}>
          <Option label="Off" value="off" icon="infinite-outline" />
          <Option label="After Closing Chat" value="close" icon="eye-off-outline" />
          <Option label="24 Hours" value="24h" icon="time-outline" />
          <Option label="7 Days" value="7d" icon="calendar-outline" />
        </View>
        <Text style={[styles.helperText, { color: colors.textMuted }]}>
          {autoDeletePref === 'close' 
            ? "Messages will be deleted from your device after you view them and close the chat screen."
            : "Messages will be automatically deleted for everyone after the selected time period."}
        </Text>
      </View>

    </ScrollView>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {},
  headerTitle: {
      fontSize: 18,
      fontWeight: '600',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 16,
    textTransform: 'uppercase',
  },
  optionsContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: {
    fontSize: 16,
  },
  helperText: {
    marginTop: 8,
    marginLeft: 16,
    fontSize: 13,
  },
});
