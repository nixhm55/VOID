import { createElement, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Paper Glass sequential top-to-bottom motion system.
 * Sorts entering elements strictly by visual top-to-bottom, left-to-right order
 * so items always glide in 1st -> 2nd -> 3rd -> 4th -> 5th one-by-one with soft blur.
 */
type WatcherItem = {
  index: number;
  show: (waveOrder: number) => void;
};

const watchers = new WeakMap<Element, WatcherItem>();
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      if (!visible.length) return;

      visible.sort((a, b) => {
        const dy = a.boundingClientRect.top - b.boundingClientRect.top;
        if (Math.abs(dy) > 8) return dy;
        const dx = a.boundingClientRect.left - b.boundingClientRect.left;
        if (Math.abs(dx) > 8) return dx;
        const wa = watchers.get(a.target)?.index ?? 0;
        const wb = watchers.get(b.target)?.index ?? 0;
        return wa - wb;
      });

      visible.forEach((entry, waveOrder) => {
        const item = watchers.get(entry.target);
        watchers.delete(entry.target);
        observer?.unobserve(entry.target);
        item?.show(waveOrder);
      });
    },
    { rootMargin: '0px 0px -2% 0px', threshold: 0.04 },
  );
  return observer;
}

export type RevealDir = 'left' | 'right' | 'up' | 'depth';
type RevealTag = 'div' | 'section' | 'li' | 'article' | 'header';
interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  dir?: RevealDir;
  index?: number;
  children?: ReactNode;
}

export function Reveal({ as = 'div', dir = 'up', index = 0, className, style, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const initialStagger = Math.min(Math.max(0, index), 14);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = getObserver();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!obs || reduce) { el.setAttribute('data-in', ''); el.setAttribute('data-done', ''); return; }
    const show = (waveOrder: number) => {
      const step = Math.min(waveOrder, 14);
      el.style.setProperty('--pg-i', String(step));
      el.setAttribute('data-in', '');
      window.setTimeout(() => el.setAttribute('data-done', ''), 1350 + step * 75);
    };
    watchers.set(el, { index, show });
    obs.observe(el);
    return () => { watchers.delete(el); obs.unobserve(el); };
  }, [index]);
  return createElement(
    as,
    { ref, className, 'data-pg-r': dir, style: { ...style, '--pg-i': initialStagger } as CSSProperties, ...rest },
    children,
  );
}

/** Writes the scroll offset of `scroller` into `--pg-sy` on `target` only (never the whole app), once per frame. */
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
    const tick = () => { frame = 0; tg.style.setProperty('--pg-sy', String(Math.min(900, Math.round(sc.scrollTop)))); };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(tick); };
    tick();
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => { sc.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
