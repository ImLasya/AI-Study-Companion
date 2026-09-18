import React from "react";

interface EduMindLogoProps {
  className?: string;
  size?: number;
}

/**
 * EduMind brand mark: Education (Book Open) + Intelligence (Neural Sparkle Node)
 */
export const EduMindLogo: React.FC<EduMindLogoProps> = ({
  className = "w-5 h-5",
  size = 20,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Open pages / book architecture */}
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      {/* Subtle neural spark / intelligence node accent at vertex */}
      <circle cx="12" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
};
