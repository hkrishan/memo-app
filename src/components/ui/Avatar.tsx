import { User } from "@/features/user/types/user.types";
import { StyleSheet, View } from "react-native";
import { CachedImage } from "./CachedImage";

type AvatarProps = {
  user: User | undefined;
  size?: number;
};
const Avatar = ({ user, size = 30 }: AvatarProps) => {
  const avatarUrl = user?.avatarUrl ?? undefined;

  return (
    <View
      style={[
        styles.avatarContainer,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {avatarUrl ? (
        <CachedImage
          uri={avatarUrl}
          style={{ width: size, height: size }}
          showPlaceholder={false}
        />
      ) : null}
    </View>
  );
};

export default Avatar;

const styles = StyleSheet.create({
  avatarContainer: {
    overflow: "hidden",
    backgroundColor: "#ccc",
  },
});
