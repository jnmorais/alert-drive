import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { VEHICLE_TYPES } from '../core/types';
import { buildOverallSummaryText, createAllScenarioReports, type ScenarioReport } from '../simulation/report';
import { SCENARIOS } from '../simulation/scenarios';
import {
  approvalLabel,
  AUTOMATIC_SCENARIOS_NOTE,
  groupReports,
  overallResultText,
  RUNNING_SCENARIOS_LABEL,
  runScenariosLabel,
} from '../text/scenarioResultsText';
import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';
import { ActionButton } from './ActionButton';

const PAINT_BEFORE_RUN_DELAY = 50;

export function AutomaticScenariosPanel() {
  const colors = useThemeColors();
  const [reports, setReports] = useState<ScenarioReport[] | null>(null);
  const [running, setRunning] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);
  const pendingRun = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pendingRun.current !== null) {
        clearTimeout(pendingRun.current);
      }
    },
    [],
  );

  function runAll(): void {
    setRunning(true);
    setShowFullReport(false);
    pendingRun.current = setTimeout(() => {
      pendingRun.current = null;
      setReports(createAllScenarioReports());
      setRunning(false);
    }, PAINT_BEFORE_RUN_DELAY);
  }

  const textColor = { color: colors.text };

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={[styles.heading, textColor]}>
        Cenários automáticos
      </Text>
      <Text style={[styles.text, textColor]}>{AUTOMATIC_SCENARIOS_NOTE}</Text>
      <ActionButton
        label={running ? RUNNING_SCENARIOS_LABEL : runScenariosLabel(SCENARIOS.length, VEHICLE_TYPES.length)}
        variant="secondary"
        disabled={running}
        onPress={runAll}
      />
      {reports !== null && !running && (
        <View style={styles.panel}>
          <Text accessibilityLiveRegion="polite" style={[styles.result, textColor]}>
            {overallResultText(reports)}
          </Text>
          {groupReports(reports).map((group) => (
            <View key={group.scenarioId} style={[styles.box, { borderColor: colors.border }]}>
              <Text style={[styles.groupTitle, textColor]}>{`${group.scenarioId} – ${group.title}`}</Text>
              {group.results.map((result) => (
                <View key={result.vehicleType}>
                  <Text style={[styles.text, textColor]}>
                    {`${result.label}: `}
                    <Text style={styles.bold}>{approvalLabel(result.approved)}</Text>
                  </Text>
                  {result.failures.map((failure) => (
                    <Text key={failure} style={[styles.failure, textColor]}>{`• ${failure}`}</Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
          <ActionButton
            label={showFullReport ? 'Esconder relatório completo' : 'Ver relatório completo'}
            variant="secondary"
            onPress={() => setShowFullReport((visible) => !visible)}
          />
          {showFullReport && (
            <Text selectable style={[styles.report, textColor, { borderColor: colors.border }]}>
              {buildOverallSummaryText(reports)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.medium,
  },
  heading: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  text: {
    fontSize: fontSizes.body,
  },
  bold: {
    fontWeight: '700',
  },
  result: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  box: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.medium,
    gap: spacing.small,
  },
  groupTitle: {
    fontSize: fontSizes.body,
    fontWeight: '700',
  },
  failure: {
    fontSize: fontSizes.body - 2,
    paddingLeft: spacing.medium,
  },
  report: {
    fontSize: 14,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.small,
  },
});
