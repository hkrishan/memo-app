/**
 * The modal bottom sheet.
 *
 * Six screens had each hand-rolled the same thing: a transparent Modal, a
 * full-bleed backdrop Pressable that dismisses, a rounded panel pinned to
 * the bottom, a grabber, and safe-area padding. This is that, once.
 *
 * Two skins, because the app genuinely has two: `light` for in-app sheets
 * and `dark` for anything presented over the camera.
 *
 * Not a replacement for the @gorhom sheets — those are the draggable,
 * snap-pointed ones (comments, tags). This is the tap-to-dismiss kind.
 */

import React, { memo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Rendered as the sheet's heading when given. */
  title?: string;
  /** `dark` matches the camera UI; `light` is the in-app default. */
  tone?: "light" | "dark";
  /** Hides the drag affordance for sheets that are pure menus. */
  showGrabber?: boolean;
  /** Extra padding/height on the panel itself. */
  style?: ViewStyle;
  children: React.ReactNode;
}

export const Sheet = memo<SheetProps>(
  ({
    visible,
    onClose,
    title,
    tone = "light",
    showGrabber = true,
    style,
    children,
  }) => {
    const insets = useSafeAreaInsets();
    const dark = tone === "dark";

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.container}>
          {/* Backdrop: anywhere outside the panel dismisses */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View
            style={[
              styles.sheet,
              dark ? styles.sheetDark : styles.sheetLight,
              { paddingBottom: insets.bottom + 12 },
              style,
            ]}
          >
            {showGrabber && (
              <View
                style={[
                  styles.grabber,
                  dark ? styles.grabberDark : styles.grabberLight,
                ]}
              />
            )}
            {title != null && (
              <Text
                style={[
                  styles.title,
                  dark ? styles.titleDark : styles.titleLight,
                ]}
              >
                {title}
              </Text>
            )}
            {children}
          </View>
        </View>
      </Modal>
    );
  },
);
Sheet.displayName = "Sheet";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  sheetLight: {
    backgroundColor: "#fff",
  },
  sheetDark: {
    backgroundColor: "#1c1c1e",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  grabberLight: {
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  grabberDark: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  title: {
    fontSize: 17,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  titleLight: {
    color: "#000",
  },
  titleDark: {
    color: "#fff",
  },
});

export default Sheet;
