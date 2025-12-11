import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  StyleSheet, 
  TextInput,
  StatusBar,
  Image,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, User } from '../../src/config/supabase';
import { useTheme } from '../../src/context/ThemeContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

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
  online: '#22c55e',
};

interface ChatWithDetails {
  id: string;
  created_at: string;
  updated_at: string;
  other_user: User | null;
  unread_count?: number;
  last_message?: {
    text: string;
    created_at: string;
  };
  status?: 'active' | 'request' | 'blocked';
  created_by?: string | null;
  name?: string | null;
  photo_url?: string | null;
  is_group?: boolean;
}

export default function ChatListScreen() {
  const [chats, setChats] = useState<ChatWithDetails[]>([]);
  const [messageRequests, setMessageRequests] = useState<ChatWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [selectedChat, setSelectedChat] = useState<ChatWithDetails | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const typingChannelsRef = useRef<any[]>([]);
  const [activeTab, setActiveTab] = useState<'inbox' | 'requests'>('inbox');

  useEffect(() => {
    loadCurrentUser();
    loadChats();
  }, []);

  // Refresh chats when screen comes into focus (e.g. back from chat)
  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [])
  );

  // Real-time subscription for new chats and messages
  useEffect(() => {
    if (!currentUserId) return;

    console.log('Setting up real-time subscriptions for:', currentUserId);

    // Subscribe to new chat_participants (when someone adds you to a chat)
    const participantsChannel = supabase
      .channel('chat_participants_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_participants',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          console.log('New chat participant added:', payload);
          loadChats(); // Reload chats when added to a new chat
        }
      )
      .subscribe();

    // Subscribe to new messages (to update last message in chat list)
    const messagesChannel = supabase
      .channel('messages_for_chatlist')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          console.log('New message received in chatlist:', payload);
          loadChats(); // Reload to update last message
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          console.log('Message deleted in chatlist:', payload);
          loadChats(); // Reload when messages are deleted (cleared chat)
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up subscriptions');
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [currentUserId]);

  // Set up typing indicator subscriptions for all chats
  useEffect(() => {
    if (!currentUserId || chats.length === 0) return;

    // Clean up previous typing channels
    typingChannelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    typingChannelsRef.current = [];

    // Subscribe to typing events for each chat
    chats.forEach(chat => {
      // Use unique suffix 'list' so it doesn't conflict with chat screen channel
      const typingChannel = supabase.channel(`typing:${chat.id}:list`, {
        config: { broadcast: { self: false } }
      });

      typingChannel
        .on('broadcast', { event: 'typing' }, (payload) => {
          const { user_id, is_typing } = payload.payload;
          console.log('Typing event received on chat list:', chat.id, is_typing);
          if (user_id !== currentUserId) {
            setTypingUsers(prev => ({
              ...prev,
              [chat.id]: is_typing
            }));
          }
        })
        .subscribe((status) => {
          console.log(`Chat list typing channel ${chat.id}:list status:`, status);
        });

      typingChannelsRef.current.push(typingChannel);
    });

    return () => {
      typingChannelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [currentUserId, chats.length]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id); // Set ID for real-time subscriptions
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      setCurrentUser(data);
    }
  };

  const loadChats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all chats where current user is a participant
      // Try to fetch with last_read_at first
      let { data: participantData, error: participantError } = await supabase
        .from('chat_participants')
        .select('chat_id, last_read_at')
        .eq('user_id', user.id);

      // Fallback: If column doesn't exist (DB migration not run), fetch without it
      if (participantError && participantError.code === '42703') {
        console.warn('DB missing last_read_at column. Unread counts disabled. Please run SQL migration.');
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('chat_participants')
          .select('chat_id')
          .eq('user_id', user.id);
          
        participantData = fallbackData?.map(d => ({ ...d, last_read_at: null })) || null;
        participantError = fallbackError;
      }

      if (participantError) {
        console.error('Error fetching chats:', participantError);
        setLoading(false);
        return;
      }

      if (!participantData || participantData.length === 0) {
        setChats([]);
        setLoading(false);
        return;
      }

      const chatIds = participantData.map(p => p.chat_id);

      // Get chat details with other participants
      const chatPromises = chatIds.map(async (chatId) => {
        // Get chat
        const { data: chat } = await supabase
          .from('chats')
          .select('*')
          .eq('id', chatId)
          .single();

        // Get other participant (only for 1:1 chats)
        let otherUser = null;
        if (!chat.is_group) {
          const { data: otherParticipant } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chatId)
            .neq('user_id', user.id)
            .single();
  
          if (otherParticipant) {
            const { data } = await supabase
              .from('users')
              .select('*')
              .eq('id', otherParticipant.user_id)
              .single();
            otherUser = data;
          }
        }

        // Get last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('text, created_at')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        let unreadCount = 0;
        const myParticipantData = participantData.find(p => p.chat_id === chatId);
        if (myParticipantData?.last_read_at) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId)
            .neq('user_id', user.id)
            .gt('created_at', myParticipantData.last_read_at);
          unreadCount = count || 0;
        }

        return {
          ...chat,
          other_user: otherUser,
          last_message: lastMessage,
          unread_count: unreadCount,
        };
      });

      const chatsWithDetails = await Promise.all(chatPromises);
      const validChats = chatsWithDetails.filter(c => c.id);
      
      const activeChats: ChatWithDetails[] = [];
      const requests: ChatWithDetails[] = [];

      validChats.forEach(chat => {
         // BLOCKED: Hide entirely
         if (chat.status === 'blocked') {
            return; // Skip
         }
         
         // REQUEST status: Requires special handling
         if (chat.status === 'request') {
            // I received this request (someone else created it)
            if (chat.created_by && chat.created_by !== user.id) {
               // Only show in Requests tab if they've sent a message
               if (chat.last_message) {
                  requests.push(chat);
               }
            }
            // I sent this request (I created it)
            // Don't show in main list - sender sees it only while in the chat
            // This prevents showing unanswered requests in the feed
            return;
         }
         
         // ACTIVE chats: Show in main list if there's a message
         if (chat.last_message) {
            activeChats.push(chat);
         }
      });

      // Sort by latest message
      const sortByDate = (a: ChatWithDetails, b: ChatWithDetails) => {
          const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
          const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
          return dateB - dateA;
      };

      activeChats.sort(sortByDate);
      requests.sort(sortByDate);

      setChats(activeChats);
      setMessageRequests(requests);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCurrentUser();
    await loadChats();
    setRefreshing(false);
  };

  // Search users
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
          .neq('id', user?.id)
          .limit(10);

        if (error) {
          console.error('Search error:', error);
        } else {
          setSearchResults(data || []);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = dayjs();
    const msgDate = dayjs(d);
    
    if (now.isSame(msgDate, 'day')) {
      return msgDate.format('h:mm A');
    } else if (now.diff(msgDate, 'day') === 1) {
      return 'Yesterday';
    } else if (now.diff(msgDate, 'day') < 7) {
      return msgDate.format('ddd');
    } else {
      return msgDate.format('MMM D');
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleUserPress = async (selectedUser: User) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if chat already exists
      const existingChat = chats.find(c => c.other_user?.id === selectedUser.id);
      if (existingChat) {
        router.push(`/(app)/chat/${existingChat.id}`);
        setSearchQuery('');
        return;
      }

      // Create new chat
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({})
        .select()
        .single();

      if (chatError || !newChat) {
        console.error('Error creating chat:', chatError);
        return;
      }

      // Add participants
      await supabase.from('chat_participants').insert([
        { chat_id: newChat.id, user_id: user.id },
        { chat_id: newChat.id, user_id: selectedUser.id },
      ]);

      router.push(`/(app)/chat/${newChat.id}`);
      setSearchQuery('');
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const handleLongPress = (chat: ChatWithDetails) => {
    setSelectedChat(chat);
    setShowDeleteModal(true);
  };

  const deleteChat = async () => {
    if (!selectedChat) return;

    setIsDeleting(true);
    try {
      // Delete all messages in the chat
      await supabase.from('messages').delete().eq('chat_id', selectedChat.id);
      
      // Delete all participants
      await supabase.from('chat_participants').delete().eq('chat_id', selectedChat.id);
      
      // Delete the chat itself
      await supabase.from('chats').delete().eq('id', selectedChat.id);

      // Remove from local state
      setChats(prev => prev.filter(c => c.id !== selectedChat.id));
      setShowDeleteModal(false);
      setSelectedChat(null);
    } catch (error) {
      console.error('Error deleting chat:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderChatItem = ({ item }: { item: ChatWithDetails }) => {
    const otherUser = item.other_user;
    const isOtherUserTyping = typingUsers[item.id];
    
    // Determine display name and photo
    const isGroup = item.is_group;
    const displayName = isGroup 
      ? (item.name || 'Group Chat') 
      : (otherUser?.display_name || otherUser?.username || 'User');
    const photoUrl = isGroup ? item.photo_url : otherUser?.photo_url;

    return (
      <TouchableOpacity
        style={[styles.chatItem, { borderBottomColor: colors.border }]}
        onPress={() => router.push(`/(app)/chat/${item.id}`)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.avatarText, { color: colors.text }]}>{getInitials(displayName)}</Text>
            </View>
          )}
          {item.is_group ? null : null}
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={[styles.userName, { color: colors.text }]}>{displayName}</Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>
              {formatTime(item.last_message?.created_at || item.updated_at)}
            </Text>
          </View>
          
          {isOtherUserTyping ? (
            <Text style={[styles.lastMessage, styles.typingIndicator, { color: colors.accent }]} numberOfLines={1}>
              typing...
            </Text>
          ) : (
            <View style={styles.messageRow}>
              <Text style={[styles.lastMessage, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                {item.last_message?.text || ''}
              </Text>
              {(item.unread_count || 0) > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>
                    {item.unread_count}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearchItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.chatItem, { borderBottomColor: colors.border }]}
      onPress={() => handleUserPress(item)}
    >
      <View style={styles.avatarContainer}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>{getInitials(item.display_name)}</Text>
          </View>
        )}
      </View>
      <View style={styles.chatInfo}>
        <Text style={[styles.userName, { color: colors.text }]}>{item.display_name || item.username}</Text>
        <Text style={[styles.usernameText, { color: colors.textMuted }]}>@{item.username || 'user'}</Text>
      </View>
      <Ionicons name="chatbubble-outline" size={24} color={colors.accent} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }


  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10, paddingBottom: 10 }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: 32, fontFamily: 'Sebino-Regular' }]}>Messages</Text>
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => router.push('/(app)/profile')}
        >
          <Image 
            source={require('../../assets/icons/profile.png')} 
            style={{ width: 30, height: 30, tintColor: colors.text }} 
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Tabs */}
      {searchQuery.length === 0 && (
         <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 8 }}>
            <TouchableOpacity 
               onPress={() => setActiveTab('inbox')}
               style={{ 
                  backgroundColor: activeTab === 'inbox' ? (isDark ? '#1e1e1e' : '#e0e0e0') : 'transparent',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border
               }}
            >
               <Text style={{ 
                  color: activeTab === 'inbox' ? colors.text : colors.textMuted,
                  fontWeight: activeTab === 'inbox' ? '600' : '400',
                  fontSize: 14
               }}>Inbox</Text>
            </TouchableOpacity>

            <TouchableOpacity 
               onPress={() => setActiveTab('requests')}
               style={{ 
                  backgroundColor: activeTab === 'requests' ? (isDark ? '#1e1e1e' : '#e0e0e0') : 'transparent',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: colors.border
               }}
            >
               <Text style={{ 
                  color: activeTab === 'requests' ? colors.text : colors.textMuted,
                  fontWeight: activeTab === 'requests' ? '600' : '400',
                  fontSize: 14
               }}>Requests</Text>
               {messageRequests.length > 0 && (
                  <View style={{ backgroundColor: colors.danger, borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
                     <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{messageRequests.length}</Text>
                  </View>
               )}
            </TouchableOpacity>

            <TouchableOpacity 
               onPress={() => router.push('/(app)/new-chat')}
               style={{ 
                  backgroundColor: 'transparent',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderWidth: 1,
                  borderColor: colors.border
               }}
            >
               <Image 
                 source={require('../../assets/icons/icons8-add-friend-96.png')} 
                 style={{ width: 16, height: 16, tintColor: colors.text }} 
               />
               <Text style={{ 
                  color: colors.text,
                  fontWeight: '400',
                  fontSize: 14
               }}>New Chat</Text>
            </TouchableOpacity>

         </View>
      )}

      {/* List */}
      {searchQuery.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderSearchItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                {isSearching ? 'Searching...' : 'No users found'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={activeTab === 'inbox' ? chats : messageRequests}
          renderItem={renderChatItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.text }]}>
                 {activeTab === 'inbox' ? 'No messages' : 'No requests'}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                 {activeTab === 'inbox' ? 'Start a conversation!' : 'Message requests will appear here'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}

      {/* Delete Chat Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDeleteModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                <View style={[styles.modalIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)' }]}>
                  <Ionicons name="trash-outline" size={40} color={colors.danger} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Chat</Text>
                <Text style={[styles.modalMessage, { color: colors.textMuted }]}>
                  Delete chat with {selectedChat?.other_user?.display_name || 'this user'}? All messages will be permanently deleted.
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonCancel, { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => {
                      setShowDeleteModal(false);
                      setSelectedChat(null);
                    }}
                    disabled={isDeleting}
                  >
                    <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonDanger, { backgroundColor: colors.danger }]}
                    onPress={deleteChat}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={[styles.modalButtonText, { color: '#ffffff' }]}>Delete</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.carbonBlack,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.slateGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Sebino-Regular',
  },
  profileAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.brightSnow,
    fontFamily: 'Sebino-Regular',
  },
  menuButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuDots: {
    fontSize: 20,
    color: COLORS.brightSnow,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gunmetal,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderRadius: 15,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.brightSnow,
    fontSize: 16,
    fontFamily: 'Sebino-Regular',
  },
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.ironGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.brightSnow,
    fontFamily: 'Sebino-Regular',
  },

  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.brightSnow,
    fontFamily: 'Sebino-Regular',
  },
  usernameText: {
    fontSize: 14,
    color: COLORS.slateGrey,
    fontFamily: 'Sebino-Regular',
  },
  time: {
    fontSize: 12,
    color: COLORS.slateGrey,
    fontFamily: 'Sebino-Regular',
  },
  lastMessage: {
    fontSize: 14,
    color: COLORS.slateGrey,
    fontFamily: 'Sebino-Regular',
  },
  typingIndicator: {
    color: '#3b82f6',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.brightSnow,
    marginBottom: 8,
    fontFamily: 'Sebino-Regular',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.slateGrey,
    fontFamily: 'Sebino-Regular',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: COLORS.gunmetal,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.brightSnow,
    marginBottom: 8,
    fontFamily: 'Sebino-Regular',
  },
  modalMessage: {
    fontSize: 14,
    color: COLORS.slateGrey,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: 'Sebino-Regular',
  },
  
  // Unread Badge
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: COLORS.accent,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  unreadText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Sebino-Regular',
  },

  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: COLORS.ironGrey,
  },
  modalButtonDanger: {
    backgroundColor: '#ef4444',
  },
  modalButtonText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Sebino-Regular',
  },
});
