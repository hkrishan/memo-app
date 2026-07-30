/**
 * CreateAlbumScreenB — the editorial "New album" form (albums-tab A/B,
 * "editorial" arm). Reached from AddAlbumSheetB; the classic arm keeps
 * CreateAlbumScreen's single name field.
 *
 * Name + description post straight to the API. The visibility choice is
 * presentational for now — every album is invite-only server-side, so
 * "Invite only" and "Just you" only differ in whether you invite anyone,
 * and "Public page" (album Pages) is marked SOON until creation wires up
 * to it. Invite suggestions come from the members already embedded in the
 * cached albums list; since invites are link-based, selecting people
 * routes into the new album's share screen after creation.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { notify } from "@/components/global";
import SocialAvatar from "../components/photoSocial/SocialAvatar";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useCreateAlbumMutation, useGetAlbumsQuery } from "../api/album.queries";
import { AlbumMember } from "../types/album.types";
import { color, font, radius, type } from "@/lib/tokens";

type Visibility = "invite" | "solo";

/**
 * People you already share albums with, most-seen first — the cached
 * albums list embeds each album's members, so this costs no extra fetch.
 */
const useSuggestedPeople = (limit = 6): AlbumMember[] => {
  const { data: albums } = useGetAlbumsQuery();
  const myUserId = useAuthStore((state) => state.user?.id);

  return useMemo(() => {
    const seen = new Map<string, { member: AlbumMember; count: number }>();
    for (const album of albums ?? []) {
      for (const member of album.members ?? []) {
        if (member.userId === myUserId) continue;
        const entry = seen.get(member.userId);
        if (entry) entry.count += 1;
        else seen.set(member.userId, { member, count: 1 });
      }
    }
    return [...seen.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((entry) => entry.member);
  }, [albums, myUserId, limit]);
};

interface VisibilityOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
  onPress?: () => void;
}

const VisibilityOption: React.FC<VisibilityOptionProps> = ({
  icon,
  title,
  subtitle,
  selected = false,
  disabled = false,
  badge,
  onPress,
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    style={({ pressed }) => [
      styles.option,
      selected && styles.optionSelected,
      disabled && styles.optionDisabled,
      pressed && !disabled && styles.pressedDim,
    ]}
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled }}
    accessibilityLabel={`${title}. ${subtitle}`}
  >
    <View style={styles.optionIconWell}>
      <Ionicons name={icon} size={18} color={color.textPrimary} />
    </View>
    <View style={styles.optionTextWrap}>
      <View style={styles.optionTitleRow}>
        <Text style={styles.optionTitle}>{title}</Text>
        {badge != null && (
          <View style={styles.optionBadge}>
            <Text style={styles.optionBadgeLabel}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.optionSubtitle}>{subtitle}</Text>
    </View>
    {selected ? (
      <View style={styles.radioSelected}>
        <Ionicons name="checkmark" size={13} color={color.textInverse} />
      </View>
    ) : (
      <View style={styles.radioEmpty} />
    )}
  </Pressable>
);

