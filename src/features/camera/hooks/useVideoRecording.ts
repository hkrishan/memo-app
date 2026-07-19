/**
 * useVideoRecording Hook
 * Handles video recording state, timing, and controls
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { Camera, VideoFile } from 'react-native-vision-camera';

import { RecordingState, UseVideoRecordingReturn, FlashMode } from '../types';
import { RECORDING_CONFIG } from '../constants';

interface UseVideoRecordingOptions {
  maxDuration?: number;
  onRecordingStart?: () => void;
  onRecordingStop?: (video: VideoFile) => void;
  onRecordingError?: (error: Error) => void;
  onMaxDurationReached?: () => void;
  flashMode?: FlashMode;
}

export function useVideoRecording({
  maxDuration = RECORDING_CONFIG.MAX_DURATION,
  onRecordingStart,
  onRecordingStop,
  onRecordingError,
  onMaxDurationReached,
  flashMode = FlashMode.OFF,
}: UseVideoRecordingOptions = {}): UseVideoRecordingReturn {
  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [duration, setDuration] = useState(0);

  // Refs
  const cameraRef = useRef<Camera | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const videoResolverRef = useRef<((video: VideoFile | null) => void) | null>(null);

  // Computed states
  const isRecording = recordingState === RecordingState.RECORDING;
  const isPaused = recordingState === RecordingState.PAUSED;

  // Clear timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start timer
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - pausedDurationRef.current * 1000;

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setDuration(elapsed);

      // Check max duration
      if (elapsed >= maxDuration) {
        onMaxDurationReached?.();
      }
    }, RECORDING_CONFIG.TIMER_INTERVAL);
  }, [maxDuration, onMaxDurationReached]);

  // Start recording
  const startRecording = useCallback(
    (camera: Camera) => {
      if (recordingState !== RecordingState.IDLE) {
        console.warn('Already recording or stopping');
        return;
      }

      cameraRef.current = camera;
      setRecordingState(RecordingState.RECORDING);
      setDuration(0);
      pausedDurationRef.current = 0;

      // Start the timer
      startTimer();

      // Start recording on camera
      camera.startRecording({
        flash: flashMode === FlashMode.ON ? 'on' : 'off',
        fileType: RECORDING_CONFIG.FILE_TYPE,
        videoCodec: RECORDING_CONFIG.VIDEO_CODEC,
        onRecordingFinished: (video) => {
          clearTimer();
          setRecordingState(RecordingState.IDLE);
          setDuration(0);
          pausedDurationRef.current = 0;

          onRecordingStop?.(video);

          // Resolve promise if waiting
          if (videoResolverRef.current) {
            videoResolverRef.current(video);
            videoResolverRef.current = null;
          }
        },
        onRecordingError: (error) => {
          clearTimer();
          setRecordingState(RecordingState.IDLE);
          setDuration(0);
          pausedDurationRef.current = 0;

          console.error('Recording error:', error);
          onRecordingError?.(error);

          // Reject promise if waiting
          if (videoResolverRef.current) {
            videoResolverRef.current(null);
            videoResolverRef.current = null;
          }
        },
      });

      onRecordingStart?.();
    },
    [recordingState, flashMode, startTimer, clearTimer, onRecordingStart, onRecordingStop, onRecordingError]
  );

  // Stop recording
  const stopRecording = useCallback(async (): Promise<VideoFile | null> => {
    if (recordingState === RecordingState.IDLE || recordingState === RecordingState.STOPPING) {
      console.warn('Not recording');
      return null;
    }

    if (!cameraRef.current) {
      console.warn('No camera reference');
      return null;
    }

    // Check minimum duration
    if (duration < RECORDING_CONFIG.MIN_DURATION) {
      console.warn('Recording too short, minimum duration not met');
      // Still stop but warn
    }

    setRecordingState(RecordingState.STOPPING);
    clearTimer();

    // Create promise to wait for recording to finish
    return new Promise<VideoFile | null>((resolve) => {
      videoResolverRef.current = resolve;

      try {
        cameraRef.current?.stopRecording();
      } catch (error) {
        console.error('Error stopping recording:', error);
        setRecordingState(RecordingState.IDLE);
        resolve(null);
        videoResolverRef.current = null;
      }
    });
  }, [recordingState, duration, clearTimer]);

  // Pause recording (if supported)
  const pauseRecording = useCallback(() => {
    if (recordingState !== RecordingState.RECORDING) {
      console.warn('Not recording');
      return;
    }

    // Note: Vision Camera doesn't natively support pause/resume
    // This is a placeholder for UI state - actual pause would need native implementation
    clearTimer();
    pausedDurationRef.current = duration;
    setRecordingState(RecordingState.PAUSED);
  }, [recordingState, duration, clearTimer]);

  // Resume recording (if supported)
  const resumeRecording = useCallback(() => {
    if (recordingState !== RecordingState.PAUSED) {
      console.warn('Not paused');
      return;
    }

    startTimer();
    setRecordingState(RecordingState.RECORDING);
  }, [recordingState, startTimer]);

  // Reset recording state
  const resetRecording = useCallback(() => {
    clearTimer();
    setRecordingState(RecordingState.IDLE);
    setDuration(0);
    pausedDurationRef.current = 0;
    cameraRef.current = null;
    videoResolverRef.current = null;
  }, [clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  // Auto-stop at max duration
  useEffect(() => {
    if (isRecording && duration >= maxDuration) {
      stopRecording();
    }
  }, [isRecording, duration, maxDuration, stopRecording]);

  return {
    isRecording,
    isPaused,
    duration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
  };
}

export default useVideoRecording;
