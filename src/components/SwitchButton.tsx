import { Pressable, StyleSheet, Text } from 'react-native';

import { fontSizes, MIN_TOUCH_TARGET, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

interface SwitchButtonProps {
  label: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  fixed?: boolean;
  onPress?: () => void;
}

export function SwitchButton({ label, value, checked, disabled = false, fixed = false, onPress }: SwitchButtonProps) {
  const colors = useThemeColors();
  const pair = checked ? colors.primaryButton : { background: colors.background, text: colors.text };
  const blocked = disabled || fixed;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ checked, disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.switch,
        {
          backgroundColor: pair.background,
          borderColor: checked ? colors.primaryButton.background : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: pair.text }]}>{label}</Text>
      <Text style={[styles.value, { color: pair.text }]}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 12,
    borderWidth: 3,
    paddingHorizontal: spacing.large,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.medium,
  },
  label: {
    fontSize: fontSizes.button,
    fontWeight: '700',
  },
  value: {
    fontSize: fontSizes.body,
    fontWeight: '700',
  },
});
