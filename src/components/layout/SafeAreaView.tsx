import useSize from "@/hooks/useSize";
import React, { forwardRef, useMemo } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Edge = "top" | "bottom" | "left" | "right";

export type SafeAreaViewProps = ViewProps & {
  edges?: Edge[];
  tabBar?: boolean;
  mode?: "padding" | "margin";
};

const SafeAreaView = forwardRef<View, SafeAreaViewProps>(
  (
    {
      style,
      edges = ["top", "bottom"],
      tabBar = false,
      mode = "padding",
      ...rest
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();

    const size = useSize();

    const computed = useMemo(() => {
      const base = StyleSheet.flatten(style) ?? {};

      // Resolve base paddings (respect padding / paddingVertical / paddingHorizontal / side-specific)
      const p = (base as any).padding ?? 0;
      const pv = (base as any).paddingVertical ?? p;
      const ph = (base as any).paddingHorizontal ?? p;
      const pt0 = (base as any).paddingTop ?? pv;
      const pb0 = (base as any).paddingBottom ?? pv;
      const pl0 = (base as any).paddingLeft ?? ph;
      const pr0 = (base as any).paddingRight ?? ph;

      // Resolve base margins the same way
      const m = (base as any).margin ?? 0;
      const mv = (base as any).marginVertical ?? m;
      const mh = (base as any).marginHorizontal ?? m;
      const mt0 = (base as any).marginTop ?? mv;
      const mb0 = (base as any).marginBottom ?? mv;
      const ml0 = (base as any).marginLeft ?? mh;
      const mr0 = (base as any).marginRight ?? mh;

      if (mode === "padding") {
        return {
          paddingTop: pt0 + (edges.includes("top") ? insets.top : 0),
          paddingBottom:
            pb0 +
            (edges.includes("bottom")
              ? tabBar
                ? size.tabBottomPadding
                : insets.bottom
              : 0),
          paddingLeft: pl0 + (edges.includes("left") ? insets.left : 0),
          paddingRight: pr0 + (edges.includes("right") ? insets.right : 0),
        };
      } else {
        return {
          marginTop: mt0 + (edges.includes("top") ? insets.top : 0),
          marginBottom:
            mb0 +
            (edges.includes("bottom")
              ? tabBar
                ? size.tabBottomPadding
                : insets.bottom
              : 0),
          marginLeft: ml0 + (edges.includes("left") ? insets.left : 0),
          marginRight: mr0 + (edges.includes("right") ? insets.right : 0),
        };
      }
    }, [style, edges, insets, mode]);

    // Put user style FIRST and our computed additive style LAST so sums win
    return <View ref={ref} style={[style, computed]} {...rest} />;
  },
);

export default SafeAreaView;
