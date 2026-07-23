/**
 * FeedMediaViewer Component
 * Fullscreen image viewer for feed media: opens on the tapped image and
 * pages horizontally through the rest of the post's pictures.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  FlatList,
  Pressable,
  Dimensions,
  StatusBar,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CachedImage } from "@/components/ui/CachedImage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface ViewerImage {
  uri: string;
}

interface FeedMediaViewerProps {
  images: ViewerImage[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const ViewerPage = memo<{ item: ViewerImage }>(({ item }) => (
  <View style={styles.page}>
    <CachedImage uri={item.uri} style={styles.image} contentFit="contain" />
  </View>
));

export const FeedMediaViewer: React.FC<FeedMediaViewerProps> = ({
  images,
  initialIndex,
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [activeIdx, setActiveIdx] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setActiveIdx(initialIndex);
    }
  }, [visible, initialIndex]);

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
    },
    [],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<ViewerImage> | null | undefined, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ViewerImage }) => <ViewerPage item={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: ViewerImage, index: number) => `${index}-${item.uri}`,
    [],
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        <FlatList
          data={images}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onScroll={onScroll}
          scrollEventThrottle={16}
        />

        {/* Counter */}
        {images.length > 1 && (
          <View
            style={[styles.counterPill, { top: insets.top + 14 }]}
            pointerEvents="none"
          >
            <Text style={styles.counterText}>
              {activeIdx + 1}/{images.length}
            </Text>
          </View>
        )}

        {/* Close */}
        <Pressable
          onPress={onClose}
          style={[styles.closeButton, { top: insets.top + 8 }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  page: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  counterPill: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default FeedMediaViewer;
