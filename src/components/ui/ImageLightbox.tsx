import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
  Text,
} from "react-native";
import PagerView from "react-native-pager-view";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { stableCacheKey } from "@/lib/imageCache";

type LightboxItem = {
  uri: string;
  type: "photo" | "video";
};

interface ImageLightboxProps {
  visible: boolean;
  initialIndex: number;
  items: LightboxItem[];
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  visible,
  initialIndex,
  items,
  onClose,
}) => {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="rgba(0,0,0,0.8)"
      />
      <View style={styles.overlay}>
        <PagerView
          style={styles.pager}
          initialPage={initialIndex}
          onPageSelected={(e) => setIndex(e.nativeEvent.position)}
        >
          {items.map((item, i) => (
            <View key={`${item.uri}-${i}`} style={styles.page}>
              {item.type === "video" ? (
                <Video
                  source={{ uri: item.uri }}
                  style={styles.image}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                />
              ) : (
                <Image
                  source={{ uri: item.uri, cacheKey: stableCacheKey(item.uri) }}
                  style={styles.image}
                  contentFit="contain"
                  transition={100}
                  cachePolicy="memory-disk"
                />
              )}
            </View>
          ))}
        </PagerView>

        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterText}>
            {index + 1}/{items.length}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  closeButton: {
    position: "absolute",
    top: Platform.select({ ios: 50, android: 30, default: 30 }),
    right: 20,
    padding: 8,
  },
  counter: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  counterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
