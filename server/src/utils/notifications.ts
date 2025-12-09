import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export const sendExpoNotification = async (
  pushToken: string, 
  title: string, 
  body: string, 
  data: any = {},
  chatId?: string
) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  const messages: any[] = [{
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    categoryId: 'chat_reply', // Enable quick reply
  }];

  // Add Android-specific tag to replace notifications from same chat
  if (chatId) {
    messages[0].channelId = 'default';
    // Using data to pass a collapsible identifier
    messages[0]._displayInForeground = true;
  }

  try {
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending chunk:', error);
      }
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};
