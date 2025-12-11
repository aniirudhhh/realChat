import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  StyleSheet, 
  StatusBar, 
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, User } from '../../src/config/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

export default function NewChatScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Group creation modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState<string | null>(null);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  // Clear users when search is cleared
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setUsers([]);
    }
  }, [searchQuery]);

  const performSearch = async () => {
    if (!currentUserId || searchQuery.trim().length === 0) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .neq('id', currentUserId)
        .limit(20);

      if (error) {
        console.error('Search error:', error);
      } else {
        setUsers(data || []);
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (user: User) => {
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.id === user.id);
      if (exists) {
        return prev.filter(u => u.id !== user.id);
      } else {
        return [...prev, user];
      }
    });
  };

  const handleProceed = () => {
    if (selectedUsers.length === 0) return;

    if (selectedUsers.length === 1) {
      // 1:1 Chat
      startOneOnOneChat(selectedUsers[0]);
    } else {
      // Group Chat
      setGroupName('');
      setShowGroupModal(true);
    }
  };

  const startOneOnOneChat = async (selectedUser: User) => {
    if (!currentUserId || creating) return;
    setCreating(true);

    try {
      // Check if chat already exists
      const { data: myChats } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', currentUserId);

      const { data: theirChats } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', selectedUser.id);

      const myChatsIds = myChats?.map(c => c.chat_id) || [];
      const theirChatIds = theirChats?.map(c => c.chat_id) || [];
      
      // Find common chat which is NOT a group
      // This requires fetching chat details, but for now we assume check is weak or we query chats
      // Better: filter common IDs where is_group is false (or null)
      
      let commonChatId = null;
      const candidates = myChatsIds.filter(id => theirChatIds.includes(id));
      
      if (candidates.length > 0) {
         const { data: existingChats } = await supabase
            .from('chats')
            .select('id, is_group')
            .in('id', candidates);
         
         const existingOneOnOne = existingChats?.find(c => !c.is_group);
         if (existingOneOnOne) {
             commonChatId = existingOneOnOne.id;
         }
      }

      if (commonChatId) {
        router.replace(`/(app)/chat/${commonChatId}`);
        return;
      }

      // Create new 1:1 chat
      const { data: newChat, error } = await supabase
        .from('chats')
        .insert({
           status: 'request',
           created_by: currentUserId,
           is_group: false
        })
        .select()
        .single();

      if (error || !newChat) throw error;

      await supabase.from('chat_participants').insert([
        { chat_id: newChat.id, user_id: currentUserId },
        { chat_id: newChat.id, user_id: selectedUser.id },
      ]);

      // Note: Don't add system message here - chat starts as request
      // Auto-delete message will be shown in chat UI footer instead

      router.replace(`/(app)/chat/${newChat.id}`);
    } catch (e) {
      console.error('Error 1:1:', e);
    } finally {
      setCreating(false);
    }
  };

  const pickGroupImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setGroupPhoto(result.assets[0].uri);
      }
    } catch (e) {
      console.error('Pick image error:', e);
    }
  };

  const createGroupChat = async () => {
    if (!currentUserId || !groupName.trim() || creating) return;
    setCreating(true);
    
    try {
       let photoUrl = null;
       if (groupPhoto) {
          // Upload Image
          const fileName = `group_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const response = await fetch(groupPhoto);
          const arrayBuffer = await response.arrayBuffer();
          
          const { error: uploadError } = await supabase.storage
            .from('group-avatars')
            .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
            
          if (!uploadError) {
             const { data } = supabase.storage.from('group-avatars').getPublicUrl(fileName);
             photoUrl = data.publicUrl;
          }
       }

       const { data: newChat, error } = await supabase
        .from('chats')
        .insert({
           status: 'active',
           created_by: currentUserId,
           is_group: true,
           name: groupName.trim(),
           admin_ids: [currentUserId], // Make creator admin
           photo_url: photoUrl
        })
        .select()
        .single();
        
       if (error || !newChat) throw error;
       
       const participants = [
          { chat_id: newChat.id, user_id: currentUserId },
          ...selectedUsers.map(u => ({ chat_id: newChat.id, user_id: u.id }))
       ];
       
       await supabase.from('chat_participants').insert(participants);

       // Add auto-delete info message
       await supabase.from('messages').insert({
         chat_id: newChat.id,
         user_id: currentUserId,
         text: 'Messages in this chat will auto-delete after 7 days',
         type: 'system',
         is_read: false
       });
       
       setShowGroupModal(false);
       router.replace(`/(app)/chat/${newChat.id}`);
       
    } catch (e) {
       console.error('Error group:', e);
    } finally {
       setCreating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
             <Text style={[styles.title, { color: colors.text }]}>New Chat</Text>
             {selectedUsers.length > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {selectedUsers.length} selected
                </Text>
             )}
        </View>
      </View>

      {/* Selected Users Chips */}
      {selectedUsers.length > 0 && (
        <View style={styles.chipsContainer}>
          {selectedUsers.map(user => (
            <TouchableOpacity 
              key={user.id}
              style={[styles.chip, { backgroundColor: colors.accent }]}
              onPress={() => toggleSelection(user)}
            >
              {user.photo_url ? (
                <Image source={{ uri: user.photo_url }} style={styles.chipAvatar} />
              ) : (
                <View style={[styles.chipAvatar, { backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{user.display_name?.[0] || '?'}</Text>
                </View>
              )}
              <Text style={styles.chipText}>{user.display_name || user.username}</Text>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput 
          style={[styles.input, { color: colors.text }]}
          placeholder="Search people..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
          onSubmitEditing={performSearch}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.accent} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const isSelected = selectedUsers.some(u => u.id === item.id);
            return (
              <TouchableOpacity 
                 style={[styles.userItem, { borderBottomColor: colors.border }]}
                 onPress={() => toggleSelection(item)}
              >
                {/* Selection Circle */}
                <View style={[styles.checkbox, isSelected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                
                {/* Avatar */}
                <View style={[styles.avatarContainer]}>
                   {item.photo_url ? (
                     <Image source={{ uri: item.photo_url }} style={styles.avatar} />
                   ) : (
                     <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center' }]}>
                       <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                         {item.display_name?.[0] || '?'}
                       </Text>
                     </View>
                   )}
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.display_name || item.username}</Text>
                  <Text style={[styles.username, { color: colors.textMuted }]}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            searchQuery.length > 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No users found</Text>
            ) : (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                  Type to find people to chat with.
                  {"\n"}Select multiple to create a group.
              </Text>
            )
          }
        />
      )}
      
      {/* Proceed Button */}
      {selectedUsers.length > 0 && (
          <TouchableOpacity 
            style={[styles.fab, { backgroundColor: colors.accent, marginBottom: insets.bottom + 20 }]}
            onPress={handleProceed}
            disabled={creating}
          >
             {creating ? <ActivityIndicator color="#fff" /> : (
                <Ionicons name="arrow-forward" size={28} color="#fff" />
             )}
          </TouchableOpacity>
      )}

      {/* Group Name Modal */}
      <Modal
        visible={showGroupModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGroupModal(false)}
      >
        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => setShowGroupModal(false)}>
             <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                <TouchableWithoutFeedback>
                   <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.modalTitle, { color: colors.text }]}>New Group</Text>
                      
                      <TouchableOpacity onPress={pickGroupImage} style={{ marginBottom: 20 }}>
                         <View style={{ 
                            width: 80, height: 80, borderRadius: 40, 
                            backgroundColor: colors.surfaceSecondary, 
                            justifyContent: 'center', alignItems: 'center',
                            overflow: 'hidden'
                         }}>
                             {groupPhoto ? (
                                 <Image source={{ uri: groupPhoto }} style={{ width: 80, height: 80 }} />
                             ) : (
                                 <Ionicons name="camera" size={32} color={colors.textMuted} />
                             )}
                         </View>
                         <Text style={{ 
                             color: colors.accent, fontSize: 13, marginTop: 8, textAlign: 'center' 
                         }}>
                             Set Photo
                         </Text>
                      </TouchableOpacity>

                      <View style={{ width: '100%', marginBottom: 20 }}>
                         <Text style={{ color: colors.textMuted, marginBottom: 8 }}>Group Name</Text>
                         <TextInput 
                            style={[styles.modalInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
                            value={groupName}
                            onChangeText={setGroupName}
                            placeholder="e.g. Family Group"
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                         />
                      </View>
                      
                      <View style={styles.modalButtons}>
                         <TouchableOpacity onPress={() => setShowGroupModal(false)} style={styles.modalBtnCancel}>
                             <Text style={{ color: colors.textMuted }}>Cancel</Text>
                         </TouchableOpacity>
                         <TouchableOpacity 
                            onPress={createGroupChat} 
                            style={[styles.modalBtnCreate, { backgroundColor: colors.accent }]}
                            disabled={!groupName.trim()}
                         >
                             <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create</Text>
                         </TouchableOpacity>
                      </View>
                   </View>
                </TouchableWithoutFeedback>
             </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: { marginRight: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 15,
    gap: 8
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 20,
    gap: 6
  },
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500'
  },
  
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#888',
      marginRight: 16,
      justifyContent: 'center',
      alignItems: 'center'
  },
  avatarContainer: {
      marginRight: 12
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  name: {
    fontSize: 16,
    fontWeight: '600'
  },
  username: {
    fontSize: 14
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 24
  },
  fab: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84
  },
  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center'
  },
  modalContent: {
      width: '85%',
      padding: 24,
      borderRadius: 20,
      alignItems: 'center'
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 24
  },
  modalInput: {
      width: '100%',
      padding: 12,
      borderRadius: 10,
      fontSize: 16
  },
  modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      width: '100%',
      gap: 16,
      marginTop: 8
  },
  modalBtnCancel: {
      padding: 10
  },
  modalBtnCreate: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20
  }
});
