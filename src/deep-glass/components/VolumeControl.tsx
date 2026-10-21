import { useEffect, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { rangeStyle } from '../utils/formatters';

export function VolumeControl({
  volume,
  muted,
  onVolume,
  onToggleMute,
  buttonTestId,
  inputTestId,
}: {
  volume: number;
  muted: boolean;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  buttonTestId: string;
  inputTestId: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const silent = muted || volume <= 0;
  const Icon = silent ? VolumeX : volume < 0.4 ? Volume1 : Volume2;
  const clearTimer = () => window.clearTimeout(timer.current);
  const armClose = () => {
    clearTimer();
    timer.current = window.setTimeout(() => {
      if (!dragging.current) setOpen(false);
    }, 1800);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const label = open ? (silent ? 'Unmute' : 'Mute') : 'Volume';

  return (
    <div
      ref={root}
      className="vol"
      data-open={open ? '' : undefined}
      data-silent={silent ? '' : undefined}
      onPointerEnter={clearTimer}
      onPointerLeave={() => {
        if (open) armClose();
      }}
      onKeyDown={event => {
        if (open && event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
        }
      }}
      onBlur={event => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) armClose();
      }}
    >
      <div className="vol-pop">
        <input
          className="vol-slider"
          style={rangeStyle(silent ? 0 : volume)}
          type="range"
          min="0"
          max="1"
          step=".01"
          value={silent ? 0 : volume}
          aria-label="Volume"
          tabIndex={open ? 0 : -1}
          onChange={event => onVolume(Number(event.target.value))}
          onPointerDown={() => {
            dragging.current = true;
            clearTimer();
            window.addEventListener(
              'pointerup',
              () => {
                dragging.current = false;
              },
              { once: true }
            );
          }}
          data-testid={inputTestId}
        />
      </div>
      <button
        className="icon-button vol-button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => {
          if (open) onToggleMute();
          else setOpen(true);
        }}
        data-testid={buttonTestId}
      >
        <Icon key={silent ? 'silent' : 'sound'} />
      </button>
    </div>
  );
}
