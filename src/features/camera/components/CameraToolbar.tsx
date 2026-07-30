/**
 * CameraToolbar Component
 * Vertical toolbar on the right edge: flip camera, flash, photo timer,
 * grid, night mode. Monochrome: an engaged control flips to a solid white
 * circle with a black glyph; the flip button sits bare (it has no on/off
 * state to signal).
 */

import React, { useCallback } from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { font } from '@/lib/tokens';

import type { DualCameraLayout } from '../../../../modules/dual-camera';
import { CameraPosition, FlashMode, TimerMode } from '../types';
import {
  FLASH_MODE_CYCLE,
  FLASH_ICONS,
  TIMER_MODE_CYCLE,
  CAMERA_UI_CONFIG,
  DUAL_LAYOUT_LABELS,
} from '../constants';
import { DualLayoutGlyph } from './DualLayoutGlyph';

const { CONTROL_BUTTON, COLORS } = CAMERA_UI_CONFIG;

interface ToolbarButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  badge?: string;
  disabled?: boolean;
  /** No circle behind the glyph (stateless buttons like flip). */
  bare?: boolean;
  accessibilityLabel?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon,
  onPress,
  active,
  badge,
  disabled,
  bare,
  accessibilityLabel,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    style={[
      styles.button,
      bare && styles.buttonBare,
      active && styles.buttonActive,
      disabled && styles.buttonDisabled,
    ]}
  >
    <Ionicons
      name={icon}
      size={CONTROL_BUTTON.ICON_SIZE}
      color={active ? '#000' : COLORS.TEXT}
    />
    {badge != null && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    )}
  </Pressable>
);

/**
 * Opens the layout picker, showing the current arrangement as its icon —
 * the same miniature the picker uses, so the button reads as "this is how
 * the cameras are arranged" rather than as an abstract settings symbol.
 */
const DualLayoutButton: React.FC<{
  layout: DualCameraLayout;
  onPress: () => void;
  disabled?: boolean;
}> = ({ layout, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={`Dual camera layout: ${DUAL_LAYOUT_LABELS[layout]}. Tap to change.`}
    style={[styles.button, disabled && styles.buttonDisabled]}
  >
    <DualLayoutGlyph
      layout={layout}
      color={COLORS.TEXT}
      size={CONTROL_BUTTON.ICON_SIZE}
    />
  </Pressable>
);

interface CameraToolbarProps {
  cameraPosition: CameraPosition;
  onFlip: () => void;
  flashAvailable: boolean;
  flashMode: FlashMode;
  onFlashChange: (mode: FlashMode) => void;
  timerMode: TimerMode;
  onTimerChange: (mode: TimerMode) => void;
  gridEnabled: boolean;
  onToggleGrid: () => void;
  nightSupported: boolean;
  nightMode: boolean;
  onToggleNight: () => void;
  disabled?: boolean;

  /** Device can run both cameras at once — hides the toggle when it can't. */
  dualSupported?: boolean;
  dualMode?: boolean;
  onToggleDual?: () => void;
  dualLayout?: DualCameraLayout;
  /** Opens the layout picker. */
  onOpenDualLayouts?: () => void;
  /** Swaps which camera fills the main pane. */
  onSwapDual?: () => void;
}

export const CameraToolbar: React.FC<CameraToolbarProps> = ({
  cameraPosition,
  onFlip,
  flashAvailable,
  flashMode,
  onFlashChange,
  timerMode,
  onTimerChange,
  gridEnabled,
  onToggleGrid,
  nightSupported,
  nightMode,
  onToggleNight,
  disabled,
  dualSupported,
  dualMode,
  onToggleDual,
  dualLayout,
  onOpenDualLayouts,
  onSwapDual,
}) => {
  const cycleFlash = useCallback(() => {
    const next =
      FLASH_MODE_CYCLE[
        (FLASH_MODE_CYCLE.indexOf(flashMode) + 1) % FLASH_MODE_CYCLE.length
      ];
    onFlashChange(next);
  }, [flashMode, onFlashChange]);

  const cycleTimer = useCallback(() => {
    const next =
      TIMER_MODE_CYCLE[
        (TIMER_MODE_CYCLE.indexOf(timerMode) + 1) % TIMER_MODE_CYCLE.length
      ];
    onTimerChange(next);
  }, [timerMode, onTimerChange]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* In dual mode there is no "other" camera to flip to — the same
          button swaps which one gets the main pane instead. */}
      <ToolbarButton
        icon={dualMode ? 'swap-horizontal' : 'camera-reverse-outline'}
        onPress={dualMode ? (onSwapDual ?? onFlip) : onFlip}
        disabled={disabled}
        bare
        accessibilityLabel={dualMode ? 'Swap camera panes' : 'Flip camera'}
      />

      {/* Flash is hidden in dual mode: the torch would blow out the back
          camera's exposure while doing nothing for the front one, and
          there's no single active camera to screen-flash for. */}
      {flashAvailable && !dualMode && (
        <ToolbarButton
          icon={FLASH_ICONS[flashMode] as keyof typeof Ionicons.glyphMap}
          onPress={cycleFlash}
          active={flashMode !== FlashMode.OFF}
          badge={flashMode === FlashMode.AUTO ? 'A' : undefined}
          disabled={disabled}
        />
      )}

      <ToolbarButton
        icon="timer-outline"
        onPress={cycleTimer}
        active={timerMode !== 0}
        badge={timerMode !== 0 ? `${timerMode}s` : undefined}
        disabled={disabled}
      />

      <ToolbarButton
        icon="grid-outline"
        onPress={onToggleGrid}
        active={gridEnabled}
        disabled={disabled}
      />

      {nightSupported && !dualMode && (
        <ToolbarButton
          icon={nightMode ? 'moon' : 'moon-outline'}
          onPress={onToggleNight}
          active={nightMode}
          disabled={disabled}
        />
      )}

      {dualSupported && onToggleDual && (
        <ToolbarButton
          icon={dualMode ? 'duplicate' : 'duplicate-outline'}
          onPress={onToggleDual}
          active={dualMode}
          disabled={disabled}
          accessibilityLabel={
            dualMode ? 'Turn off dual camera' : 'Turn on dual camera'
          }
        />
      )}

      {/* Directly under the dual toggle it enables — reads as a setting
          belonging to dual mode rather than a peer of flash and grid. */}
      {dualMode && dualLayout && onOpenDualLayouts && (
        <DualLayoutButton
          layout={dualLayout}
          onPress={onOpenDualLayouts}
          disabled={disabled}
        />
      )}

      {!dualMode && cameraPosition === CameraPosition.FRONT && (
        <View style={styles.frontIndicator} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 14,
  },
  button: {
    width: CONTROL_BUTTON.SIZE,
    height: CONTROL_BUTTON.SIZE,
    borderRadius: CONTROL_BUTTON.SIZE / 2,
    backgroundColor: CONTROL_BUTTON.BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonBare: {
    backgroundColor: 'transparent',
  },
  buttonActive: {
    backgroundColor: '#fff',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  // Dark on a white border so it reads on both the idle (translucent) and
  // engaged (solid white) button faces
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...font.bold,
    color: '#fff',
    fontSize: 9,
  },
  frontIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});

export default CameraToolbar;
