import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { AutomaticScenariosPanel } from '../components/AutomaticScenariosPanel';
import { OptionButton } from '../components/OptionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { Stepper } from '../components/Stepper';
import { SwitchButton } from '../components/SwitchButton';
import { systemClock } from '../services/systemClock';
import { deviceUtcOffsetMinutes } from '../services/timeZone';
import { DEFAULT_SPEED_FACTOR, localTimeOnSameDay, SPEED_FACTOR_PRESETS } from '../simulation/clock';
import { SCENARIOS } from '../simulation/scenarios';
import { scriptDuration, stepStartHour } from '../simulation/speedScript';
import { settingsFor } from '../state/preferences';
import { usePreferences } from '../state/PreferencesContext';
import { createSimulationRunner } from '../state/simulationRunner';
import { useTripController } from '../state/TripContext';
import { browserTimers } from '../state/tripController';
import { VEHICLE_TYPE_LABELS } from '../text/labels';
import {
  AUTO_RESPONSE_LABEL,
  autoResponseValue,
  formatStartTime,
  progressText,
  scenarioOptionLabel,
  scriptLengthNote,
  SIMULATION_STATUS_LABELS,
  SIMULATION_TOUCH_NOTE,
  speedFactorLabel,
  speedText,
  START_TIME_NOTE,
} from '../text/simulationText';
import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

const FIRST_SCENARIO = SCENARIOS[0]!;

export default function SimulationScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const controller = useTripController();
  const preferences = usePreferences();
  const runner = useMemo(
    () => createSimulationRunner({ controller, timers: browserTimers, realClock: systemClock }),
    [controller],
  );
  const progress = useSyncExternalStore(runner.subscribe, runner.getSnapshot, runner.getSnapshot);
  const [scenarioId, setScenarioId] = useState(FIRST_SCENARIO.id);
  const [speedFactor, setSpeedFactor] = useState(DEFAULT_SPEED_FACTOR);
  const [autoRespond, setAutoRespond] = useState(false);
  const settings = settingsFor(preferences);
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId) ?? FIRST_SCENARIO;
  const plan = scenario.plan(settings);
  const [startHour, setStartHour] = useState(plan.startLocalHour);

  useEffect(() => () => runner.stop(), [runner]);

  function chooseScenario(id: string): void {
    const chosen = SCENARIOS.find((candidate) => candidate.id === id) ?? FIRST_SCENARIO;
    setScenarioId(chosen.id);
    setStartHour(chosen.plan(settings).startLocalHour);
  }

  function start(): void {
    const utcOffsetMinutes = deviceUtcOffsetMinutes(systemClock);
    runner.start({
      vehicleType: preferences.vehicleType,
      settings,
      segments: plan.segments,
      startAt: localTimeOnSameDay(systemClock.now(), startHour, plan.startLocalMinute, utcOffsetMinutes),
      utcOffsetMinutes,
      speedFactor,
      responder: autoRespond ? plan.responder : null,
    });
    router.push('/trip');
  }

  const active = progress.status === 'running' || progress.status === 'paused';
  const textStyle = [styles.text, { color: colors.text }];

  if (progress.status !== 'idle') {
    return (
      <ScreenContainer>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
          {SIMULATION_STATUS_LABELS[progress.status]}
        </Text>
        <View style={[styles.box, { borderColor: colors.border }]}>
          <Text style={textStyle}>{scenarioOptionLabel(scenario)}</Text>
          <Text style={[styles.value, { color: colors.text }]}>{progressText(progress)}</Text>
          <Text style={textStyle}>{`Velocidade do roteiro: ${speedText(progress.speedKmh)}`}</Text>
          <Text style={textStyle}>{speedFactorLabel(progress.speedFactor)}</Text>
        </View>
        <ActionButton label="Ver viagem" onPress={() => router.push('/trip')} />
        {active && (
          <ActionButton
            label={progress.status === 'paused' ? 'Continuar' : 'Pausar'}
            variant="secondary"
            onPress={progress.status === 'paused' ? runner.resume : runner.pause}
          />
        )}
        <ActionButton label="Encerrar simulação" variant="secondary" onPress={runner.stop} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={textStyle}>{`Perfil: ${VEHICLE_TYPE_LABELS[preferences.vehicleType]} (escolhido na tela inicial)`}</Text>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Roteiro
      </Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {SCENARIOS.map((candidate) => (
          <OptionButton
            key={candidate.id}
            label={scenarioOptionLabel(candidate)}
            selected={candidate.id === scenario.id}
            onPress={() => chooseScenario(candidate.id)}
          />
        ))}
      </View>
      <Text style={textStyle}>{`Esperado: ${scenario.expectedOutcome}`}</Text>
      <Text style={textStyle}>{scriptLengthNote(scriptDuration(plan.segments), speedFactor)}</Text>

      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Aceleração
      </Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {SPEED_FACTOR_PRESETS.map((factor) => (
          <OptionButton
            key={factor}
            label={speedFactorLabel(factor)}
            selected={factor === speedFactor}
            onPress={() => setSpeedFactor(factor)}
          />
        ))}
      </View>

      <Stepper
        label="Horário de início"
        value={formatStartTime(startHour, plan.startLocalMinute)}
        note={START_TIME_NOTE}
        canDecrease
        canIncrease
        onDecrease={() => setStartHour((hour) => stepStartHour(hour, 'decrease'))}
        onIncrease={() => setStartHour((hour) => stepStartHour(hour, 'increase'))}
      />

      <SwitchButton
        label={AUTO_RESPONSE_LABEL}
        value={autoResponseValue(autoRespond)}
        checked={autoRespond}
        onPress={() => setAutoRespond((enabled) => !enabled)}
      />
      <Text style={textStyle}>{SIMULATION_TOUCH_NOTE}</Text>

      <ActionButton label="Iniciar simulação" onPress={start} />

      <AutomaticScenariosPanel />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  text: {
    fontSize: fontSizes.body,
  },
  value: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  group: {
    gap: spacing.small,
  },
  box: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.medium,
    gap: spacing.small,
  },
});
