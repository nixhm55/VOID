import { createElement, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Single-pass IntersectionObserver reveal system for Deep Glass and Paper Glass.
 * Elements enter once with physics-eased curves and staggered timing,
 * then unobserve to keep DOM overhead zero during active listening.
 */
type Callback = () => void;
const watchers = new WeakMap<Element, Callback>();
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const callback = watchers.get(entry.target);
      watchers.delete(entry.target);
      observer?.unobserve(entry.target);
      callback?.();
    }
  }, { rootMargin: '0px 0px -4% 0px', threshold: 0.05 });
  return observer;
}

export type RevealDir = 'left' | 'right' | 'up' | 'depth' | 'row';
type RevealTag = 'div' | 'section' | 'li' | 'article' | 'header' | 'p' | 'tr';

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  dir?: RevealDir;
  index?: number;
  children?: ReactNode;
}

export function Reveal({ as = 'div', dir = 'up', index = 0, className, style, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = getObserver();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!obs || reduce) {
      el.setAttribute('data-in', '');
      el.setAttribute('data-done', '');
      return;
    }

    const show = () => {
      el.setAttribute('data-in', '');
      window.setTimeout(() => el.setAttribute('data-done', ''), 1200 + Math.min(index, 8) * 60);
    };

    watchers.set(el, show);
    obs.observe(el);

    return () => {
      watchers.delete(el);
      obs.unobserve(el);
    };
  }, [index]);

  return createElement(
    as,
    {
      ref,
      className,
      'data-dg-r': dir,
      style: { ...style, '--dg-i': Math.min(index, 8) } as CSSProperties,
      ...rest,
    },
    children,
  );
}

// Alias for DgReveal to ensure compatibility across imports
export const DgReveal = Reveal;

/**
 * Drives smooth parallax scroll transitions by writing scrollTop directly
 * to a CSS custom variable on the target element once per frame via requestAnimationFrame.
 */
export function useScrollVar(
  scroller: { current: HTMLElement | null },
  target: { current: HTMLElement | null },
  deps: unknown[],
) {
  useEffect(() => {
    const sc = scroller.current;
    const tg = target.current;
    if (!sc || !tg || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const tick = () => {
      frame = 0;
      tg.style.setProperty('--dg-sy', String(Math.min(900, Math.round(sc.scrollTop))));
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    tick();
    sc.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
