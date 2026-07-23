/**
 * Pluggable moment type registry. The Moments page and create sheet only
 * ever iterate this record — adding a future moment type means adding ONE
 * entry here (plus its CreateForm/ActiveCard components). No per-type
 * conditionals may exist outside these entries.
 */

import {
  ChallengeConfig,
  DailyDropConfig,
  MomentType,
} from "../types/moment.types";
import { MomentTypeDefinition } from "./registry.types";
import DailyDropCreateForm from "../components/DailyDropCreateForm";
import ChallengeCreateForm from "../components/ChallengeCreateForm";
import DailyDropCard from "../components/DailyDropCard";
import ChallengeCard from "../components/ChallengeCard";
import { formatDeadline } from "../utils/time";

export type {
  MomentTypeDefinition,
  MomentCardProps,
  MomentCreateFormProps,
} from "./registry.types";

export const momentTypeRegistry: Record<MomentType, MomentTypeDefinition> = {
  daily_drop: {
    type: "daily_drop",
    displayName: "Daily Drop",
    tagline: "Surprise pings — everyone races to post in minutes",
    icon: "flash",
    accentColor: "#FF9500",
    CreateForm: DailyDropCreateForm,
    ActiveCard: DailyDropCard,
    describeConfig: (config) => {
      const c = config as DailyDropConfig;
      const drops = c.dropsPerDay === 1 ? "1 drop" : `${c.dropsPerDay} drops`;
      return `${c.days} days · ${drops}/day · ${c.responseWindowMinutes} min to post`;
    },
  },
  challenge: {
    type: "challenge",
    displayName: "Challenge",
    tagline: "Set a prompt, race the deadline for the best shot",
    icon: "trophy",
    accentColor: "#5E5CE6",
    CreateForm: ChallengeCreateForm,
    ActiveCard: ChallengeCard,
    describeConfig: (config) => {
      const c = config as ChallengeConfig;
      return `Ends ${formatDeadline(c.deadlineAt)}`;
    },
  },
};

/** Stable iteration order for pickers/heroes */
export const momentTypeList: MomentTypeDefinition[] =
  Object.values(momentTypeRegistry);
