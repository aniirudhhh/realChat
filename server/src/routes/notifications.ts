import express, { Response } from 'express';
import { verifyToken, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { sendExpoNotification } from '../utils/notifications';

const router = express.Router();

router.post('/send', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Get target user's push token
    const { data: userData, error } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (error || !userData?.push_token) {
      // Not an error per se, maybe user hasn't granted permission
      console.log(`No push token found for user ${userId}`);
      res.status(200).json({ message: 'No token found, skipped' });
      return;
    }

    // Send notification (pass chatId for grouping)
    const chatId = data?.chatId;
    await sendExpoNotification(userData.push_token, title, body, data, chatId);

    res.json({ success: true });

  } catch (error) {
    console.error('Error in /notifications/send:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
