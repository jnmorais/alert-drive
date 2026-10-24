import { Pressable, StyleSheet, Text } from 'react-native';

import { fontSizes, MIN_TOUCH_TARGET, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

type ActionButtonVariant = 'primary' | 'secondary';

interface ActionButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ActionButtonVariant;
  disabled?: boolean;
}

export function ActionButton({ label, onPress, variant = 'primary', disabled = false }: ActionButtonProps) {
  const colors = useThemeColors();
  const pair = variant === 'primary' ? colors.primaryButton : colors.secondaryButton;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pair.background, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: pair.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 12,
    paddingHorizontal: spacing.large,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: fontSizes.button,
    fontWeight: '700',
  },
});
