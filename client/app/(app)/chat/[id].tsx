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
  Image,
  LayoutAnimation,
  UIManager
} from 'react-native';
import { contentState } from '../../../src/utils/contentState';
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
import calendar from 'dayjs/plugin/calendar';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Audio } from 'expo-av';

dayjs.extend(calendar);
dayjs.extend(relativeTime);
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoClipboard from 'expo-clipboard';


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
  const [isGroup, setIsGroup] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{name?: string, photo_url?: string}>({});
  const [participants, setParticipants] = useState<Map<string, User>>(new Map());
  const [showMenu, setShowMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isMenuMounted, setIsMenuMounted] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteChatConfirm, setShowDeleteChatConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<MessageWithUser | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null); // message ID
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [messageToDelete, setMessageToDelete] = useState<MessageWithUser | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageWithUser | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [autoDeletePref, setAutoDeletePref] = useState<'off' | 'close' | '24h' | '7d'>('off');
  
  // Audio Recording State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null); // For playback
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  // Image Message State
  const [viewingImage, setViewingImage] = useState<MessageWithUser | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Chat Request State
  const [chatStatus, setChatStatus] = useState<'active' | 'request' | 'blocked' | null>(null);
  const [chatCreatedBy, setChatCreatedBy] = useState<string | null>(null);
  const [isChatDeleted, setIsChatDeleted] = useState(false);
  const chatStatusRef = useRef<'active' | 'request' | 'blocked' | null>(null);
  const chatCreatedByRef = useRef<string | null>(null);

  // Animated value for reply preview height
  const replyPreviewHeight = useRef(new Animated.Value(0)).current;
  // Animated value for right action buttons (0 = mic/image, 1 = send)
  const inputMode = useRef(new Animated.Value(0)).current;
  const prevShowSend = useRef(false);
  // Animation for Add Menu (0 = closed, 1 = open)
  const menuAnim = useRef(new Animated.Value(0)).current;

  // Manual Keyboard Handling (Reanimated) removed
  // Reverted to standard behavior


  // Animate input mode when text/image changes
  useEffect(() => {
    const shouldShowSend = inputText.trim().length > 0 || !!selectedImageUri;
    if (shouldShowSend !== prevShowSend.current) {
      prevShowSend.current = shouldShowSend;
      Animated.timing(inputMode, {
        toValue: shouldShowSend ? 1 : 0,
        duration: 250, // Smooth duration
        useNativeDriver: false,
      }).start();
    }
  }, [inputText, selectedImageUri]);

  // Animate Add Menu Open/Close
  useEffect(() => {
    if (showAddMenu) {
      setIsMenuMounted(true);
      Animated.spring(menuAnim, {
        toValue: 1,
        useNativeDriver: false,
        friction: 8,
        tension: 50
      }).start();
    } else {
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false
      }).start(({ finished }) => {
        if (finished) setIsMenuMounted(false);
      });
    }
  }, [showAddMenu]);

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
  const inputRef = useRef<TextInput>(null);
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
    
    // Don't mark as read if it's a pending request that I haven't accepted
    // Check refs to ensure we have latest status inside callbacks
    const currentStatus = chatStatusRef.current;
    if (!currentStatus) return; // Still loading
    if (currentStatus === 'request' && chatCreatedByRef.current !== currentUserIdRef.current) return;

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
    loadCurrentUser();
    loadChatDetails();
    // loadMessages(); // Moved to useEffect depending on currentUserId
    
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as MessageReaction;
            setReactions(prev => {
               const existing = prev[newReaction.message_id] || [];
               if (existing.some(r => r.id === newReaction.id)) return prev;
               return {
                  ...prev,
                  [newReaction.message_id]: [...existing, newReaction]
               };
            });
          } else if (payload.eventType === 'DELETE') {
             const deletedId = payload.old.id;
             setReactions(prev => {
                const updated = { ...prev };
                let found = false;
                Object.keys(updated).forEach(msgId => {
                   const originalLen = updated[msgId].length;
                   updated[msgId] = updated[msgId].filter(r => r.id !== deletedId);
                   if (updated[msgId].length !== originalLen) found = true;
                });
                return found ? updated : prev;
             });
          }
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
      
      // Auto-Delete Logic on Unmount
      // Check current pref - this requires fetching or having it in state. 
      // We'll simplisticly run the delete check every time we leave if we can, 
      // or ideally we loaded the chat settings.
      // Since we didn't load settings in this component yet, let's just trigger a helper function
      // that checks the DB preference for this chat then deletes if needed.
      checkCleanupOnClose(chatId, currentUserIdRef.current);
    };
  }, [chatId]);

  const checkCleanupOnClose = async (cid: string, uid: string | null) => {
    if (!uid) return;
    try {
      const { data } = await supabase.from('chats').select('auto_delete_preference, status, created_by').eq('id', cid).single();
      console.log('Cleanup Check:', { cid, data });
      
      if (data?.auto_delete_preference === 'close') {
         // Delete messages where is_read is true
         const { error, count } = await supabase
           .from('messages')
           .delete({ count: 'exact' })
           .eq('chat_id', cid)
           .eq('is_read', true); // CRITICAL: Only delete READ messages
           
         console.log('Cleaned up read messages on close:', { count, error });
      }

      // Cleanup Empty Requests (User opened chat but sent nothing)
      if (data?.status === 'request' && data.created_by === uid) {
         // Check if any messages exist
         const { count } = await supabase
           .from('messages')
           .select('*', { count: 'exact', head: true })
           .eq('chat_id', cid);

         if (count === 0) {
            console.log('Deleting empty request chat...');
            await supabase.from('chat_participants').delete().eq('chat_id', cid);
            await supabase.from('chats').delete().eq('id', cid);
         }
      }
    } catch (e) {
      console.log('Cleanup error', e); 
    }
  };

  // Mark as read when entering the screen
  useEffect(() => {
    if (currentUserId && chatId) {
      markAsRead();
      loadMessages();
    }
    
    // Track active chat for notifications
    contentState.activeChatId = chatId;
    
    return () => {
      contentState.activeChatId = null;
    };
  }, [currentUserId, chatId, chatStatus]);

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

      // Fetch Chat Details (Auto-delete pref)
      const { data: chatData } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single();
      
      if (chatData) {
        setAutoDeletePref(chatData.auto_delete_preference || 'off');
        const status = chatData.status || 'active';
        setChatStatus(status);
        chatStatusRef.current = status;
        
        setChatCreatedBy(chatData.created_by);
        chatCreatedByRef.current = chatData.created_by;
        
        if (chatData.is_group) {
             setIsGroup(true);
             setGroupInfo({ name: chatData.name, photo_url: chatData.photo_url });
             
             // Fetch all participants
             const { data: partData } = await supabase
                .from('chat_participants')
                .select('user_id')
                .eq('chat_id', chatId);
             
             if (partData) {
                 const userIds = partData.map(p => p.user_id);
                 const { data: users } = await supabase
                    .from('users')
                    .select('*')
                    .in('id', userIds);
                 
                 const pMap = new Map<string, User>();
                 users?.forEach(u => pMap.set(u.id, u));
                 setParticipants(pMap);
             }
        } else {
            // Get other participant (1:1)
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
        }
      }
    } catch (error) {
      console.error('Error loading chat details:', error);
    }
  };

  // Subscribe to Chat Settings Changes
  useEffect(() => {
    if (!chatId) return;
    // Subscribe to chat status changes
    const chatSettingsChannel = supabase
      .channel(`chat_settings:${chatId}`)
      .on(
        'postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'chats', 
          filter: `id=eq.${chatId}` 
        }, 
        (payload) => {
          const newChat = payload.new as any;
          if (newChat.auto_delete_preference) {
            setAutoDeletePref(newChat.auto_delete_preference);
          }
          if (newChat.status) {
            setChatStatus(newChat.status);
            chatStatusRef.current = newChat.status;
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chats',
          filter: `id=eq.${chatId}`,
        },
        () => {
           setIsChatDeleted(true);
           setChatStatus('blocked'); // Effectively blocked/gone
           chatStatusRef.current = 'blocked';
           showToast('This chat has been ended', 'info');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatSettingsChannel);
    };
  }, [chatId]);

  const loadMessages = async () => {
    try {
      if (!currentUserId && !currentUserIdRef.current) return;

      // 1. Get join date to filter history
      const { data: membership } = await supabase
          .from('chat_participants')
          .select('joined_at')
          .eq('chat_id', chatId)
          .eq('user_id', currentUserId || currentUserIdRef.current) 
          .single();

      // 2. Build Query
      let query = supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false });

      // 3. Apply Filter
      if (membership?.joined_at) {
          query = query.gte('created_at', membership.joined_at);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading messages:', error);
      } else {
        setMessages(data || []);
        loadReactions(data?.map(m => m.id) || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      setIsPickingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, 
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // 10MB Limit Check
        // Note: fileSize might be undefined on some platforms/versions, 
        // so we check if it exists. If undefined, we let it pass or check via FileSystem.
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
           showToast('Image too large (Max 10MB)', 'error');
           return;
        }
        
        setSelectedImageUri(asset.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
    } finally {
      setIsPickingImage(false);
    }
  };

  const uploadAndSendImage = async (uri: string) => {
    try {
      setSending(true);
      
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const fileName = `${Date.now()}_img_${Math.random().toString(36).substring(7)}.jpg`;
      
      const { data, error } = await supabase.storage
        .from('image-messages')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('image-messages')
        .getPublicUrl(fileName);

      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: chatId,
        user_id: currentUserId,
        text: 'Photo',
        type: 'image',
        image_url: publicUrl,
        is_read: false,
      });

      if (msgError) throw msgError;
      playSendSound();
      setSelectedImageUri(null); // Clear selection after sending

    } catch (error) {
       console.error('Error sending image:', error);
       showToast('Failed to send image', 'error');
    } finally {
      setSending(false);
    }
  };

  const deleteImageMessage = async (message: MessageWithUser) => {
    try {
      // Optimistic updat
      setMessages(prev => prev.map(m => 
        m.id === message.id 
          ? { ...m, type: 'system', text: 'Photo expired', image_url: null } as MessageWithUser
          : m
      ));

      await supabase
        .from('messages')
        .update({
          type: 'system',
          text: 'Photo expired',
          image_url: null
        })
        .eq('id', message.id);

      if (message.image_url) {
         const fileName = message.image_url.split('/').pop();
         if (fileName) {
           await supabase.storage.from('image-messages').remove([fileName]);
         }
      }
    } catch (e) {
      console.error('Error deleting image:', e);
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        showToast('Microphone permission needed', 'error');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording', err);
      showToast('Failed to start recording', 'error');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI(); 
      setRecording(null);

      if (uri) {
        await uploadAndSendAudio(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
  };

  const uploadAndSendAudio = async (uri: string) => {
    try {
      setSending(true);
      
      // 1. Read file
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      // 2. Upload to Supabase
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.m4a`;
      const { data, error } = await supabase.storage
        .from('audio-messages')
        .upload(fileName, arrayBuffer, {
          contentType: 'audio/m4a',
        });

      if (error) throw error;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('audio-messages')
        .getPublicUrl(fileName);

      // 4. Send Message Record
      // Note: We send 'Voice Message' as text fallback
      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: chatId,
        user_id: currentUserId,
        text: 'Voice Message',
        type: 'audio',
        audio_url: publicUrl,
        is_read: false,
      });

      if (msgError) throw msgError;

      playSendSound();
    } catch (error) {
      console.error('Error sending audio:', error);
      showToast('Failed to send audio', 'error');
    } finally {
      setSending(false);
      setRecordingDuration(0);
    }
  };

  const deleteAudioMessage = async (message: MessageWithUser) => {
    try {
      // Optimistic update
      setMessages(prev => prev.map(m => 
        m.id === message.id 
          ? { ...m, type: 'system', text: 'Voice message expired', audio_url: null } as MessageWithUser
          : m
      ));

      // 1. Update DB (Convert to system message)
      const { error } = await supabase
        .from('messages')
        .update({
          type: 'system',
          text: 'Voice message expired',
          audio_url: null
        })
        .eq('id', message.id);
      
      if (error) throw error;

      // 2. Delete from Storage
      if (message.audio_url) {
         const fileName = message.audio_url.split('/').pop();
         if (fileName) {
           await supabase.storage.from('audio-messages').remove([fileName]);
         }
      }
    } catch (error) {
       console.error('Error auto-deleting audio:', error);
    }
  };

  const playAudio = async (message: MessageWithUser) => {
    try {
      // Validate audio URL
      if (!message.audio_url || !message.audio_url.startsWith('https')) {
        console.warn('Invalid audio URL:', message.audio_url);
        showToast('Audio unplayable', 'error');
        return;
      }

      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setPlayingMessageId(null);
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: message.audio_url },
        { shouldPlay: true },
        (status) => {
           if (status.isLoaded && status.didJustFinish) {
             // Auto-delete logic
             deleteAudioMessage(message);
             setPlayingMessageId(null);
           }
        }
      );
      setSound(newSound);
      setPlayingMessageId(message.id);
    } catch (error) {
      console.error('Failed to play audio', error);
      showToast('Failed to play audio', 'error');
    }
  };

  const acceptRequest = async () => {
    try {
      await supabase.from('chats').update({ status: 'active' }).eq('id', chatId);
      setChatStatus('active');
      chatStatusRef.current = 'active';
      showToast('Request accepted', 'success');
    } catch (error) {
      console.error('Error accepting request:', error);
      showToast('Failed to accept request', 'error');
    }
  };

  const deleteChat = async () => {
    try {
      setIsDeletingChat(true);
      
      // Delete from chats (cascade should handle participants/messages if set, else explicit)
      // Assuming cascade or manual cleanup
      const { error } = await supabase.from('chats').delete().eq('id', chatId);
      
      if (error) throw error;
      
      showToast('Friend removed', 'success');
      router.replace('/(app)');
    } catch (error) {
      console.error('Error removing friend:', error);
      showToast('Failed to remove friend', 'error');
    } finally {
      setIsDeletingChat(false);
      setShowDeleteChatConfirm(false);
    }
  };

  const rejectRequest = async () => {
    try {
      // Logic for reject: Delete chat or Block?
      // Usually "Delete" removes it. "Block" sets status 'blocked'.
      // For now, let's just delete the chat (User declines).
      await supabase.from('chats').delete().eq('id', chatId);
      router.replace('/(app)'); // Go back
    } catch (error) {
      console.error('Error rejecting request:', error);
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

  const renderRightSwipeAction = () => (
    <View style={styles.swipeReplyActionRight}>
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

  const renderMessage = ({ item, index }: { item: MessageWithUser; index: number }) => {
    // Date Header Logic
    const isLastMessage = index === messages.length - 1;
    const currentMessageDate = dayjs(item.created_at);
    // Inverted List: Messages[index+1] is OLDER (visually above)
    const previousMessageDate = !isLastMessage ? dayjs(messages[index + 1].created_at) : null;
    const showDayHeader = !previousMessageDate || !currentMessageDate.isSame(previousMessageDate, 'day');

    const DayHeader = () => (
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
         <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Sebino-Regular', fontWeight: '500' }}>
           {currentMessageDate.calendar(null, {
              sameDay: '[Today]',
              lastDay: '[Yesterday]',
              lastWeek: 'dddd',
              sameElse: 'MMM D'
           })}
         </Text>
      </View>
    );

    // Handle System Messages
    if (item.type === 'system') {
       return (
         <View>
           {showDayHeader && <DayHeader />}
           <View style={{ alignItems: 'center', marginVertical: 10, paddingHorizontal: 20 }}>
             <Text style={{ 
               color: colors.textMuted, 
               fontSize: 12, 
               textAlign: 'center', 
               backgroundColor: colors.surfaceSecondary, 
               paddingVertical: 4, 
               paddingHorizontal: 12, 
               borderRadius: 10, 
               overflow: 'hidden' 
             }}>
               {item.text}
             </Text>
           </View>
         </View>
       );
    }

    const isMe = item.user_id === currentUserId;
    const repliedMessage = item.reply_to_id ? messages.find(m => m.id === item.reply_to_id) : null;
    const messageReactions = getMessageReactions(item.id);

    // Audio Message Rendering
    if (item.type === 'audio') {
       const isPlaying = playingMessageId === item.id;
       return (
        <View>
          {showDayHeader && <DayHeader />}
          <Swipeable
            ref={ref => {
              if (ref) swipeableRefs.current.set(item.id, ref);
            }}
            renderLeftActions={!isMe ? renderSwipeAction : undefined}
            renderRightActions={isMe ? renderRightSwipeAction : undefined}
            onSwipeableWillOpen={(direction) => handleSwipeOpen(item, direction)}
            friction={2}
            rightThreshold={40}
          >
           <TouchableOpacity 
              onLongPress={() => setSelectedMessage(item)}
              delayLongPress={500}
              activeOpacity={0.8}
              style={[
                styles.messageRow, 
                isMe ? styles.messageRowMe : {}
              ]}
           >
            <View style={[
              styles.messageBubble,
              isMe ? styles.bubbleMe : styles.bubbleOther,
              { minWidth: 150, alignItems: 'center', flexDirection: 'row', gap: 10 }
            ]}>
              <TouchableOpacity 
                onPress={() => playAudio(item)}
                style={{ 
                  width: 32, height: 32, borderRadius: 16, 
                  backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : colors.surfaceSecondary,
                  justifyContent: 'center', alignItems: 'center'
                }}
              >
                 <Ionicons name={isPlaying ? "volume-high" : "play"} size={18} color={isMe ? '#fff' : colors.text} />
              </TouchableOpacity>
              <View>
                <Text style={{ color: isMe ? '#fff' : colors.text, fontWeight: '600' }}>Voice Message</Text>
                <Text style={{ color: isMe ? 'rgba(255,255,255,0.7)' : colors.textMuted, fontSize: 10 }}>1-Time Play</Text>
              </View>
            </View>
           </TouchableOpacity>
         </Swipeable>
        </View>
       );
    }

    // Image Message Rendering
    if (item.type === 'image') {
       return (
        <View>
         {showDayHeader && <DayHeader />}
         <Swipeable
           ref={ref => {
             if (ref) swipeableRefs.current.set(item.id, ref);
           }}
            renderLeftActions={!isMe ? renderSwipeAction : undefined}
            renderRightActions={isMe ? renderRightSwipeAction : undefined}
            onSwipeableWillOpen={(direction) => handleSwipeOpen(item, direction)}
           friction={2}
           rightThreshold={40}
         >
            <TouchableOpacity 
              onLongPress={() => setSelectedMessage(item)}
              onPress={() => {
                if (!isMe) {
                  setViewingImage(item);
                } else {
                  showToast("You can't view your own one-time photo", "error");
                }
              }}
              delayLongPress={500}
              activeOpacity={0.8}
              style={[
                styles.messageRow, 
                isMe ? styles.messageRowMe : {}
              ]}
           >
            <View style={[
              styles.messageBubble,
              isMe ? styles.bubbleMe : styles.bubbleOther,
              { minWidth: 150, alignItems: 'center', flexDirection: 'row', gap: 10 }
            ]}>
              <View
                style={{ 
                  width: 32, height: 32, borderRadius: 16, 
                  backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : colors.surfaceSecondary,
                  justifyContent: 'center', alignItems: 'center'
                }}
              >
                 <Ionicons name="image" size={18} color={isMe ? '#fff' : colors.text} />
              </View>
              <View>
                <Text style={{ color: isMe ? '#fff' : colors.text, fontWeight: '600' }}>Photo</Text>
                <Text style={{ color: isMe ? 'rgba(255,255,255,0.7)' : colors.textMuted, fontSize: 10 }}>1-Time View</Text>
              </View>
            </View>
           </TouchableOpacity>
         </Swipeable>
        </View>
       );
    }

    const handleDoubleTap = () => {
      const now = Date.now();
      const lastTap = lastTapTimes.current.get(item.id) || 0;
      if (now - lastTap < 300) {
        setShowReactionPicker(item.id);
      }
      lastTapTimes.current.set(item.id, now);
    };

    return (
      <View>
       {showDayHeader && <DayHeader />}
       <Swipeable
         ref={(ref) => {
           if (ref) swipeableRefs.current.set(item.id, ref);
         }}
         renderLeftActions={!isMe ? renderSwipeAction : undefined}
         renderRightActions={isMe ? renderRightSwipeAction : undefined}
         onSwipeableOpen={(direction) => handleSwipeOpen(item, direction)}
         overshootLeft={false}
         overshootRight={false}
         leftThreshold={40}
         rightThreshold={40}
       >
         <TouchableOpacity 
           style={[styles.messageRow, isMe && styles.messageRowMe, { marginBottom: 0 }]}
           onPress={handleDoubleTap}
           onLongPress={() => setSelectedMessage(item)}
           activeOpacity={0.9}
         >
           <View style={{ maxWidth: '80%' }}>
            {isGroup && !isMe && (
                <Text style={{ fontSize: 10, color: colors.accent, marginBottom: 4, marginLeft: 2, fontWeight: 'bold' }}>
                    {participants.get(item.user_id)?.display_name || 'User'}
                </Text>
            )}
            <View style={[
              styles.messageBubble, 
              isMe ? styles.bubbleMe : styles.bubbleOther,
              { backgroundColor: isMe ? colors.accent : colors.bubbleOther }
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
      </View>
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
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.headerProfile, { flex: 1, marginLeft: 12 }]} 
          onPress={() => router.push({ pathname: '/(app)/chat/details', params: { chatId } })}
        >
          <View style={[styles.headerAvatar, { backgroundColor: colors.surfaceSecondary }]}>
            {isGroup ? (
                groupInfo.photo_url ? (
                    <Image source={{ uri: groupInfo.photo_url }} style={styles.headerAvatarImage} />
                ) : (
                    <Text style={[styles.headerAvatarText, { color: colors.text }]}>
                        {groupInfo.name?.[0] || 'G'}
                    </Text>
                )
            ) : (
                otherUser?.photo_url ? (
                  <Image source={{ uri: otherUser.photo_url }} style={styles.headerAvatarImage} />
                ) : (
                  <Text style={[styles.headerAvatarText, { color: colors.text }]}>
                    {otherUser?.display_name?.[0] || 'U'}
                  </Text>
                )
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerName, { color: colors.text }]}>
                {isGroup ? (groupInfo.name || 'Group Chat') : (otherUser?.display_name || 'User')}
            </Text>
            {!isGroup && (
                <Text style={{ fontSize: 12, color: colors.textMuted, opacity: 0.7, fontFamily: 'Sebino-Regular' }}>
                    {otherUser?.username ? `@${otherUser.username}` : ''}
                </Text>
            )}
          </View>
        </TouchableOpacity>

        {autoDeletePref !== 'off' && (
          <View style={{ marginRight: 10, flexDirection: 'row', alignItems: 'center' }}>
             <Ionicons 
               name={
                 autoDeletePref === 'close' ? 'eye-off-outline' :
                 autoDeletePref === '24h' ? 'timer-outline' : 'calendar-outline'
               } 
               size={20} 
               color={colors.textMuted} 
             />
             <Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 2, fontWeight: 'bold' }}>
               {autoDeletePref === 'close' ? '' : autoDeletePref}
             </Text>
          </View>
        )}

        <TouchableOpacity style={styles.menuButton} onPress={() => setShowMenu(true)}>
          <Image source={require('../../../assets/icons/more.png')} style={{ width: 24, height: 24, tintColor: colors.text }} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.messagesList, 
          messages.length === 0 && { flexGrow: 1, justifyContent: 'center' }
        ]}
        showsVerticalScrollIndicator={false}
        inverted
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListFooterComponent={() => (
          isGroup ? <View style={{ height: 40 }} /> : (
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceSecondary, marginBottom: 16, justifyContent: 'center', alignItems: 'center' }}>
                {otherUser?.photo_url ? (
                  <Image source={{ uri: otherUser.photo_url }} style={{ width: 96, height: 96, borderRadius: 48 }} />
                ) : (
                  <Text style={{ fontSize: 36, color: colors.text, fontFamily: 'Sebino-Regular' }}>{otherUser?.display_name?.[0]}</Text>
                )}
            </View>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4, fontFamily: 'Sebino-Regular', textAlign: 'center' }}>
                {otherUser?.display_name}
            </Text>
            <Text style={{ fontSize: 16, color: colors.textMuted, marginBottom: 24, fontFamily: 'Sebino-Regular' }}>
                @{otherUser?.username}
            </Text>
            <TouchableOpacity 
              style={{ 
                backgroundColor: colors.background, 
                paddingHorizontal: 16, 
                paddingVertical: 6, 
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)' 
              }}
              onPress={() => router.push({ pathname: '/(app)/chat/details', params: { chatId } })}
            >
                <Text style={{ color: colors.text, fontWeight: '600', fontFamily: 'Sebino-Regular', fontSize: 13 }}>View Profile</Text>
            </TouchableOpacity>
          </View>
          )
        )}
        ListHeaderComponent={() => (
          <View>
            <View style={{ height: 10 }} />
            {otherUserTyping ? (
              <View style={[styles.messageRow, { marginTop: 8, marginBottom: 8 }]}>
                <View style={[
                  styles.messageBubble, 
                  styles.bubbleOther,
                  { backgroundColor: colors.bubbleOther, paddingVertical: 12, paddingHorizontal: 16 }
                ]}>
                  <TypingIndicator color={colors.textMuted} dotSize={6} />
                </View>
              </View>
            ) : null}
          </View>
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

      {/* Input Bar or Request Actions */}
      {isChatDeleted ? (
        <View style={[styles.inputContainer, { backgroundColor: colors.background, justifyContent: 'center', paddingBottom: 30 }]}>
           <Text style={{ color: colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 20 }}>
             You lost them without a goodbye.
           </Text>
        </View>
      ) : chatStatus === 'request' && chatCreatedBy && currentUserId && chatCreatedBy !== currentUserId ? (
        <View style={[styles.inputContainer, { marginBottom: 20, backgroundColor: colors.headerBackground, flexDirection: 'column', height: 'auto', paddingVertical: 20 }]}>
           <Text style={{ color: colors.text, marginBottom: 15, textAlign: 'center', fontWeight: '600' }}>
              Message Request from {otherUser?.display_name || 'User'}
           </Text>
           <Text style={{ color: colors.textMuted, marginBottom: 20, textAlign: 'center', fontSize: 12 }}>
              They won't know you've read their messages until you accept.
           </Text>
           <View style={{ flexDirection: 'row', gap: 20, width: '100%', justifyContent: 'center' }}>
              <TouchableOpacity 
                 onPress={rejectRequest}
                 style={{ backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger, paddingVertical: 10, paddingHorizontal: 30, borderRadius: 20 }}
              >
                 <Text style={{ color: colors.danger, fontWeight: 'bold' }}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                 onPress={acceptRequest}
                 style={{ backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 30, borderRadius: 20 }}
              >
                 <Text style={{ color: '#fff', fontWeight: 'bold' }}>Accept</Text>
              </TouchableOpacity>
           </View>
        </View>
      ) : (
      <Animated.View style={[styles.inputContainer, { marginBottom: Animated.add(keyboardHeight, 20), backgroundColor: colors.headerBackground }]}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', opacity: isRecording ? 0 : 1 }}>
            <TouchableOpacity style={{ 
              width: 40, height: 40, borderRadius: 20, 
              backgroundColor: '#262626', 
              justifyContent: 'center', alignItems: 'center',
              marginRight: 8
            }} onPress={() => setShowAddMenu(!showAddMenu)}>
               <Animated.View style={{
                 transform: [{
                   rotate: menuAnim.interpolate({
                     inputRange: [0, 1],
                     outputRange: ['0deg', '45deg']
                   })
                 }]
               }}>
                 <Ionicons name="add" size={28} color="#A0A0A0" />
               </Animated.View>
            </TouchableOpacity>

            <View style={{ 
              flex: 1, 
              flexDirection: 'row', 
              alignItems: 'center', 
              backgroundColor: '#262626', 
              borderRadius: 24, 
              paddingLeft: 12,
              paddingRight: 4,
              paddingVertical: 0,
              minHeight: 40
            }}>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, { backgroundColor: 'transparent', color: colors.text, marginHorizontal: 0, flex: 1 }]}
                placeholder="Message..."
                placeholderTextColor={colors.textMuted}
                value={inputText}
                onChangeText={handleTextChange}
                multiline
              />

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Animated.View style={{
                    height: 32,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    width: inputMode.interpolate({
                        inputRange: [0, 1],
                        outputRange: [40, selectedImageUri ? 84 : 44]
                    })
                }}>
                    {/* Actions Mode (Mic Only) */}
                    <Animated.View style={{
                        position: 'absolute', right: 0,
                        flexDirection: 'row', gap: 12, alignItems: 'center',
                        justifyContent: 'center', width: 40,
                        opacity: inputMode.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                        transform: [{ scale: inputMode.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]
                    }} pointerEvents={inputText.trim().length > 0 || selectedImageUri ? 'none' : 'auto'}>
                       <TouchableOpacity onPress={startRecording}>
                         <Ionicons name="mic-outline" size={24} color={colors.text} />
                       </TouchableOpacity>
                    </Animated.View>

                    {/* Send Mode */}
                    <Animated.View style={{
                        position: 'absolute', right: 0,
                        flexDirection: 'row', gap: 8, alignItems: 'center',
                        opacity: inputMode,
                        transform: [{ scale: inputMode }]
                    }} pointerEvents={inputText.trim().length > 0 || selectedImageUri ? 'auto' : 'none'}>
                        {selectedImageUri && (
                            <TouchableOpacity onPress={() => setSelectedImageUri(null)} activeOpacity={0.7}>
                                <Image source={{ uri: selectedImageUri }} style={{ width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: colors.surface, borderRadius: 8 }}>
                                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                                </View>
                            </TouchableOpacity>
                        )}
                       <TouchableOpacity 
                         style={{ width: 44, height: 32, borderRadius: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }} 
                         onPress={() => {
                            if (selectedImageUri) uploadAndSendImage(selectedImageUri);
                            else sendMessage();
                         }}
                       >
                          <Image source={require('../../../assets/icons/paper-plane-send.png')} style={{ width: 20, height: 20, tintColor: '#000' }} />
                       </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
              </View>
            </View>
      </View>

      {/* Recording Overlay */}
      {isRecording && (
        <View style={{ 
             position: 'absolute', 
             top: 0, bottom: 0, left: 0, right: 0, 
             backgroundColor: colors.headerBackground, 
             flexDirection: 'row', 
             alignItems: 'center', 
             justifyContent: 'space-between',
             paddingHorizontal: 16 // Match container padding
        }}>
              <TouchableOpacity onPress={async () => {
                 if(recording) {
                    await recording.stopAndUnloadAsync();
                    setRecording(null);
                 }
                 setIsRecording(false);
                 setRecordingDuration(0);
              }}>
                 <Ionicons name="trash" size={24} color={COLORS.danger} />
              </TouchableOpacity>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                 <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.danger }} />
                 <Text style={{ color: colors.text, fontSize: 16 }}>
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                 </Text>
              </View>

              <TouchableOpacity 
                style={{ width: 44, height: 32, borderRadius: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }} 
                onPress={stopRecording}
              >
                 <Image source={require('../../../assets/icons/paper-plane-send.png')} style={{ width: 20, height: 20, tintColor: '#000' }} />
              </TouchableOpacity>
        </View>
      )}
      </Animated.View>
      )}

      {/* Add Menu (Plus Button) - Inline to keep keyboard open */}
      {isMenuMounted && (
        <TouchableWithoutFeedback onPress={() => setShowAddMenu(false)}>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10 }}>
            <Animated.View style={{
                position: 'absolute',
                bottom: Animated.add(keyboardHeight, 80),
                left: 16,
                backgroundColor: '#262626',
                borderRadius: 24,
                paddingVertical: 16,
                paddingHorizontal: 20,
                minWidth: 240,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 5,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                gap: 24,
                opacity: menuAnim,
                transform: [
                  { scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                  { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }
                ]
            }}>
              {/* Media */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => {
                  setShowAddMenu(false);
                  pickImage();
                }}
              >
                <Text style={{ fontSize: 16, color: '#fff', fontWeight: '600' }}>Media</Text>
                <Ionicons name="image-outline" size={26} color="#fff" />
              </TouchableOpacity>

              {/* Stickers and GIFs */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowAddMenu(false)}
              >
                <Text style={{ fontSize: 16, color: '#fff', fontWeight: '600' }}>Stickers and GIFs</Text>
                <Ionicons name="happy-outline" size={26} color="#fff" />
              </TouchableOpacity>

              {/* Camera */}
              <TouchableOpacity 
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setShowAddMenu(false)}
              >
                <Text style={{ fontSize: 16, color: '#fff', fontWeight: '600' }}>Camera</Text>
                <Ionicons name="camera-outline" size={26} color="#fff" />
              </TouchableOpacity>

            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      )}

      {/* Options Menu Modal */}
      {/* Options Menu Modal (Bottom Sheet) */}
      <Modal
        visible={showMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
          <View style={[styles.menuOverlay, { justifyContent: 'flex-end', alignItems: 'center', padding: 0 }]}>
            <TouchableWithoutFeedback> 
                 {/* Inner Touchable to prevent closing on tap */}
                <View style={{ 
                    width: '100%', 
                    backgroundColor: '#262626', 
                    borderTopLeftRadius: 24, 
                    borderTopRightRadius: 24, 
                    paddingBottom: 40,
                    paddingTop: 12,
                    paddingHorizontal: 24
                }}>
                  {/* Handle */}
                  <View style={{ 
                      width: 40, height: 4, 
                      backgroundColor: '#505050', 
                      borderRadius: 2, 
                      alignSelf: 'center', 
                      marginBottom: 24 
                  }} />

                  {/* Options Group */}
                  <View style={{ backgroundColor: '#333333', borderRadius: 16, overflow: 'hidden' }}>
                      {/* Mute Option */}
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}
                        onPress={() => {
                          setShowMenu(false);
                          showToast("Muted", "info");
                        }}
                      >
                        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '500', fontFamily: 'Sebino-Regular' }}>Mute</Text>
                        <Ionicons name="notifications-off-outline" size={24} color={colors.text} />
                      </TouchableOpacity>

                      {/* Clear Chat Option */}
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}
                        onPress={() => {
                          setShowMenu(false);
                          setShowClearConfirm(true);
                        }}
                      >
                        <Text style={{ color: colors.danger, fontSize: 17, fontWeight: '500', fontFamily: 'Sebino-Regular' }}>Clear Chat</Text>
                        <Ionicons name="trash-outline" size={24} color={colors.danger} />
                      </TouchableOpacity>
                      
                      {/* Remove Friend Option */}
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 }}
                        onPress={() => {
                          setShowMenu(false);
                          setShowDeleteChatConfirm(true);
                        }}
                      >
                        <Text style={{ color: colors.danger, fontSize: 17, fontWeight: '500', fontFamily: 'Sebino-Regular' }}>Block / Remove</Text>
                        <Ionicons name="ban-outline" size={24} color={colors.danger} />
                      </TouchableOpacity>
                  </View>
                </View>
            </TouchableWithoutFeedback>
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

      {/* View Once Image Modal */}
      <Modal
        visible={viewingImage !== null}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          if (viewingImage) {
            deleteImageMessage(viewingImage);
            setViewingImage(null);
          }
        }}
      >
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
           <StatusBar barStyle="light-content" />
           {viewingImage?.image_url && (
             <>
               <Image 
                 source={{ uri: viewingImage.image_url }} 
                 style={{ width: '100%', height: '80%', resizeMode: 'contain' }} 
                 onLoadStart={() => setImageLoading(true)}
                 onLoadEnd={() => setImageLoading(false)}
               />
               {imageLoading && (
                 <View style={{ position: 'absolute', alignSelf: 'center' }}>
                    <ActivityIndicator size="large" color="#fff" />
                 </View>
               )}
             </>
           )}
           
           <TouchableOpacity 
             style={{ 
               position: 'absolute', top: 50, right: 20, 
               backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 10 
             }}
             onPress={() => {
                if(viewingImage) {
                   deleteImageMessage(viewingImage);
                   setViewingImage(null);
                }
             }}
           >
             <Ionicons name="close" size={30} color="#fff" />
           </TouchableOpacity>

           <View style={{ position: 'absolute', bottom: 50,alignSelf:'center' }}>
              <Text style={{ color: '#fff', opacity: 0.8 }}>Photo will expire when closed</Text>
           </View>
        </View>
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
      {/* Remove Friend Confirmation Modal */}
      <Modal
        visible={showDeleteChatConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteChatConfirm(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDeleteChatConfirm(false)}>
          <View style={styles.deleteModalOverlay}>
            <View style={[styles.deleteModalContent, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name="person-remove-outline" size={40} color={colors.danger} />
              </View>
              <Text style={[styles.deleteModalTitle, { color: colors.text }]}>Remove Friend?</Text>
              <Text style={{ color: colors.textMuted, marginBottom: 20, textAlign: 'center', fontFamily: 'Sebino-Regular' }}>
                This will delete the chat and remove them from your list.
              </Text>
              <View style={styles.deleteModalButtons}>
                <TouchableOpacity 
                  style={[styles.deleteModalButton, { backgroundColor: 'transparent' }]}
                  onPress={() => setShowDeleteChatConfirm(false)}
                  disabled={isDeletingChat}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 16, fontFamily: 'Sebino-Regular' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.deleteModalButton, { backgroundColor: colors.danger, borderRadius: 20 }]}
                  onPress={deleteChat}
                  disabled={isDeletingChat}
                >
                  {isDeletingChat ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600', fontFamily: 'Sebino-Regular' }}>Remove</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Message Options Menu */}
      <Modal
        visible={!!selectedMessage && !showInfoModal && !messageToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => { setSelectedMessage(null); setTimeout(() => inputRef.current?.focus(), 100); }}
      >
        <TouchableWithoutFeedback onPress={() => { setSelectedMessage(null); setTimeout(() => inputRef.current?.focus(), 100); }}>
          <View style={[styles.deleteModalOverlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <View style={{ alignItems: 'center' }}>
              
              {/* Reaction Bar */}
              <View style={{ 
                flexDirection: 'row', 
                backgroundColor: '#262626', 
                borderRadius: 40, 
                paddingVertical: 8, 
                paddingHorizontal: 16, 
                gap: 16,
                marginBottom: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 5,
              }}>
                {REACTION_EMOJIS.slice(0, 5).map((emoji, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      if (selectedMessage) addReaction(selectedMessage.id, emoji);
                      setSelectedMessage(null);
                      setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                {/* Placeholder for 'More Reactions' + button if needed */}
                <TouchableOpacity style={{ justifyContent: 'center', alignItems: 'center', width: 30 }}>
                   <Ionicons name="add" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Menu Actions */}
              <View style={{ 
                width: 240, 
                backgroundColor: '#262626', 
                borderRadius: 16, 
                overflow: 'hidden',
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 5,
              }}>
                {/* Reply */}
                <TouchableOpacity 
                   style={styles.menuItem} 
                   onPress={() => {
                     if (selectedMessage) {
                       setReplyToMessage(selectedMessage);
                       setSelectedMessage(null);
                       setTimeout(() => inputRef.current?.focus(), 100);
                     }
                   }}
                >
                   <Text style={[styles.menuItemText, { color: colors.text, flex: 1 }]}>Reply</Text>
                   <Ionicons name="arrow-undo-outline" size={22} color={colors.text} />
                </TouchableOpacity>

                {/* Copy */}
                {selectedMessage?.type === 'text' && (
                  <TouchableOpacity 
                    style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }]} 
                    onPress={async () => {
                        await ExpoClipboard.setStringAsync(selectedMessage.text || "");
                        showToast("Copied to clipboard", "success");
                        setSelectedMessage(null);
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                  >
                      <Text style={[styles.menuItemText, { color: colors.text, flex: 1 }]}>Copy</Text>
                      <Ionicons name="copy-outline" size={22} color={colors.text} />
                  </TouchableOpacity>
                )}

                {/* Info */}
                <TouchableOpacity 
                  style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }]} 
                  onPress={() => setShowInfoModal(true)}
                >
                    <Text style={[styles.menuItemText, { color: colors.text, flex: 1 }]}>Info</Text>
                    <Ionicons name="information-circle-outline" size={22} color={colors.text} />
                </TouchableOpacity>

                {/* Delete / Unsend */}
                <TouchableOpacity 
                  style={[styles.menuItem, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }]} 
                  onPress={() => {
                      setMessageToDelete(selectedMessage);
                      setSelectedMessage(null);
                  }}
                >
                    <Text style={[styles.menuItemText, { color: colors.danger, flex: 1 }]}>
                      {selectedMessage?.user_id === currentUserId ? 'Unsend' : 'Delete'}
                    </Text>
                    <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </TouchableOpacity>

              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Message Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowInfoModal(false); setSelectedMessage(null); }}
      >
        <TouchableWithoutFeedback onPress={() => { setShowInfoModal(false); setSelectedMessage(null); }}>
          <View style={styles.deleteModalOverlay}>
             <View style={[styles.deleteModalContent, { backgroundColor: colors.surface }]}>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 20 }]}>Message Info</Text>
                
                <View style={{ width: '100%', gap: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: colors.textMuted, fontSize: 16, fontFamily: 'Sebino-Regular' }}>Sent</Text>
                        <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Sebino-Regular' }}>
                            {selectedMessage ? dayjs(selectedMessage.created_at).format('h:mm A') : ''}
                        </Text>
                    </View>
                    
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: colors.textMuted, fontSize: 16, fontFamily: 'Sebino-Regular' }}>Read</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                             <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Sebino-Regular' }}>
                                {selectedMessage?.is_read ? 'Yes' : 'No'}
                             </Text>
                             <Ionicons name="checkmark-done" size={18} color={selectedMessage?.is_read ? '#4ade80' : colors.textMuted} />
                        </View>
                    </View>
                </View>

                 <TouchableOpacity 
                  style={[styles.deleteModalButton, { backgroundColor: colors.accent, marginTop: 24, width: '100%' }]}
                  onPress={() => { setShowInfoModal(false); setSelectedMessage(null); }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600', fontFamily: 'Sebino-Regular' }}>Close</Text>
                </TouchableOpacity>
             </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

        </View>
      </KeyboardAvoidingView>
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.ironGrey,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerAvatarText: {
    color: COLORS.brightSnow,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Sebino-Regular',
  },
  headerAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.online,
    borderWidth: 2,
    borderColor: COLORS.carbonBlack,
  },
  headerInfo: {
    marginLeft: 10,
  },
  headerName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.brightSnow,
    fontFamily: 'Sebino-Regular',
  },
  headerStatus: {
    fontSize: 12,
    color: COLORS.online,
    fontFamily: 'Sebino-Regular',
  },
  typingStatus: {
    color: COLORS.accent,
    fontStyle: 'italic',
    fontFamily: 'Sebino-Regular',
  },
  menuButton: {
    padding: 8,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '100%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginVertical: 1, // Tighter message spacing
  },
  bubbleOther: {
    backgroundColor: '#4c4c4c',
  },
  bubbleMe: {
    backgroundColor: COLORS.ironGrey,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.brightSnow,
    lineHeight: 20,
    fontFamily: 'Sebino-Regular',
  },
  messageTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTimeInline: {
    fontSize: 9,
    color: COLORS.paleSlate2,
    marginBottom: -4,
    fontFamily: 'Sebino-Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 2,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  inputIcon: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.gunmetal,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 0,
    color: COLORS.brightSnow,
    fontSize: 16,
    maxHeight: 100,
    marginHorizontal: 4,
    fontFamily: 'Sebino-Regular',
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
    top: 65,
    right: 20,
    backgroundColor: COLORS.gunmetal,
    borderRadius: 24,
    paddingVertical: 8,
    minWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  menuItemText: {
    fontSize: 16,
    color: COLORS.brightSnow,
    fontWeight: '600',
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
    fontFamily: 'Sebino-Regular',
  },
  modalButtonConfirmText: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Sebino-Regular',
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
    fontFamily: 'Sebino-Regular',
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
    fontFamily: 'Sebino-Regular',
  },
  replyPreviewMessage: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'Sebino-Regular',
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
  swipeReplyActionRight: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 50,
    marginRight: 8,
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

  // Delete modal styles (Modern & Simple)
  deleteModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', 
    padding: 20,
  },
  deleteModalContent: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 10,
    textAlign: 'center',
    fontFamily: 'Sebino-Regular',
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 10,
  },
  deleteModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
