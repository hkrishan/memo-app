/**
 * Bell button for the home top bar: opens the activity screen and shows
 * a red unread badge (same visual language as the chat unread badge).
 * Mounts the refresh listeners (foreground + push received) itself.
 */

import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Touchable from "@/components/touchable";
import { useUnreadActivityCount } from "./activity.queries";
import { useActivityRefresh } from "./useActivityRefresh";

/** Display cap — the badge renders "99+" at this value. */
const UNREAD_CAP = 99;

interface ActivityBellProps {
  /** Animated text style carrying the top bar's interpolated icon color. */
  iconColorStyle: React.ComponentProps<typeof Animated.Text>["style"];
}

const ActivityBell = memo(({ iconColorStyle }: ActivityBellProps) => {
  const router = useRouter();
  const unreadCount = useUnreadActivityCount();
  useActivityRefresh();

  return (
    <Touchable
      style={styles.button}
      onPress={() => {
        router.push("/activity");
      }}
    >
      <Animated.Text style={iconColorStyle}>
        <Ionicons name="notifications-outline" size={22} />
      </Animated.Text>
      {unreadCount > 0 && (
        <View style={styles.unreadBadge} pointerEvents="none">
          <Text style={styles.unreadBadgeText}>
            {unreadCount >= UNREAD_CAP ? `${UNREAD_CAP}+` : unreadCount}
          </Text>
        </View>
      )}
    </Touchable>
  );
});

ActivityBell.displayName = "ActivityBell";

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  // Same visual language as the album chat unread badge
  unreadBadge: {
    position: "absolute",
    top: 3,
    right: 1,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    paddingHorizontal: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
    lineHeight: 12,
  },
});

export default ActivityBell;
