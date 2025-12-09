import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  StatusBar,
  ActivityIndicator,
  Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/config/supabase';
import { useToast } from '../../src/components/Toast';
import { compressProfilePicture } from '../../src/utils/image';

const COLORS = {
  brightSnow: '#f8f9fa',
  platinum: '#e9ecef',
  alabasterGrey: '#dee2e6',
  slateGrey: '#6c757d',
  ironGrey: '#495057',
  gunmetal: '#343a40',
  carbonBlack: '#212529',
  accent: '#3b82f6',
  error: '#ef4444',
};

export default function SetupProfileScreen() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      
      // Check file size (get from asset if available, or estimate from uri)
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        showToast('Image must be less than 2MB. Please choose a smaller image.', 'warning');
        return;
      }
      
      setImage(asset.uri);
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

  const cleanUsername = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9_]/g, '');
  };

  const checkUsernameAvailable = async (usr: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', usr);
    
    if (error) {
      console.log('Username check error:', error);
      return true; // Assume available on error
    }
    
    return !data || data.length === 0;
  };

  const handleComplete = async () => {
    if (!username || username.length < 3) {
      showToast('Username must be at least 3 characters long', 'warning');
      return;
    }

    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast('No user session found', 'error');
        return;
      }

      // Check username availability
      const isAvailable = await checkUsernameAvailable(username);
      if (!isAvailable) {
        showToast('Username is already taken. Please choose another.', 'warning');
        setLoading(false);
        return;
      }

      // Upload profile image if selected
      let photoURL = null;
      if (image) {
        showToast('Processing image...', 'info');
        let uploadUri = image;
        try {
          // Compress image before upload
          const compressed = await compressProfilePicture(image);
          uploadUri = compressed.uri;
        } catch (err) {
          console.warn('Image compression failed, falling back to original:', err);
        }

        photoURL = await uploadImage(user.id, uploadUri);
        if (photoURL === null && image) {
          // Upload failed, but we still want to continue with profile setup
          // User can update their photo later
          console.log('Image upload failed, continuing without photo');
        }
      }

      // Upsert user profile (insert if not exists, update if exists)
      console.log('Saving profile for user:', user.id);
      const { data: updateData, error } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          phone_number: user.email || '', // Using email as phone_number since it's NOT NULL
          username: username,
          display_name: displayName || username,
          photo_url: photoURL,
          is_profile_complete: true,
        }, {
          onConflict: 'id'
        })
        .select();

      if (error) {
        console.error('Profile update error:', error);
        // Parse error for user-friendly message
        let errorMessage = 'Failed to save profile';
        if (error.code === '23505') {
          errorMessage = 'This email is already registered with another account';
        } else if (error.message) {
          errorMessage = error.message;
        }
        showToast(errorMessage, 'error');
        return;
      }

      console.log('Profile saved successfully:', updateData);
      console.log('Profile setup complete!');
      router.replace('/(app)');

    } catch (error: any) {
      showToast(error.message || 'An unexpected error occurred', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Setup Profile</Text>
        <Text style={styles.subtitle}>Complete your profile to get started</Text>
      </View>

      <View style={styles.content}>
        {/* Avatar Picker */}
        <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
          <View style={styles.avatar}>
            {image ? (
              <Image source={{ uri: image }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarPlaceholder}>{displayName?.[0] || 'U'}</Text>
            )}
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={20} color={COLORS.brightSnow} />
            </View>
          </View>
          <Text style={styles.changeText}>Change Photo</Text>
        </TouchableOpacity>

        {/* Inputs */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username (Unique)</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => setUsername(cleanUsername(t))}
              placeholder="username"
              placeholderTextColor={COLORS.slateGrey}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your Name"
              placeholderTextColor={COLORS.slateGrey}
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleComplete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.brightSnow} />
          ) : (
            <Text style={styles.buttonText}>Complete Setup</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.carbonBlack,
    padding: 24,
  },
  header: {
    marginTop: 60,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.brightSnow,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.slateGrey,
  },
  content: {
    flex: 1,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gunmetal,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.ironGrey,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    fontSize: 36,
    color: COLORS.slateGrey,
    fontWeight: '600',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.accent,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.carbonBlack,
  },
  changeText: {
    color: COLORS.accent,
    fontSize: 16,
  },
  form: {
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: COLORS.brightSnow,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.gunmetal,
    borderRadius: 12,
    padding: 16,
    color: COLORS.brightSnow,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.ironGrey,
  },
  button: {
    backgroundColor: COLORS.accent,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: COLORS.ironGrey,
    opacity: 0.7,
  },
  buttonText: {
    color: COLORS.brightSnow,
    fontSize: 18,
    fontWeight: '600',
  },
});
