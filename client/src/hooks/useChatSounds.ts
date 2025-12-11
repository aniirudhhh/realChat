import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export const useChatSounds = () => {
  const sendSoundRef = useRef<Audio.Sound | null>(null);
  const receiveSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Configure mix mode to Duck background audio (e.g. YouTube)
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
    }).catch(err => console.log('Audio mode error:', err));

    // Preload sounds
    const loadSounds = async () => {
      try {
        const { sound: send } = await Audio.Sound.createAsync(require('../../assets/send-tone.wav'));
        const { sound: receive } = await Audio.Sound.createAsync(require('../../assets/new-noti.mp3'));
        sendSoundRef.current = send;
        receiveSoundRef.current = receive;
      } catch (error) {
        console.log('Error loading chat sounds:', error);
      }
    };
    loadSounds();

    return () => {
      sendSoundRef.current?.unloadAsync();
      receiveSoundRef.current?.unloadAsync();
    };
  }, []);

  const playSendSound = async () => {
    try {
      await sendSoundRef.current?.replayAsync();
    } catch (error) {
      console.log('Error playing send sound:', error);
    }
  };

  const playReceiveSound = async () => {
    if (AppState.currentState === 'active') {
      try {
        await receiveSoundRef.current?.replayAsync();
      } catch (error) {
        console.log('Error playing receive sound:', error);
      }
    }
  };

  return {
    playSendSound,
    playReceiveSound
  };
};
