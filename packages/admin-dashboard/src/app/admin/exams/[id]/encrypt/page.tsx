"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { examsApi, type EncryptionStatus } from "@/lib/api";
import { connectSocket, joinExamRoom, leaveExamRoom, subscribeToEncryptionProgress } from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { truncateHash } from "@/lib/utils";
import {
  Lock,
  Key,
  Shield,
  Send,
  CheckCircle2,
  Loader2,
  Play,
  Hash,
  User,
  Building2,
} from "lucide-react";

interface StepConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const STEPS: StepConfig[] = [
  { key: "encrypting", label: "Encrypt Questions", icon: Lock, description: "AES-256-GCM encryption of all questions" },
  { key: "tlp_generating", label: "Generate TLP Puzzles", icon: Key, description: "Time-lock puzzle generation for each question" },
  { key: "shamir_splitting", label: "Generate Shamir Fragments", icon: Shield, description: "5-of-3 Shamir secret sharing of exam KEK" },
  { key: "distributing", label: "Distribute to Centers", icon: Send, description: "Encrypted question distribution per center" },
];

export default function EncryptPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const examId = params.id as string;

  const [wsUpdate, setWsUpdate] = useState<{
    step: string;
    progress: number;
    detail: string;
    txHash?: string;
  } | null>(null);

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => examsApi.getById(examId),
  });

  const statusQuery = useQuery({
    queryKey: ["encryption-status", examId],
    queryFn: () => examsApi.getEncryptionStatus(examId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.step !== "completed" && data?.step !== "idle" ? 5000 : false;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => examsApi.triggerEncrypt(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encryption-status", examId] });
    },
  });

  useEffect(() => {
    connectSocket();
    joinExamRoom(examId);
    const unsub = subscribeToEncryptionProgress(examId, (data) => {
      setWsUpdate(data);
      if (data.step === "completed") {
        queryClient.invalidateQueries({ queryKey: ["encryption-status", examId] });
      }
    });
    return () => {
      unsub();
      leaveExamRoom(examId);
    };
  }, [examId, queryClient]);

  const status = statusQuery.data;
  const currentStep = wsUpdate?.step || status?.step || "idle";
  const isActive = currentStep !== "idle" && currentStep !== "completed";
  const isCompleted = currentStep === "completed";

  const getStepStatus = (stepKey: string): "completed" | "active" | "pending" => {
    const stepOrder = STEPS.map((s) => s.key);
    const currentIdx = stepOrder.indexOf(currentStep);
    const stepIdx = stepOrder.indexOf(stepKey);
    if (currentStep === "completed") return "completed";
    if (stepIdx < currentIdx) return "completed";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Encryption Workflow</h1>
          <p className="text-muted-foreground">
            {examQuery.data?.name || "Loading..."} — Secure question encryption and distribution
          </p>
        </div>
        {!isActive && !isCompleted && (
          <Button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}>
            {triggerMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Start Encryption
          </Button>
        )}
        {isCompleted && <Badge variant="success" className="text-sm px-4 py-1">All Steps Completed</Badge>}
      </div>

      {/* Step Progress */}
      <div className="space-y-4">
        {STEPS.map((step, index) => {
          const stepStatus = getStepStatus(step.key);
          const Icon = step.icon;

          return (
            <Card
              key={step.key}
              className={
                stepStatus === "active"
                  ? "ring-2 ring-primary"
                  : stepStatus === "completed"
                  ? "border-green-200 dark:border-green-900"
                  : ""
              }
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`rounded-full p-3 ${
                      stepStatus === "completed"
                        ? "bg-green-100 dark:bg-green-900/30"
                        : stepStatus === "active"
                        ? "bg-primary/10"
                        : "bg-muted"
                    }`}
                  >
                    {stepStatus === "completed" ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    ) : stepStatus === "active" ? (
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    ) : (
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        Step {index + 1}: {step.label}
                      </h3>
                      <Badge
                        variant={
                          stepStatus === "completed"
                            ? "success"
                            : stepStatus === "active"
                            ? "info"
                            : "secondary"
                        }
                      >
                        {stepStatus === "completed" ? "Done" : stepStatus === "active" ? "In Progress" : "Pending"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{step.description}</p>

                    {stepStatus === "active" && (
                      <div className="mt-3 space-y-2">
                        <Progress
                          value={
                            wsUpdate?.step === step.key
                              ? wsUpdate.progress
                              : status?.progress || 0
                          }
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          {wsUpdate?.detail || `Processing...`}
                        </p>
                      </div>
                    )}

                    {/* Show specific details per step */}
                    {step.key === "encrypting" && stepStatus === "completed" && status && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {status.encryptedQuestions} / {status.totalQuestions} questions encrypted
                      </p>
                    )}

                    {step.key === "tlp_generating" && stepStatus === "completed" && status && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {status.tlpPuzzlesGenerated} TLP puzzles generated
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Shamir Fragment Holders */}
      {status?.shamirFragments && status.shamirFragments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Shamir Fragment Distribution (3-of-5 Threshold)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.shamirFragments.map((frag, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{frag.holder}</p>
                      <p className="text-xs text-muted-foreground">{frag.role}</p>
                    </div>
                  </div>
                  <Badge variant={frag.distributed ? "success" : "warning"}>
                    {frag.distributed ? "Distributed" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Center Distribution Status */}
      {status?.centerDistribution && status.centerDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Per-Center Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status.centerDistribution.map((center) => (
                <div key={center.centerId} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{center.centerName}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      {center.centerId}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {center.txHash && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Hash className="h-3 w-3" />
                        {truncateHash(center.txHash)}
                      </div>
                    )}
                    <Badge
                      variant={
                        center.status === "distributed"
                          ? "success"
                          : center.status === "distributing"
                          ? "info"
                          : "secondary"
                      }
                    >
                      {center.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blockchain Transaction Hashes */}
      {status?.blockchainTxHashes && status.blockchainTxHashes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Blockchain Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {status.blockchainTxHashes.map((hash, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-mono p-2 bg-muted rounded">
                  <span className="text-muted-foreground w-8">#{i + 1}</span>
                  <span className="break-all">{hash}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
