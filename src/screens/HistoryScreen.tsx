import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { buildTripLog } from '../core/tripLog';
import { shareCsvFile } from '../services/eventLog/shareCsvFile';
import { systemClock } from '../services/systemClock';
import { deviceUtcOffsetMinutes } from '../services/timeZone';
import { exportTripHistory, type HistoryExportResult } from '../state/historyExport';
import { useTripSnapshot } from '../state/TripContext';
import { useTripHistory } from '../state/TripHistoryContext';
import type { CompletedTrip } from '../state/tripController';
import {
  EXPORT_BUTTON_LABEL,
  EXPORT_PRIVACY_NOTE,
  EXPORT_RESULT_NOTES,
  EXPORTING_LABEL,
} from '../text/historyCsv';
import {
  checkLine,
  EMPTY_HISTORY,
  HISTORY_STATUS_NOTES,
  TRIP_IN_PROGRESS_NOTE,
  tripSummaryLines,
  tripTitle,
} from '../text/historyText';
import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

interface TripCardProps {
  trip: CompletedTrip;
}

function TripCard({ trip }: TripCardProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const log = buildTripLog(trip.effects);
  const textColor = { color: colors.text };

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Text style={[styles.title, textColor]}>{tripTitle(trip)}</Text>
      {tripSummaryLines(trip, log).map((line) => (
        <Text key={line} style={[styles.text, textColor]}>
          {line}
        </Text>
      ))}
      {log.checks.length > 0 && (
        <ActionButton
          label={expanded ? 'Esconder verificações' : 'Ver verificações'}
          variant="secondary"
          onPress={() => setExpanded((visible) => !visible)}
        />
      )}
      {expanded &&
        log.checks.map((check, index) => (
          <Text key={`${check.startedAt}-${index}`} style={[styles.detail, textColor]}>
            {`${index + 1}. ${checkLine(check, trip.config.utcOffsetMinutes)}`}
          </Text>
        ))}
    </View>
  );
}

function ExportSection({ trips }: { trips: readonly CompletedTrip[] }) {
  const colors = useThemeColors();
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<HistoryExportResult | null>(null);
  const textColor = { color: colors.text };

  async function handleExport() {
    setExporting(true);
    setResult(null);
    const exported = await exportTripHistory({
      trips,
      at: systemClock.now(),
      utcOffsetMinutes: deviceUtcOffsetMinutes(systemClock),
      share: shareCsvFile,
    });
    setResult(exported);
    setExporting(false);
  }

  return (
    <View style={styles.section}>
      <ActionButton
        label={exporting ? EXPORTING_LABEL : EXPORT_BUTTON_LABEL}
        disabled={exporting}
        onPress={() => void handleExport()}
      />
      {result !== null && <Text style={[styles.text, textColor]}>{EXPORT_RESULT_NOTES[result]}</Text>}
      <Text style={[styles.text, textColor]}>{EXPORT_PRIVACY_NOTE}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const colors = useThemeColors();
  const snapshot = useTripSnapshot();
  const history = useTripHistory();
  const trips = [...history.trips].reverse();
  const textColor = { color: colors.text };

  return (
    <ScreenContainer>
      {snapshot.trip !== null && <Text style={[styles.text, textColor]}>{TRIP_IN_PROGRESS_NOTE}</Text>}
      {history.trips.length > 0 && <ExportSection trips={history.trips} />}
      {trips.length === 0 ? (
        <Text style={[styles.title, textColor]}>{EMPTY_HISTORY}</Text>
      ) : (
        trips.map((trip) => <TripCard key={`${trip.config.startedAt}-${trip.endedAt}`} trip={trip} />)
      )}
      <Text style={[styles.text, textColor]}>{HISTORY_STATUS_NOTES[history.status]}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.small,
  },
  card: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.medium,
    gap: spacing.small,
  },
  title: {
    fontSize: fontSizes.body + 2,
    fontWeight: '700',
  },
  text: {
    fontSize: fontSizes.body,
  },
  detail: {
    fontSize: fontSizes.body - 2,
  },
});
