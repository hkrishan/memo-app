import React, { useCallback, useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import { useSharedValue } from "react-native-reanimated";

import { useGetPhotosQuery } from "../../api/photo.queries";
import { useGetAlbumQuery } from "../../api/album.queries";
import { AlbumNavBar, AlbumTabs } from "../../components";
import { MediaAsset } from "../../hooks";
import { PhotoWithUploader } from "../../types/album.types";
import GalleryPage from "./GalleryPage";
import GalleryPage2 from "./GalleryPage2";
import PagePage from "./PagePage";
import ChatPage from "./ChatPage";
import SettingsPage from "@/features/album/screens/AlbumScreen/SettingsPage";

const photoToMediaAsset = (photo: PhotoWithUploader): MediaAsset => ({
  id: photo.photoId,
  uri: photo.url,
  thumbnailUrl: photo.thumbnailUrl ?? photo.url,
  mediaType: "photo",
  width: 0,
  height: 0,
  duration: 0,
  creationTime: new Date(photo.createdAt).getTime(),
  modificationTime: new Date(photo.createdAt).getTime(),
});

const AlbumScreen = () => {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const pagerRef = useRef<PagerView>(null);
  const galleryScrollY = useSharedValue(0);
  const tabPosition = useSharedValue(0);

  const { data: album } = useGetAlbumQuery(albumId!);
  const { data: photos, isLoading } = useGetPhotosQuery(albumId);

  const assets = useMemo(() => {
    if (!photos) return [];
    return photos
      .map(photoToMediaAsset)
      .sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0));
  }, [photos]);

  const galleryUrls = useMemo(() => assets.map((asset) => asset.uri), [assets]);
  const members = useMemo(() => album?.members ?? [], [album?.members]);

  const handleBack = useCallback(() => router.back(), [router]);

  const handlePageSelected = useCallback(
    (e: any) => {
      const { position } = e.nativeEvent;
      tabPosition.value = position;
    },
    [tabPosition],
  );

  const handlePageScroll = useCallback(
    (e: any) => {
      const { position, offset } = e.nativeEvent;
      tabPosition.value = position + offset;
    },
    [tabPosition],
  );

  const handleTabPress = useCallback(
    (index: number) => {
      pagerRef.current?.setPage(index);
      tabPosition.value = index;
    },
    [tabPosition],
  );

  const contentTop = 56 + insets.top;

  return (
    <View style={styles.container}>
      <AlbumNavBar
        title={album?.title ?? "Album"}
        scrollPosition={tabPosition}
        galleryScrollY={galleryScrollY}
        onBack={handleBack}
      />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
        overdrag={false}
        offscreenPageLimit={1}
      >
        <GalleryPage
          key="gallery"
          album={album}
          assets={assets}
          galleryUrls={galleryUrls}
          isLoading={isLoading}
          galleryScrollY={galleryScrollY}
        />

        <PagePage key="page" contentTop={contentTop} />

        <ChatPage
          key="chat"
          contentTop={contentTop}
          albumId={albumId}
          albumTitle={album?.title}
        />

        <SettingsPage
          key="settings"
          contentTop={contentTop}
          albumId={albumId}
        />
      </PagerView>

      <AlbumTabs
        scrollPosition={tabPosition}
        onTabPress={handleTabPress}
        photoCount={assets.length}
        memberCount={members.length}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  pager: {
    flex: 1,
  },
});

export default AlbumScreen;
