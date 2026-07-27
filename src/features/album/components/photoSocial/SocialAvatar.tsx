/**
 * Avatar with an initials fallback, used across the photo social components.
 * The shared ui/Avatar renders a plain gray circle when avatarUrl is missing,
 * so this local variant adds the initials treatment the dark viewer needs.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { stableCacheKey } from "@/lib/imageCache";
import { initialsFromName } from "./socialUtils";

type SocialAvatarProps = {
  name: string;
  avatarUrl: string | null;
  size?: number;
  borderColor?: string;
};

const SocialAvatar: React.FC<SocialAvatarProps> = ({
  name,
  avatarUrl,
  size = 32,
  borderColor,
}) => {
  const radius = size / 2;
  const borderStyle = borderColor
    ? { borderWidth: 1.5, borderColor }
    : undefined;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl, cacheKey: stableCacheKey(avatarUrl) }}
        style={[
          { width: size, height: size, borderRadius: radius },
          borderStyle,
        ]}
        contentFit="cover"
        cachePolicy="memory-disk"
        accessibilityLabel={`${name}'s avatar`}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius },
        borderStyle,
      ]}
      accessibilityLabel={`${name}'s avatar`}
    >
      <Text style={[styles.initials, { fontSize: Math.max(10, size * 0.38) }]}>
        {initialsFromName(name)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#fff",
    fontWeight: "600",
  },
});

export default SocialAvatar;
