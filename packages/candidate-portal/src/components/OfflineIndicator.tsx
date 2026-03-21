"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExamStore } from "@/lib/exam-store";
import { processSyncQueue } from "@/lib/checkpoint";

export default function OfflineIndicator() {
  const isOnline = useExamStore((s) => s.isOnline);
  const pendingSyncCount = useExamStore((s) => s.pendingSyncCount);
  const setOnlineStatus = useExamStore((s) => s.setOnlineStatus);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setOnlineStatus(true);
      // Auto-sync when coming back online
      handleSync();
    }
    function handleOffline() {
      setOnlineStatus(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Set initial state
    setOnlineStatus(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnlineStatus]);

  async function handleSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await processSyncQueue();
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={
        isOnline
          ? pendingSyncCount > 0
            ? `Online. ${pendingSyncCount} checkpoints pending sync.`
            : "Online. All data synced."
          : "Offline. Responses are being saved locally."
      }
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
        isOnline
          ? pendingSyncCount > 0
            ? "bg-yellow-100 text-yellow-800"
            : "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      )}
    >
      {isOnline ? (
        <Wifi className="h-4 w-4" aria-hidden="true" />
      ) : (
        <WifiOff className="h-4 w-4" aria-hidden="true" />
      )}

      <span>
        {isOnline ? (
          pendingSyncCount > 0 ? (
            <>
              {pendingSyncCount} pending
            </>
          ) : (
            "Synced"
          )
        ) : (
          "Offline"
        )}
      </span>

      {isOnline && pendingSyncCount > 0 && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="ml-1 p-0.5 rounded hover:bg-yellow-200 transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isSyncing ? "Syncing in progress" : "Sync pending checkpoints now"}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
