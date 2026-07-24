import { useLocalSearchParams } from "expo-router";
import PageProfileScreen from "@/features/page/screens/PageProfileScreen";

export default function PageProfileRoute() {
  const { albumId, pageId } = useLocalSearchParams<{
    albumId: string;
    pageId: string;
  }>();

  return <PageProfileScreen albumId={albumId ?? ""} pageId={pageId ?? ""} />;
}
