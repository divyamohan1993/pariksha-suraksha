"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, truncateHash } from "@/lib/utils";
import type { AuditEvent } from "@/lib/api";
import {
  FileText,
  Lock,
  Key,
  Send,
  Unlock,
  FileCheck,
  GraduationCap,
  Shield,
  AlertTriangle,
  Blocks,
} from "lucide-react";

const eventTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  question_create: { icon: FileText, color: "text-blue-500", label: "Question Created" },
  encrypt: { icon: Lock, color: "text-amber-500", label: "Encrypted" },
  key_generate: { icon: Key, color: "text-purple-500", label: "Key Generated" },
  distribute: { icon: Send, color: "text-indigo-500", label: "Distributed" },
  key_release: { icon: Unlock, color: "text-green-500", label: "Key Released" },
  decrypt: { icon: Unlock, color: "text-green-600", label: "Decrypted" },
  submit: { icon: FileCheck, color: "text-cyan-500", label: "Submitted" },
  grade: { icon: GraduationCap, color: "text-emerald-500", label: "Graded" },
  scribe_action: { icon: Shield, color: "text-gray-500", label: "Scribe Action" },
  emergency_release: { icon: AlertTriangle, color: "text-red-500", label: "Emergency Release" },
};

interface AuditTimelineProps {
  events: AuditEvent[];
  className?: string;
  onEventClick?: (event: AuditEvent) => void;
}

export function AuditTimeline({ events, className, onEventClick }: AuditTimelineProps) {
  return (
    <div className={className}>
      <div className="space-y-1">
        {events.map((event, index) => {
          const config = eventTypeConfig[event.eventType] || {
            icon: Blocks,
            color: "text-gray-400",
            label: event.eventType,
          };
          const Icon = config.icon;

          return (
            <div
              key={event.eventId}
              className="flex gap-4 py-3 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onEventClick?.(event)}
            >
              <div className="flex flex-col items-center">
                <div className={`rounded-full p-2 bg-background border ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {index < events.length - 1 && (
                  <div className="w-px h-full bg-border mt-1" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{config.label}</span>
                  <Badge variant="outline" className="text-xs">
                    {event.actorOrg}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDateTime(event.timestamp)}
                </div>
                <div className="text-xs font-mono text-muted-foreground mt-1">
                  Entity: {truncateHash(event.entityHash)}
                  {event.txId && (
                    <span className="ml-2">Tx: {truncateHash(event.txId)}</span>
                  )}
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {Object.entries(event.metadata).map(([key, val]) => (
                      <span key={key} className="mr-3">
                        {key}: {String(val)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
