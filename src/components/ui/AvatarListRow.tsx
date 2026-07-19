import { AlbumMember } from "@/features/album/types/album.types";
import { User } from "@/features/user/types/user.types";
import { View } from "react-native";
import Avatar from "./Avatar";

type AvatarListRowProps = {
  avatars: AlbumMember[] | User[];
  maxAvatars?: number;
  avatarSize?: number;
  gap?: number;
};
const AvatarListRow = ({
  avatars,
  maxAvatars = 5,
  avatarSize = 32,
  gap = 0,
}: AvatarListRowProps) => {
  return (
    <View
      style={{
        flexDirection: "row",
      }}
    >
      {avatars.slice(0, maxAvatars).map((member, index) => {
        return (
          <View
            style={{ marginLeft: index === 0 ? 0 : gap }}
            key={member.userId}
          >
            <Avatar
              key={member.userId}
              user={member as User}
              size={avatarSize}
            />
          </View>
        );
      })}
    </View>
  );
};

export default AvatarListRow;
