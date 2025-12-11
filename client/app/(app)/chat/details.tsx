import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  ScrollView, 
  Modal, 
  TextInput, 
  FlatList, 
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, User } from '../../../src/config/supabase';
import { useTheme } from '../../../src/context/ThemeContext';
import { useToast } from '../../../src/components/Toast';
import * as ImagePicker from 'expo-image-picker';

export default function ChatDetailsScreen() {
  const { chatId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [isGroup, setIsGroup] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{name?: string, photo_url?: string, admin_ids?: string[], created_by?: string}>({});
  const [participants, setParticipants] = useState<User[]>([]);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [autoDeletePref, setAutoDeletePref] = useState<'off' | 'close' | '24h' | '7d'>('off');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  
  // Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [editName, setEditName] = useState('');
  
  // Member Actions
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [showMemberActions, setShowMemberActions] = useState(false);

  useEffect(() => {
    loadCurrentUser();
    loadDetails();
  }, [chatId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: chatData } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single();
        
      if (chatData) {
        setAutoDeletePref(chatData.auto_delete_preference || '7d');
        setIsGroup(chatData.is_group);
        if (chatData.is_group) {
             setGroupInfo({ 
                 name: chatData.name, 
                 photo_url: chatData.photo_url,
                 admin_ids: chatData.admin_ids || [],
                 created_by: chatData.created_by
             });
             setEditName(chatData.name || '');
             
             // Fetch Participants
             const { data: parts } = await supabase.from('chat_participants').select('user_id').eq('chat_id', chatId);
             if (parts) {
                 const ids = parts.map(p => p.user_id);
                 const { data: users } = await supabase.from('users').select('*').in('id', ids);
                 setParticipants(users || []);
             }
        } else {
             // 1:1
             const { data: otherParticipant } = await supabase
                .from('chat_participants')
                .select('user_id')
                .eq('chat_id', chatId)
                .neq('user_id', user.id)
                .single();
    
             if (otherParticipant) {
                const { data: userData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', otherParticipant.user_id)
                    .single();
                setOtherUser(userData);
             }
        }
      }
    } catch (error) {
      console.error('Error loading details:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAutoDelete = async (value: 'close' | '24h' | '7d') => {
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
        await supabase.from('messages').insert({
          chat_id: chatId,
          user_id: user.id,
          text: `changed disappearing messages to ${value === 'close' ? 'After Closing' : value === '24h' ? '24 Hours' : '7 Days'}`,
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

  const leaveGroup = async () => {
      Alert.alert('Leave Group', 'Are you sure you want to leave this group?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: async () => {
               try {
                   await supabase.from('chat_participants').delete().eq('chat_id', chatId).eq('user_id', currentUserId);
                   router.replace('/(app)');
               } catch(e) { console.error(e); }
          }}
      ]);
  };
  
  const searchUsers = async (text: string) => {
      setSearchQuery(text);
      if (text.trim().length === 0) {
          setSearchResults([]);
          return;
      }
      const { data } = await supabase.from('users').select('*')
        .or(`username.ilike.%${text}%,display_name.ilike.%${text}%`)
        .limit(10);
      
      const existingIds = participants.map(p => p.id);
      setSearchResults(data?.filter(u => !existingIds.includes(u.id)) || []);
  };

  const addMember = async (user: User) => {
      try {
          await supabase.from('chat_participants').insert({ chat_id: chatId, user_id: user.id });
          
          // System Message
          const me = participants.find(p => p.id === currentUserId);
          const myName = me?.display_name || 'Admin';
          
          await supabase.from('messages').insert({
              chat_id: chatId,
              user_id: currentUserId,
              text: `${myName} added ${user.display_name}`,
              type: 'system',
              is_read: false
          });

          setParticipants(prev => [...prev, user]);
          setShowAddModal(false);
          setSearchQuery('');
          showToast(`${user.display_name} added`, 'success');
      } catch(e) {
          console.error(e);
          showToast('Failed to add member', 'error');
      }
  };
  
  const updateGroupName = async () => {
     if (!editName.trim()) return;
     try {
         const { error } = await supabase.from('chats').update({ name: editName.trim() }).eq('id', chatId);
         if (error) throw error;
         setGroupInfo(prev => ({...prev, name: editName.trim()}));
         setShowEditNameModal(false);
         showToast('Group name updated', 'success');
     } catch (e) {
         console.error(e);
         showToast('Failed to update name', 'error');
     }
  };

  const updateGroupPhoto = async () => {
     try {
         const result = await ImagePicker.launchImageLibraryAsync({
             mediaTypes: ImagePicker.MediaTypeOptions.Images,
             allowsEditing: true,
             aspect: [1, 1],
             quality: 0.8,
         });

         if (!result.canceled && result.assets[0]) {
             // Delete old photo if exists
             if (groupInfo.photo_url) {
                 const oldFileName = groupInfo.photo_url.split('/').pop();
                 if (oldFileName) {
                     await supabase.storage.from('group-avatars').remove([oldFileName]);
                 }
             }

             // Upload
             const uri = result.assets[0].uri;
             const fileName = `group_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
             const response = await fetch(uri);
             const arrayBuffer = await response.arrayBuffer();
             
             const { error: uploadError } = await supabase.storage
                .from('group-avatars') // Ensure this bucket exists!
                .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
            
             if (uploadError) throw uploadError;

             const { data: { publicUrl } } = supabase.storage.from('group-avatars').getPublicUrl(fileName);
             
             // Update Chat
             const { error: updateError } = await supabase.from('chats').update({ photo_url: publicUrl }).eq('id', chatId);
             if (updateError) throw updateError;
             
             setGroupInfo(prev => ({...prev, photo_url: publicUrl}));
             showToast('Group photo updated', 'success');
         }
     } catch (e) {
         console.error(e);
         showToast('Failed to update photo', 'error');
     }
  };

  const handleMemberPress = (member: User) => {
      if (!isAdmin || member.id === currentUserId) return;
      
      // Super Admin Protection: Cannot edit the Creator
      if (groupInfo.created_by && member.id === groupInfo.created_by) {
          Alert.alert('Permission Denied', 'You cannot perform actions on the Group Owner.');
          return;
      }
      
      setSelectedMember(member);
      setShowMemberActions(true);
  };

  const toggleAdminStatus = async () => {
      if (!selectedMember || !chatId) return;
      const memberId = selectedMember.id;
      const currentAdmins = groupInfo.admin_ids || [];
      const isMemberAdmin = currentAdmins.includes(memberId);
      
      let newAdmins = [];
      if (isMemberAdmin) {
          newAdmins = currentAdmins.filter(id => id !== memberId);
      } else {
          newAdmins = [...currentAdmins, memberId];
      }
      
      try {
          const { error } = await supabase.from('chats')
            .update({ admin_ids: newAdmins })
            .eq('id', chatId);
            
          if (error) throw error;
          
          setGroupInfo(prev => ({ ...prev, admin_ids: newAdmins }));
          setShowMemberActions(false);
          showToast(isMemberAdmin ? 'Admin dismissed' : 'Admin promoted', 'success');
      } catch (e) {
          console.error(e);
          showToast('Failed to update admin status', 'error');
      }
  };

  const removeMember = async () => {
      if (!selectedMember || !chatId) return;
      
      Alert.alert('Remove User', `Remove ${selectedMember.display_name} from group?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: async () => {
              try {
                  const { error } = await supabase.from('chat_participants')
                    .delete()
                    .eq('chat_id', chatId)
                    .eq('user_id', selectedMember.id);
                    
                  if (error) throw error;
                  
                  setParticipants(prev => prev.filter(p => p.id !== selectedMember.id));
                  setShowMemberActions(false);
                  showToast('User removed', 'success');
              } catch (e) {
                  console.error(e);
                  showToast('Failed to remove user', 'error');
              }
          }}
      ]);
  };

  const isAdmin = isGroup && currentUserId && groupInfo.admin_ids?.includes(currentUserId);

  const Option = ({ label, value, icon }: { label: string, value: 'close' | '24h' | '7d', icon: string }) => (
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
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 20 }}>Loading...</Text>
      </View>
    );
  }

  const title = isGroup ? (groupInfo.name || 'Group') : (otherUser?.display_name || 'Contact Info');
  const photo = isGroup ? groupInfo.photo_url : otherUser?.photo_url;
  const subtitle = isGroup ? `${participants.length} members` : `@${otherUser?.username}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          
        {/* Header Back */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{isGroup ? 'Group Info' : 'Contact Info'}</Text>
            {isAdmin && (
                <TouchableOpacity onPress={() => setShowEditNameModal(true)}>
                    <Text style={{ color: colors.accent, fontWeight: '600' }}>Edit</Text>
                </TouchableOpacity>
            )}
            {!isAdmin && <View style={{ width: 24 }} />}
        </View>

        {/* Profile Info */}
        <View style={styles.profileSection}>
            <TouchableOpacity 
                style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}
                disabled={!isAdmin}
                onPress={updateGroupPhoto}
            >
                {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatarImage} />
                ) : (
                    <Text style={[styles.avatarText, { color: colors.text }]}>
                    {title?.[0] || '?'}
                    </Text>
                )}
                {isAdmin && (
                    <View style={styles.editBadge}>
                        <Ionicons name="camera" size={12} color="#fff" />
                    </View>
                )}
            </TouchableOpacity>
            <Text style={[styles.name, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.username, { color: colors.textMuted }]}>{subtitle}</Text>
        </View>

        {/* Group Actions */}
        {isGroup && (
             <View style={styles.section}>
                 <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>PARTICIPANTS</Text>
                 <View style={[styles.optionsContainer, { backgroundColor: colors.surface }]}>
                     <TouchableOpacity 
                        style={[styles.participantRow, { borderBottomColor: colors.border }]}
                        onPress={() => setShowAddModal(true)}
                     >
                         <View style={[styles.pAvatar, { backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' }]}>
                             <Ionicons name="add" size={24} color="#fff" />
                         </View>
                         <Text style={{ color: colors.accent, fontWeight: '600', marginLeft: 12 }}>Add Member</Text>
                     </TouchableOpacity>

                     {participants.map(p => (
                         <TouchableOpacity 
                            key={p.id} 
                            style={[styles.participantRow, { borderBottomColor: colors.border }]}
                            onPress={() => handleMemberPress(p)}
                            disabled={!isAdmin || p.id === currentUserId}
                         >
                             <Image 
                                source={{ uri: p.photo_url || '' }} 
                                style={[styles.pAvatar, { backgroundColor: colors.surfaceSecondary }]} 
                             />
                             <View style={{ marginLeft: 12 }}>
                                 <Text style={{ color: colors.text, fontWeight: '500' }}>{p.display_name || p.username}</Text>
                                 <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                                    {p.id === currentUserId ? 'You' : ''} 
                                    {p.id === groupInfo.created_by ? ' • Owner' : (groupInfo.admin_ids?.includes(p.id) ? ' • Admin' : '')}
                                 </Text>
                             </View>
                         </TouchableOpacity>
                     ))}
                 </View>
             </View>
        )}

        {/* Settings */}
        <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>DISAPPEARING MESSAGES</Text>
            <View style={[styles.optionsContainer, { backgroundColor: colors.surface }]}>
            <Option label="After Closing Chat" value="close" icon="eye-off-outline" />
            <Option label="24 Hours" value="24h" icon="time-outline" />
            <Option label="Default (7 Days)" value="7d" icon="calendar-outline" />
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>
            {autoDeletePref === 'close' 
                ? "Messages here clear when you close the chat."
                : autoDeletePref === '24h'
                ? "Messages automatically delete after 24 hours."
                : "Messages automatically delete after 7 days."}
            </Text>
        </View>

        {/* Leave Group / Block */}
        <View style={styles.section}>
            <TouchableOpacity 
                style={[
                    styles.dangerButton, 
                    { backgroundColor: 'rgba(239, 68, 68, 0.1)' }
                ]}
                onPress={isGroup ? leaveGroup : () => {}}
            >
                <Text style={{ color: colors.danger, fontWeight: 'bold' }}>
                    {isGroup ? 'Leave Group' : 'Block User (Not Implemented)'}
                </Text>
            </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Add Member Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
           <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
               <View style={styles.modalHeader}>
                   <Text style={[styles.modalTitle, { color: colors.text }]}>Add Members</Text>
                   <TouchableOpacity onPress={() => setShowAddModal(false)}>
                       <Text style={{ color: colors.accent, fontSize: 16 }}>Done</Text>
                   </TouchableOpacity>
               </View>
               <TextInput 
                  style={[styles.searchInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
                  placeholder="Search users..."
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={searchUsers}
               />
               <FlatList 
                   data={searchResults}
                   keyExtractor={item => item.id}
                   renderItem={({ item }) => (
                       <TouchableOpacity style={styles.searchItem} onPress={() => addMember(item)}>
                            <Image source={{ uri: item.photo_url || '' }} style={styles.pAvatar} />
                            <Text style={{ color: colors.text, marginLeft: 12 }}>{item.display_name}</Text>
                            <View style={{ flex: 1 }} />
                            <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
                       </TouchableOpacity>
                   )}
               />
           </View>
      </Modal>

      {/* Edit Group Name Modal */}
      <Modal visible={showEditNameModal} transparent animationType="fade">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <View style={[styles.alertBox, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.alertTitle, { color: colors.text }]}>Edit Group Name</Text>
                  <TextInput 
                     style={[styles.alertInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
                     value={editName}
                     onChangeText={setEditName}
                     placeholder="Group Name"
                  />
                  <View style={styles.alertButtons}>
                      <TouchableOpacity onPress={() => setShowEditNameModal(false)} style={styles.alertBtn}>
                          <Text style={{ color: colors.textMuted }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={updateGroupName} style={styles.alertBtn}>
                          <Text style={{ color: colors.accent, fontWeight: 'bold' }}>Save</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

      {/* Member Action Modal */}
      <Modal visible={showMemberActions} transparent animationType="fade">
          <TouchableOpacity 
             style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
             activeOpacity={1}
             onPress={() => setShowMemberActions(false)}
          >
              <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.actionSheetTitle, { color: colors.textMuted }]}>
                      {selectedMember?.display_name}
                  </Text>
                  
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={toggleAdminStatus}>
                      <Text style={{ color: colors.text, fontSize: 16 }}>
                          {groupInfo.admin_ids?.includes(selectedMember?.id || '') ? 'Dismiss as Admin' : 'Make Group Admin'}
                      </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={removeMember}>
                      <Text style={{ color: colors.danger, fontSize: 16 }}>Remove from Group</Text>
                  </TouchableOpacity>
                  
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                  
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={() => setShowMemberActions(false)}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>Cancel</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  backButton: {},
  profileSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarText: { fontSize: 40, fontWeight: 'bold' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#3b82f6', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  username: { fontSize: 16 },
  section: { padding: 20 },
  sectionHeader: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 16, textTransform: 'uppercase' },
  optionsContainer: { borderRadius: 12, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { fontSize: 16 },
  helperText: { marginTop: 8, marginLeft: 16, fontSize: 13 },
  participantRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  pAvatar: { width: 40, height: 40, borderRadius: 20 },
  dangerButton: { padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Modal
  modalContainer: { flex: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  searchInput: { padding: 12, borderRadius: 10, fontSize: 16, marginBottom: 20 },
  searchItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  // Alert Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  alertBox: { width: '80%', padding: 20, borderRadius: 16, elevation: 5 },
  alertTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  alertInput: { padding: 10, borderRadius: 8, fontSize: 16, marginBottom: 20 },
  alertButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  alertBtn: { padding: 5 },
  // Action Sheet
  actionSheet: { width: '90%', borderRadius: 14, padding: 16, paddingBottom: 24, elevation: 5  },
  actionSheetTitle: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginBottom: 16, textTransform: 'uppercase' },
  actionSheetBtn: { paddingVertical: 12, alignItems: 'center' }
});
