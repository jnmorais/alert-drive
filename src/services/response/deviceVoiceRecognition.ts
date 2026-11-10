import { deviceSpeechRecognizer } from './deviceSpeechRecognizer';
import { createVoiceRecognition } from './voiceResponse';

export const deviceVoiceRecognition = createVoiceRecognition(deviceSpeechRecognizer);
