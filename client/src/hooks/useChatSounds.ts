import { useAudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

export const useChatSounds = () => {
  // Load sounds
  const sendSound = useAudioPlayer(require('../../assets/send-tone.wav'));
  const receiveSound = useAudioPlayer(require('../../assets/new-noti.mp3'));

  // Simple play wrappers that ensure sound resets to start because expo-audio doesn't auto-reset
  const playSendSound = () => {
    if (sendSound) {
      sendSound.seekTo(0);
      sendSound.play();
    }
  };

  const playReceiveSound = () => {
    if (receiveSound) {
      receiveSound.seekTo(0);
      receiveSound.play();
    }
  };

  return {
    playSendSound,
    playReceiveSound
  };
};
