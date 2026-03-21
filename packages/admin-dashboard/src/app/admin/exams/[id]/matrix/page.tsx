"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { examsApi, type MatrixStatus } from "@/lib/api";
import { connectSocket, joinExamRoom, leaveExamRoom, subscribeToMatrixProgress } from "@/lib/socket";
import { DifficultyHistogram } from "@/components/DifficultyHistogram";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Play, Loader2, CheckCircle2, AlertCircle, Grid3X3 } from "lucide-react";

export default function MatrixPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const examId = params.id as string;

  const [wsProgress, setWsProgress] = useState<{
    progress: number;
    generatedPapers: number;
    totalPapers: number;
  } | null>(null);

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => examsApi.getById(examId),
  });

  const statusQuery = useQuery({
    queryKey: ["matrix-status", examId],
    queryFn: () => examsApi.getMatrixStatus(examId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 5000 : false;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => examsApi.triggerMatrix(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matrix-status", examId] });
    },
  });

  // WebSocket for real-time progress
  useEffect(() => {
    connectSocket();
    joinExamRoom(examId);

    const unsubscribe = subscribeToMatrixProgress(examId, (data) => {
      setWsProgress(data);
      if (data.progress >= 100) {
        queryClient.invalidateQueries({ queryKey: ["matrix-status", examId] });
      }
    });

    return () => {
      unsubscribe();
      leaveExamRoom(examId);
    };
  }, [examId, queryClient]);

  const status = statusQuery.data;
  const progress = wsProgress?.progress ?? status?.progress ?? 0;
  const isRunning = status?.status === "running" || triggerMutation.isPending;
  const isCompleted = status?.status === "completed";

  // Mock sample paper comparison data
  const samplePaperData = [
    { difficulty: "Very Easy", paper1: 3, paper2: 4, paper3: 3, paper4: 3, paper5: 4 },
    { difficulty: "Easy", paper1: 12, paper2: 11, paper3: 12, paper4: 13, paper5: 12 },
    { difficulty: "Medium", paper1: 30, paper2: 31, paper3: 30, paper4: 29, paper5: 30 },
    { difficulty: "Hard", paper1: 12, paper2: 11, paper3: 12, paper4: 12, paper5: 11 },
    { difficulty: "Very Hard", paper1: 3, paper2: 3, paper3: 3, paper4: 3, paper5: 3 },
  ];

  // Mock overlap heat map data
  const overlapData = [
    { pair: "S1-S2", overlap: 8 },
    { pair: "S1-S3", overlap: 5 },
    { pair: "S2-S3", overlap: 7 },
    { pair: "S1-S4", overlap: 3 },
    { pair: "S2-S4", overlap: 6 },
    { pair: "S3-S4", overlap: 4 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Matrix Generation</h1>
          <p className="text-muted-foreground">
            {examQuery.data?.name || "Loading..."} — Generate unique papers for all candidates
          </p>
        </div>
        {!isCompleted && (
          <Button
            onClick={() => triggerMutation.mutate()}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Generate Matrix
              </>
            )}
          </Button>
        )}
      </div>

      {/* Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
            Generation Progress
            {isCompleted && <Badge variant="success">Completed</Badge>}
            {isRunning && <Badge variant="info">Running</Badge>}
            {status?.status === "idle" && <Badge variant="secondary">Not Started</Badge>}
            {status?.status === "failed" && <Badge variant="destructive">Failed</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between text-sm">
            <span>
              {wsProgress?.generatedPapers ?? status?.generatedPapers ?? 0} /{" "}
              {wsProgress?.totalPapers ?? status?.totalPapers ?? "?"} papers
            </span>
            <span className="font-semibold">{progress.toFixed(1)}%</span>
          </div>

          {status?.startedAt && (
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                Started: {new Date(status.startedAt).toLocaleString("en-IN")}
              </div>
              {status.completedAt && (
                <div>
                  Completed: {new Date(status.completedAt).toLocaleString("en-IN")}
                </div>
              )}
            </div>
          )}

          {status?.error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{status.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview section - only shown when complete */}
      {isCompleted && (
        <>
          {/* Side-by-side difficulty comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Difficulty Histogram — 5 Sample Papers</CardTitle>
              <CardDescription>
                All papers should match the target difficulty distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={samplePaperData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="difficulty" />
                  <YAxis label={{ value: "Questions", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="paper1" fill="#6366f1" name="Paper 1" />
                  <Bar dataKey="paper2" fill="#f43f5e" name="Paper 2" />
                  <Bar dataKey="paper3" fill="#22c55e" name="Paper 3" />
                  <Bar dataKey="paper4" fill="#f59e0b" name="Paper 4" />
                  <Bar dataKey="paper5" fill="#06b6d4" name="Paper 5" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Neighbor Overlap Heat Map */}
          <Card>
            <CardHeader>
              <CardTitle>Neighbor Overlap</CardTitle>
              <CardDescription>
                Question overlap between adjacent seats. Target: less than 10%.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={overlapData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="pair" />
                  <YAxis
                    domain={[0, 15]}
                    label={{ value: "Overlap %", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip />
                  <Bar dataKey="overlap" radius={[4, 4, 0, 0]}>
                    {overlapData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.overlap > 10 ? "#ef4444" : "#22c55e"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-green-500" />
                  <span>Within limit (&lt; 10%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-red-500" />
                  <span>Exceeds limit (&gt; 10%)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
