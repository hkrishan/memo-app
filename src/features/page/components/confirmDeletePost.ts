import { Alert } from "react-native";
import * as Haptics from "expo-haptics";

/** One confirm dialog for every surface that can delete a post. */
export const confirmDeletePost = (onConfirm: () => void) => {
  Alert.alert(
    "Delete post?",
    "The post and its likes and comments will be removed from the page and feed.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onConfirm();
        },
      },
    ],
  );
};
