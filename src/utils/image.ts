export const createLowResolutionUrls = (
  urls: string[],
  width: number = 512,
): string[] => {
  return urls.map((url) => {
    if (typeof url !== "string") return url;

    // Leave local/device URIs untouched.
    if (
      url.startsWith("file://") ||
      url.startsWith("ph://") ||
      url.startsWith("data:")
    ) {
      return url;
    }

    try {
      const parsed = new URL(url);
      if (!parsed.searchParams.has("w")) {
        parsed.searchParams.set("w", width.toString());
      }
      if (!parsed.searchParams.has("auto")) {
        parsed.searchParams.set("auto", "format");
      }
      return parsed.toString();
    } catch (error) {
      // If the URL can't be parsed, fall back to the original.
      return url;
    }
  });
};
