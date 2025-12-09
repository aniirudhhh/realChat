import { messaging } from '../config/firebase';

export const sendPushNotification = async (token: string, title: string, body: string, data?: any) => {
  try {
    await messaging.send({
      token,
      notification: {
        title,
        body,
      },
      data: data || {},
    });
    console.log('Notification sent successfully');
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};
