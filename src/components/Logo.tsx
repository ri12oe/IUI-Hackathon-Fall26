import "./Logo.scss";

type Props = {
  size?: number;              // font size of the wordmark, in px
  variant?: "full" | "mark";  // "mark" = just the m, for tight spaces
  className?: string;
};

// The two arches of the Rising m, cropped so the bottom of the
// viewBox is the bottom of the strokes (that lets it sit on the text baseline)
function RisingM() {
  return (
    <svg
      className="logo__m"
      viewBox="4 13.5 56 48.5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 57V37a11.5 11.5 0 0 1 23 0v20" stroke="#FF7F11" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M32 57V25a11.5 11.5 0 0 1 23 0v32" stroke="#FF1B1C" strokeWidth="10" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Logo({ size = 24, variant = "full", className = "" }: Props) {
  return (
    <span
      className={`logo ${className}`}
      style={{ fontSize: size }}
      role="img"
      aria-label="Muddy"
    >
      <RisingM />
      {variant === "full" && <span className="logo__word" aria-hidden="true">uddy</span>}
    </span>
  );
}