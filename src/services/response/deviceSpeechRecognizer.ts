import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { VOICE_RESPONSE_HINTS } from '../../core/voiceCommand';
import type { SpeechRecognizer } from './voiceResponse';

export const VOICE_RESPONSE_LANGUAGE = 'pt-BR';

const UNAVAILABLE_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);

export const deviceSpeechRecognizer: SpeechRecognizer = {
  async prepare() {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      return 'denied';
    }
    const available =
      ExpoSpeechRecognitionModule.isRecognitionAvailable() && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    return available ? 'ready' : 'unsupported';
  },
  listen(handlers) {
    const subscriptions = [
      ExpoSpeechRecognitionModule.addListener('result', (event) =>
        handlers.onTranscripts(event.results.map((result) => result.transcript)),
      ),
      ExpoSpeechRecognitionModule.addListener('end', () => handlers.onEnd()),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        if (UNAVAILABLE_ERRORS.has(event.error)) {
          handlers.onUnavailable();
        }
      }),
    ];
    ExpoSpeechRecognitionModule.start({
      lang: VOICE_RESPONSE_LANGUAGE,
      interimResults: true,
      maxAlternatives: 3,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
      contextualStrings: [...VOICE_RESPONSE_HINTS],
    });
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      ExpoSpeechRecognitionModule.abort();
    };
  },
};
