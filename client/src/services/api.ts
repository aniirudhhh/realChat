import { supabase } from '../config/supabase';

const BASE_URL = 'https://realchat-7iq8.onrender.com';

export const api = {
  async getHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      throw new Error('No authenticated session');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  },

  async createUploadUrl(filename: string, mimeType: string, size: number) {
    const headers = await this.getHeaders();
    const response = await fetch(`${BASE_URL}/media/createUploadUrl`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename, mimeType, size }),
    });
    if (!response.ok) throw new Error('Failed to create upload URL');
    return response.json();
  },

  async getSignedDownloadUrl(path: string) {
    const headers = await this.getHeaders();
    const response = await fetch(`${BASE_URL}/media/getSignedDownloadUrl?path=${encodeURIComponent(path)}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) throw new Error('Failed to get download URL');
    return response.json();
  },

  async sendPushNotification(userId: string, title: string, body: string, data: any = {}) {
    try {
      const headers = await this.getHeaders();
      // Don't throw if fails, just log it. Notifications are optional.
      const response = await fetch(`${BASE_URL}/notifications/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, title, body, data }),
      });
      if (!response.ok) console.warn('Failed to send notification');
    } catch (e) {
      console.warn('Error sending notification:', e);
    }
  }
};
