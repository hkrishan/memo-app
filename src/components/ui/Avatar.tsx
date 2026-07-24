import { User } from "@/features/user/types/user.types";
import { StyleSheet, View } from "react-native";
import { CachedImage } from "./CachedImage";

type AvatarProps = {
  user: User | undefined;
  size?: number;
  /**
   * Album identity ring — a 2px circle in the member's color drawn around
   * the avatar (overall footprint stays `size`).
   */
  ringColor?: string;
};
const Avatar = ({ user, size = 30, ringColor }: AvatarProps) => {
  const avatarUrl = user?.avatarUrl ?? undefined;

  // With a ring, the photo shrinks to leave a hairline gap inside the 2px
  // border; tiny avatars skip the gap so the photo stays legible.
  const imageSize = ringColor ? size - (size >= 28 ? 6 : 4) : size;

  const core = (
    <View
      style={[
        styles.avatarContainer,
        { width: imageSize, height: imageSize, borderRadius: imageSize / 2 },
      ]}
    >
      {avatarUrl ? (
        <CachedImage
          uri={avatarUrl}
          style={{ width: imageSize, height: imageSize }}
          showPlaceholder={false}
        />
      ) : null}
    </View>
  );

  if (!ringColor) return core;

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: ringColor,
        },
      ]}
    >
      {core}
    </View>
  );
};

export default Avatar;

const styles = StyleSheet.create({
  avatarContainer: {
    overflow: "hidden",
    backgroundColor: "#ccc",
  },
  ring: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
