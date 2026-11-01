import { memo } from 'react';

export const VerifiedArtistBadge = memo(function VerifiedArtistBadge({
  label = 'Verified Artist',
}: {
  label?: string;
}) {
  return (
    <span className="verified-artist-badge" title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="verified-artist-icon">
        <path
          d="M12 2.25L14.62 4.39L17.96 3.96L19.06 7.16L22.25 8.26L21.82 11.6L23.96 14.22L21.82 16.84L22.25 20.18L19.06 21.28L17.96 24.48L14.62 24.05L12 26.19L9.38 24.05L6.04 24.48L4.94 21.28L1.75 20.18L2.18 16.84L0.04 14.22L2.18 11.6L1.75 8.26L4.94 7.16L6.04 3.96L9.38 4.39L12 2.25Z"
          transform="scale(0.84) translate(2.2, 0.8)"
          fill="currentColor"
        />
        <path
          d="M8.6 12.4L10.85 14.65L15.6 9.75"
          stroke="#06080c"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
});
