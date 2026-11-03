'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CameraOffIcon, RefreshIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

type ScannerState = 'starting' | 'running' | 'denied' | 'unavailable' | 'insecure';

type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

type NativeDetector = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};
type NativeDetectorClass = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};

const SCAN_INTERVAL_MS = 140;
const REPEAT_WINDOW_MS = 2500;
const MAX_DECODE_WIDTH = 640;

/** BarcodeDetector where the browser has it (Chrome on Android); jsQR, loaded on demand, elsewhere. */
async function createDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Fall through to jsQR.
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!context || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null
    );
  };
}

export function QrScanner({
  onScan,
  paused = false,
  facing = 'environment',
  className,
}: {
  /** Called once per distinct code; the same code is ignored for a few seconds. */
  onScan: (text: string) => void;
  paused?: boolean;
  facing?: 'environment' | 'user';
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [state, setState] = useState<ScannerState>('starting');
  const [facingMode, setFacingMode] = useState(facing);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      setState('starting');
      if (!navigator.mediaDevices?.getUserMedia) {
        setState(window.isSecureContext ? 'unavailable' : 'insecure');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay can reject while the element is being torn down; the loop below copes.
      }
      const decode = await createDecoder();
      if (cancelled) return;
      setState('running');

      const tick = async () => {
        if (cancelled) return;
        if (!pausedRef.current && video.readyState >= 2) {
          try {
            const text = await decode(video);
            const now = Date.now();
            const last = lastRef.current;
            if (text && !(last && last.text === text && now - last.at < REPEAT_WINDOW_MS)) {
              lastRef.current = { text, at: now };
              onScanRef.current(text);
            }
          } catch {
            // A single bad frame is not worth surfacing.
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const message =
    state === 'denied'
      ? copy.scanner.denied
      : state === 'unavailable'
        ? copy.scanner.unavailable
        : state === 'insecure'
          ? copy.scanner.insecure
          : null;

  return (
    <div
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-xl border bg-[#111111]',
        className,
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label={copy.scanner.frameLabel}
        className={cn(
          'size-full object-cover transition-opacity duration-300',
          state === 'running' ? 'opacity-100' : 'opacity-0',
          facingMode === 'user' && '-scale-x-100',
        )}
      />
      {state === 'running' ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-[18%]">
          <span className="absolute top-0 left-0 size-8 rounded-tl-md border-t-2 border-l-2 border-white/90" />
          <span className="absolute top-0 right-0 size-8 rounded-tr-md border-t-2 border-r-2 border-white/90" />
          <span className="absolute bottom-0 left-0 size-8 rounded-bl-md border-b-2 border-l-2 border-white/90" />
          <span className="absolute right-0 bottom-0 size-8 rounded-br-md border-r-2 border-b-2 border-white/90" />
        </div>
      ) : null}
      {state === 'starting' ? (
        <p className="absolute inset-0 grid place-items-center text-sm text-white/70">
          {copy.scanner.starting}
        </p>
      ) : null}
      {message ? (
        <div className="absolute inset-0 grid place-items-center bg-[#F7F6F3] p-6 text-center">
          <div className="grid max-w-xs justify-items-center gap-3">
            <CameraOffIcon className="text-muted-foreground size-6" />
            <p className="text-sm leading-relaxed">{message}</p>
            {state !== 'insecure' ? (
              <Button variant="outline" size="sm" onClick={retry}>
                {copy.scanner.retry}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {state === 'running' ? (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}
          className="absolute right-3 bottom-3 border-white/20 bg-black/40 text-white backdrop-blur hover:bg-black/60"
        >
          <RefreshIcon />
          <span className="sr-only">{copy.scanner.switchCamera}</span>
        </Button>
      ) : null}
    </div>
  );
}
