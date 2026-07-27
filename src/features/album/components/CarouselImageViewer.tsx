import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { stableCacheKey } from "@/lib/imageCache";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

interface CarouselImageViewerProps {
  urls: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

export const CarouselImageViewer: React.FC<CarouselImageViewerProps> = ({
  urls,
  initialIndex,
  visible,
  onClose,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const progress = useSharedValue(0);
  const [animatingOut, setAnimatingOut] = useState(false);

  useEffect(() => {
    if (visible && scrollRef.current) {
      const offsetX = initialIndex * width;
      scrollRef.current.scrollTo({ x: offsetX, animated: false });
      setCurrentIndex(initialIndex);
      progress.value = 0;
      progress.value = withTiming(1, { duration: 180 });
      setAnimatingOut(false);
    }
  }, [visible, initialIndex, progress]);

  const safeUrls = useMemo(() => urls.filter(Boolean), [urls]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== currentIndex) setCurrentIndex(idx);
  };

  const handleClose = () => {
    setAnimatingOut(true);
    progress.value = withTiming(0, { duration: 160 }, (finished) => {
      if (finished) {
        onClose();
      }
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0, 1],
          [0.92, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  if (!visible && !animatingOut) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />

        <Animated.View style={[styles.carouselWrapper, imageStyle]}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentOffset={{ x: initialIndex * width, y: 0 }}
          >
            {safeUrls.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={styles.page}>
                <Image
                  source={{ uri, cacheKey: stableCacheKey(uri) }}
                  style={styles.image}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        <View style={styles.topBar}>
          <Pressable
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={10}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.pagination} pointerEvents="none">
          <View style={styles.bulletRow}>
            {safeUrls.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.bullet,
                  idx === currentIndex ? styles.bulletActive : undefined,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  carouselWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  page: {
    width,
    height,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width,
    height,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pagination: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bulletRow: {
    flexDirection: "row",
    gap: 6,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  bulletActive: {
    backgroundColor: "#fff",
    width: 14,
    borderRadius: 7,
  },
});

export default CarouselImageViewer;
