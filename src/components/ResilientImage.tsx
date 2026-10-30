import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackLabel,
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#14151B] via-[#0E0F14] to-[#1A1812] text-[#D4AF37] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <BookOpen className="w-7 h-7 opacity-80 mb-2" />
        {fallbackLabel && (
          <span className="text-xs font-medium text-[#E5E5EA] line-clamp-2 max-w-[16ch]">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const GoogleSignInButton: React.FC<{
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}> = ({ onClick, label = 'Sign in with Google', disabled = false }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gsi-material-button disabled:opacity-50"
    >
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            className="block w-full h-full"
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
        </div>
        <span className="font-medium text-sm text-[#F5F5F7] whitespace-nowrap">{label}</span>
      </div>
    </button>
  );
};

export const BinanceQrDisplay: React.FC<{
  qrUrl: string;
  binancePayId: string;
}> = ({ qrUrl, binancePayId }) => {
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    setImgErr(false);
  }, [qrUrl]);

  if (qrUrl && !imgErr) {
    return (
      <img
        src={qrUrl}
        alt={`Binance Pay QR for ID ${binancePayId}`}
        referrerPolicy="no-referrer"
        onError={() => setImgErr(true)}
        className="w-48 sm:w-52 h-auto max-h-60 rounded-2xl object-contain mx-auto border border-white/15 shadow-lg"
      />
    );
  }

  return (
    <div className="w-40 h-40 rounded-xl bg-white p-3 mx-auto flex flex-col items-center justify-between text-[#09090B]">
      <svg viewBox="0 0 100 100" className="w-28 h-28" aria-label="Binance Pay QR matrix">
        <rect x="4" y="4" width="26" height="26" fill="none" stroke="#09090B" strokeWidth="6" />
        <rect x="12" y="12" width="10" height="10" fill="#09090B" />
        <rect x="70" y="4" width="26" height="26" fill="none" stroke="#09090B" strokeWidth="6" />
        <rect x="78" y="12" width="10" height="10" fill="#09090B" />
        <rect x="4" y="70" width="26" height="26" fill="none" stroke="#09090B" strokeWidth="6" />
        <rect x="12" y="78" width="10" height="10" fill="#09090B" />
        <rect x="40" y="10" width="8" height="8" fill="#09090B" />
        <rect x="52" y="18" width="8" height="8" fill="#09090B" />
        <rect x="38" y="36" width="24" height="24" rx="4" fill="#D4AF37" />
        <rect x="46" y="44" width="8" height="8" fill="#09090B" />
        <rect x="12" y="44" width="14" height="8" fill="#09090B" />
        <rect x="72" y="44" width="18" height="8" fill="#09090B" />
        <rect x="42" y="72" width="10" height="18" fill="#09090B" />
        <rect x="64" y="68" width="10" height="10" fill="#09090B" />
        <rect x="80" y="78" width="14" height="14" fill="#09090B" />
      </svg>
      <span className="text-[10px] font-mono font-semibold tracking-tight">ID {binancePayId}</span>
    </div>
  );
};
