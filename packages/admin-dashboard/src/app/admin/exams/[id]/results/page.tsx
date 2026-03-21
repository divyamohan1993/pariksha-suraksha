"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { examsApi, type ExamResult } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/DataTable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  BarChart3,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Scale,
  TrendingUp,
} from "lucide-react";

export default function ResultsPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const examId = params.id as string;
  const [searchQuery, setSearchQuery] = useState("");

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => examsApi.getById(examId),
  });

  const resultsQuery = useQuery({
    queryKey: ["results", examId],
    queryFn: () => examsApi.getResults(examId),
  });

  const searchMutation = useMutation({
    mutationFn: (q: string) => examsApi.searchCandidateResult(examId, q),
  });

  const publishMutation = useMutation({
    mutationFn: () => examsApi.publishResults(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["results", examId] });
      queryClient.invalidateQueries({ queryKey: ["exam", examId] });
    },
  });

  const equateMutation = useMutation({
    mutationFn: () => examsApi.triggerEquating(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["results", examId] });
    },
  });

  const results = resultsQuery.data;

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery.trim());
    }
  };

  const searchColumns: Column<ExamResult>[] = [
    { key: "candidateId", header: "Candidate ID", sortable: true },
    { key: "candidateName", header: "Name", sortable: true },
    {
      key: "rawScore",
      header: "Raw Score",
      sortable: true,
      render: (item) => <span className="font-semibold">{item.rawScore}</span>,
    },
    {
      key: "equatedScore",
      header: "Equated Score",
      sortable: true,
      render: (item) => (
        <span className="font-semibold text-primary">{item.equatedScore}</span>
      ),
    },
    { key: "centerId", header: "Center", sortable: true },
    {
      key: "paperVariant",
      header: "Paper Variant",
      render: (item) => (
        <Badge variant="outline" className="font-mono">{item.paperVariant}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exam Results</h1>
          <p className="text-muted-foreground">
            {examQuery.data?.name || "Loading..."} — Score analysis and publication
          </p>
        </div>
        <div className="flex gap-2">
          {!results?.equatingApplied && (
            <Button
              variant="outline"
              onClick={() => equateMutation.mutate()}
              disabled={equateMutation.isPending}
            >
              {equateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Scale className="h-4 w-4 mr-2" />
              )}
              Run Equating
            </Button>
          )}
          <Button
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || results?.published}
          >
            {publishMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : results?.published ? (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {results?.published ? "Published" : "Publish Results"}
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Candidates</p>
            <p className="text-2xl font-bold">{results?.totalCandidates?.toLocaleString() ?? "..."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Mean Score</p>
            <p className="text-2xl font-bold">{results?.mean?.toFixed(1) ?? "..."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Median Score</p>
            <p className="text-2xl font-bold">{results?.median?.toFixed(1) ?? "..."}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Std Deviation</p>
            <p className="text-2xl font-bold">{results?.stdDev?.toFixed(2) ?? "..."}</p>
          </CardContent>
        </Card>
      </div>

      {/* Score Distribution Histogram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Score Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results?.scoreDistribution ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={results.scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="bin"
                  label={{ value: "Score Range", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  label={{ value: "Candidates", angle: -90, position: "insideLeft" }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Candidates" />
                {results.mean && (
                  <ReferenceLine
                    x={results.scoreDistribution.find(
                      (d) => parseFloat(d.bin) >= results.mean
                    )?.bin}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    label={{ value: `Mean: ${results.mean.toFixed(1)}`, position: "top" }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* KS Test / Equating Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Score Equating Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results?.ksTestResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">KS Test Statistic</p>
                  <p className="text-xl font-bold">{results.ksTestResult.statistic.toFixed(4)}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">p-value</p>
                  <p className="text-xl font-bold">{results.ksTestResult.pValue.toFixed(6)}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Papers Differ?</p>
                  <Badge
                    variant={results.ksTestResult.papersDiffer ? "warning" : "success"}
                    className="mt-1"
                  >
                    {results.ksTestResult.papersDiffer ? "Yes - Equating Needed" : "No - Papers Equivalent"}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg border">
                {results.equatingApplied ? (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <div>
                      <p className="font-semibold text-green-700 dark:text-green-400">
                        IRT True-Score Equating Applied
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Scores have been adjusted using IRT-based equating to account for paper difficulty differences.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                    <div>
                      <p className="font-semibold">Equating Not Yet Applied</p>
                      <p className="text-sm text-muted-foreground">
                        Run equating to adjust scores if paper difficulty distributions differ significantly.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No equating data available yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Per-candidate Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Candidate Result Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by candidate ID or name..."
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searchMutation.isPending}>
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {searchMutation.data && (
            <DataTable<ExamResult>
              columns={searchColumns}
              data={searchMutation.data}
              keyExtractor={(item) => item.candidateId}
              pageSize={20}
              emptyMessage="No results found for this search query."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
