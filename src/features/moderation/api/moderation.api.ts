import { endpoints, httpClient } from "@/lib/api";
import {
  BlockedUser,
  ReportContentParams,
  ReportContentResponse,
} from "../types/moderation.types";

type BlockedUsersResponse = {
  blocked: BlockedUser[];
};

const moderationApi = {
  /** Report a piece of user-generated content (or a user/album). */
  reportContent: async (
    params: ReportContentParams,
  ): Promise<ReportContentResponse> =>
    httpClient.post<ReportContentResponse>(endpoints.moderation.report, params),

  /** The current user's block list. */
  getBlockedUsers: async (): Promise<BlockedUser[]> => {
    const response = await httpClient.get<BlockedUsersResponse>(
      endpoints.user.blocks,
    );
    return response.blocked ?? [];
  },

  blockUser: async (userId: string): Promise<void> => {
    await httpClient.post<void>(endpoints.user.block(userId));
  },

  unblockUser: async (userId: string): Promise<void> => {
    await httpClient.delete<void>(endpoints.user.block(userId));
  },
};

export default moderationApi;
