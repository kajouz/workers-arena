/**
 * Official OMT (Orange Money Transfer) logo.
 * Used in payment method picker and manual payment instructions.
 */
export function OMTIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Orange circle */}
      <circle cx="20" cy="20" r="18" fill="#FF6600" />
      {/* White O letter inside */}
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fill="white"
        fontSize="18"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        O
      </text>
      {/* OMT text */}
      <text
        x="50"
        y="26"
        fill="#FF6600"
        fontSize="16"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        OMT
      </text>
    </svg>
  );
}

/**
 * Compact OMT icon for small spaces (payment picker, badges).
 */
export function OMTIconCompact({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="16" cy="16" r="14" fill="#FF6600" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="white"
        fontSize="16"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        O
      </text>
    </svg>
  );
}
