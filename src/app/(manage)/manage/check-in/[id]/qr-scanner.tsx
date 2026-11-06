"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CameraOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// How often to look for a code. A timer rather than requestAnimationFrame: enough
// for someone holding up a phone, and kinder to the battery during a long event.
const SCAN_EVERY_MS = 150;
// Big enough to read a phone screen at arm's length, small enough to stay quick.
const MAX_FRAME_WIDTH = 640;

function cameraProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return "Camera access is blocked. Allow it in your browser's site settings, or use search below.";
  }
  if (name === "NotFoundError") return "This device has no camera. Use search below.";
  if (name === "NotReadableError") {
    return "Another app is using the camera. Close it and try again, or use search below.";
  }
  return "The camera couldn't start. Use search below.";
}

/** The phone's camera, reading QR codes. Calls onCode for everything it sees. */
export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The latest callback, without restarting the camera every time it changes.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!running) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | undefined;

    async function start() {
      // Browsers only offer the camera on https and localhost.
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This connection can't use the camera. It needs https. Use search below.");
        setRunning(false);
        return;
      }
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          }),
        ]);
        stream = media;
        if (stopped) return;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });

        const scan = () => {
          if (stopped) return;
          if (context && video.videoWidth > 0) {
            const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
            if (found?.data) onCodeRef.current(found.data);
          }
          timer = setTimeout(scan, SCAN_EVERY_MS);
        };
        scan();
      } catch (e) {
        if (stopped) return;
        setProblem(cameraProblem(e));
        setRunning(false);
      }
    }
    void start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [running]);

  return (
    <div className="grid gap-2">
      {running && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Camera view"
            className="size-full object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 aspect-square h-3/4 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-white/80"
          />
        </div>
      )}
      {problem && !running && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        variant={running ? "outline" : "default"}
        className="h-12 w-full text-base"
        onClick={() => {
          setProblem(null);
          setRunning(!running);
        }}
      >
        {running ? (
          <>
            <CameraOffIcon data-icon="inline-start" /> Stop camera
          </>
        ) : (
          <>
            <CameraIcon data-icon="inline-start" /> Scan tickets
          </>
        )}
      </Button>
    </div>
  );
}
