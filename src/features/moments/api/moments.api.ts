import { endpoints, httpClient } from "@/lib/api";
import {
  CreateMomentInput,
  Moment,
  MomentSubmission,
  OpenDrop,
} from "../types/moment.types";

const momentsApi = {
  getMoments: async (albumId: string) => {
    const { moments } = await httpClient.get<{ moments: Moment[] }>(
      endpoints.album.moments.list(albumId),
    );
    return moments;
  },

  getMoment: async (albumId: string, momentId: string) =>
    httpClient.get<Moment>(endpoints.album.moments.get(albumId, momentId)),

  createMoment: async (albumId: string, input: CreateMomentInput) =>
    httpClient.post<Moment>(endpoints.album.moments.create(albumId), input),

  /** Cancel a moment (creator/owner only) */
  cancelMoment: async (albumId: string, momentId: string) =>
    httpClient.delete<void>(endpoints.album.moments.cancel(albumId, momentId)),

  /**
   * Submit an uploaded album photo to an open event. 409 when the user
   * already submitted; late allowed up to 60 min past the deadline.
   * `frontPhotoId` carries the secondary shot of a dual capture.
   */
  submitToEvent: async (
    albumId: string,
    momentId: string,
    eventId: string,
    photoId: string,
    frontPhotoId?: string,
  ) =>
    httpClient.post<MomentSubmission>(
      endpoints.album.moments.submissions(albumId, momentId, eventId),
      frontPhotoId ? { photoId, frontPhotoId } : { photoId },
    ),

  /** OPEN events the user hasn't posted to yet, across all their albums */
  getOpenDrops: async () => {
    const { drops } = await httpClient.get<{ drops: OpenDrop[] }>(
      endpoints.user.openDrops,
    );
    return drops;
  },
};

export default momentsApi;
