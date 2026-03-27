import { useEffect, useRef } from 'react';

interface AudioPlayerProps {
  stream: MediaStream;
  isDeafened?: boolean;
}

export function AudioPlayer({ stream, isDeafened }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={isDeafened} className="hidden" />;
}
