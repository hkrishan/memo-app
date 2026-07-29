import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useGetAlbumQuery } from "../api/album.queries";
import { AlbumChatScreen } from "./AlbumScreen/chat";

const ChatScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();

  const { data: album } = useGetAlbumQuery(albumId!);

  const handleBack = () => {
    router.back();
  };

  return (
    <KeyboardProvider>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {album?.title ?? "Chat"}
          </Text>
          <View style={styles.placeholder} />
        </View>
        {albumId && (
          <AlbumChatScreen
            albumId={albumId}
            albumTitle={album?.title}
            contentTop={0}
            bottomInset={insets.bottom}
          />
        )}
      </View>
    </KeyboardProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  placeholder: {
    width: 40,
    height: 40,
  },
});

export default ChatScreen;
