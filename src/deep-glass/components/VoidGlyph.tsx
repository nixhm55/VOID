export function VoidGlyph({ playing }: { playing: boolean }) {
  return (
    <svg className="void-glyph" viewBox="0 0 24 24" aria-hidden="true" data-playing={playing}>
      <circle className="g-ring" cx="12" cy="12" r="10" transform="rotate(-19 12 12)" />
      <path className="g-play" d="M10 8.4 L16.4 12 L10 15.6 Z" />
      <g className="g-pause">
        <rect x="9" y="8.6" width="2.1" height="6.8" rx=".8" />
        <rect x="12.9" y="8.6" width="2.1" height="6.8" rx=".8" />
      </g>
    </svg>
  );
}
