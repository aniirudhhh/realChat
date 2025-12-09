import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

import mediaRoutes from './routes/media';
import notificationRoutes from './routes/notifications';

app.use(cors());
app.use(express.json());

app.use('/media', mediaRoutes);
app.use('/notifications', notificationRoutes);

app.get('/', (req, res) => {
  res.send('RealChat Backend is running');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
