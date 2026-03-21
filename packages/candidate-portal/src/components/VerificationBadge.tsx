"use client";

import { CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { cn, truncateHash, formatDateTime } from "@/lib/utils";

interface VerificationBadgeProps {
  verified: boolean | null;
  hash?: string;
  timestamp?: string;
  eventId?: string;
  size?: "sm" | "md" | "lg";
  showLink?: boolean;
}

export default function VerificationBadge({
  verified,
  hash,
  timestamp,
  eventId,
  size = "md",
  showLink = false,
}: VerificationBadgeProps) {
  const sizeClasses = {
    sm: "p-2 text-xs",
    md: "p-4 text-sm",
    lg: "p-6 text-base",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  if (verified === null) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-muted/50",
          sizeClasses[size]
        )}
        role="status"
        aria-label="Verification status: checking"
      >
        <Clock className={cn(iconSizes[size], "text-muted-foreground animate-pulse")} aria-hidden="true" />
        <span className="text-muted-foreground">Checking verification status...</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2",
        sizeClasses[size],
        verified
          ? "border-green-300 bg-green-50"
          : "border-red-300 bg-red-50"
      )}
      role="status"
      aria-label={`Verification status: ${verified ? "verified" : "not verified"}`}
    >
      <div className="flex items-start gap-3">
        {verified ? (
          <CheckCircle2 className={cn(iconSizes[size], "text-green-600 flex-shrink-0")} aria-hidden="true" />
        ) : (
          <XCircle className={cn(iconSizes[size], "text-red-600 flex-shrink-0")} aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0 space-y-1">
          <p className={cn("font-bold", verified ? "text-green-800" : "text-red-800")}>
            {verified ? "Verified on Blockchain" : "Verification Failed"}
          </p>

          {hash && (
            <p className="text-muted-foreground font-mono break-all">
              <span className="font-medium">Hash: </span>
              <span title={hash}>{size === "lg" ? hash : truncateHash(hash, 12)}</span>
            </p>
          )}

          {timestamp && (
            <p className="text-muted-foreground">
              <span className="font-medium">Timestamp: </span>
              {formatDateTime(timestamp)}
            </p>
          )}

          {eventId && (
            <p className="text-muted-foreground font-mono">
              <span className="font-medium">Event ID: </span>
              {size === "lg" ? eventId : truncateHash(eventId, 8)}
            </p>
          )}

          {showLink && hash && (
            <a
              href={`/verify/${hash}`}
              className="inline-flex items-center gap-1 text-pariksha-600 hover:text-pariksha-700 font-medium mt-1 focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              View full verification
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
