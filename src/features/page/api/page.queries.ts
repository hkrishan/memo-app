import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { CreatePageInput } from "../types/page.types";
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

export const useGetPageQuery = (albumId: string) => {
  return useQuery({
    queryKey: ["page", albumId],
    queryFn: () => pageApi().getPage(albumId),
    staleTime: 5 * 60 * 1000,
  });
};
