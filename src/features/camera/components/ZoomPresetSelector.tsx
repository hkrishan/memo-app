/**
 * ZoomPresetSelector Component
 * iOS/Snapchat-style zoom pills (0.5x / 1x / 2x / 3x) above the capture button.
 * The active pill shows the live zoom value while zooming between presets.
 */

import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';

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
            hitSlop={4}
            style={[styles.pill, isActive && styles.pillActive]}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {isActive ? formatZoom(currentZoom) : pillLabel(preset)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  disabled: {
    opacity: 0.4,
  },
  pill: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  pillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    fontVariant: ['tabular-nums'],
  },
  pillTextActive: {
    color: '#FFD700',
    fontSize: 13,
  },
});

export default ZoomPresetSelector;
