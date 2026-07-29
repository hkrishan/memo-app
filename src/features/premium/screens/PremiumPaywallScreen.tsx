/**
 * Memo Premium paywall — an iOS sheet modal. The brand background video
 * (same footage as the auth screen) fills the top and dissolves into
 * black; the wordmark, feature list, plan picker, and subscribe button
 * stack at the bottom.
 *
 * Pricing is display-only until in-app purchases are wired up — the
 * subscribe button is the integration point (see handleSubscribe).
 */

import React, { useCallback, useState } from "react";
import { Platform, Pressable, StatusBar, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { scriptType } from "@/lib/tokens";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

type PlanId = "monthly" | "yearly";

/** Display-only placeholders until StoreKit products are wired up. */
const PLANS: {
  id: PlanId;
  title: string;
  priceLine: string;
  saveLabel?: string;
}[] = [
  {
    id: "monthly",
    title: "Monthly",
    priceLine: "$6.99 per month",
  },
  {
    id: "yearly",
    title: "Yearly",
    priceLine: "$3.33 per month ($39.99 per year)",
    saveLabel: "SAVE 52%",
  },
];

const FEATURES = [
  "Unlimited shared albums",
  "Original-quality photo & video uploads",
  "Cancel anytime from the app",
];

export default function PremiumPaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("monthly");

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleSelectPlan = useCallback((plan: PlanId) => {
    Haptics.selectionAsync();
    setSelectedPlan(plan);
  }, []);

  const handleSubscribe = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // TODO: start the in-app purchase flow for `selectedPlan`
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Brand footage hero — heavily dimmed, its edges smudging into the
          black canvas: a dark wash over the whole clip, then a fade on
          every side so no hard video edge ever shows */}
      <View style={styles.hero} pointerEvents="none">
        <Video
          source={require("../../../../assets/memo-background-vid.mp4")}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
        />
        <View style={styles.heroDim} />
        <LinearGradient
          colors={["#000", "transparent"]}
          style={styles.heroFadeTop}
        />
        <LinearGradient
          colors={["#000", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.heroFadeLeft}
        />
        <LinearGradient
          colors={["transparent", "#000"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.heroFadeRight}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)", "#000"]}
          locations={[0, 0.55, 1]}
          style={styles.heroFade}
        />
      </View>

      <Pressable
        onPress={handleClose}
        hitSlop={8}
        style={[
          styles.closeButton,
          // Sheet modals already clear the notch on iOS; Android draws
          // them full-height, so only it needs the inset
          { top: (Platform.OS === "android" ? insets.top : 0) + 16 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>

      <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        {/* Wordmark: "Memo" in the app face, "Premium" in script — the
            same pairing as Memo Create */}
        <Text style={styles.title}>
          Memo <Text style={styles.titleScript}>Premium</Text>
        </Text>
        <Text style={styles.subtitle}>
          Enjoy full access with Memo Premium
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          {PLANS.map((plan) => {
            const selected = plan.id === selectedPlan;
            return (
              <Pressable
                key={plan.id}
                onPress={() => handleSelectPlan(plan.id)}
                style={[styles.planCard, selected && styles.planCardSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${plan.title}, ${plan.priceLine}`}
              >
                {selected ? (
                  <View style={styles.radioSelected}>
                    <Ionicons name="checkmark" size={16} color="#000" />
                  </View>
                ) : (
                  <View style={styles.radio} />
                )}
                <View style={styles.planText}>
                  <View style={styles.planTitleRow}>
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    {plan.saveLabel && (
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveBadgeText}>
                          {plan.saveLabel}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.planPrice}>{plan.priceLine}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleSubscribe}
          style={({ pressed }) => [
            styles.subscribeButton,
            pressed && styles.subscribeButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Subscribe now"
        >
          <Text style={styles.subscribeLabel}>Subscribe Now</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Renews automatically. Cancel any time.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "62%",
  },
  heroDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  heroFadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  heroFadeLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 56,
  },
  heroFadeRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 56,
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "60%",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(90, 90, 95, 0.55)",
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
  },
  title: {
    color: "#fff",
    fontSize: 38,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    // The serif italic's descenders need the extra line height
    lineHeight: 48,
  },
  titleScript: {
    ...scriptType(34),
    color: "#fff",
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 26,
    lineHeight: 33,
    marginTop: 6,
  },
  features: {
    marginTop: 26,
    gap: 14,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureText: {
    color: "#fff",
    fontSize: 17,
  },
  plans: {
    marginTop: 26,
    gap: 12,
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  planCardSelected: {
    borderColor: "rgba(255, 255, 255, 0.55)",
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.7)",
  },
  radioSelected: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  planText: {
    flex: 1,
  },
  planTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  saveBadge: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  saveBadgeText: {
    color: "#000",
    fontSize: 11,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  planPrice: {
    color: "#9a9aa0",
    fontSize: 15,
    marginTop: 2,
  },
  subscribeButton: {
    marginTop: 22,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  subscribeButtonPressed: {
    opacity: 0.85,
  },
  subscribeLabel: {
    color: "#000",
    fontSize: 17,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
  },
  footnote: {
    color: "#9a9aa0",
    fontSize: 15,
    textAlign: "center",
    marginTop: 14,
  },
});
