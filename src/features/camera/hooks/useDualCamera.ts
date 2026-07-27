/**
 * useDualCamera Hook
 * Recording state + capture wrappers for the dual (front + back at once)
 * camera. Mirrors useVideoRecording's shape so CameraScreen can swap
 * between the two without the UI caring which one is driving.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  captureDualPhoto,
  startDualRecording,
  stopDualRecording,
  type DualCameraPhoto,
  type DualCameraVideo,
} from "../../../../modules/dual-camera";
import { RECORDING_CONFIG } from "../constants";
import { captureException } from "@/lib/sentry";

interface UseDualCameraOptions {
  maxDuration?: number;
  onRecordingStop?: (video: DualCameraVideo) => void;
  onError?: (error: Error) => void;
}

export interface UseDualCameraReturn {
  isRecording: boolean;
  duration: number;
  capturePhoto: () => Promise<DualCameraPhoto | null>;
  startRecording: () => void;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
}

export function useDualCamera({
  maxDuration = RECORDING_CONFIG.MAX_DURATION,
  onRecordingStop,
  onError,
}: UseDualCameraOptions = {}): UseDualCameraReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  // Guards the stop path: the shutter's release and the max-duration
  // auto-stop can both fire, and a second stopRecording() would reject.
  const stoppingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    try {
      return await captureDualPhoto();
    } catch (error) {
      if (__DEV__) console.error("Dual photo capture failed:", error);
      captureException(error, { operation: "dualCamera.capturePhoto" });
      onError?.(error as Error);
      return null;
    }
  }, [onError]);

  const startRecording = useCallback(() => {
    if (isRecording || stoppingRef.current) return;
    setIsRecording(true);
    setDuration(0);
    startedAtRef.current = Date.now();
    clearTimer();
    timerRef.current = setInterval(() => {
      setDuration((Date.now() - startedAtRef.current) / 1000);
    }, RECORDING_CONFIG.TIMER_INTERVAL);

    startDualRecording().catch((error) => {
      clearTimer();
      setIsRecording(false);
      setDuration(0);
      if (__DEV__) console.error("Dual recording failed to start:", error);
      captureException(error, { operation: "dualCamera.startRecording" });
      onError?.(error as Error);
    });
  }, [isRecording, clearTimer, onError]);

  const stopRecording = useCallback(async () => {
    if (!isRecording || stoppingRef.current) return;
    stoppingRef.current = true;
    clearTimer();

    try {
      const video = await stopDualRecording();
      onRecordingStop?.(video);
    } catch (error) {
      if (__DEV__) console.error("Dual recording failed to stop:", error);
      captureException(error, { operation: "dualCamera.stopRecording" });
      onError?.(error as Error);
    } finally {
      stoppingRef.current = false;
      setIsRecording(false);
      setDuration(0);
    }
  }, [isRecording, clearTimer, onRecordingStop, onError]);

  const resetRecording = useCallback(() => {
    clearTimer();
    stoppingRef.current = false;
    setIsRecording(false);
    setDuration(0);
  }, [clearTimer]);

  // Auto-stop at the same ceiling the single-camera recorder uses
  useEffect(() => {
    if (isRecording && duration >= maxDuration) {
      void stopRecording();
    }
  }, [isRecording, duration, maxDuration, stopRecording]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    isRecording,
    duration,
    capturePhoto,
    startRecording,
    stopRecording,
    resetRecording,
  };
}

export default useDualCamera;
