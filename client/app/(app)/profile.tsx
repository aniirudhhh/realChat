import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Image, 
  ScrollView,
  Switch,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase, User } from '../../src/config/supabase';
import { useToast } from '../../src/components/Toast';
import { useTheme, ThemeMode } from '../../src/context/ThemeContext';
import { compressProfilePicture } from '../../src/utils/image';

// Color palette
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
  danger: '#ef4444',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { mode: theme, setMode: setTheme, colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [friendsCount, setFriendsCount] = useState(0);

  // Logout modal states
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  

  
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (data) {
        setUser(data);
        setImage(data.photo_url);
        
        // Count Friends (Unique people I have chatted with)
        // 1. Get my chat IDs
        const { data: myChats } = await supabase
           .from('chat_participants')
           .select('chat_id')
           .eq('user_id', authUser.id);
           
        if (myChats && myChats.length > 0) {
            const chatIds = myChats.map(c => c.chat_id);
            // 2. Get unique participants in those chats (excluding me)
            const { count } = await supabase
               .from('chat_participants')
               .select('user_id', { count: 'exact', head: true })
               .in('chat_id', chatIds)
               .neq('user_id', authUser.id);
            
            setFriendsCount(count || 0);
        } else {
            setFriendsCount(0);
        }
      }
    }
  };

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && user) {
      const asset = result.assets[0];
      
      // Check file size
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        showToast('Image must be less than 2MB. Please choose a smaller image.', 'warning');
        return;
      }
      
      // Show preview immediately
      setImage(asset.uri);
      
      // Upload in background
      showToast('Processing image...', 'info');
      
      let uploadUri = asset.uri;
      try {
        const compressed = await compressProfilePicture(asset.uri);
        uploadUri = compressed.uri;
      } catch (err) {
        console.warn('Image compression failed, using original:', err);
      }

      const photoUrl = await uploadImage(user.id, uploadUri);
      
      if (photoUrl) {
        // Delete old image if exists
        if (user.photo_url) {
          try {
            const oldPath = user.photo_url.split('/avatars/').pop();
            if (oldPath) {
              await supabase.storage.from('avatars').remove([oldPath]);
              console.log('Deleted old profile image:', oldPath);
            }
          } catch (error) {
            console.error('Error deleting old image:', error);
          }
        }

        // Update database with new URL
        await supabase
          .from('users')
          .update({ photo_url: photoUrl })
          .eq('id', user.id);
        
        setImage(photoUrl);
        showToast('Profile photo updated!', 'success');
      }
    }
  };

  const uploadImage = async (userId: string, imageUri: string): Promise<string | null> => {
    try {
      // Fetch file as array buffer (works better in React Native)
      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Validate size (2MB limit)
      if (uint8Array.length > MAX_FILE_SIZE) {
        showToast('Image must be less than 2MB. Please choose a smaller image.', 'warning');
        return null;
      }
      
      const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      console.log('Uploading to Supabase Storage:', filePath, 'Size:', uint8Array.length);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(filePath, uint8Array, {
          contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
          upsert: true,
        });

      if (error) {
        console.error('Upload error:', error);
        showToast('Failed to upload image: ' + error.message, 'error');
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      console.log('Image uploaded:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Upload error:', error);
      showToast('Failed to upload image: ' + (error.message || 'Unknown error'), 'error');
      return null;
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      showToast('Logged out successfully', 'success');
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Failed to log out', 'error');
    }
    setShowLogoutModal(false);
  };



  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const userName = user?.display_name || user?.username || 'User';
  const userPhone = user?.phone_number || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.avatarText, { color: colors.text }]}>{getInitials(userName)}</Text>
              </View>
            )}
            <View style={[styles.cameraIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="camera" size={14} color="#ffffff" />
            </View>
          </TouchableOpacity>
          
          <View style={styles.profileInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>{userName}</Text>
            <Text style={[styles.userEmail, { color: colors.textMuted }]}>{userPhone}</Text>
            {user?.username && (
              <Text style={[styles.userStatus, { color: colors.accent }]}>{user.username}</Text>
            )}
          </View>
        </View>

        {/* Theme Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Theme</Text>
        <View style={[styles.themeContainer, { backgroundColor: colors.surface }]}>
          <TouchableOpacity 
            style={[styles.themeOption, theme === 'light' && styles.themeOptionActive, theme === 'light' && { backgroundColor: colors.accent }]}
            onPress={() => setTheme('light')}
          >
            <Ionicons name="sunny-outline" size={20} color={theme === 'light' ? '#ffffff' : colors.textMuted} />
            <Text style={[styles.themeText, { color: theme === 'light' ? '#ffffff' : colors.textMuted }]}>Light</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.themeOption, theme === 'dark' && styles.themeOptionActive, theme === 'dark' && { backgroundColor: colors.accent }]}
            onPress={() => setTheme('dark')}
          >
            <Ionicons name="moon-outline" size={20} color={theme === 'dark' ? '#ffffff' : colors.textMuted} />
            <Text style={[styles.themeText, { color: theme === 'dark' ? '#ffffff' : colors.textMuted }]}>Dark</Text>
          </TouchableOpacity>
        </View>

        {/* Settings Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Settings</Text>
        <View style={[styles.settingsCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity 
            style={styles.settingRow}
            onPress={() => router.push('/(app)/friends-list')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="people-outline" size={22} color={colors.text} />
              <Text style={[styles.settingText, { color: colors.text }]}>See Your Friends</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          
          <TouchableOpacity 
             style={styles.settingRow} 
             onPress={() => router.push('/(app)/account-security')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.text} />
              <Text style={[styles.settingText, { color: colors.text }]}>Account & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

           <TouchableOpacity 
             style={styles.settingRow} 
             onPress={() => router.push('/(app)/terms-privacy')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={22} color={colors.text} />
              <Text style={[styles.settingText, { color: colors.text }]}>Terms & Privacy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* More Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>More</Text>
        <View style={[styles.settingsCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/(app)/help-support')}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-circle-outline" size={22} color={colors.text} />
              <Text style={[styles.settingText, { color: colors.text }]}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => setShowLogoutModal(true)}>
            <View style={styles.settingLeft}>
              <Ionicons name="log-out-outline" size={22} color={colors.danger} />
              <Text style={[styles.settingText, { color: colors.danger }]}>Log Out</Text>
            </View>
          </TouchableOpacity>
        </View>
        
        <View style={styles.bottomSpace} />
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Ionicons name="log-out-outline" size={40} color={colors.accent} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Log Out</Text>
            <Text style={[styles.modalMessage, { color: colors.textMuted }]}>
              Are you sure you want to log out of your account?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[styles.modalButtonCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonConfirm, { backgroundColor: colors.accent }]}
                onPress={handleLogout}
              >
                <Text style={[styles.modalButtonConfirmText, { color: '#ffffff' }]}>Log Out</Text>
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
    backgroundColor: COLORS.carbonBlack,
  },
  
  // Header
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
    color: COLORS.brightSnow,
  },
  
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  
  // Profile Section
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  avatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.ironGrey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.brightSnow,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.accent,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.carbonBlack,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.brightSnow,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.slateGrey,
    marginTop: 2,
  },
  userStatus: {
    fontSize: 14,
    color: COLORS.paleSlate2,
    marginTop: 2,
  },
  
  // Section Title
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.slateGrey,
    marginTop: 24,
    marginBottom: 12,
  },
  
  // Theme Section
  themeContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.gunmetal,
    borderRadius: 25,
    padding: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
  },
  themeOptionActive: {
    backgroundColor: COLORS.ironGrey,
  },
  themeText: {
    fontSize: 12,
    color: COLORS.slateGrey,
    marginTop: 4,
  },
  themeTextActive: {
    color: COLORS.brightSnow,
  },
  
  // Settings Card
  settingsCard: {
    backgroundColor: COLORS.gunmetal,
    borderRadius: 12,
    padding: 4,
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
    color: COLORS.brightSnow,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.carbonBlack,
    marginHorizontal: 12,
  },
  logoutText: {
    color: COLORS.danger,
  },
  
  bottomSpace: {
    height: 40,
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
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
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
  confirmLabel: {
    fontSize: 14,
    color: COLORS.brightSnow,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  confirmInput: {
    width: '100%',
    backgroundColor: COLORS.carbonBlack,
    borderRadius: 10,
    padding: 14,
    color: COLORS.brightSnow,
    fontSize: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.ironGrey,
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
  modalButtonConfirm: {
    backgroundColor: COLORS.accent,
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
});
