import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  FlatList, 
  Image, 
  Alert,
  ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, User } from '../../src/config/supabase';
import { useToast } from '../../src/components/Toast';
import { useTheme } from '../../src/context/ThemeContext';

export default function FriendsListScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [friends, setFriends] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);

      // Get all chats where current user is a participant
      const { data: myChats } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', user.id);

      if (!myChats || myChats.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      const chatIds = myChats.map(c => c.chat_id);

      // Get all other participants in those chats (excluding me)
      const { data: otherParticipants } = await supabase
        .from('chat_participants')
        .select('user_id')
        .in('chat_id', chatIds)
        .neq('user_id', user.id);

      if (!otherParticipants || otherParticipants.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs
      const uniqueUserIds = [...new Set(otherParticipants.map(p => p.user_id))];

      // Fetch user details
      const { data: users } = await supabase
        .from('users')
        .select('*')
        .in('id', uniqueUserIds);

      setFriends(users || []);
    } catch (error) {
      console.error('Error loading friends:', error);
      showToast('Failed to load friends', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUnfriend = async (friend: User) => {
    Alert.alert(
      'Unfriend',
      `Are you sure you want to unfriend ${friend.display_name || friend.username}? This will delete your chat with them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Unfriend', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (!currentUserId) return;

              // Find the chat between me and this friend
              const { data: myChats } = await supabase
                .from('chat_participants')
                .select('chat_id')
                .eq('user_id', currentUserId);

              const { data: theirChats } = await supabase
                .from('chat_participants')
                .select('chat_id')
                .eq('user_id', friend.id);

              if (!myChats || !theirChats) return;

              // Find common chat (1:1 chat between us)
              const myIds = myChats.map(c => c.chat_id);
              const theirIds = theirChats.map(c => c.chat_id);
              const commonChatId = myIds.find(id => theirIds.includes(id));

              if (commonChatId) {
                // Delete messages
                await supabase.from('messages').delete().eq('chat_id', commonChatId);
                // Delete participants
                await supabase.from('chat_participants').delete().eq('chat_id', commonChatId);
                // Delete chat
                await supabase.from('chats').delete().eq('id', commonChatId);
              }

              // Update local state
              setFriends(prev => prev.filter(f => f.id !== friend.id));
              showToast('Friend removed', 'success');
            } catch (error) {
              console.error('Error unfriending:', error);
              showToast('Failed to unfriend', 'error');
            }
          }
        }
      ]
    );
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const renderFriend = ({ item }: { item: User }) => (
    <View style={[styles.friendRow, { backgroundColor: colors.surface }]}>
      <TouchableOpacity 
        style={styles.friendInfo}
        onPress={async () => {
          // Find chat with this friend
          if (!currentUserId) return;
          
          const { data: myChats } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', currentUserId);

          const { data: theirChats } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', item.id);

          if (!myChats || !theirChats) return;

          const myIds = myChats.map(c => c.chat_id);
          const theirIds = theirChats.map(c => c.chat_id);
          const commonChatId = myIds.find(id => theirIds.includes(id));

          if (commonChatId) {
            router.push(`/(app)/chat/${commonChatId}`);
          }
        }}
      >
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>
              {getInitials(item.display_name || item.username)}
            </Text>
          </View>
        )}
        <View style={styles.nameContainer}>
          <Text style={[styles.friendName, { color: colors.text }]}>
            {item.display_name || item.username || 'User'}
          </Text>
          {item.username && (
            <Text style={[styles.friendUsername, { color: colors.textMuted }]}>
              {item.username}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.unfriendButton, { backgroundColor: colors.danger + '20' }]}
        onPress={() => handleUnfriend(item)}
      >
        <Ionicons name="person-remove-outline" size={18} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Your Friends</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No friends yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Start chatting with people to add them as friends!
            </Text>
          </View>
        }
        ListHeaderComponent={
          friends.length > 0 ? (
            <Text style={[styles.countText, { color: colors.textMuted }]}>
              {friends.length} {friends.length === 1 ? 'Friend' : 'Friends'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  list: {
    padding: 16,
  },
  countText: {
    fontSize: 14,
    marginBottom: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nameContainer: {
    marginLeft: 12,
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
  },
  friendUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  unfriendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
