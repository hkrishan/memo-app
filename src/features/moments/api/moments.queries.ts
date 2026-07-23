import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "@/lib/api";
import { notify } from "@/components/global";
import { uploadIndicator } from "@/components/global/uploadIndicator";
import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/features/auth/store/authStore";
import { CreateMomentInput, Moment } from "../types/moment.types";
import momentsApi from "./moments.api";

export const momentKeys = {
  all: ["moments"] as const,
  openDrops: ["moments", "open-drops"] as const,
  byAlbum: (albumId: string) => [...momentKeys.all, albumId] as const,
  detail: (albumId: string, momentId: string) =>
    [...momentKeys.byAlbum(albumId), momentId] as const,
};

const hasOpenEvent = (moments: Moment[] | undefined) =>
  !!moments?.some(
    (moment) =>
      moment.status === "active" &&
      moment.events.some((event) => event.status === "open"),
  );

const hasActiveMoment = (moments: Moment[] | undefined) =>
  !!moments?.some((moment) => moment.status === "active");

export const useGetMomentsQuery = (albumId: string) => {
  return useQuery({
    queryKey: momentKeys.byAlbum(albumId),
    queryFn: () => momentsApi.getMoments(albumId),
    enabled: !!albumId,
    staleTime: 5 * 1000,
    placeholderData: (previousData) => previousData,
    // While an event is OPEN, poll fast so countdowns and the submission
    // rows stay fresh. While a moment is merely active (a surprise drop
    // could fire any time), poll slowly to discover it without a push.
    refetchInterval: (query) => {
      const moments = query.state.data;
      if (hasOpenEvent(moments)) return 15 * 1000;
      if (hasActiveMoment(moments)) return 60 * 1000;
      return false;
    },
  });
};

/**
 * OPEN drops the user still has to post to, across all albums. Drives the
 * app-entry takeover and the global Live Activity. Polls slowly while a
 * drop is pending so a passing deadline is noticed without a push.
 */
export const useOpenDropsQuery = () => {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: momentKeys.openDrops,
    queryFn: momentsApi.getOpenDrops,
    enabled: isAuthenticated,
    staleTime: 10 * 1000,
    refetchInterval: (query) =>
      query.state.data && query.state.data.length > 0 ? 30 * 1000 : false,
  });
};

export const useCreateMomentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      input,
    }: {
      albumId: string;
      input: CreateMomentInput;
    }) => momentsApi.createMoment(albumId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: momentKeys.byAlbum(variables.albumId),
      });
    },
  });
};

export const useCancelMomentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      momentId,
    }: {
      albumId: string;
      momentId: string;
    }) => momentsApi.cancelMoment(albumId, momentId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: momentKeys.byAlbum(variables.albumId),
      });
    },
  });
};

export const useSubmitToMomentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      albumId,
      momentId,
      eventId,
      photoId,
      frontPhotoId,
    }: {
      albumId: string;
      momentId: string;
      eventId: string;
      photoId: string;
      frontPhotoId?: string;
    }) =>
      momentsApi.submitToEvent(albumId, momentId, eventId, photoId, frontPhotoId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: momentKeys.byAlbum(variables.albumId),
      });
      // The submitted event no longer counts as an open drop
      queryClient.invalidateQueries({ queryKey: momentKeys.openDrops });
    },
  });
};

/**
 * Camera → moment bridge. When the album camera was opened from a moment's
 * "Post now" (route params carry momentId + eventId), this returns a
 * callback for CameraScreen's onPhotoUploaded: once the photo lands in the
 * album, it is submitted to the open event with the upload-pill treatment.
 * Returns undefined when the capture isn't tied to a moment.
 */
export const useMomentUploadSubmission = ({
  albumId,
  momentId,
  eventId,
}: {
  albumId?: string;
  momentId?: string;
  eventId?: string;
}): ((photo: { photoId: string }) => void) | undefined => {
  const submitMutation = useSubmitToMomentMutation();

  const handlePhotoUploaded = useCallback(
    (photo: { photoId: string }) => {
      if (!albumId || !momentId || !eventId) return;
      const indicatorId = `moment-submit-${Date.now()}`;
      uploadIndicator.begin(indicatorId, "Posting to moment…");
      // mutateAsync, not per-call callbacks: react-query drops those on
      // unmount, which would strand the pill mid-spin.
      submitMutation
        .mutateAsync({ albumId, momentId, eventId, photoId: photo.photoId })
        .then(() => {
          uploadIndicator.succeed(indicatorId, "Posted to moment");
        })
        .catch((error) => {
          if (isApiError(error) && error.status === 409) {
            uploadIndicator.succeed(indicatorId, "Already posted");
            notify.error("Already posted", "You already posted for this drop");
          } else {
            uploadIndicator.fail(indicatorId, "Couldn't post to moment");
          }
        });
    },
    [albumId, momentId, eventId, submitMutation],
  );

  if (!albumId || !momentId || !eventId) return undefined;
  return handlePhotoUploaded;
};
