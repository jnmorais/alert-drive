import type { VoiceRecognition } from '../services/response/voiceResponse';
import type { TripController } from './tripController';

type ObservedController = Pick<TripController, 'getSnapshot' | 'subscribe'>;

export function connectVoicePreparation(
  controller: ObservedController,
  voice: Pick<VoiceRecognition, 'prepare'>,
): () => void {
  let preparedTrip: number | null = null;

  function sync(): void {
    const trip = controller.getSnapshot().trip;
    const tripStart = trip === null ? null : trip.config.startedAt;
    if (tripStart === null || tripStart === preparedTrip) {
      preparedTrip = tripStart;
      return;
    }
    preparedTrip = tripStart;
    void voice.prepare();
  }

  const unsubscribe = controller.subscribe(sync);
  sync();
  return unsubscribe;
}
