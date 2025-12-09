import express, { Response } from 'express';
import { verifyToken, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// POST /media/createUploadUrl
// Generates a signed URL for the client to upload directly to Supabase
router.post('/createUploadUrl', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { filename, mimeType, size } = req.body;
    const uid = req.user?.uid;

    if (!uid) {
      res.status(400).json({ error: 'User ID missing' });
      return;
    }

    // Validate inputs (basic)
    if (!filename || !mimeType) {
      res.status(400).json({ error: 'Filename and mimeType are required' });
      return;
    }

    // Path: media/user_uid/timestamp_uuid.ext
    const ext = filename.split('.').pop();
    const storagePath = `media/${uid}/${Date.now()}_${uuidv4()}.${ext}`;

    // Generate Signed Upload URL
    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error('Supabase createSignedUploadUrl error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
      return;
    }

    res.json({
      uploadPath: storagePath,
      uploadUrl: data?.signedUrl,
      token: data?.token, // Some SDKs might need this
      fullPath: data?.path
    });

  } catch (error) {
    console.error('Error in createUploadUrl:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /media/getSignedDownloadUrl
// Generates a temporary signed URL for viewing private media
router.get('/getSignedDownloadUrl', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { path } = req.query;

    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    // Generate Signed URL (valid for 60 minutes)
    const { data, error } = await supabase.storage
      .from('media')
      .createSignedUrl(path, 3600);

    if (error) {
      console.error('Supabase createSignedUrl error:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
      return;
    }

    res.json({
      downloadUrl: data?.signedUrl
    });

  } catch (error) {
    console.error('Error in getSignedDownloadUrl:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /media/uploadProxy
// Placeholder for proxy upload if needed (not implemented fully to save bandwidth)
router.post('/uploadProxy', verifyToken, async (req: AuthRequest, res: Response) => {
  res.status(501).json({ message: 'Proxy upload not implemented. Use createUploadUrl for direct upload.' });
});

export default router;
