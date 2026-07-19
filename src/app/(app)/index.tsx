import SwipeableTabs from "@/components/SwipeableTabs";
import CameraScreen from "@/features/camera/screens/CameraScreen";
import FeedScreen from "@/features/feed/screens/FeedTabScreen";
import AlbumTabScreen from "@/features/album/screens/AlbumTabScreen";

const tabs = [
  {
    key: "albums",
    icon: "albums-outline" as const,
    iconFocused: "albums" as const,
    component: <AlbumTabScreen />,
    topBar: { title: "My Albums" },
  },
  {
    key: "camera",
    icon: "camera-outline" as const,
    iconFocused: "camera" as const,
    component: <CameraScreen />,
  },
  {
    key: "feed",
    icon: "diamond-outline" as const,
    iconFocused: "diamond" as const,
    component: <FeedScreen />,
    topBar: { title: "Feed" },
  },
];

export default function HomePage() {
  return <SwipeableTabs tabs={tabs} initialPage={1} />;
}
