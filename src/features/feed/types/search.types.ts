/** The viewer's relationship to a page in search results. */
export type PageFollowStatus = "member" | "accepted" | "pending" | "none";

export type PageSearchResult = {
  pageId: string;
  albumId: string;
  pageHandle: string;
  pageTitle: string | null;
  bio: string | null;
  isPublic: boolean;
  coverUrl: string | null;
  followerCount: number;
  myStatus: PageFollowStatus;
};

export type PageSearchResponse = {
  results: PageSearchResult[];
};
