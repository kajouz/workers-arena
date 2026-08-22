/**
 * Official Wish Money (Whish) logo.
 * Used in payment method picker and manual payment instructions.
 */
export function WishIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Purple rounded rectangle */}
      <rect x="2" y="4" width="32" height="32" rx="8" fill="#7C3AED" />
      {/* White W letter inside */}
      <text
        x="18"
        y="27"
        textAnchor="middle"
        fill="white"
        fontSize="18"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        W
      </text>
      {/* Whish text */}
      <text
        x="48"
        y="26"
        fill="#7C3AED"
        fontSize="16"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        Whish
      </text>
    </svg>
  );
}

/**
 * Compact Wish icon for small spaces (payment picker, badges).
 */
export function WishIconCompact({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2" y="2" width="28" height="28" rx="6" fill="#7C3AED" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="white"
        fontSize="16"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        W
      </text>
    </svg>
  );
}
