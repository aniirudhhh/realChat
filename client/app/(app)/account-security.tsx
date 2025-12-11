import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Modal, 
  TextInput, 
  ActivityIndicator, 
  ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/config/supabase';
import { useToast } from '../../src/components/Toast';
import { useTheme } from '../../src/context/ThemeContext';

const COLORS = {
  brightSnow: '#f8f9fa',
  platinum: '#e9ecef',
  gunmetal: '#343a40',
  carbonBlack: '#212529',
  danger: '#ef4444',
  slateGrey: '#6c757d',
  ironGrey: '#495057',
  accent: '#3b82f6',
};

export default function AccountSecurityScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Delete account modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      showToast('Please type DELETE to confirm', 'warning');
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        showToast('No user session found', 'error');
        return;
      }

      console.log('Deleting account for user:', authUser.id);

      // Step 1: Get all chats this user is part of
      const { data: userChats } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', authUser.id);

      const chatIds = userChats?.map(c => c.chat_id) || [];
      
      // Step 2: Delete all messages in those chats
      if (chatIds.length > 0) {
        await supabase.from('messages').delete().in('chat_id', chatIds);
      }

      // Step 3: Delete all chat_participants for those chats
      if (chatIds.length > 0) {
        await supabase.from('chat_participants').delete().in('chat_id', chatIds);
      }

      // Step 4: Delete the chats themselves
      if (chatIds.length > 0) {
        await supabase.from('chats').delete().in('id', chatIds);
      }
      
      // Step 5: Delete user from users table
      const { error: userDeleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', authUser.id);

      if (userDeleteError) {
        throw userDeleteError;
      }

      // Sign out the user
      await supabase.auth.signOut();
      
      showToast('Account deleted successfully', 'success');
      setShowDeleteModal(false);
      // Navigation to login happens automatically via auth state change
      
    } catch (error: any) {
      console.error('Delete account error:', error);
      showToast(error.message || 'Failed to delete account', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account & Security</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={[styles.sectionDescription, { color: colors.textMuted }]}>
          Manage your account security and data settings.
        </Text>

        {/* Change Password / Email Placeholders (Future) */}
        {/* 
        <TouchableOpacity style={[styles.settingRow, { backgroundColor: colors.surface }]}>
           <Text style={[styles.settingText, { color: colors.text }]}>Change Password</Text>
           <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        */}

        <View style={{ height: 20 }} />

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: COLORS.danger }]}>Danger Zone</Text>
        <View style={[styles.settingsCard, { borderColor: COLORS.danger, borderWidth: 1, backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.settingRow} onPress={() => setShowDeleteModal(true)}>
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
              <Text style={[styles.settingText, { color: COLORS.danger }]}>Delete Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalIcon, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Ionicons name="warning" size={40} color={COLORS.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Account</Text>
            <Text style={[styles.modalMessage, { color: colors.textMuted }]}>
              This action is permanent and cannot be undone. All your data, messages, and chats will be deleted forever.
            </Text>
            <Text style={[styles.confirmLabel, { color: colors.text }]}>Type DELETE to confirm:</Text>
            <TextInput
              style={[styles.confirmInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                disabled={isDeleting}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: COLORS.danger }]}
                onPress={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmText !== 'DELETE'}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#ffffff' }]}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  settingsCard: {
    borderRadius: 12,
    padding: 4,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {
    fontSize: 16,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmLabel: {
    fontSize: 14,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  confirmInput: {
    width: '100%',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
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
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
