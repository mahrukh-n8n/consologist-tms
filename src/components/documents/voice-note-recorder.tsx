"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { notify } from "@/lib/notifications/client";
import { Button } from "@/components/ui/button";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function VoiceNoteRecorder({ onRecorded, disabled }: { onRecorded: (file: File) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => () => {
    stopTracks();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        const ext = (mimeType ?? "audio/webm").includes("mp4") ? "m4a" : (mimeType ?? "").includes("ogg") ? "ogg" : "webm";
        onRecorded(new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type }));
      };
      recorder.start();
      setRecording(true);
      elapsedRef.current = 0;
      setElapsed(0);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= 120) stop();
      }, 1000);
    } catch {
      notify.error("Microphone unavailable", "Allow microphone access to record a voice note.", "voice-record");
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }

  return recording ? (
    <Button type="button" variant="destructive" size="sm" onClick={stop}>
      <Square className="size-3.5" /> Stop {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
    </Button>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled}>
      <Mic className="size-3.5" /> Voice note
    </Button>
  );
}
