import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Text, 
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Keyboard,
  Animated,
  Modal,
  TouchableWithoutFeedback,
  Image
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase, User, Message, MessageReaction } from '../../../src/config/supabase';
import { useToast } from '../../../src/components/Toast';
import { useTheme } from '../../../src/context/ThemeContext';
import { useChatSounds } from '../../../src/hooks/useChatSounds';
import { api } from '../../../src/services/api';
import TypingIndicator from '../../../src/components/TypingIndicator';
import dayjs from 'dayjs';

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
  danger: '#ef4444',
};

interface MessageWithUser extends Message {
  user?: User;
  reactions?: MessageReaction[];
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { colors, isDark } = useTheme();
  // Use new sound hook
  const { playSendSound, playReceiveSound } = useChatSounds();
  const insets = useSafeAreaInsets();
  
  const [messages, setMessages] = useState<MessageWithUser[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<MessageWithUser | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null); // message ID
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [messageToDelete, setMessageToDelete] = useState<MessageWithUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Animated value for reply preview height
  const replyPreviewHeight = useRef(new Animated.Value(0)).current;

  // Animate reply preview when replyToMessage changes
  useEffect(() => {
    Animated.timing(replyPreviewHeight, {
      toValue: replyToMessage ? 60 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [replyToMessage]);

  const chatId = id as string;
  const flatListRef = useRef<FlatList>(null);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<any>(null);
  const listChannelRef = useRef<any>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const otherUserIdRef = useRef<string | null>(null);
  const userStatusChannelRef = useRef<any>(null);
  const lastTapTimes = useRef<Map<string, number>>(new Map());

  const markAsRead = async () => {
    if (!currentUserIdRef.current || !chatId) return;
    
    try {
      // Update chat_participants last_read_at
      await supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('chat_id', chatId)
        .eq('user_id', currentUserIdRef.current);

      // Mark all unread messages from OTHER user as read
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('user_id', currentUserIdRef.current)
        .eq('is_read', false);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  useEffect(() => {
    loadCurrentUser();
    loadChatDetails();
    loadMessages();
    
    // Subscribe to new messages
    const messagesChannel = supabase
      .channel(`messages:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          console.log('New message received:', payload);
          const newMessage = payload.new as Message;
          setMessages(prev => [newMessage, ...prev]);
          
          // Play receive sound if message is from another user
          if (newMessage.user_id !== currentUserIdRef.current) {
            playReceiveSound();
            markAsRead(); // Mark as read immediately since user is in chat
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // Update message read status in real-time
          const updatedMessage = payload.new as Message;
          setMessages(prev => 
            prev.map(msg => 
              msg.id === updatedMessage.id ? updatedMessage : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
      if (userStatusChannelRef.current) {
        supabase.removeChannel(userStatusChannelRef.current);
      }
    };
  }, [chatId]);

  // Mark as read when entering the screen
  useEffect(() => {
    if (currentUserId && chatId) {
      markAsRead();
    }
  }, [currentUserId, chatId]);

  // Track if channels are connected
  const isPresenceConnected = useRef(false);
  const isListConnected = useRef(false);

  // Typing indicator using Supabase Broadcast
  useEffect(() => {
    if (!currentUserId || !chatId) return;

    isPresenceConnected.current = false;
    isListConnected.current = false;

    const presenceChannel = supabase.channel(`typing:${chatId}`, {
      config: { broadcast: { self: false } }
    });

    presenceChannel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.user_id !== currentUserId) {
          setOtherUserTyping(payload.payload.is_typing);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isPresenceConnected.current = true;
          console.log('Presence channel connected');
        }
      });

    presenceChannelRef.current = presenceChannel;

    // Also create channel for chat list to receive broadcasts
    const listChannel = supabase.channel(`typing:${chatId}:list`, {
      config: { broadcast: { self: false } }
    });
    
    listChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isListConnected.current = true;
        console.log('List channel connected');
      }
    });
    
    listChannelRef.current = listChannel;

    return () => {
      isPresenceConnected.current = false;
      isListConnected.current = false;
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
      if (listChannelRef.current) {
        supabase.removeChannel(listChannelRef.current);
      }
    };
  }, [currentUserId, chatId]);

  // Broadcast typing status to both channels
  const broadcastTyping = (typing: boolean) => {
    const payload = { user_id: currentUserId, is_typing: typing };
    
    // Send to presence channel (for chat screen)
    if (presenceChannelRef.current && currentUserId && isPresenceConnected.current) {
      presenceChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload
      });
    }
    
    // Send to list channel (for chat list screen)
    if (listChannelRef.current && currentUserId && isListConnected.current) {
      listChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload
      });
    }
  };

  // Handle text input change with typing indicator
  const handleTextChange = (text: string) => {
    setInputText(text);
    
    // Broadcast typing start
    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      broadcastTyping(true);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set typing stop after 2 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      broadcastTyping(false);
    }, 2000);

    // If text is empty, stop typing immediately
    if (text.length === 0) {
      setIsTyping(false);
      broadcastTyping(false);
    }
  };

  // Subscribe to other user's online status changes
  useEffect(() => {
    if (!otherUser?.id) return;

    const userChannel = supabase
      .channel(`user:${otherUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${otherUser.id}`,
        },
        (payload) => {
          console.log('User status changed:', payload);
          setOtherUser(prev => prev ? { ...prev, is_online: payload.new.is_online } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
    };
  }, [otherUser?.id]);

  // Keyboard handling
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? 250 : 0,
          useNativeDriver: false,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? 250 : 0,
          useNativeDriver: false,
        }).start();
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;
    setCurrentUserId(userId);
    currentUserIdRef.current = userId;

    if (userId) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      setCurrentUserProfile(data);
    }
  };

  // Set up real-time subscription for other user's online status
  const setupUserStatusSubscription = (userId: string) => {
    // Remove existing subscription if any
    if (userStatusChannelRef.current) {
      supabase.removeChannel(userStatusChannelRef.current);
    }

    const channel = supabase
      .channel(`user-status:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          console.log('User status changed:', payload.new);
          const updatedUser = payload.new as User;
          setOtherUser(prev => prev ? { ...prev, is_online: updatedUser.is_online } : null);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('User status channel connected for:', userId);
        }
      });

    userStatusChannelRef.current = channel;
  };

  const loadChatDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get other participant
      const { data: otherParticipant } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chatId)
        .neq('user_id', user.id)
        .single();

      if (otherParticipant) {
        otherUserIdRef.current = otherParticipant.user_id;
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', otherParticipant.user_id)
          .single();
        setOtherUser(userData);
        
        // Set up real-time subscription for other user's status
        setupUserStatusSubscription(otherParticipant.user_id);
      }
    } catch (error) {
      console.error('Error loading chat details:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading messages:', error);
      } else {
        setMessages(data || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !currentUserId) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);
    
    // Clear typing status when sending
    setIsTyping(false);
    broadcastTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          user_id: currentUserId,
          text: text,
          reply_to_id: replyToMessage?.id || null,
        });

      // Clear reply state after sending
      setReplyToMessage(null);

      if (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
        setInputText(text); // Restore text
      } else {
        // Play send sound on success
        playSendSound();

        // Send Push Notification to other user
        if (otherUserIdRef.current) {
          const title = currentUserProfile?.display_name || 'New Message';
          api.sendPushNotification(
            otherUserIdRef.current, 
            title, 
            text, 
            { chatId }
          );
        }
      }

      // Update chat's updated_at
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('chat_id', chatId);

      if (error) {
        console.error('Error clearing chat:', error);
        showToast('Failed to clear chat', 'error');
        return;
      }

      setMessages([]);
      showToast('Chat cleared successfully', 'success');
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Error clearing chat:', error);
      showToast('Failed to clear chat', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const formatTime = (dateStr: string) => {
    return dayjs(dateStr).format('h:mm A');
  };

  // Load reactions for messages
  const loadReactions = async (messageIds: string[]) => {
    if (messageIds.length === 0) return;
    
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds);

    if (!error && data) {
      const grouped: Record<string, MessageReaction[]> = {};
      data.forEach((reaction: MessageReaction) => {
        if (!grouped[reaction.message_id]) {
          grouped[reaction.message_id] = [];
        }
        grouped[reaction.message_id].push(reaction);
      });
      setReactions(prev => ({ ...prev, ...grouped }));
    }
  };

  // Add/toggle reaction
  const addReaction = async (messageId: string, emoji: string) => {
    if (!currentUserId) return;
    
    // Check if user already reacted with this emoji
    const existingReaction = reactions[messageId]?.find(
      r => r.user_id === currentUserId && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      await supabase.from('message_reactions').delete().eq('id', existingReaction.id);
      setReactions(prev => ({
        ...prev,
        [messageId]: prev[messageId]?.filter(r => r.id !== existingReaction.id) || []
      }));
    } else {
      // Remove any existing reaction from this user on this message
      const userReaction = reactions[messageId]?.find(r => r.user_id === currentUserId);
      if (userReaction) {
        await supabase.from('message_reactions').delete().eq('id', userReaction.id);
      }
      
      // Add new reaction
      const { data, error } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: currentUserId, emoji })
        .select()
        .single();

      if (!error && data) {
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId]?.filter(r => r.user_id !== currentUserId) || []), data]
        }));
      }
    }
    setShowReactionPicker(null);
  };

  // Get reactions for a message
  const getMessageReactions = (messageId: string) => {
    return reactions[messageId] || [];
  };

  // Delete message for everyone
  const deleteMessage = async () => {
    if (!messageToDelete) return;
    
    setIsDeleting(true);
    try {
      // First, clear any replies pointing to this message
      await supabase
        .from('messages')
        .update({ reply_to_id: null })
        .eq('reply_to_id', messageToDelete.id);

      // Then delete the message
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageToDelete.id);

      if (error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message', 'error');
      } else {
        // Remove from local state
        setMessages(prev => prev.filter(m => m.id !== messageToDelete.id));
        showToast('Message deleted', 'success');
      }
    } catch (e) {
      console.error('Error deleting message:', e);
      showToast('Failed to delete message', 'error');
    } finally {
      setIsDeleting(false);
      setMessageToDelete(null);
    }
  };

  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const renderSwipeAction = () => (
    <View style={styles.swipeReplyAction}>
      <Ionicons name="arrow-undo" size={20} color={COLORS.slateGrey} />
    </View>
  );

  const handleSwipeOpen = (item: MessageWithUser, direction: string) => {
    setReplyToMessage(item);
    // Close the swipeable after triggering reply
    const ref = swipeableRefs.current.get(item.id);
    if (ref) {
      ref.close();
    }
  };

  const renderMessage = ({ item }: { item: MessageWithUser }) => {
    const isMe = item.user_id === currentUserId;
    const repliedMessage = item.reply_to_id ? messages.find(m => m.id === item.reply_to_id) : null;
    const messageReactions = getMessageReactions(item.id);

    const handleDoubleTap = () => {
      const now = Date.now();
      const lastTap = lastTapTimes.current.get(item.id) || 0;
      if (now - lastTap < 300) {
        setShowReactionPicker(item.id);
      }
      lastTapTimes.current.set(item.id, now);
    };

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
        }}
        renderLeftActions={isMe ? undefined : renderSwipeAction}
        renderRightActions={isMe ? renderSwipeAction : undefined}
        onSwipeableOpen={(direction) => handleSwipeOpen(item, direction)}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={40}
        rightThreshold={40}
      >
        <TouchableOpacity 
          style={[styles.messageRow, isMe && styles.messageRowMe]}
          onPress={handleDoubleTap}
          onLongPress={() => isMe && setMessageToDelete(item)}
          activeOpacity={0.9}
        >
          <View style={{ maxWidth: '80%' }}>
            <View style={[
              styles.messageBubble, 
              isMe ? styles.bubbleMe : styles.bubbleOther,
              { backgroundColor: isMe ? colors.bubbleMe : colors.bubbleOther }
            ]}>
              {/* Quoted message if replying */}
              {repliedMessage && (
                <View style={[styles.quotedMessage, { backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)' }]}>
                  <Text style={[styles.quotedText, { color: isMe ? 'rgba(255,255,255,0.8)' : colors.textMuted }]} numberOfLines={2}>
                    {repliedMessage.text}
                  </Text>
                </View>
              )}
              <Text style={[styles.messageText, { color: isMe ? colors.bubbleTextMe : colors.bubbleTextOther }]}>{item.text}</Text>
              <View style={styles.messageTimeContainer}>
                <Text style={[styles.messageTimeInline, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textMuted }]}>
                  {formatTime(item.created_at)}
                  {isMe && (
                    <Text style={{ color: item.is_read ? '#3b82f6' : 'rgba(255,255,255,0.5)' }}>
                      {' '}✓✓
                    </Text>
                  )}
                </Text>
              </View>
            </View>
            {/* Reactions display */}
            {messageReactions.length > 0 && (
              <View style={[styles.reactionsContainer, isMe && styles.reactionsContainerMe]}>
                {messageReactions.map((reaction, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    onPress={() => {
                      // Allow removing own reaction
                      if (reaction.user_id === currentUserId) {
                        addReaction(item.id, reaction.emoji);
                      }
                    }}
                  >
                    <Text style={[
                      styles.reactionEmoji,
                      reaction.user_id === currentUserId && styles.reactionEmojiMine
                    ]}>
                      {reaction.emoji}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <View style={styles.headerProfile}>
          <View style={[styles.headerAvatar, { backgroundColor: colors.surfaceSecondary }]}>
            {otherUser?.photo_url ? (
              <Image source={{ uri: otherUser.photo_url }} style={styles.headerAvatarImage} />
            ) : (
              <Text style={[styles.headerAvatarText, { color: colors.text }]}>
                {otherUser?.display_name?.[0] || 'U'}
              </Text>
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerName, { color: colors.text }]}>{otherUser?.display_name || 'User'}</Text>

          </View>
        </View>

        <TouchableOpacity style={styles.menuButton} onPress={() => setShowMenu(true)}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        inverted
        ListHeaderComponent={() => (
          otherUserTyping ? (
            <View style={[styles.messageRow, { marginTop: 8, marginBottom: 8 }]}>
              <View style={[
                styles.messageBubble, 
                styles.bubbleOther,
                { backgroundColor: colors.bubbleOther, paddingVertical: 12, paddingHorizontal: 16 }
              ]}>
                <TypingIndicator color={colors.textMuted} dotSize={6} />
              </View>
            </View>
          ) : null
        )}
      />

      {/* Reply Preview Bar */}
      <Animated.View style={[styles.replyPreview, { backgroundColor: colors.surface, height: replyPreviewHeight, overflow: 'hidden' }]}>
        {replyToMessage && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={styles.replyPreviewContent}>
              <View style={styles.replyPreviewBar} />
              <View style={styles.replyPreviewText}>
                <Text style={[styles.replyPreviewLabel, { color: colors.accent }]}>
                  Replying to {replyToMessage.user_id === currentUserId ? 'yourself' : otherUser?.display_name || 'User'}
                </Text>
                <Text style={[styles.replyPreviewMessage, { color: colors.textMuted }]} numberOfLines={1}>
                  {replyToMessage.text}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setReplyToMessage(null)} style={styles.replyPreviewClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* Input Bar */}
      <Animated.View style={[styles.inputContainer, { marginBottom: keyboardHeight, backgroundColor: colors.headerBackground }]}>
        <TouchableOpacity style={styles.inputIcon}>
          <Ionicons name="happy-outline" size={24} color={colors.textMuted} />
        </TouchableOpacity>

        <TextInput
          style={[styles.textInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
          placeholder="Type a message..."
          placeholderTextColor={colors.textMuted}
          value={inputText}
          onChangeText={handleTextChange}
          multiline
        />

        <TouchableOpacity style={styles.inputIcon}>
          <Ionicons name="attach" size={24} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.accent }]} onPress={inputText.trim() ? sendMessage : undefined} disabled={sending}>
          <Ionicons name={inputText.trim() ? "send" : "mic"} size={20} color="#ffffff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Options Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
          <View style={styles.menuOverlay}>
            <View style={[styles.menuDropdown, { backgroundColor: colors.surface }]}>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowClearConfirm(true);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Clear Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Clear Chat Confirmation Modal */}
      <Modal
        visible={showClearConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)' }]}>
              <Ionicons name="trash-outline" size={40} color={colors.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Clear Chat</Text>
            <Text style={[styles.modalMessage, { color: colors.textMuted }]}>
              All messages will be deleted. This action cannot be undone.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => setShowClearConfirm(false)}
                disabled={isClearing}
              >
                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonDanger, { backgroundColor: colors.danger }]}
                onPress={clearChat}
                disabled={isClearing}
              >
                {isClearing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.modalButtonConfirmText, { color: '#ffffff' }]}>Clear</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reaction Picker Modal */}
      <Modal
        visible={showReactionPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReactionPicker(null)}
      >
        <TouchableWithoutFeedback onPress={() => setShowReactionPicker(null)}>
          <View style={styles.reactionPickerOverlay}>
            <View style={[styles.reactionPickerContainer, { backgroundColor: colors.surface }]}>
              {REACTION_EMOJIS.map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.reactionPickerItem}
                  onPress={() => showReactionPicker && addReaction(showReactionPicker, emoji)}
                >
                  <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete Message Modal */}
      <Modal
        visible={messageToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMessageToDelete(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMessageToDelete(null)}>
          <View style={styles.deleteModalOverlay}>
            <View style={[styles.deleteModalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.deleteModalTitle, { color: colors.text }]}>Delete for everyone?</Text>
              <View style={styles.deleteModalButtons}>
                <TouchableOpacity 
                  style={[styles.deleteModalButton, { backgroundColor: 'transparent' }]}
                  onPress={() => setMessageToDelete(null)}
                  disabled={isDeleting}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.deleteModalButton, { backgroundColor: colors.accent, borderRadius: 20 }]}
                  onPress={deleteMessage}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ok</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
    </GestureHandlerRootView>
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
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.carbonBlack,
  },
  backButton: {
    padding: 4,
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.ironGrey,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerAvatarText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600',
  },
  headerAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.online,
    borderWidth: 2,
    borderColor: COLORS.carbonBlack,
  },
  headerInfo: {
    marginLeft: 10,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.brightSnow,
  },
  headerStatus: {
    fontSize: 12,
    color: COLORS.online,
  },
  typingStatus: {
    color: COLORS.accent,
    fontStyle: 'italic',
  },
  menuButton: {
    padding: 8,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderRadius: 18,
  },
  bubbleOther: {
    backgroundColor: COLORS.gunmetal,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: COLORS.ironGrey,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.brightSnow,
    lineHeight: 20,
  },
  messageTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTimeInline: {
    fontSize: 10,
    color: COLORS.paleSlate2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: COLORS.carbonBlack,
    borderTopWidth: 1,
    borderTopColor: COLORS.gunmetal,
  },
  inputIcon: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.gunmetal,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: COLORS.brightSnow,
    fontSize: 16,
    maxHeight: 100,
    marginHorizontal: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Menu Overlay
  menuOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuDropdown: {
    position: 'absolute',
    top: 70,
    right: 16,
    backgroundColor: COLORS.gunmetal,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: COLORS.brightSnow,
    fontWeight: '500',
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
  },
  modalMessage: {
    fontSize: 14,
    color: COLORS.slateGrey,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
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
    backgroundColor: COLORS.danger,
  },
  modalButtonCancelText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirmText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600',
  },

  // Reply styles
  quotedMessage: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  quotedText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyPreviewContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyPreviewBar: {
    width: 3,
    height: 36,
    backgroundColor: '#3b82f6',
    borderRadius: 2,
    marginRight: 10,
  },
  replyPreviewText: {
    flex: 1,
  },
  replyPreviewLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  replyPreviewMessage: {
    fontSize: 13,
    marginTop: 2,
  },
  replyPreviewClose: {
    padding: 8,
  },
  swipeReplyAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 50,
    marginLeft: 8,
  },

  // Reaction styles
  reactionsContainer: {
    flexDirection: 'row',
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  reactionsContainerMe: {
    alignSelf: 'flex-end',
  },
  reactionEmoji: {
    fontSize: 14,
    marginHorizontal: 1,
  },
  reactionPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reactionPickerContainer: {
    flexDirection: 'row',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reactionPickerItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionPickerEmoji: {
    fontSize: 28,
  },
  reactionEmojiMine: {
    opacity: 1,
    textShadowColor: 'rgba(59, 130, 246, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },

  // Delete modal styles (compact)
  deleteModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  deleteModalContent: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    minWidth: 220,
  },
  deleteModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteModalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
