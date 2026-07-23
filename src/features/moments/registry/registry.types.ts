import type React from "react";
import type { Ionicons } from "@expo/vector-icons";
import type {
  Moment,
  MomentConfig,
  MomentEvent,
  MomentType,
} from "../types/moment.types";

/** Props every moment type's create form receives inside the bottom sheet */
export interface MomentCreateFormProps {
  albumId: string;
  /** Close the sheet (called after a successful create, or by Cancel) */
  onClose: () => void;
}

/** Props every moment type's live card receives on the Moments page */
export interface MomentCardProps {
  moment: Moment;
  /** Viewer's userId — for "you already posted" states */
  currentUserId?: string;
  /** Viewer may cancel this moment (creator or album owner) */
  canCancel: boolean;
  /** Open the album camera to post into this event */
  onPostNow: (event: MomentEvent) => void;
  /** Ask the page to confirm + cancel this moment */
  onRequestCancel: () => void;
  /** Open the moment's posts feed (card body tap) — optional per type */
  onOpenPosts?: (moment: Moment) => void;
}

/**
 * One pluggable moment type. Adding a future type must only require adding
 * a new entry to the registry — nothing outside registry entries may
 * branch on MomentType.
 */
export interface MomentTypeDefinition {
  type: MomentType;
  displayName: string;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  CreateForm: React.ComponentType<MomentCreateFormProps>;
  ActiveCard: React.ComponentType<MomentCardProps>;
  /** Short human summary of a config, e.g. "7 days · 1 drop/day" */
  describeConfig: (config: MomentConfig) => string;
}
