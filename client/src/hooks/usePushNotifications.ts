import { useState,useEffect, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const usePushNotifications = () => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  const registerForPushNotificationsAsync = async () => {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        // console.log('Failed to get push token for push notification!');
        return;
      }
      
      try {
        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        
        // If no projectId is found (bare workflow issue), try without options (managed/Expo Go)
        if (!projectId) {
          token = (await Notifications.getExpoPushTokenAsync()).data;
        } else {
          token = (await Notifications.getExpoPushTokenAsync({
            projectId,
          })).data;
        }
        
        console.log("Expo Push Token:", token);
      } catch (e) {
        console.log("Error getting push token: Project ID might be missing or user not logged in.");
      }
    } else {
      // console.log('Must use physical device for Push Notifications');
    }

    return token;
  };

  const saveTokenToDatabase = async (token: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('users')
        .update({ push_token: token })
        .eq('id', user.id);
        
      if (error) {
        console.error("Error saving push token to DB:", error);
      }
    }
  };

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      setExpoPushToken(token);
      if (token) {
        saveTokenToDatabase(token);
      }
    });

    // Register the category for replies
    Notifications.setNotificationCategoryAsync('chat_reply', [
      {
        identifier: 'reply_action',
        buttonTitle: 'Reply',
        textInput: {
          submitButtonTitle: 'Send',
          placeholder: 'Type your reply...',
        },
      },
    ]);

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(async response => {
      console.log('Notification response:', response);
      
      const actionId = response.actionIdentifier;
      const userText = (response as any).userText; // Type cast for userText
      const data = response.notification.request.content.data;
      const chatId = data?.chatId;

      if (actionId === 'reply_action' && userText && chatId) {
        console.log(`Replying to chat ${chatId}: ${userText}`);
        
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('messages')
              .insert({
                chat_id: chatId,
                user_id: user.id,
                text: userText,
              });
          }
        } catch (e) {
          console.error('Error sending reply:', e);
        }
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return {
    expoPushToken,
    notification,
  };
};
