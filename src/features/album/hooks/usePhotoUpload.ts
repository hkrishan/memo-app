import { useState, useCallback, useRef } from "react";
import * as MediaLibrary from "expo-media-library";
import { useUploadPhotoMutation } from "../api/photo.queries";
import { MediaAsset } from "./useMediaLibrary";
import { perf, PerfInteractions } from "@/lib/performance";

// Maximum concurrent uploads to balance speed and resource usage
const MAX_CONCURRENT_UPLOADS = 3;

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadProgress = {
  current: number;
  total: number;
};

interface UsePhotoUploadOptions {
  albumId: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

interface UsePhotoUploadReturn {
  uploadPhotos: (assets: MediaAsset[], caption?: string) => Promise<void>;
  uploadSinglePhoto: (asset: MediaAsset, caption?: string) => Promise<void>;
  status: UploadStatus;
  progress: UploadProgress;
  isUploading: boolean;
  error: Error | null;
  reset: () => void;
}

export function usePhotoUpload({
  albumId,
  onSuccess,
  onError,
}: UsePhotoUploadOptions): UsePhotoUploadReturn {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState<UploadProgress>({
    current: 0,
    total: 0,
  });
  const [error, setError] = useState<Error | null>(null);

  const uploadMutation = useUploadPhotoMutation();

  const getMimeType = (mediaType: "photo" | "video"): string => {
    return mediaType === "video" ? "video/mp4" : "image/jpeg";
  };

  const uploadSinglePhoto = useCallback(
    async (asset: MediaAsset, caption?: string) => {
      setStatus("uploading");
      setProgress({ current: 0, total: 1 });
      setError(null);

      const endPerfTrace = perf.startInteraction(PerfInteractions.UPLOAD_SINGLE);

      try {
        // Get the asset info to ensure we have the correct URI
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        const uri = assetInfo.localUri ?? asset.uri;

        await uploadMutation.mutateAsync({
          albumId,
          uri,
          mimeType: getMimeType(asset.mediaType),
          caption,
        });

        setProgress({ current: 1, total: 1 });
        setStatus("success");
        endPerfTrace();
        onSuccess?.();
      } catch (err) {
        const uploadError =
          err instanceof Error ? err : new Error("Upload failed");
        setError(uploadError);
        setStatus("error");
        endPerfTrace();
        onError?.(uploadError);
        throw uploadError;
      }
    },
    [albumId, uploadMutation, onSuccess, onError],
  );

  // Track completed count for progress updates in concurrent uploads
  const completedCountRef = useRef(0);

  const uploadPhotos = useCallback(
    async (assets: MediaAsset[], caption?: string) => {
      if (assets.length === 0) return;

      setStatus("uploading");
      setProgress({ current: 0, total: assets.length });
      setError(null);
      completedCountRef.current = 0;

      const endPerfTrace = perf.startInteraction(
        `${PerfInteractions.UPLOAD_BATCH}[${assets.length}]`,
      );

      try {
        // Create upload task for each asset
        const uploadTask = async (asset: MediaAsset, index: number) => {
          // Get the asset info to ensure we have the correct URI
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
          const uri = assetInfo.localUri ?? asset.uri;

          await uploadMutation.mutateAsync({
            albumId,
            uri,
            mimeType: getMimeType(asset.mediaType),
            // Only add caption to first photo if batch uploading
            caption: index === 0 ? caption : undefined,
          });

          // Update progress atomically
          completedCountRef.current += 1;
          setProgress({ current: completedCountRef.current, total: assets.length });
        };

        // Execute uploads concurrently with limit
        const executing: Promise<void>[] = [];
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i]!;
          const promise = uploadTask(asset, i).then(() => {
            executing.splice(executing.indexOf(promise), 1);
          });
          executing.push(promise);

          // Wait if we've hit the concurrency limit
          if (executing.length >= MAX_CONCURRENT_UPLOADS) {
            await Promise.race(executing);
          }
        }

        // Wait for remaining uploads to complete
        await Promise.all(executing);

        setStatus("success");
        endPerfTrace();
        onSuccess?.();
      } catch (err) {
        const uploadError =
          err instanceof Error ? err : new Error("Upload failed");
        setError(uploadError);
        setStatus("error");
        endPerfTrace();
        onError?.(uploadError);
        throw uploadError;
      }
    },
    [albumId, uploadMutation, onSuccess, onError],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress({ current: 0, total: 0 });
    setError(null);
  }, []);

  return {
    uploadPhotos,
    uploadSinglePhoto,
    status,
    progress,
    isUploading: status === "uploading",
    error,
    reset,
  };
}

export default usePhotoUpload;
