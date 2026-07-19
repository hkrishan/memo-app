/**
 * ImageViewer Context
 * Provides global access to the image viewer from anywhere in the app
 * Supports horizontal swiping between images and vertical drag to dismiss
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import { MediaAsset } from "@/features/album/hooks";
import { ImagePosition } from "@/features/album/components/ImageViewer";

interface ImageViewerContextValue {
  openImage: (assets: MediaAsset[], initialIndex: number, position: ImagePosition) => void;
  closeImage: () => void;
  onCloseComplete: () => void;
  assets: MediaAsset[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  position: ImagePosition | null;
  visible: boolean;
  openKey: number;
  activeAssetId: string | null;
  isClosing: boolean;
}

const ImageViewerContext = createContext<ImageViewerContextValue | null>(null);

export function ImageViewerProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [position, setPosition] = useState<ImagePosition | null>(null);
  const [visible, setVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [openKey, setOpenKey] = useState(0);

  const openImage = useCallback((newAssets: MediaAsset[], initialIndex: number, newPosition: ImagePosition) => {
    setAssets(newAssets);
    setCurrentIndex(initialIndex);
    setPosition(newPosition);
    setVisible(true);
    setIsClosing(false);
    setOpenKey((k) => k + 1);
  }, []);

  const closeImage = useCallback(() => {
    setIsClosing(true);
  }, []);

  const onCloseComplete = useCallback(() => {
    setVisible(false);
    setIsClosing(false);
    setAssets([]);
    setCurrentIndex(0);
  }, []);

  // Active asset ID - show placeholder only when visible AND not closing
  const currentAsset = assets[currentIndex] ?? null;
  const activeAssetId = (visible && !isClosing) ? currentAsset?.id ?? null : null;

  return (
    <ImageViewerContext.Provider value={{
      openImage,
      closeImage,
      onCloseComplete,
      assets,
      currentIndex,
      setCurrentIndex,
      position,
      visible,
      openKey,
      activeAssetId,
      isClosing
    }}>
      {children}
    </ImageViewerContext.Provider>
  );
}

export function useImageViewer() {
  const context = useContext(ImageViewerContext);
  if (!context) {
    throw new Error("useImageViewer must be used within ImageViewerProvider");
  }
  return context;
}
