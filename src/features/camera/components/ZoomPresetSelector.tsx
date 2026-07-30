/**
 * ZoomPresetSelector Component
 * Bare zoom labels (.5 / 1x / 2 / 3) above the capture button — no pill
 * chrome; the active lens reads bigger with a dot beneath it, and shows the
 * live zoom value while zooming between presets.
 */

import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';

import { font } from '@/lib/tokens';
import { ZoomLevel } from '../types';

interface ZoomPresetSelectorProps {
  zoomLevels: ZoomLevel[];
  activePreset: ZoomLevel | null;
  currentZoom: number;
  onSelect: (preset: ZoomLevel) => void;
  disabled?: boolean;
}

const formatZoom = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}x` : `${rounded.toFixed(1)}x`;
};

const pillLabel = (preset: ZoomLevel): string =>
  preset.value < 1 ? `.${Math.round(preset.value * 10)}` : `${preset.value}`;

export const ZoomPresetSelector: React.FC<ZoomPresetSelectorProps> = ({
  zoomLevels,
  activePreset,
  currentZoom,
  onSelect,
  disabled,
}) => {
  // A single lens (e.g. front camera) needs no selector
  if (zoomLevels.length < 2) {
    return null;
  }

  // When between presets, highlight the nearest preset at or below the zoom
  const highlighted =
    activePreset ??
    [...zoomLevels].reverse().find((p) => p.value <= currentZoom + 0.001) ??
    zoomLevels[0];

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      {zoomLevels.map((preset) => {
        const isActive = preset.label === highlighted.label;
        return (
          <Pressable
            key={preset.label}
            onPress={() => onSelect(preset)}
            disabled={disabled}
            hitSlop={8}
            style={styles.option}
          >
            <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
              {isActive ? formatZoom(currentZoom) : pillLabel(preset)}
            </Text>
            <View style={[styles.dot, !isActive && styles.dotHidden]} />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 22,
  },
  disabled: {
    opacity: 0.4,
  },
  option: {
    minWidth: 24,
    alignItems: 'center',
  },
  optionText: {
    ...font.semibold,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  optionTextActive: {
    ...font.bold,
    color: '#fff',
    fontSize: 16,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: '#fff',
  },
  dotHidden: {
    opacity: 0,
  },
});

export default ZoomPresetSelector;
