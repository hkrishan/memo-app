import { Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isAndroid } from "@/utils/platform.util";

const ANDROID_NAV_BAR_EXTRA = 12;

const useSize = () => {
  const { top, bottom, left, right } = useSafeAreaInsets();

  const bottomInset =
    bottom && bottom > 0 ? bottom : isAndroid ? ANDROID_NAV_BAR_EXTRA : 0;

  const tabBarHeight = bottomInset;

  return {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,

    safeArea: {
      top,
      bottom,
      left,
      right,
      padding: {
        top: { paddingTop: top },
        bottom: { paddingBottom: bottomInset },
      },
    },
    tabBarHeight,
    tabBottomPadding: tabBarHeight,
  };
};

export default useSize;
