/**
 * MomentsPage — the Moments tab inside AlbumScreen. Live moment cards on
 * top (rendered by each type's registry ActiveCard), a "start a moment"
 * section iterating the registry (a full hero when nothing is running),
 * and a compact history of past moments below.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { notify } from "@/components/global";
import { useGetAlbumQuery } from "@/features/album/api/album.queries";
import useUser from "@/features/user/hooks/useUser";
import {
  useCancelMomentMutation,
  useGetMomentsQuery,
} from "../api/moments.queries";
import { dropCaptureRoute } from "../hooks/useDropTakeover";
import { Moment, MomentEvent, MomentType } from "../types/moment.types";
import {
  momentTypeList,
  momentTypeRegistry,
  MomentTypeDefinition,
} from "../registry/momentTypes";
import CreateMomentSheet from "../components/CreateMomentSheet";
import { formatShortDate } from "../utils/time";

interface MomentsPageProps {
  contentTop: number;
  albumId?: string;
}

const countSubmissions = (moment: Moment): number =>
  moment.events.reduce((sum, event) => sum + event.submissions.length, 0);

/** One registry type as a start card (hero or compact) */
const TypeCard: React.FC<{
  entry: MomentTypeDefinition;
  compact: boolean;
  onPress: () => void;
}> = ({ entry, compact, onPress }) => (
  <Pressable
    style={[styles.typeCard, compact && styles.typeCardCompact]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`Start a ${entry.displayName}`}
  >
    <View
      style={[
        styles.typeIcon,
        compact && styles.typeIconCompact,
        { backgroundColor: `${entry.accentColor}1A` },
      ]}
    >
      <Ionicons
        name={entry.icon}
        size={compact ? 18 : 24}
        color={entry.accentColor}
      />
    </View>
    <View style={styles.typeCardText}>
      <Text style={[styles.typeName, compact && styles.typeNameCompact]}>
        {entry.displayName}
      </Text>
      <Text style={styles.typeTagline} numberOfLines={2}>
        {entry.tagline}
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
  </Pressable>
);

const PastMomentRow: React.FC<{ moment: Moment }> = ({ moment }) => {
  const definition = momentTypeRegistry[moment.type];
  if (!definition) return null;
  const submissionCount = countSubmissions(moment);
  const when =
    moment.status === "cancelled"
      ? "Cancelled"
      : `Ended ${formatShortDate(moment.endsAt)}`;
  return (
    <View style={styles.pastRow}>
      <View
        style={[
          styles.pastIcon,
          { backgroundColor: `${definition.accentColor}14` },
        ]}
      >
        <Ionicons
          name={definition.icon}
          size={14}
          color={definition.accentColor}
        />
      </View>
      <View style={styles.pastText}>
        <Text style={styles.pastTitle} numberOfLines={1}>
          {moment.title || definition.displayName}
        </Text>
        <Text style={styles.pastMeta}>
          {when}
          {submissionCount > 0 &&
            ` · ${submissionCount} photo${submissionCount === 1 ? "" : "s"}`}
        </Text>
      </View>
    </View>
  );
};

