import { useLocalSearchParams } from "expo-router";
import CreateAlbumScreen from "@/features/album/screens/CreateAlbumScreen";
import CreateAlbumScreenB from "@/features/album/screens/CreateAlbumScreenB";
import JoinAlbumScreenB from "@/features/album/screens/JoinAlbumScreenB";
import {
  selectAlbumsVariant,
  useAlbumsVariantStore,
} from "@/features/album/store/albumsVariantStore";

/**
 * Albums-tab A/B: the classic arm keeps the three-step choice modal; the
 * editorial arm picks its step in AddAlbumSheetB and deep-links here with
 * ?mode=create|join (entry points without a mode land on the create form).
 */
export default () => {
  const albumsVariant = useAlbumsVariantStore(selectAlbumsVariant);
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  if (albumsVariant === "editorial") {
    return mode === "join" ? <JoinAlbumScreenB /> : <CreateAlbumScreenB />;
  }
  return <CreateAlbumScreen />;
};
