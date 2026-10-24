import { Pressable, StyleSheet, Text } from 'react-native';

import { fontSizes, MIN_TOUCH_TARGET, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function OptionButton({ label, selected, onPress }: OptionButtonProps) {
  const colors = useThemeColors();
  const pair = selected ? colors.primaryButton : { background: colors.background, text: colors.text };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pair.background,
          borderColor: selected ? colors.primaryButton.background : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: pair.text }]}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 12,
    borderWidth: 3,
    paddingHorizontal: spacing.large,
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.button,
    fontWeight: '700',
  },
});
