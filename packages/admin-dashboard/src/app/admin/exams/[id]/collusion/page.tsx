"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { examsApi, type CollusionResult, type CollusionAnalysis } from "@/lib/api";
import {
  connectSocket,
  joinExamRoom,
  leaveExamRoom,
  subscribeToCollusionProgress,
} from "@/lib/socket";
import { DataTable, type Column } from "@/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  Play,
  Loader2,
  AlertTriangle,
  Users,
  FileText,
  ExternalLink,
  Shield,
  Target,
  Eye,
} from "lucide-react";

export default function CollusionPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const examId = params.id as string;

  const [selectedPair, setSelectedPair] = useState<CollusionResult | null>(null);
  const [wsProgress, setWsProgress] = useState<{
    progress: number;
    centersAnalyzed: number;
    totalCenters: number;
  } | null>(null);

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => examsApi.getById(examId),
  });

  const collusionQuery = useQuery({
    queryKey: ["collusion", examId],
    queryFn: () => examsApi.getCollusionResults(examId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 5000 : false;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => examsApi.triggerCollusion(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collusion", examId] });
    },
  });

  useEffect(() => {
    connectSocket();
    joinExamRoom(examId);
    const unsub = subscribeToCollusionProgress(examId, (data) => {
      setWsProgress(data);
      if (data.progress >= 100) {
        queryClient.invalidateQueries({ queryKey: ["collusion", examId] });
      }
    });
    return () => {
      unsub();
      leaveExamRoom(examId);
    };
  }, [examId, queryClient]);

  const analysis = collusionQuery.data;
  const isRunning = analysis?.status === "running";
  const isCompleted = analysis?.status === "completed";
  const flaggedResults = (analysis?.results || []).filter((r) => r.flagged);
  const progress = wsProgress?.progress ?? analysis?.progress ?? 0;

  const columns: Column<CollusionResult>[] = [
    {
      key: "candidateU",
      header: "Candidate A",
      sortable: true,
      render: (item) => <span className="font-mono text-xs">{item.candidateU}</span>,
    },
    {
      key: "candidateV",
      header: "Candidate B",
      sortable: true,
      render: (item) => <span className="font-mono text-xs">{item.candidateV}</span>,
    },
    {
      key: "logLambda",
      header: "Log-Likelihood Ratio",
      sortable: true,
      render: (item) => (
        <span className={item.flagged ? "font-bold text-red-600" : ""}>
          {item.logLambda.toFixed(2)}
        </span>
      ),
    },
    {
      key: "threshold",
      header: "Threshold",
      render: (item) => <span className="text-muted-foreground">{item.threshold.toFixed(2)}</span>,
    },
    {
      key: "centerName",
      header: "Center",
      sortable: true,
    },
    {
      key: "flagged",
      header: "Status",
      render: (item) => (
        <Badge variant={item.flagged ? "destructive" : "success"}>
          {item.flagged ? "FLAGGED" : "Clear"}
        </Badge>
      ),
    },
    {
      key: "evidence",
      header: "",
      render: (item) =>
        item.flagged ? (
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedPair(item); }}>
            <Eye className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  // Network graph data for cheating rings
  const ringData = (analysis?.rings || []).map((ring) => ({
    id: ring.id,
    members: ring.members.length,
    avgScore: ring.avgLogLambda,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Collusion Detection</h1>
          <p className="text-muted-foreground">
            {examQuery.data?.name || "Loading..."} — Statistical analysis of answer pattern similarity
          </p>
        </div>
        {!isCompleted && (
          <Button
            onClick={() => triggerMutation.mutate()}
            disabled={isRunning || triggerMutation.isPending}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Detection
              </>
            )}
          </Button>
        )}
      </div>

      {/* Progress */}
      {isRunning && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span>
                Analyzing centers: {wsProgress?.centersAnalyzed ?? analysis?.centersAnalyzed ?? 0} /{" "}
                {wsProgress?.totalCenters ?? analysis?.totalCenters ?? "?"}
              </span>
              <span className="font-semibold">{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {isCompleted && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <Users className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <div className="text-2xl font-bold">{analysis?.results?.length ?? 0}</div>
              <p className="text-xs text-muted-foreground">Total Pairs Analyzed</p>
            </CardContent>
          </Card>
          <Card className={flaggedResults.length > 0 ? "ring-2 ring-red-500/50" : ""}>
            <CardContent className="pt-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
              <div className="text-2xl font-bold text-red-600">{flaggedResults.length}</div>
              <p className="text-xs text-muted-foreground">Flagged Pairs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Target className="h-5 w-5 mx-auto text-purple-500 mb-1" />
              <div className="text-2xl font-bold">{analysis?.rings?.length ?? 0}</div>
              <p className="text-xs text-muted-foreground">Cheating Rings</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Shield className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <div className="text-2xl font-bold">{analysis?.totalCenters ?? 0}</div>
              <p className="text-xs text-muted-foreground">Centers Analyzed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Flagged Pairs Table */}
      {isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle>Flagged Pairs (sorted by log-likelihood ratio)</CardTitle>
            <CardDescription>
              Pairs exceeding the statistical threshold (FPR &lt; 0.0001)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable<CollusionResult>
              columns={columns}
              data={flaggedResults.sort((a, b) => b.logLambda - a.logLambda)}
              keyExtractor={(item) => item.id}
              pageSize={50}
              onRowClick={setSelectedPair}
              emptyMessage="No collusion detected. All pairs are within normal statistical bounds."
            />
          </CardContent>
        </Card>
      )}

      {/* Cheating Ring Visualization */}
      {isCompleted && analysis?.rings && analysis.rings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cheating Ring Network</CardTitle>
            <CardDescription>
              Connected components of flagged candidate pairs. Each node is a candidate, edges represent flagged pairs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analysis.rings.map((ring) => (
                <div key={ring.id} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Ring {ring.id}</Badge>
                      <span className="text-sm">{ring.members.length} members</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Avg score: {ring.avgLogLambda.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ring.members.map((member) => (
                      <div
                        key={member}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-sm"
                      >
                        <Users className="h-3 w-3" />
                        <span className="font-mono text-xs">{member}</span>
                      </div>
                    ))}
                  </div>
                  {/* Simple network representation */}
                  <div className="mt-3 flex items-center gap-1 flex-wrap">
                    {ring.members.map((member, idx) =>
                      idx < ring.members.length - 1 ? (
                        <React.Fragment key={member}>
                          <div className="px-2 py-0.5 bg-red-500 text-white text-xs rounded">
                            {member.slice(-4)}
                          </div>
                          <div className="w-8 h-0.5 bg-red-300" />
                        </React.Fragment>
                      ) : (
                        <div key={member} className="px-2 py-0.5 bg-red-500 text-white text-xs rounded">
                          {member.slice(-4)}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Detail Dialog */}
      <Dialog open={!!selectedPair} onOpenChange={() => setSelectedPair(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Evidence: {selectedPair?.candidateU} vs {selectedPair?.candidateV}
            </DialogTitle>
          </DialogHeader>

          {selectedPair && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Log-Likelihood Ratio</p>
                  <p className="text-2xl font-bold text-red-600">
                    {selectedPair.logLambda.toFixed(3)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Threshold: {selectedPair.threshold.toFixed(3)}
                  </p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Statistical Significance</p>
                  <Badge
                    variant={
                      selectedPair.evidence.statisticalSignificance > 0.9999
                        ? "destructive"
                        : selectedPair.evidence.statisticalSignificance > 0.99
                        ? "warning"
                        : "secondary"
                    }
                    className="text-lg mt-1"
                  >
                    {(selectedPair.evidence.statisticalSignificance * 100).toFixed(2)}%
                  </Badge>
                </div>
              </div>

              {/* Matching Wrong Answers */}
              <div>
                <h3 className="font-semibold mb-3">Matching Wrong Answers</h3>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left">Question</th>
                        <th className="p-2 text-left">Shared Wrong Answer</th>
                        <th className="p-2 text-left">Selection Probability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPair.evidence.matchingWrongAnswers.map((mwa, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2 font-mono">{mwa.questionId}</td>
                          <td className="p-2 font-semibold">{mwa.answer}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Progress value={mwa.probability * 100} className="h-2 w-20" />
                              <span>{(mwa.probability * 100).toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Seating Position */}
              <div>
                <h3 className="font-semibold mb-3">Seating Position</h3>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                      <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-2">
                        <Users className="h-6 w-6 text-red-500" />
                      </div>
                      <p className="font-mono text-xs">{selectedPair.candidateU}</p>
                      <p className="text-xs text-muted-foreground">Seat {selectedPair.evidence.seatU}</p>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-muted-foreground">
                        {selectedPair.evidence.seatingDistance} seat(s) apart
                      </div>
                      <div className="h-0.5 w-24 bg-red-300 mx-auto my-2" />
                    </div>
                    <div className="text-center">
                      <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-2">
                        <Users className="h-6 w-6 text-red-500" />
                      </div>
                      <p className="font-mono text-xs">{selectedPair.candidateV}</p>
                      <p className="text-xs text-muted-foreground">Seat {selectedPair.evidence.seatV}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* PDF Report Link */}
              {selectedPair.evidence.pdfReportUrl && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedPair.evidence.pdfReportUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    Download PDF Evidence Report
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
