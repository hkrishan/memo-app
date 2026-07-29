import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

/**
 * Persisted "finished the intro flow" flag read by the (app) gate.
 * MMKV (sync) on purpose — the gate must know the answer on its first
 * render; an AsyncStorage-backed store hydrates a frame late and would
 * flash the onboarding redirect for users who already completed it.
 * Deliberately NOT reset on logout: the flow primes device-level
 * permissions, which survive account changes.
 */
const onboardingStorage = new MMKV({ id: "onboarding-storage" });

const zustandStorage = {
  getItem: (name: string) => onboardingStorage.getString(name) ?? null,
  setItem: (name: string, value: string) => {
    onboardingStorage.set(name, value);
  },
  removeItem: (name: string) => {
    onboardingStorage.delete(name);
  },
};

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  /** The camera's location priming sheet (map + why) was shown once. */
  hasSeenLocationPrimer: boolean;
  /** The album Page tab's first-visit explainer was shown once. */
  hasSeenPageIntro: boolean;
  completeOnboarding: () => void;
  markLocationPrimerSeen: () => void;
  markPageIntroSeen: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      hasSeenLocationPrimer: false,
      hasSeenPageIntro: false,
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      markLocationPrimerSeen: () => set({ hasSeenLocationPrimer: true }),
      markPageIntroSeen: () => set({ hasSeenPageIntro: true }),
    }),
    {
      name: "onboarding-store",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

export const selectHasCompletedOnboarding = (state: OnboardingState) =>
  state.hasCompletedOnboarding;
export const selectHasSeenLocationPrimer = (state: OnboardingState) =>
  state.hasSeenLocationPrimer;
export const selectHasSeenPageIntro = (state: OnboardingState) =>
  state.hasSeenPageIntro;
