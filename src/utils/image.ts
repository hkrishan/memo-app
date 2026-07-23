export type PhotoGps = {
  latitude: number;
  longitude: number;
};

/**
 * Extract the GPS position from an expo-image-picker EXIF record.
 * iOS reports GPSLatitude/GPSLongitude as unsigned values with S/W encoded
 * in the Ref fields; some sources return them already signed. Returns null
 * when the photo carries no (valid) location.
 */
export const gpsFromExif = (
  exif: Record<string, unknown> | null | undefined,
): PhotoGps | null => {
  if (!exif) return null;
  const rawLat = exif.GPSLatitude;
  const rawLng = exif.GPSLongitude;
  if (typeof rawLat !== "number" || typeof rawLng !== "number") return null;

  let latitude = rawLat;
  let longitude = rawLng;
  if (exif.GPSLatitudeRef === "S" && latitude > 0) latitude = -latitude;
  if (exif.GPSLongitudeRef === "W" && longitude > 0) longitude = -longitude;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  return { latitude, longitude };
};

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
