"use client";

import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", variant: "secondary" },
  blueprint_set: { label: "Blueprint Set", variant: "info" },
  matrix_generated: { label: "Matrix Generated", variant: "info" },
  encrypted: { label: "Encrypted", variant: "warning" },
  distributed: { label: "Distributed", variant: "warning" },
  active: { label: "Active", variant: "success" },
  completed: { label: "Completed", variant: "default" },
  graded: { label: "Graded", variant: "default" },
  published: { label: "Published", variant: "success" },
  // Center statuses
  ready: { label: "Ready", variant: "success" },
  issue: { label: "Issue", variant: "destructive" },
  offline: { label: "Offline", variant: "secondary" },
  // Calibration statuses
  pending: { label: "Pending", variant: "warning" },
  field_testing: { label: "Field Testing", variant: "info" },
  calibrated: { label: "Calibrated", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

interface ExamStatusBadgeProps {
  status: string;
  className?: string;
}

export function ExamStatusBadge({ status, className }: ExamStatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "outline" as const };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
