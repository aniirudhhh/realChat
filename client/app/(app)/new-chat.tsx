import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, User } from '../../src/config/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

export default function NewChatScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
        .limit(10);

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

  const startChat = async (selectedUser: User) => {
    if (!currentUserId) return;

    try {
      // Check if chat already exists between these users
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
      const commonChatId = myChatsIds.find(id => theirChatIds.includes(id));

      if (commonChatId) {
        // Chat exists, go to it
        router.replace(`/(app)/chat/${commonChatId}`);
        return;
      }

      // Create new chat
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({
           status: 'request',
           created_by: currentUserId
        })
        .select()
        .single();

      if (chatError || !newChat) {
        console.error('Error creating chat:', chatError);
        return;
      }

      // Add participants
      const { error: participantError } = await supabase
        .from('chat_participants')
        .insert([
          { chat_id: newChat.id, user_id: currentUserId },
          { chat_id: newChat.id, user_id: selectedUser.id },
        ]);

      if (participantError) {
        console.error('Error adding participants:', participantError);
        return;
      }

      router.replace(`/(app)/chat/${newChat.id}`);
    } catch (e: any) {
      console.error('Error starting chat:', e);
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
        <Text style={[styles.title, { color: colors.text }]}>New Chat</Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground }]}>
        <TouchableOpacity onPress={performSearch}>
           <Ionicons name="search" size={20} color={colors.textMuted} />
        </TouchableOpacity>
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
      </View>

      {/* Results */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.accent} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={[styles.userItem, { borderBottomColor: colors.border }]}>
               <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                {item.photo_url ? (
                  <Image source={{ uri: item.photo_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>
                      {item.display_name?.[0] || '?'}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={[styles.name, { color: colors.text }]}>{item.display_name || item.username}</Text>
                  <Text style={[styles.username, { color: colors.textMuted }]}>@{item.username || 'user'}</Text>
                </View>
               </View>

              <TouchableOpacity 
                style={{ backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
                onPress={() => startChat(item)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Chat</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            searchQuery.length > 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No users found</Text>
            ) : (
              <Text style={[styles.empty, { color: colors.textMuted }]}>Type to find people</Text>
            )
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
    paddingBottom: 16,
  },
  backButton: { marginRight: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderRadius: 25
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12
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
    marginTop: 40
  }
});

