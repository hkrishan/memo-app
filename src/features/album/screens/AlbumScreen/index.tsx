import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, InteractionManager } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import { useSharedValue } from "react-native-reanimated";

import { useGetPhotosQuery } from "../../api/photo.queries";
import {
  useGetAlbumQuery,
  useMarkAlbumViewedMutation,
} from "../../api/album.queries";
import { useGetPageQuery } from "@/features/page/api/page.queries";
import { AlbumNavBar, AlbumTabs } from "../../components";
import MemberColorSheet from "../../components/MemberColorSheet";
import { photoToMediaAsset } from "../../utils/mediaAsset";
import { useAlbumPendingAssets } from "../../hooks/useAlbumPendingAssets";
import GalleryPage from "./GalleryPage";
import PagePage from "./PagePage";
import MomentsPage from "@/features/moments/screens/MomentsPage";
import { useLiveDropAlbumIds } from "@/features/moments/hooks/useLiveDropAlbumIds";
import { selectUser, useAuthStore } from "@/features/auth/store/authStore";

const TAB_COUNT = 3;

// Albums whose color picker already showed THIS app session — a "Not now"
// (offline escape) must not re-nag on every re-navigation; a still-null
// color re-triggers naturally on the next session.
const colorPromptedAlbumIds = new Set<string>();

const AlbumScreen = () => {
  const { albumId, initialTab } = useLocalSearchParams<{
    albumId: string;
    /** Optional deep-selected tab index (e.g. push routing → Moments) */
    initialTab?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Resolved once on mount: which tab the screen opens on. Push routing
  // passes initialTab=2 to land on Moments.
  const initialTabIndexRef = useRef<number | null>(null);
  if (initialTabIndexRef.current === null) {
    const parsed = Number(initialTab);
    initialTabIndexRef.current =
      Number.isInteger(parsed) && parsed >= 0 && parsed < TAB_COUNT
        ? parsed
        : 0;
  }
  const initialTabIndex = initialTabIndexRef.current;

  const pagerRef = useRef<PagerView>(null);
  // While true, onPageScroll is ignored so a programmatic setPage
  // doesn't sweep the nav title / tab highlights through intermediate tabs
  const isTabJumpRef = useRef(false);
  const galleryScrollY = useSharedValue(0);
  const pageScrollY = useSharedValue(0);
  const tabPosition = useSharedValue(initialTabIndex);

  const { data: album } = useGetAlbumQuery(albumId!);

  // Opening the album counts as "seen": clear its "NEW +n" badge on the list.
  // Fires once per albumId (mutate is stable) — NOT on scroll-past, only here
  // where the album is actually open.
  const { mutate: markAlbumViewed } = useMarkAlbumViewedMutation();
  useEffect(() => {
    if (!albumId) return;
    markAlbumViewed(albumId);
  }, [albumId, markAlbumViewed]);

  // The nav bar suppresses its "Page" tab title/background while the
  // album has no page (the create-page hero shows there instead). While
  // still loading, assume a page exists so the title never flashes away.
  const { data: page, isLoading: pageLoading } = useGetPageQuery(albumId!);
  const pageExists = pageLoading ? true : page != null;
  const { data: photos, isLoading } = useGetPhotosQuery(albumId);
  // Live-drop badge on the Moments tab — refreshed by the global takeover
  // hook (foreground, socket, push), so it flips without this screen doing
  // anything
  const liveDropAlbumIds = useLiveDropAlbumIds();
  const momentsLive = albumId ? liveDropAlbumIds.has(albumId) : false;

  // Captures still uploading to THIS album render from their local file, so
  // walking into the album straight after the shutter shows the photo (with
  // its uploading badge) instead of a gallery that's missing it
  const pendingAssets = useAlbumPendingAssets(albumId, photos);

  const assets = useMemo(() => {
    if (!photos && pendingAssets.length === 0) return [];
    return [...pendingAssets, ...(photos ?? []).map(photoToMediaAsset)].sort(
      (a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0),
    );
  }, [photos, pendingAssets]);

  const members = useMemo(() => album?.members ?? [], [album?.members]);

  // First open of an album where I have no identity color yet: present the
  // color picker (once per album per app session).
  const currentUserId = useAuthStore(selectUser)?.id;
  const [colorSheetVisible, setColorSheetVisible] = useState(false);
  useEffect(() => {
    if (!albumId || !currentUserId || !album?.members) return;
    if (colorPromptedAlbumIds.has(albumId)) return;
    const me = album.members.find((m) => m.userId === currentUserId);
    if (!me || me.color != null) return;

    // Mark synchronously so a members-refetch can't schedule a second sheet.
    colorPromptedAlbumIds.add(albumId);
    // Present only AFTER the screen's push transition has settled: an RN
    // Modal shown mid-transition silently fails to appear on iOS (which is
    // why a blocking alert in this effect made it "work" — the alert stalls
    // the JS thread past the animation).
    const handle = InteractionManager.runAfterInteractions(() => {
      setColorSheetVisible(true);
    });
    return () => handle.cancel();
  }, [albumId, currentUserId, album?.members]);
  const handleColorSheetClose = useCallback(
    () => setColorSheetVisible(false),
    [],
  );

  const handleBack = useCallback(() => router.back(), [router]);

  const handleOpenSettings = useCallback(() => {
    if (albumId) {
      router.push(`/album/${albumId}/settings`);
    }
  }, [albumId, router]);

  const handlePageSelected = useCallback(
    (e: any) => {
      const { position } = e.nativeEvent;
      tabPosition.value = position;
    },
    [tabPosition],
  );

  const handlePageScroll = useCallback(
    (e: any) => {
      if (isTabJumpRef.current) return;
      const { position, offset } = e.nativeEvent;
      tabPosition.value = position + offset;
    },
    [tabPosition],
  );

  const handlePageScrollStateChanged = useCallback((e: any) => {
    const { pageScrollState } = e.nativeEvent;
    // idle: jump finished; dragging: user grabbed the pager mid-jump
    if (pageScrollState === "idle" || pageScrollState === "dragging") {
      isTabJumpRef.current = false;
    }
  }, []);

  const handleTabPress = useCallback(
    (index: number) => {
      isTabJumpRef.current = true;
      tabPosition.value = index;
      pagerRef.current?.setPage(index);
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
        pageScrollY={pageScrollY}
        onBack={handleBack}
        onSettingsPress={handleOpenSettings}
        pageExists={pageExists}
      />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialTabIndex}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
        onPageScrollStateChanged={handlePageScrollStateChanged}
        overdrag={false}
        offscreenPageLimit={1}
      >
        <GalleryPage
          key="gallery"
          album={album}
          albumId={albumId}
          assets={assets}
          isLoading={isLoading}
          galleryScrollY={galleryScrollY}
          contentTop={contentTop}
        />

        <PagePage
          key="page"
          contentTop={contentTop}
          pageScrollY={pageScrollY}
        />

        <MomentsPage
          key="moments"
          contentTop={contentTop}
          albumId={albumId}
        />
      </PagerView>

      <AlbumTabs
        scrollPosition={tabPosition}
        onTabPress={handleTabPress}
        photoCount={assets.length}
        memberCount={members.length}
        momentsLive={momentsLive}
      />

      {albumId != null && currentUserId != null && (
        <MemberColorSheet
          visible={colorSheetVisible}
          albumId={albumId}
          members={members}
          currentUserId={currentUserId}
          onClose={handleColorSheetClose}
        />
      )}
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
