/**
 * SkillSprint design tokens.
 * Concept: a running track. Cobalt is the track, Flame is the streak,
 * Volt marks XP. Surfaces are cool and calm so the colour carries meaning.
 */
export const palette = {
  cobalt: '#3B5BFD',
  cobaltDeep: '#2A44D6',
  cobaltSoft: '#E6EBFF',
  flame: '#FF6B35',
  flameSoft: '#FFE8DE',
  volt: '#D4F53C',
  rose: '#EF476F',
  roseSoft: '#FDE4EA',
  mint: '#14A774',
  mintSoft: '#DDF6EC',
  amber: '#F5A524',
  ink: '#1A1E3A',
  paper: '#F6F7FB',
  white: '#FFFFFF',
};

export interface Theme {
  dark: boolean;
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textMuted: string;
    textOnPrimary: string;
    primary: string;
    primaryPressed: string;
    primarySoft: string;
    shadowBlock: string;
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    streak: string;
    streakSoft: string;
    xp: string;
    heart: string;
    locked: string;
    track: string;
  };
}

export const lightTheme: Theme = {
  dark: false,
  colors: {
    bg: palette.paper,
    surface: palette.white,
    surfaceAlt: '#EEF0F7',
    border: '#DCE0EC',
    text: palette.ink,
    textMuted: '#5B6180',
    textOnPrimary: palette.white,
    primary: palette.cobalt,
    primaryPressed: palette.cobaltDeep,
    primarySoft: palette.cobaltSoft,
    shadowBlock: palette.ink,
    success: palette.mint,
    successSoft: palette.mintSoft,
    danger: '#D93358',
    dangerSoft: palette.roseSoft,
    streak: palette.flame,
    streakSoft: palette.flameSoft,
    xp: palette.volt,
    heart: palette.rose,
    locked: '#B9BFD3',
    track: '#E3E7F3',
  },
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    bg: '#12152B',
    surface: '#1C2142',
    surfaceAlt: '#252B52',
    border: '#323A68',
    text: '#EEF0FA',
    textMuted: '#A3A9C8',
    textOnPrimary: palette.white,
    primary: '#5873FF',
    primaryPressed: '#4660F0',
    primarySoft: '#27306B',
    shadowBlock: '#05061A',
    success: '#2CC489',
    successSoft: '#163D36',
    danger: '#FF5C7F',
    dangerSoft: '#46203A',
    streak: '#FF8150',
    streakSoft: '#46291F',
    xp: palette.volt,
    heart: '#FF6385',
    locked: '#4A5280',
    track: '#262D57',
  },
};

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  heading: 'BricolageGrotesque_700Bold',
  headingMedium: 'BricolageGrotesque_600SemiBold',
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
  mono: 'monospace',
};

/** Type scale (modular, ~1.2 ratio) */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 31, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 25 },
  subheading: { fontFamily: fonts.headingMedium, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  smallBold: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 19 },
  tiny: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Radius by hierarchy: big containers are softest, interactive items are tighter. */
export const radius = { chip: 999, button: 14, card: 20, sheet: 28, input: 12 };

export const MIN_TOUCH = 48;
