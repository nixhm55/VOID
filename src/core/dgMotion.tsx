import { createElement, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Deep Glass motion.
 * One shared IntersectionObserver drives element reveals. Each element enters once
 * (ENTER -> SETTLE -> STAY), then the observer releases it, ensuring zero ongoing overhead.
 * Direction, depth and stagger are expressed in CSS ([data-dg-r]).
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

export type DgRevealDir = 'left' | 'right' | 'up' | 'depth';
type DgRevealTag = 'div' | 'section' | 'li' | 'article' | 'header';

export interface DgRevealProps extends HTMLAttributes<HTMLElement> {
  as?: DgRevealTag;
  dir?: DgRevealDir;
  index?: number;
  children?: ReactNode;
}

export function DgReveal({ as = 'div', dir = 'up', index = 0, className, style, children, ...rest }: DgRevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = getObserver();
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!obs || reduce) {
      el.setAttribute('data-in', '');
      el.setAttribute('data-done', '');
      return;
    }

    const show = () => {
      el.setAttribute('data-in', '');
      window.setTimeout(() => el.setAttribute('data-done', ''), 1400 + Math.min(index, 8) * 60);
    };

    watchers.set(el, show);
    obs.observe(el);

    return () => {
      watchers.delete(el);
      obs.unobserve(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
