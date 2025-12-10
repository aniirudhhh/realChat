import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jxhnxrrulrahjjhixlbr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4aG54cnJ1bHJhaGpqaGl4bGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4ODA5MzUsImV4cCI6MjA4MDQ1NjkzNX0.x0KH9g3hKZqmwXaA-poAHcKYKXt984oNx4EuIE0fc2w';

// Note: Replace YOUR_ANON_KEY_HERE with your actual anon key from Supabase Dashboard
// Go to Settings -> API -> Project API keys -> anon/public

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Helper types
export interface User {
  id: string;
  phone_number: string | null;
  email?: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
  is_profile_complete: boolean;
  is_online: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface Chat {
  id: string;
  created_at: string;
  updated_at: string;
  auto_delete_preference?: 'off' | 'close' | '24h' | '7d';
}

export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  text: string | null;
  image_url: string | null;
  audio_url?: string | null;
  type?: 'text' | 'image' | 'system' | 'audio';
  is_read: boolean;
  reply_to_id: string | null;
  created_at: string;
}

export interface ChatParticipant {
  chat_id: string;
  user_id: string;
  last_read_at?: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}