const CreateAlbumScreenB: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [albumName, setAlbumName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("invite");
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  const suggestedPeople = useSuggestedPeople();
  const createAlbumMutation = useCreateAlbumMutation();

  const canCreate = albumName.trim().length > 0;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleSelectVisibility = useCallback((next: Visibility) => {
    Haptics.selectionAsync();
    setVisibility(next);
    // "Just you" means no invites — clear any picked people
    if (next === "solo") setSelectedPeople(new Set());
  }, []);

  const togglePerson = useCallback((userId: string) => {
    Haptics.selectionAsync();
    setSelectedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setVisibility((current) => (current === "solo" ? "invite" : current));
  }, []);

  const handleCreate = async () => {
    if (!canCreate || createAlbumMutation.isPending) return;

    const wantsInvites = selectedPeople.size > 0;
    try {
      const result = await createAlbumMutation.mutateAsync({
        title: albumName.trim(),
        description: description.trim() || undefined,
      });

      router.back();
      setTimeout(() => {
        router.push(`/album/${result.albumId}`);
      }, 500);
      // Invites are link-based — land the user on the share screen so the
      // people they picked actually get asked in
      if (wantsInvites) {
        setTimeout(() => {
          router.push(`/album/${result.albumId}/add-members`);
        }, 900);
      }
    } catch {
      notify.error("Couldn't create the album", "Please try again");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar barStyle="dark-content" />

      {/* X · New album */}
      <View style={styles.navBar}>
        <Pressable
          onPress={handleClose}
          hitSlop={8}
          style={({ pressed }) => [
            styles.navButton,
            pressed && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={color.textPrimary} />
        </Pressable>
        <Text style={styles.navTitle}>New album</Text>
        <View style={styles.navButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Cover placeholder + name/description */}
        <View style={styles.nameRow}>
          <View style={styles.coverWell}>
            <Ionicons
              name="image-outline"
              size={22}
              color={color.textTertiary}
            />
            <Text style={styles.coverLabel}>Cover</Text>
          </View>
          <View style={styles.nameFields}>
            <Text style={styles.fieldOverline}>Album name</Text>
            <TextInput
              style={styles.nameInput}
              value={albumName}
              onChangeText={setAlbumName}
              placeholder="e.g. Gotland, july"
              placeholderTextColor={color.textTertiary}
              autoFocus
              returnKeyType="next"
              accessibilityLabel="Album name"
            />
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description"
              placeholderTextColor={color.textTertiary}
              accessibilityLabel="Album description"
            />
          </View>
        </View>

        {/* Visibility */}
        <Text style={styles.sectionOverline}>Who can see it</Text>
        <View style={styles.optionsGroup}>
          <VisibilityOption
            icon="lock-closed-outline"
            title="Invite only"
            subtitle="Only people you invite can see and add"
            selected={visibility === "invite"}
            onPress={() => handleSelectVisibility("invite")}
          />
          <VisibilityOption
            icon="globe-outline"
            title="Public page"
            subtitle="Anyone with the link can follow"
            disabled
            badge="SOON"
          />
          <VisibilityOption
            icon="remove-circle-outline"
            title="Just you"
            subtitle="Private, invite people later"
            selected={visibility === "solo"}
            onPress={() => handleSelectVisibility("solo")}
          />
        </View>

        {/* Invite people */}
        {suggestedPeople.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionOverline}>Invite people</Text>
              <Text style={styles.sectionAside}>Optional</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.peopleRow}
            >
              {suggestedPeople.map((person) => {
                const picked = selectedPeople.has(person.userId);
                return (
                  <Pressable
                    key={person.userId}
                    onPress={() => togglePerson(person.userId)}
                    style={({ pressed }) => [
                      styles.personCell,
                      pressed && styles.pressedDim,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: picked }}
                    accessibilityLabel={`Invite ${person.name}`}
                  >
                    <View>
                      <SocialAvatar
                        name={person.name}
                        avatarUrl={person.avatarUrl}
                        size={54}
                        surface="light"
                      />
                      {picked && (
                        <View style={styles.personCheck}>
                          <Ionicons
                            name="checkmark"
                            size={11}
                            color={color.textInverse}
                          />
                        </View>
                      )}
                    </View>
                    <Text style={styles.personName} numberOfLines={1}>
                      {person.name.split(" ")[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Rules */}
        <Text style={styles.sectionOverline}>Rules</Text>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Members can add photos</Text>
          {/* No per-album permission API yet — everyone you invite can
              add, so the switch states the truth and stays put */}
          <Switch
            value
            disabled
            trackColor={{ true: color.textPrimary }}
            accessibilityLabel="Members can add photos"
          />
        </View>
        <Text style={styles.ruleCaption}>
          Everyone you invite can add their own photos.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={handleCreate}
          disabled={!canCreate || createAlbumMutation.isPending}
          style={({ pressed }) => [
            styles.createButton,
            !canCreate && styles.createButtonDisabled,
            pressed && canCreate && styles.pressedDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create album"
        >
          {createAlbumMutation.isPending ? (
            <ActivityIndicator size="small" color={color.textInverse} />
          ) : (
            <>
              <Text
                style={[
                  styles.createButtonLabel,
                  !canCreate && styles.createButtonLabelDisabled,
                ]}
              >
                Create album
              </Text>
              <Ionicons
                name="arrow-forward"
                size={17}
                color={canCreate ? color.textInverse : color.textTertiary}
              />
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.bg,
  },
  pressedDim: {
    opacity: 0.7,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    ...type.navTitle,
    color: color.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  nameRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 28,
  },
  coverWell: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(0, 0, 0, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  coverLabel: {
    fontSize: 12,
    ...font.medium,
    color: color.textTertiary,
  },
  nameFields: {
    flex: 1,
  },
  fieldOverline: {
    ...type.overline,
    color: color.textSecondary,
    marginBottom: 4,
  },
  nameInput: {
    fontSize: 24,
    ...font.semibold,
    color: color.textPrimary,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.textPrimary,
  },
  descriptionInput: {
    ...type.body,
    color: color.textPrimary,
    paddingVertical: 8,
  },
  sectionOverline: {
    ...type.overline,
    color: color.textSecondary,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionAside: {
    ...type.caption,
    color: color.textTertiary,
    marginBottom: 10,
  },
  optionsGroup: {
    gap: 10,
    marginBottom: 28,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.16)",
  },
  optionSelected: {
    borderWidth: 1.5,
    borderColor: color.textPrimary,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextWrap: {
    flex: 1,
    gap: 1,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  optionTitle: {
    fontSize: 15,
    ...font.semibold,
    color: color.textPrimary,
  },
  optionBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    backgroundColor: color.surface2,
  },
  optionBadgeLabel: {
    fontSize: 9,
    ...font.bold,
    letterSpacing: 0.6,
    color: color.textSecondary,
  },
  optionSubtitle: {
    fontSize: 13,
    ...font.regular,
    color: color.textSecondary,
  },
  radioSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(0, 0, 0, 0.18)",
  },
  peopleRow: {
    gap: 16,
    paddingBottom: 4,
    marginBottom: 24,
  },
  personCell: {
    alignItems: "center",
    gap: 6,
    width: 58,
  },
  personCheck: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.textPrimary,
    borderWidth: 1.5,
    borderColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  personName: {
    fontSize: 12,
    ...font.medium,
    color: color.textSecondary,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ruleLabel: {
    ...type.body,
    color: color.textPrimary,
  },
  ruleCaption: {
    ...type.caption,
    color: color.textTertiary,
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.full,
    backgroundColor: color.textPrimary,
  },
  createButtonDisabled: {
    backgroundColor: color.surface2,
  },
  createButtonLabel: {
    fontSize: 16,
    ...font.semibold,
    color: color.textInverse,
  },
  createButtonLabelDisabled: {
    color: color.textTertiary,
  },
});

export default CreateAlbumScreenB;
