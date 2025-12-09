import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, User } from '../../src/config/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  brightSnow: '#f8f9fa',
  slateGrey: '#6c757d',
  gunmetal: '#343a40',
  carbonBlack: '#212529',
  accent: '#3b82f6',
  ironGrey: '#495057',
};

export default function NewChatScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  // Search users
  useEffect(() => {
    if (!currentUserId) return;
    
    if (searchQuery.trim().length === 0) {
      setUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
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
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId]);

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
        .insert({})
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.brightSnow} />
        </TouchableOpacity>
        <Text style={styles.title}>New Chat</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.slateGrey} />
        <TextInput 
          style={styles.input}
          placeholder="Search people..."
          placeholderTextColor={COLORS.slateGrey}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
      </View>

      {/* Results */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={COLORS.accent} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userItem} onPress={() => startChat(item)}>
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: COLORS.brightSnow, fontWeight: 'bold' }}>
                    {item.display_name?.[0] || '?'}
                  </Text>
                </View>
              )}
              <View>
                <Text style={styles.name}>{item.display_name || item.username}</Text>
                <Text style={styles.username}>@{item.username || 'user'}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            searchQuery.length > 0 ? (
              <Text style={styles.empty}>No users found</Text>
            ) : (
              <Text style={styles.empty}>Type to find people</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.carbonBlack },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: { marginRight: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.brightSnow },
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gunmetal,
    margin: 16,
    padding: 12,
    borderRadius: 12
  },
  input: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.brightSnow,
    fontSize: 16,
  },
  
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gunmetal
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.slateGrey,
    marginRight: 12
  },
  name: {
    color: COLORS.brightSnow,
    fontSize: 16,
    fontWeight: '600'
  },
  username: {
    color: COLORS.slateGrey,
    fontSize: 14
  },
  empty: {
    color: COLORS.slateGrey,
    textAlign: 'center',
    marginTop: 40
  }
});
