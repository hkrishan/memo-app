/**
 * PageIntroSheet
 * First-visit explainer for the album's Page tab, shown once (globally,
 * persisted) when the user first swipes to a Page that exists. Albums
 * without a page don't need it — the create-page hero explains itself.
 * Light tone (the album screen is light), same editorial language as the
 * onboarding flow: serif-italic accent headline, hairline rows, bare icons.
 */

import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import Sheet from "@/components/ui/Sheet";
import { color, font, scriptType } from "@/lib/tokens";

interface PageIntroSheetProps {
  visible: boolean;
  onClose: () => void;
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const ROWS: ReadonlyArray<{ icon: IoniconName; text: string }> = [
  { icon: "planet-outline", text: "A public profile with its own @handle and link" },
  { icon: "images-outline", text: "Members choose which photos make it on" },
  { icon: "heart-outline", text: "Anyone can follow, like, and comment" },
];

const PageIntroSheet = memo<PageIntroSheetProps>(({ visible, onClose }) => (
  <Sheet visible={visible} onClose={onClose}>
    <View style={styles.content}>
      <Animated.View entering={FadeInDown.duration(300)}>
        <Text style={styles.title}>
          Meet your album's{"\n"}
          <Text style={styles.titleAccent}>Page</Text>
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <Text style={styles.body}>
          The Gallery stays private to members. The Page is your album's
          public side — a profile you curate and share.
        </Text>
      </Animated.View>

      <View style={styles.rows}>
        {ROWS.map((row, i) => (
          <Animated.View
            key={row.icon}
            entering={FadeInDown.duration(300).delay(120 + i * 60)}
            style={styles.row}
          >
            <Ionicons name={row.icon} size={20} color={color.textPrimary} />
            <Text style={styles.rowText}>{row.text}</Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInDown.duration(300).delay(320)}>
        <Pressable
          style={styles.button}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Got it</Text>
        </Pressable>
      </Animated.View>
    </View>
  </Sheet>
));
PageIntroSheet.displayName = "PageIntroSheet";

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 26,
    ...font.bold,
    letterSpacing: -0.5,
    lineHeight: 34,
    color: color.textPrimary,
  },
  titleAccent: {
    ...scriptType(26),
    letterSpacing: 0,
    color: color.textPrimary,
  },
  body: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: color.textSecondary,
  },
  rows: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    ...font.medium,
    color: color.textPrimary,
  },
  button: {
    marginTop: 20,
    backgroundColor: "#111",
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 17,
    ...font.bold,
    color: "#fff",
  },
});

export default PageIntroSheet;
