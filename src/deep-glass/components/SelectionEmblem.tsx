export const SelectionEmblem = ({ selected }: { selected: boolean }) => (
  <span
    aria-hidden="true"
    data-selection-emblem="true"
    data-selected={selected ? 'true' : 'false'}
    style={{
      boxSizing: 'border-box',
      width: 18,
      height: 18,
      minWidth: 18,
      minHeight: 18,
      borderRadius: '50%',
      border: selected ? '1px solid #22c55e' : '1.5px solid hsl(var(--muted-foreground) / 0.4)',
      backgroundColor: selected ? '#22c55e' : 'transparent',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 18px',
      overflow: 'visible',
      transition: 'border-color 0.2s ease, background-color 0.2s ease',
      pointerEvents: 'none',
    }}
  >
    {selected && (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        focusable="false"
        style={{
          display: 'block',
          width: 12,
          height: 12,
          minWidth: 12,
          minHeight: 12,
          opacity: 1,
          visibility: 'visible',
          overflow: 'visible',
        }}
      >
        <path
          d="M2.2 6.2 4.8 8.5 9.8 3.5"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);
