/**
 * Retired v1 collage editor route — everything now lands in the Studio.
 * Old deep links carry their params across; a collage projectId upgrades
 * in place when the Studio opens it.
 */

import { Redirect, useLocalSearchParams } from "expo-router";

export default () => {
  const params = useLocalSearchParams<{
    projectId?: string;
    templateId?: string;
  }>();
  return <Redirect href={{ pathname: "/create/studio", params }} />;
};
