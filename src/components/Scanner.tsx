import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function Scanner({ onResult }: { onResult: (text: string)=>void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();
    let active = true;
    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId = devices[0]?.deviceId;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: deviceId ? { exact: deviceId } : undefined, facingMode: "environment" }
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        await codeReader.decodeFromVideoDevice(deviceId ?? null, videoRef.current!, (result) => {
          if (!active) return;
          if (result) onResult(result.getText());
        });
      } catch (e:any) {
        setError(e?.message ?? "Impossible d’ouvrir la caméra");
      }
    })();
    return () => { active = false; codeReader.reset(); };
  }, [onResult]);

  return (
    <div className="flex flex-col gap-2">
      <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl shadow" />
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
