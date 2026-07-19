import React, { memo } from "react";
import { StyleSheet } from "react-native";
import { Galeria } from "@nandorojo/galeria";

import { MediaAsset } from "../../hooks";
import { CachedImage } from "@/components/ui/CachedImage";

interface PhotoItemProps {
  asset: MediaAsset;
  index: number;
  itemSize: number;
  spacing: number;
}

const PhotoItem = memo<PhotoItemProps>(
  ({ asset, index, itemSize, spacing }) => (
    <Galeria.Image
      index={index}
      style={[styles.photoItem, itemStyle(itemSize, spacing)]}
    >
      <CachedImage
        uri={asset.thumbnailUrl ?? asset.uri}
        style={styles.photoImage}
        showPlaceholder={false}
      />
    </Galeria.Image>
  ),
  (prev, next) => prev.asset.id === next.asset.id && prev.index === next.index,
);

const itemStyle = (size: number, spacing: number) => ({
  width: size,
  height: size,
  marginHorizontal: spacing / 2,
  marginBottom: spacing,
  backgroundColor: "#f0f0f0",
});

const styles = StyleSheet.create({
  photoItem: {
    borderRadius: 4,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
});

export default PhotoItem;
