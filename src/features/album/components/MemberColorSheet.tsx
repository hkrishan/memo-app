/**
 * MemberColorSheet — "pick your color" bottom card, presented over the
 * album screen the first time a member opens an album where they have no
 * identity color yet. A grid of the 12 server-palette swatches; colors
 * taken by other members render dimmed with a tiny avatar of their owner
 * and are not selectable while free colors remain (once every color is
 * taken the server allows duplicates, so they become selectable again).
 *
 * While the member has no color the sheet is deliberately NOT dismissible
 * (no backdrop tap, Android back is swallowed) — picking is required.
 * Exception: after a failed save (network trouble) a "Not now" escape
 * appears so nobody gets locked out offline. A 409 ("already taken")
 * refetches the members and keeps the sheet open with an inline error.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import Avatar from "@/components/ui/Avatar";
import { ApiError } from "@/lib/api";
import { useSetMemberColorMutation } from "../api/album.queries";
import { AlbumMember } from "../types/album.types";
import { MEMBER_COLOR_PALETTE } from "../memberColor";

const SWATCH_SIZE = 56;
const SWATCH_INNER = 40;

type MemberColorSheetProps = {
  visible: boolean;
  albumId: string;
  /** The album's members (colors included) — drives taken/free swatches. */
  members: AlbumMember[];
  /** Me — my current color (if any) renders pre-selected. */
  currentUserId: string;
  onClose: () => void;
};

export const MemberColorSheet: React.FC<MemberColorSheetProps> = ({
  visible,
  albumId,
  members,
  currentUserId,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const setColor = useSetMemberColorMutation(albumId);

  const me = members.find((m) => m.userId === currentUserId);
  const myColor = me?.color ?? null;

  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Flips true after the first failed save so an offline user can escape
  const [canEscape, setCanEscape] = useState(false);

  // Fresh session every time the sheet opens; my current color (if any)
  // starts selected.
  useEffect(() => {
    if (visible) {
      setSelected(myColor);
      setError(null);
      setCanEscape(false);
    }
    // Intentionally NOT keyed on myColor: mid-session member refetches must
    // not clobber an in-progress selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // color -> the OTHER member who owns it (mine renders as selected, not taken)
  const takenBy = useMemo(() => {
    const map = new Map<string, AlbumMember>();
    for (const member of members) {
      if (member.userId === currentUserId || !member.color) continue;
      if (!map.has(member.color)) map.set(member.color, member);
    }
    return map;
  }, [members, currentUserId]);

  // Server-side uniqueness only holds while free colors remain — once the
  // palette is exhausted, taken swatches become selectable again.
  const freeRemain = MEMBER_COLOR_PALETTE.some((c) => !takenBy.has(c));

  // Required until I actually have a color; a failed save unlocks "Not now"
  const dismissible = myColor != null || canEscape;

  const handleSelect = useCallback((color: string) => {
    Haptics.selectionAsync();
    setSelected(color);
    setError(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selected || setColor.isPending) return;
    setError(null);
    setColor.mutate(selected, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          // Someone grabbed it first — refetch the members so the swatch
          // turns "taken", and ask again.
          queryClient.invalidateQueries({ queryKey: ["albums", albumId] });
          setError("That color was just taken");
          setSelected(null);
        } else {
          setError("Couldn't save your color. Check your connection.");
          setCanEscape(true);
        }
      },
    });
  }, [selected, setColor, onClose, queryClient, albumId]);

  const handleRequestClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.root}>
        {/* Backdrop dismisses only once dismissal is allowed at all */}
        <Pressable
          style={styles.backdrop}
          onPress={handleRequestClose}
          accessibilityRole={dismissible ? "button" : undefined}
          accessibilityLabel={dismissible ? "Close" : undefined}
        />

        <View
          style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <Text style={styles.title}>Pick your color</Text>
          <Text style={styles.subtitle}>
            It identifies you in this album — on your photos, messages and
            drops. Each member gets their own.
          </Text>

          <View style={styles.grid}>
            {MEMBER_COLOR_PALETTE.map((color) => {
              const owner = takenBy.get(color);
              const taken = owner != null;
              const disabled = taken && freeRemain;
              const isSelected = selected === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => handleSelect(color)}
                  disabled={disabled || setColor.isPending}
                  style={[
                    styles.swatchRing,
                    isSelected && { borderColor: color },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected: isSelected }}
                  accessibilityLabel={
                    taken ? `Color taken by ${owner.name}` : "Color"
                  }
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: color },
                      disabled && styles.swatchTaken,
                    ]}
                  >
                    {taken ? (
                      <Avatar user={owner} size={20} />
                    ) : isSelected ? (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {error != null && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleConfirm}
            disabled={!selected || setColor.isPending}
            style={({ pressed }) => [
              styles.confirmButton,
              (!selected || setColor.isPending) && styles.confirmDisabled,
              pressed && !!selected && styles.confirmPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Confirm color"
          >
            {setColor.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmLabel}>Confirm</Text>
            )}
          </Pressable>

          {/* Escape hatch: only after a failed save (or when already colored) */}
          {dismissible && (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.notNowButton,
                pressed && styles.notNowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={styles.notNowLabel}>Not now</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  // Selection ring around the swatch, with a small gap
  swatchRing: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: 3,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    margin: 6,
  },
  swatch: {
    width: SWATCH_INNER,
    height: SWATCH_INNER,
    borderRadius: SWATCH_INNER / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchTaken: {
    opacity: 0.35,
  },
  error: {
    fontSize: 13,
    fontWeight: "600",
    color: "#E5484D",
    textAlign: "center",
    marginTop: 12,
  },
  confirmButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  confirmDisabled: {
    opacity: 0.35,
  },
  confirmPressed: {
    opacity: 0.85,
  },
  confirmLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  notNowButton: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  notNowPressed: {
    opacity: 0.6,
  },
  notNowLabel: {
    color: "#8E8E93",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default MemberColorSheet;
