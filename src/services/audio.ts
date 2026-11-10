import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import type { SoundPattern } from '../core/escalation';
import type { AlertSoundPlayer } from '../state/alertSound';

const SOUND_SOURCES: Readonly<Record<SoundPattern, number>> = {
  shortTone: require('../../assets/sounds/check-tone-1000hz.wav'),
  alarm: require('../../assets/sounds/alert-tone-2500hz.wav'),
};

export interface DeviceAlertSoundPlayer extends AlertSoundPlayer {
  release(): void;
}

export function createDeviceAlertSoundPlayer(): DeviceAlertSoundPlayer {
  void setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
  }).catch(() => undefined);

  const players: Record<SoundPattern, AudioPlayer> = {
    shortTone: createAudioPlayer(SOUND_SOURCES.shortTone),
    alarm: createAudioPlayer(SOUND_SOURCES.alarm),
  };
  let command = 0;

  function pauseAll(): void {
    Object.values(players).forEach((player) => player.pause());
  }

  return {
    play(cue) {
      command += 1;
      const issued = command;
      pauseAll();
      const player = players[cue.pattern];
      player.volume = cue.volume;
      player.loop = cue.loop;
      void player
        .seekTo(0)
        .catch(() => undefined)
        .then(() => {
          if (issued === command) {
            player.play();
          }
        });
    },
    stop() {
      command += 1;
      pauseAll();
    },
    release() {
      command += 1;
      Object.values(players).forEach((player) => player.remove());
    },
  };
}
