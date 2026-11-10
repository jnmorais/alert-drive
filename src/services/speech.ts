import * as Speech from 'expo-speech';

import type { AlertVoice } from '../state/alertVoice';

export const VOICE_LANGUAGE = 'pt-BR';
export const VOICE_RATE = 0.9;

let command = 0;

export const deviceVoice: AlertVoice = {
  speak(cue) {
    command += 1;
    const issued = command;
    void Speech.stop()
      .catch(() => undefined)
      .then(() => {
        if (issued === command) {
          Speech.speak(cue.text, { language: VOICE_LANGUAGE, rate: VOICE_RATE });
        }
      });
  },
  stop() {
    command += 1;
    void Speech.stop().catch(() => undefined);
  },
};
