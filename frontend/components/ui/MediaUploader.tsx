// File: frontend/components/ui/MediaUploader.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { storage } from "@/lib/firebase";
import { deleteVisitMedia } from "@/lib/services/logVisitService";
import type { MediaItem } from "@/types/visit";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

type UploadSlot = {
  id: string;
  name: string;
  state: "uploading" | "error";
};

type MediaLocation = {
  lat: number;
  lng: number;
};

type CapturedMediaItem = MediaItem & {
  location: MediaLocation;
};

type CameraMode = "photo" | "video";

type MediaUploaderProps = {
  items: MediaItem[];
  uploaderId: string;
  onChange: (items: MediaItem[]) => void;
  onLocationCaptured?: (location: MediaLocation) => void;
};

export function MediaUploader({
  items,
  uploaderId,
  onChange,
  onLocationCaptured,
}: MediaUploaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const pendingLocationRef = useRef<MediaLocation | null>(null);
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("photo");
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState<string | null>(null);
  const [capturedPreviewType, setCapturedPreviewType] = useState<
    "image" | "video" | null
  >(null);
  const [error, setError] = useState("");

  const uploadCapturedMedia = async (
    file: File,
    location: MediaLocation,
  ): Promise<CapturedMediaItem> => {
    const extFromName = file.name.split(".").pop()?.trim();
    const extFromType = file.type.split("/").pop()?.trim();
    const extension = extFromName || extFromType || "bin";
    const uniqueName = `${Date.now()}_${crypto.randomUUID()}.${extension}`;
    const storagePath = `visits/${uploaderId}/media/${uniqueName}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file);

    const url = await getDownloadURL(storageRef);

    return {
      url,
      storagePath,
      type: file.type.startsWith("video/") ? "video" : "image",
      location,
      createdAt: new Date().toISOString(),
    };
  };

  const getCurrentLocation = () =>
    new Promise<MediaLocation>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (positionError) => {
          switch (positionError.code) {
            case positionError.PERMISSION_DENIED:
              reject(
                new Error(
                  "Location access denied. Enable it in your browser settings.",
                ),
              );
              break;
            case positionError.POSITION_UNAVAILABLE:
              reject(
                new Error(
                  "Location unavailable. Check your signal and try again.",
                ),
              );
              break;
            case positionError.TIMEOUT:
              reject(
                new Error("Location request timed out. Please try again."),
              );
              break;
            default:
              reject(
                new Error("Could not capture location. Please try again."),
              );
          }
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });

  const stopCameraStream = () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    setIsRecording(false);

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const closeCamera = () => {
    discardRecordingRef.current = true;
    stopCameraStream();
    setIsCameraOpen(false);
    setCameraPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
    setCapturedPreviewType(null);
    pendingLocationRef.current = null;
  };

  useEffect(
    () => () => {
      stopCameraStream();
      if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
    },
    [cameraPreviewUrl],
  );

  useEffect(() => {
    if (!isCameraOpen || !pendingLocationRef.current) return;

    let active = true;

    const startCamera = async () => {
      setIsStartingCamera(true);
      setError("");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (cameraError) {
        if (!active) return;

        setError(
          cameraError instanceof Error
            ? cameraError.message
            : "Camera access denied. Please enable camera permissions.",
        );
        setIsCameraOpen(false);
        pendingLocationRef.current = null;
      } finally {
        if (active) setIsStartingCamera(false);
      }
    };

    startCamera();

    return () => {
      active = false;
    };
  }, [cameraMode, isCameraOpen]);

  const openCameraCapture = async () => {
    if (isFetchingLocation) return;

    setError("");
    setIsFetchingLocation(true);

    try {
      const location = await getCurrentLocation();
      pendingLocationRef.current = location;
      onLocationCaptured?.(location);
      setCameraMode("photo");
      setCameraPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
      });
      setCapturedPreviewType(null);
      setIsCameraOpen(true);
    } catch (locationError) {
      setError(
        locationError instanceof Error
          ? locationError.message
          : "Could not capture location. Please try again.",
      );
      pendingLocationRef.current = null;
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const uploadCaptureBlob = async (blob: Blob) => {
    const location = pendingLocationRef.current;
    pendingLocationRef.current = null;

    if (!location) {
      setError("Location must be captured before adding media.");
      return;
    }

    const extension = blob.type.startsWith("video/") ? "webm" : "jpg";
    const file = new File([blob], `capture-${Date.now()}.${extension}`, {
      type: blob.type,
    });

    const pending: UploadSlot[] = [
      {
        id: crypto.randomUUID(),
        name: file.name,
        state: "uploading",
      },
    ];
    setSlots((prev) => [...prev, ...pending]);
    setError("");

    try {
      const uploaded = await uploadCapturedMedia(file, location);
      onChange([...items, uploaded]);
      setSlots((prev) => prev.filter((slot) => slot.id !== pending[0].id));
    } catch {
      setSlots((prev) =>
        prev
          .filter((slot) => slot.id !== pending[0].id)
          .concat({ ...pending[0], state: "error" }),
      );
    }
  };

  const capturePhoto = async () => {
    if (!streamRef.current || !videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (!context) {
      setError("Unable to capture photo. Please try again.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    );

    if (!blob) {
      setError("Unable to capture photo. Please try again.");
      return;
    }

    setCapturedPreviewType("image");
    setCameraPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return URL.createObjectURL(blob);
    });

    await uploadCaptureBlob(blob);
    closeCamera();
  };

  const startVideoRecording = () => {
    if (!streamRef.current || isRecording) return;

    chunksRef.current = [];

    const preferredMimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];

    const mimeType = preferredMimeTypes.find((candidate) =>
      typeof MediaRecorder !== "undefined"
        ? MediaRecorder.isTypeSupported(candidate)
        : false,
    );

    try {
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined,
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          chunksRef.current = [];
          return;
        }

        const recordedBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        chunksRef.current = [];

        setCapturedPreviewType("video");
        setCameraPreviewUrl((currentUrl) => {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          return URL.createObjectURL(recordedBlob);
        });

        await uploadCaptureBlob(recordedBlob);
        closeCamera();
      };

      discardRecordingRef.current = false;
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError("Video recording is not supported in this browser.");
    }
  };

  const stopVideoRecording = () => {
    if (!recorderRef.current || !isRecording) return;
    discardRecordingRef.current = false;
    recorderRef.current.stop();
    setIsRecording(false);
  };

  const handleRemove = async (index: number) => {
    try {
      await deleteVisitMedia(items[index].storagePath);
    } catch {
      // Remove from UI even if Storage delete fails
    }
    onChange(items.filter((_, i) => i !== index));
  };

  const dismissSlot = (id: string) =>
    setSlots((prev) => prev.filter((s) => s.id !== id));

  const total =
    items.length + slots.filter((s) => s.state === "uploading").length;

  const primaryLabel = isFetchingLocation
    ? "Fetching location..."
    : "Capture Photo / Video";

  return (
    <div className="space-y-3">
      {isFetchingLocation ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-page px-4 py-3 text-sm text-textSecondary">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          Fetching location before opening the camera...
        </div>
      ) : null}

      {isCameraOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-textPrimary/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-textPrimary">
                  Camera capture
                </p>
                <p className="text-xs text-textSecondary">
                  Location is attached before the camera opens.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-lg border border-border bg-page px-3 py-1.5 text-xs font-semibold text-textPrimary transition hover:bg-surface"
              >
                Cancel
              </button>
            </div>

            <div className="relative bg-black">
              {cameraPreviewUrl ? (
                <div className="relative aspect-video w-full bg-black">
                  {capturedPreviewType === "image" ? (
                    <img
                      src={cameraPreviewUrl}
                      alt="Captured preview"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <video
                      src={cameraPreviewUrl}
                      controls
                      autoPlay
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="relative aspect-video w-full bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  {(isStartingCamera || isFetchingLocation) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                      <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Starting camera...
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium text-white">
                {cameraMode === "photo"
                  ? "Photo mode"
                  : isRecording
                    ? "Recording..."
                    : "Video mode"}
              </div>
            </div>

            <div className="space-y-3 border-t border-border px-4 py-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCameraMode("photo")}
                  disabled={isRecording}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${cameraMode === "photo" ? "bg-accent text-accentContrast" : "bg-page text-textPrimary hover:bg-surface"} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Photo
                </button>
                <button
                  type="button"
                  onClick={() => setCameraMode("video")}
                  disabled={isRecording}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${cameraMode === "video" ? "bg-accent text-accentContrast" : "bg-page text-textPrimary hover:bg-surface"} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Video
                </button>
                <div className="ml-auto text-xs text-textSecondary">
                  {cameraMode === "photo"
                    ? "Tap capture to take a photo"
                    : "Start and stop recording from this screen"}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {cameraMode === "photo" ? (
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={
                      isStartingCamera ||
                      isFetchingLocation ||
                      !streamRef.current
                    }
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accentContrast transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Capture Photo
                  </button>
                ) : isRecording ? (
                  <button
                    type="button"
                    onClick={stopVideoRecording}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                  >
                    Stop Recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startVideoRecording}
                    disabled={
                      isStartingCamera ||
                      isFetchingLocation ||
                      !streamRef.current
                    }
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accentContrast transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Start Recording
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      ) : null}

      {/* Empty drop zone */}
      {!items.length && !slots.length ? (
        <button
          type="button"
          onClick={openCameraCapture}
          disabled={isFetchingLocation}
          className="group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-page py-10 text-center transition hover:border-accent/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-sm transition group-hover:bg-accent/5 group-hover:shadow">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-textSecondary transition group-hover:text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-textPrimary">
              {primaryLabel}
            </p>
            <p className="mt-0.5 text-xs text-textSecondary">
              Location is captured first, then your camera opens.
            </p>
          </div>
        </button>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-textSecondary">
              {total > 0 ? `${total} file${total > 1 ? "s" : ""}` : ""}
            </p>
            <button
              type="button"
              onClick={openCameraCapture}
              disabled={isFetchingLocation || isStartingCamera}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-textPrimary shadow-sm transition hover:bg-page focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h4l2-2h4l2 2h4v12H4z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              {primaryLabel}
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((item, index) => (
              <div
                key={item.storagePath}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-page"
              >
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={`Visit media ${index + 1}`}
                    className="h-full w-full object-cover transition group-hover:opacity-80"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-page">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 text-textSecondary"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    <span className="text-[10px] text-textSecondary">
                      Video
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute inset-0 flex items-center justify-center bg-textPrimary/0 text-danger/40 transition hover:bg-danger/20 hover:text-danger focus-visible:bg-danger/20 focus-visible:text-danger"
                  aria-label="Remove media"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Upload/error slots */}
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="aspect-square overflow-hidden rounded-xl border border-border bg-page"
              >
                {slot.state === "uploading" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
                    <p className="line-clamp-2 text-center text-[10px] text-textSecondary">
                      {slot.name}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => dismissSlot(slot.id)}
                    className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center"
                    aria-label="Dismiss failed upload"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-danger"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-[10px] text-danger">
                      Failed — tap to dismiss
                    </p>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
