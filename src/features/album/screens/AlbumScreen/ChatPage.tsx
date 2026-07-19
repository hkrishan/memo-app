import React, { memo } from "react";
import { View, StyleSheet } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AlbumChatScreen } from "./chat";

interface ChatPageProps {
  contentTop: number;
  albumId?: string;
  albumTitle?: string;
}

const ChatPage = memo<ChatPageProps>(({ contentTop, albumId, albumTitle }) => {
  if (!albumId) {
    return <View style={styles.container} />;
  }

  return (
    <KeyboardProvider>
      <View style={styles.container}>
        <AlbumChatScreen
          albumId={albumId}
          albumTitle={albumTitle}
          contentTop={contentTop}
        />
      </View>
    </KeyboardProvider>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});

export default ChatPage;
