import { useEffect, useMemo, useRef, useState } from 'react';

interface VoiceMessageProps {
  url: string;
  isOutbound: boolean;
  time: string;
  storedDuration?: number;
  isRead?: boolean;
}

function formatDur(s: number) {
  if (!s || isNaN(s) || !isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function VoiceMessage({ url, isOutbound, time, storedDuration = 0, isRead = false }: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(storedDuration);
  const [currentTime, setCurrentTime] = useState(0);

  const bars = useMemo(() => {
    let seed = url.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 32 }, () => {
      seed = (seed * 9301 + 49297) % 233280;
      return 0.2 + (seed / 233280) * 0.8;
    });
  }, [url]);

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  // Elapsed time пока играет, total duration пока стоит — как в WhatsApp
  const displayTime = playing ? currentTime : duration;

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      document.querySelectorAll('audio').forEach(a => { if (a !== audio) a.pause(); });
      try {
        await audio.play();
        setPlaying(true);
      } catch (e) {
        console.error('Audio play error:', e);
      }
    }
  };

  // onPointerUp работает и на тач и на мышке
  const handleSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (duration || audio.duration || 0);
    if (targetTime > 0) {
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (storedDuration > 0) {
        setDuration(storedDuration);
        audio.currentTime = 1e101; // трюк для WebM
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if ((!duration || !isFinite(duration)) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        if (audio.currentTime > audio.duration) audio.currentTime = 0;
      }
    };

    const onEnd = () => { setPlaying(false); setCurrentTime(0); };
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('pause', onPause);
    };
  }, [storedDuration, duration]);

  const activeColor = isOutbound ? 'bg-white' : 'bg-emerald-400';
  const inactiveColor = isOutbound ? 'bg-white/35' : 'bg-white/25';

  return (
    <div className="px-2 py-2 flex items-center gap-2 min-w-[220px] max-w-[280px]">
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play / Pause */}
      <button
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity active:opacity-70 ${
          isOutbound ? 'bg-white/20' : 'bg-emerald-500/30'
        }`}
      >
        {playing ? (
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform + info */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Bars — seek по onPointerUp */}
        <div
          className="flex items-center gap-[2px] h-8 cursor-pointer touch-none"
          onPointerUp={handleSeek}
        >
          {bars.map((h, i) => {
            const passed = i / bars.length <= progress;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full ${passed ? activeColor : inactiveColor}`}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>

        {/* Время + галочка */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/70 font-mono">{formatDur(displayTime)}</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/50">{time}</span>
            {/* Галочка только для исходящих */}
            {isOutbound && (
              <span
                className="text-[12px] font-bold leading-none flex-shrink-0"
                style={{ letterSpacing: '-3px', color: isRead ? '#60a5fa' : '#a7c5bd' }}
              >✓✓</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}