const MomentsPage: React.FC<MomentsPageProps> = ({ contentTop, albumId }) => {
  const router = useRouter();
  const { user } = useUser();
  const { data: album } = useGetAlbumQuery(albumId ?? "");
  const {
    data: moments,
    isLoading,
    isRefetching,
    refetch,
  } = useGetMomentsQuery(albumId ?? "");
  const cancelMutation = useCancelMomentMutation();

  const [sheetState, setSheetState] = useState<{
    visible: boolean;
    type: MomentType | null;
  }>({ visible: false, type: null });

  const activeMoments = useMemo(
    () => moments?.filter((m) => m.status === "active") ?? [],
    [moments],
  );
  const pastMoments = useMemo(
    () =>
      (moments?.filter((m) => m.status !== "active") ?? [])
        .slice()
        .sort(
          (a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime(),
        ),
    [moments],
  );

  const isOwner = !!user && album?.ownerId === user.userId;

  const openSheetFor = useCallback((type: MomentType | null) => {
    setSheetState({ visible: true, type });
  }, []);

  const closeSheet = useCallback(() => {
    setSheetState((s) => ({ ...s, visible: false }));
  }, []);

  // "Post now" → the dedicated BeReal-style drop capture screen
  const handlePostNow = useCallback(
    (moment: Moment, event: MomentEvent) => {
      if (!albumId) return;
      router.push(
        dropCaptureRoute({
          albumId,
          momentId: moment.momentId,
          eventId: event.eventId,
          deadlineAt: event.deadlineAt,
          albumTitle: album?.title,
        }) as Parameters<typeof router.push>[0],
      );
    },
    [albumId, album?.title, router],
  );

  // Card body tap → the moment's posts feed (BeReal-style, lock mechanic)
  const handleOpenPosts = useCallback(
    (moment: Moment) => {
      if (!albumId) return;
      router.push(
        `/album/${albumId}/moment/${moment.momentId}` as Parameters<
          typeof router.push
        >[0],
      );
    },
    [albumId, router],
  );

  const handleRequestCancel = useCallback(
    (moment: Moment) => {
      if (!albumId) return;
      const definition = momentTypeRegistry[moment.type];
      notify.popup({
        type: "warning",
        title: "Cancel this moment?",
        message: `"${moment.title || definition?.displayName || "Moment"}" ends for everyone in the album.`,
        primaryAction: {
          label: "Cancel moment",
          onPress: () => {
            cancelMutation.mutate(
              { albumId, momentId: moment.momentId },
              {
                onError: () => {
                  notify.error("Couldn't cancel the moment", "Please try again");
                },
              },
            );
          },
        },
        secondaryAction: {
          label: "Keep it going",
          onPress: () => {},
        },
        dismissable: true,
      });
    },
    [albumId, cancelMutation],
  );

  const hasActive = activeMoments.length > 0;
  const showHero = !isLoading && !hasActive;

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: contentTop + 12,
          paddingBottom: 120,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#888"
          />
        }
      >
        {/* Live moments */}
        {activeMoments.map((moment) => {
          const definition = momentTypeRegistry[moment.type];
          if (!definition) return null;
          const canCancel = isOwner || moment.createdBy === user?.userId;
          const { ActiveCard } = definition;
          return (
            <ActiveCard
              key={moment.momentId}
              moment={moment}
              currentUserId={user?.userId}
              canCancel={canCancel}
              onPostNow={(event) => handlePostNow(moment, event)}
              onRequestCancel={() => handleRequestCancel(moment)}
              onOpenPosts={handleOpenPosts}
            />
          );
        })}

        {/* Start a moment — full hero when nothing is running */}
        {showHero ? (
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Ionicons name="flash" size={26} color="#000" />
            </View>
            <Text style={styles.heroTitle}>Start a moment</Text>
            <Text style={styles.heroSubtitle}>
              Little photo games for everyone in this album — surprise drops,
              challenges, and whatever comes next.
            </Text>
            <View style={styles.heroCards}>
              {momentTypeList.map((entry) => (
                <TypeCard
                  key={entry.type}
                  entry={entry}
                  compact={false}
                  onPress={() => openSheetFor(entry.type)}
                />
              ))}
            </View>
          </View>
        ) : (
          !isLoading && (
            <>
              <Text style={styles.sectionTitle}>Start another</Text>
              <View style={styles.compactCards}>
                {momentTypeList.map((entry) => (
                  <TypeCard
                    key={entry.type}
                    entry={entry}
                    compact
                    onPress={() => openSheetFor(entry.type)}
                  />
                ))}
              </View>
            </>
          )
        )}

        {/* History */}
        {pastMoments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Past moments</Text>
            <View style={styles.pastGroup}>
              {pastMoments.map((moment) => (
                <PastMomentRow key={moment.momentId} moment={moment} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {albumId && (
        <CreateMomentSheet
          albumId={albumId}
          visible={sheetState.visible}
          initialType={sheetState.type}
          onClose={closeSheet}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#fff",
  },
  hero: {
    alignItems: "center",
    paddingTop: 28,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#000",
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  heroCards: {
    alignSelf: "stretch",
    gap: 12,
  },
  compactCards: {
    gap: 10,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.1)",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  typeCardCompact: {
    padding: 12,
    borderRadius: 14,
    shadowOpacity: 0.03,
  },
  typeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  typeIconCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  typeCardText: {
    flex: 1,
  },
  typeName: {
    fontSize: 16,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#000",
  },
  typeNameCompact: {
    fontSize: 14,
  },
  typeTagline: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 26,
    marginBottom: 10,
  },
  pastGroup: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.1)",
    overflow: "hidden",
  },
  pastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
  },
  pastIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pastText: {
    flex: 1,
  },
  pastTitle: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  pastMeta: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 1,
  },
});

export default MomentsPage;
