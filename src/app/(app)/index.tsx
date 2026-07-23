import SwipeableTabs from "@/components/SwipeableTabs";
import CameraScreen from "@/features/camera/screens/CameraScreen";
import FeedScreen from "@/features/feed/screens/FeedTabScreen";
import AlbumTabScreen from "@/features/album/screens/AlbumTabScreen";

const tabs = [
  {
    key: "albums",
    icon: "images-outline" as const,
    iconFocused: "images" as const,
    component: <AlbumTabScreen />,
    topBar: { title: "My Albums" },
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
];

export default function HomePage() {
  return <SwipeableTabs tabs={tabs} initialPage={1} />;
}
