import SafeAreaView from "@/components/layout/SafeAreaView";
import useAuth from "@/features/auth/hooks/useAuth";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";

const MoreScreen = () => {
  const auth = useAuth();
  return (
    <ScrollView
      style={{
        flex: 1,
      }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 20,
      }}
    >
      <SafeAreaView>
        <Text style={styles.title}>More Screen</Text>
        <Button onPress={auth.logout}>Logout</Button>
      </SafeAreaView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
});

export default MoreScreen;
