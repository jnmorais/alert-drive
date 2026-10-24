import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontSizes, MIN_TOUCH_TARGET, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

interface StepperProps {
  label: string;
  value: string;
  note: string;
  canDecrease: boolean;
  canIncrease: boolean;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}

interface StepButtonProps {
  symbol: string;
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
}

function StepButton({ symbol, accessibilityLabel, enabled, onPress }: StepButtonProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        {
          backgroundColor: colors.primaryButton.background,
          opacity: enabled ? (pressed ? 0.8 : 1) : 0.35,
        },
      ]}
    >
      <Text style={[styles.symbol, { color: colors.primaryButton.text }]}>{symbol}</Text>
    </Pressable>
  );
}

export function Stepper({
  label,
  value,
  note,
  canDecrease,
  canIncrease,
  disabled = false,
  onDecrease,
  onIncrease,
}: StepperProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.row}>
        <StepButton
          symbol="−"
          accessibilityLabel={`Diminuir ${label.toLowerCase()}`}
          enabled={!disabled && canDecrease}
          onPress={onDecrease}
        />
        <Text
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${label}: ${value}`}
          style={[styles.value, { color: colors.text }]}
        >
          {value}
        </Text>
        <StepButton
          symbol="+"
          accessibilityLabel={`Aumentar ${label.toLowerCase()}`}
          enabled={!disabled && canIncrease}
          onPress={onIncrease}
        />
      </View>
      <Text style={[styles.note, { color: colors.text }]}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
  },
  stepButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  symbol: {
    fontSize: fontSizes.headline,
    fontWeight: '700',
  },
  value: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  note: {
    fontSize: fontSizes.body,
  },
});
