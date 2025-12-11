import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, StatusBar, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, User } from '../../src/config/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface ChatWithDetails {
  id: string;
  created_at: string;
  updated_at: string;
  other_user: User | null;
  last_message?: {
    text: string;
    created_at: string;
  };
}

export default function RequestsScreen() {
  const [requests, setRequests] = useState<ChatWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get chats where I am a participant
      const { data: participantData } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', user.id);

      if (!participantData || participantData.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      const chatIds = participantData.map(p => p.chat_id);

      // Fetch chats that are 'request' and NOT created by me
      const { data: chats } = await supabase
        .from('chats')
        .select('*')
        .in('id', chatIds)
        .eq('status', 'request')
        .neq('created_by', user.id); // Only requests sent TO me

      if (!chats || chats.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      // Enhance with details
      const detailedRequests = await Promise.all(chats.map(async (chat) => {
        // Other participant
        const { data: otherParticipant } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('chat_id', chat.id)
          .neq('user_id', user.id)
          .single();

        let otherUser = null;
        if (otherParticipant) {
           const { data } = await supabase.from('users').select('*').eq('id', otherParticipant.user_id).single();
           otherUser = data;
        }

        // Last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('text, created_at')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...chat,
          other_user: otherUser,
          last_message: lastMessage
        };
      }));

      // Only show requests that have a message (ignore empty shells)
      const validRequests = detailedRequests.filter(r => r.last_message);
      setRequests(validRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = dayjs();
    const msgDate = dayjs(d);
    
    if (now.isSame(msgDate, 'day')) {
      return msgDate.format('h:mm A');
    } else if (now.diff(msgDate, 'day') === 1) {
      return 'Yesterday';
    } else {
      return msgDate.format('MMM D');
    }
  };

  const renderItem = ({ item }: { item: ChatWithDetails }) => (
    <TouchableOpacity
      style={[styles.chatItem, { borderBottomColor: colors.border }]}
      onPress={() => router.push(`/(app)/chat/${item.id}`)}
    >
      <View style={styles.avatarContainer}>
          {item.other_user?.photo_url ? (
            <Image source={{ uri: item.other_user.photo_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.avatarText, { color: colors.text }]}>{getInitials(item.other_user?.display_name)}</Text>
            </View>
          )}
      </View>
      <View style={styles.chatInfo}>
         <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.userName, { color: colors.text }]}>{item.other_user?.display_name || 'User'}</Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(item.last_message?.created_at)}</Text>
         </View>
         <Text style={[styles.lastMessage, { color: colors.textMuted }]} numberOfLines={1}>
            {item.last_message?.text || 'Sent an attachment'}
         </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
       <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
       <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.headerBackground }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 15 }}>
             <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Message Requests</Text>
       </View>

       {loading ? (
         <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.accent} />
         </View>
       ) : (
         <FlatList
            data={requests}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            ListEmptyComponent={
               <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 }}>
                  <Text style={{ color: colors.textMuted }}>No pending requests</Text>
               </View>
            }
         />
       )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    alignItems: 'center'
  },
  avatarContainer: { marginRight: 12 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { fontSize: 16, fontWeight: 'bold' },
  chatInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  lastMessage: { fontSize: 14 },
  time: { fontSize: 12 },
});
