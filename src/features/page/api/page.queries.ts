import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { CreatePageInput, UpdatePageInput } from "../types/page.types";
import pageApi from "./page.api";

export const useCreatePageMutation = () => {
  return useMutation({
    mutationFn: ({
      albumId,
      input,
    }: {
      albumId: string;
      input: CreatePageInput;
    }) => pageApi().createPage(albumId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page", variables.albumId],
      });
    },
  });
};

export const useUpdatePageMutation = () => {
  return useMutation({
    mutationFn: ({
      albumId,
      pageId,
      input,
    }: {
      albumId: string;
      pageId: string;
      input: UpdatePageInput;
    }) => pageApi().updatePage(albumId, pageId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page", variables.albumId],
      });
    },
  });
};

export const useGetPageQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["page", albumId],
    queryFn: () => pageApi().getPage(albumId),
    staleTime: 5 * 60 * 1000,
  });
};

/** Standalone viewer's read-only page profile (GET .../page/:pageId/view). */
export const usePageProfileQuery = (albumId: string, pageId: string) => {
  return useQuery({
    queryKey: ["page", "view", albumId, pageId],
    queryFn: () => pageApi().getPageView(albumId, pageId),
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * The album members behind a page (viewer-accessible — powers the feed's
 * "who's in this" sheet). `enabled` gates the fetch to when the sheet is
 * actually open, so scrolling the feed fetches nothing.
 */
export const usePageMembersQuery = (
  albumId: string,
  pageId: string,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ["page", "members", albumId, pageId],
    queryFn: () => pageApi().getPageMembers(albumId, pageId),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
};

export const useSetWebPasswordMutation = () => {
  return useMutation({
    mutationFn: ({
      albumId,
      pageId,
      password,
    }: {
      albumId: string;
      pageId: string;
      password: string | null;
    }) => pageApi().setWebPassword(albumId, pageId, password),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page", variables.albumId],
      });
    },
  });
};
