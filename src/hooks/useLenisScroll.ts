import { useEffect, useRef } from 'react';
import Lenis from 'lenis';

type ElementRef<T extends HTMLElement> = { current: T | null };

export function useLenisScroll<T extends HTMLElement, C extends HTMLElement>(
  wrapperRef: ElementRef<T>,
  contentRef: ElementRef<C>,
  enabled = true,
) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!enabled || !wrapper || !content) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };

    const start = () => {
      if (motionPreference.matches || lenisRef.current) return;

      const lenis = new Lenis({
        wrapper,
        content,
        autoRaf: false,
        lerp: 0.1,
        wheelMultiplier: 0.9,
        allowNestedScroll: true,
      });
      lenisRef.current = lenis;

      const raf = (time: number) => {
        if (lenisRef.current !== lenis) return;
        lenis.raf(time);
        frame = window.requestAnimationFrame(raf);
      };

      frame = window.requestAnimationFrame(raf);
    };

    const onMotionPreferenceChange = () => {
      if (motionPreference.matches) stop();
      else start();
    };

    motionPreference.addEventListener('change', onMotionPreferenceChange);
    start();

    return () => {
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      stop();
    };
  }, [contentRef, enabled, wrapperRef]);

  return lenisRef;
}
