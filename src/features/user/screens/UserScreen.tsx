import { Animated, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import useUser from "../hooks/useUser";
import Avatar from "@/components/ui/Avatar";

const UserScreen = () => {
  const { user } = useUser();
  return (
    <Animated.ScrollView
      style={{
        flex: 1,
      }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        padding: 20,
      }}
    >
      <Avatar user={user} size={140} />
      <Text style={styles.name}>{user?.name}</Text>
    </Animated.ScrollView>
  );
};

export default UserScreen;

const styles = StyleSheet.create({
  name: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 10,
  },
});
