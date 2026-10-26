import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { tap } from '../lib/feedback';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '../theme/tokens';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Feather name={name} size={size} color={color ?? t.colors.text} />;
}

type Variant = keyof typeof type;
export function AppText({ variant = 'body', muted, color, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      style={[type[variant], { color: color ?? (muted ? t.colors.textMuted : t.colors.text) }, style]}
      {...rest}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  padded = true,
  contentStyle,
  ...scrollProps
}: { children: React.ReactNode; scroll?: boolean; edges?: Edge[]; padded?: boolean; contentStyle?: StyleProp<ViewStyle> } & ScrollViewProps) {
  const t = useTheme();
  const inner = padded ? { paddingHorizontal: space.lg, paddingBottom: space.xxl } : undefined;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, contentStyle]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [base, style, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }]}
    >
      {children}
    </Pressable>
  );
}

export function Row({ children, gap = space.sm, style, align = 'center' }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Spacer({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

/**
 * Primary action button. A solid offset block sits underneath and the face
 * presses down onto it — the app's signature tactile feel.
 */
export function PrimaryButton({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
  accessibilityHint,
  testID,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const t = useTheme();
  const palette: Record<ButtonKind, { bg: string; fg: string; border: string; block: string }> = {
    primary: { bg: t.colors.primary, fg: t.colors.textOnPrimary, border: t.colors.shadowBlock, block: t.colors.shadowBlock },
    secondary: { bg: t.colors.surface, fg: t.colors.text, border: t.colors.shadowBlock, block: t.colors.shadowBlock },
    ghost: { bg: 'transparent', fg: t.colors.primary, border: 'transparent', block: 'transparent' },
    success: { bg: t.colors.success, fg: '#fff', border: t.colors.shadowBlock, block: t.colors.shadowBlock },
    danger: { bg: t.colors.danger, fg: '#fff', border: t.colors.shadowBlock, block: t.colors.shadowBlock },
  };
  const p = palette[kind];
  const inactive = disabled || loading;
  const depth = kind === 'ghost' ? 0 : 4;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[{ minHeight: MIN_TOUCH + depth, paddingBottom: depth }, style]}
    >
      {({ pressed }) => (
        <View style={{ flex: 1 }}>
          {depth > 0 && (
            <View style={[StyleSheet.absoluteFill, { top: depth, bottom: -depth, borderRadius: radius.button, backgroundColor: inactive ? t.colors.locked : p.block }]} />
          )}
          <View
            style={{
              minHeight: MIN_TOUCH,
              borderRadius: radius.button,
              backgroundColor: inactive && kind !== 'ghost' ? t.colors.surfaceAlt : p.bg,
              borderWidth: depth ? 2 : 0,
              borderColor: inactive ? t.colors.locked : p.border,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: space.sm,
              paddingHorizontal: space.lg,
              transform: [{ translateY: pressed && !inactive ? depth : 0 }],
            }}
          >
            {loading ? (
              <ActivityIndicator color={p.fg} />
            ) : (
              <>
                {icon && <Icon name={icon} size={18} color={inactive ? t.colors.textMuted : p.fg} />}
                <AppText variant="subheading" color={inactive ? t.colors.textMuted : p.fg}>
                  {title}
                </AppText>
              </>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      onPress={
        onPress
          ? () => {
              tap();
              onPress();
            }
          : undefined
      }
      style={{
        minHeight: 40,
        paddingHorizontal: space.md + 2,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primarySoft : t.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon && <Icon name={icon} size={15} color={selected ? t.colors.primary : t.colors.textMuted} />}
      <AppText variant="smallBold" color={selected ? t.colors.primary : t.colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function TextField({ label, error, hint, style, ...rest }: TextInputProps & { label: string; error?: string; hint?: string }) {
    const t = useTheme();
    return (
      <View style={{ gap: 6 }}>
        <AppText variant="smallBold">{label}</AppText>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.colors.textMuted}
          style={[
            type.body,
            {
              minHeight: MIN_TOUCH,
              borderRadius: radius.input,
              borderWidth: 1.5,
              borderColor: error ? t.colors.danger : t.colors.border,
              backgroundColor: t.colors.surface,
              color: t.colors.text,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
            },
            style,
          ]}
          {...rest}
        />
        {error ? (
          <AppText variant="small" color={t.colors.danger} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : hint ? (
          <AppText variant="small" muted>
            {hint}
          </AppText>
        ) : null}
      </View>
    );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }}>
      <AppText variant="heading">{title}</AppText>
      {action && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12}>
          <AppText variant="smallBold" color={t.colors.primary}>
            {action}
          </AppText>
        </Pressable>
      )}
    </Row>
  );
}
