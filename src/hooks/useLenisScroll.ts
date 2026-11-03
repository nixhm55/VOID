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
    const mobileViewport = window.matchMedia('(max-width: 820px)');
    let frame = 0;

    const stopRaf = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const wakeRaf = () => {
      const lenis = lenisRef.current;
      if (!lenis || frame) return;

      const raf = (time: number) => {
        if (lenisRef.current !== lenis) {
          frame = 0;
          return;
        }
        lenis.raf(time);
        if (lenis.isScrolling || Math.abs(lenis.velocity) > 0.008) {
          frame = window.requestAnimationFrame(raf);
        } else {
          frame = 0;
        }
      };

      frame = window.requestAnimationFrame(raf);
    };

    const stop = () => {
      stopRaf();
      lenisRef.current?.destroy();
      lenisRef.current = null;
    };

    const start = () => {
      if (mobileViewport.matches || motionPreference.matches || lenisRef.current) return;

      const lenis = new Lenis({
        wrapper,
        content,
        autoRaf: false,
        lerp: 0.1,
        wheelMultiplier: 0.9,
        allowNestedScroll: true,
      });
      lenisRef.current = lenis;
      wakeRaf();
    };

    const onWake = () => wakeRaf();

    const syncScrollMode = () => {
      if (mobileViewport.matches || motionPreference.matches) stop();
      else start();
    };

    wrapper.addEventListener('wheel', onWake, { passive: true });
    wrapper.addEventListener('scroll', onWake, { passive: true });
    window.addEventListener('keydown', onWake, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            lenisRef.current?.resize();
          })
        : null;
    resizeObserver?.observe(content);

    motionPreference.addEventListener('change', syncScrollMode);
    mobileViewport.addEventListener('change', syncScrollMode);
    syncScrollMode();

    return () => {
      motionPreference.removeEventListener('change', syncScrollMode);
      mobileViewport.removeEventListener('change', syncScrollMode);
      resizeObserver?.disconnect();
      wrapper.removeEventListener('wheel', onWake);
      wrapper.removeEventListener('scroll', onWake);
      window.removeEventListener('keydown', onWake);
      stop();
    };
  }, [contentRef, enabled, wrapperRef]);

  return lenisRef;
}
