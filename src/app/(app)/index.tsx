import { useMemo } from "react";
import SwipeableTabs from "@/components/SwipeableTabs";
import CameraScreen from "@/features/camera/screens/CameraScreen";
import FeedScreen from "@/features/feed/screens/FeedTabScreen";
import AlbumTabScreen from "@/features/album/screens/AlbumTabScreen";
import AlbumTabScreenB from "@/features/album/screens/AlbumTabScreenB";
import {
  selectAlbumsVariant,
  useAlbumsVariantStore,
} from "@/features/album/store/albumsVariantStore";

export default function HomePage() {
  // Albums-tab A/B — MMKV-backed, so the right variant mounts on the
  // pager's first frame (see albumsVariantStore)
  const albumsVariant = useAlbumsVariantStore(selectAlbumsVariant);

  const tabs = useMemo(
    () => [
      {
        key: "albums",
        icon: "images-outline" as const,
        iconFocused: "images" as const,
        component:
          albumsVariant === "editorial" ? <AlbumTabScreenB /> : <AlbumTabScreen />,
        // The editorial page carries its own "My albums" display title,
        // so its top bar shows the wordmark instead
        topBar: {
          title: albumsVariant === "editorial" ? "Memo" : "My Albums",
        },
      },
      {
        key: "camera",
        shutterIcon: true,
        component: <CameraScreen />,
      },
      {
        key: "feed",
        icon: "sparkles-outline" as const,
        iconFocused: "sparkles" as const,
        component: <FeedScreen />,
        topBar: { title: "Feed" },
      },
    ],
    [albumsVariant],
  );

  return <SwipeableTabs tabs={tabs} initialPage={1} />;
}
