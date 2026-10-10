import { createElement, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Paper Glass motion.
 * One shared IntersectionObserver drives every reveal. Each element enters once
 * (ENTER → SETTLE → STAY), then the observer lets go of it, so nothing keeps animating afterwards.
 * Direction, depth and stagger are expressed in CSS (see paperGlass.css, `[data-pg-r]`).
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
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
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
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = getObserver();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!obs || reduce) { el.setAttribute('data-in', ''); el.setAttribute('data-done', ''); return; }
    const show = () => {
      el.setAttribute('data-in', '');
      window.setTimeout(() => el.setAttribute('data-done', ''), 1500 + Math.min(index, 8) * 70);
    };
    watchers.set(el, show);
    obs.observe(el);
    return () => { watchers.delete(el); obs.unobserve(el); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createElement(
    as,
    { ref, className, 'data-pg-r': dir, style: { ...style, '--pg-i': Math.min(index, 8) } as CSSProperties, ...rest },
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