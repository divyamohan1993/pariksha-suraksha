"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { questionsApi, type QuestionTemplate } from "@/lib/api";
import { DataTable, type Column } from "@/components/DataTable";
import { ExamStatusBadge } from "@/components/ExamStatusBadge";
import { DifficultyHistogram } from "@/components/DifficultyHistogram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FlaskConical,
} from "lucide-react";

export default function CalibratePage() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<QuestionTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTemplateId, setUploadingTemplateId] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: ["questions", { calibrationStatus: "pending" }],
    queryFn: () =>
      questionsApi.list({
        calibrationStatus: "pending",
        pageSize: 50,
      }),
  });

  const fieldTestingQuery = useQuery({
    queryKey: ["questions", { calibrationStatus: "field_testing" }],
    queryFn: () =>
      questionsApi.list({
        calibrationStatus: "field_testing",
        pageSize: 50,
      }),
  });

  const calibratedQuery = useQuery({
    queryKey: ["questions", { calibrationStatus: "calibrated" }],
    queryFn: () =>
      questionsApi.list({
        calibrationStatus: "calibrated",
        pageSize: 20,
      }),
  });

  const calibrationDetailQuery = useQuery({
    queryKey: ["calibration-detail", selectedTemplate?.id],
    queryFn: () =>
      selectedTemplate
        ? questionsApi.getCalibrationStatus(selectedTemplate.id)
        : Promise.reject("No template"),
    enabled: !!selectedTemplate,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ templateId, formData }: { templateId: string; formData: FormData }) =>
      questionsApi.uploadFieldTestData(templateId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      setUploadingTemplateId(null);
    },
  });

  const handleUpload = (templateId: string) => {
    setUploadingTemplateId(templateId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingTemplateId) {
      const formData = new FormData();
      formData.append("file", file);
      uploadMutation.mutate({ templateId: uploadingTemplateId, formData });
    }
    e.target.value = "";
  };

  const pendingColumns: Column<QuestionTemplate>[] = [
    {
      key: "id",
      header: "Template ID",
      sortable: true,
      render: (item) => <span className="font-mono text-xs">{item.id.slice(0, 12)}</span>,
    },
    { key: "subject", header: "Subject", sortable: true },
    { key: "topic", header: "Topic", sortable: true },
    {
      key: "bloomLevel",
      header: "Bloom Level",
      render: (item) => <Badge variant="outline">{item.bloomLevel}</Badge>,
    },
    {
      key: "calibrationStatus",
      header: "Status",
      render: (item) => <ExamStatusBadge status={item.calibrationStatus} />,
    },
    {
      key: "fieldTestCount",
      header: "Field Tests",
      sortable: true,
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            handleUpload(item.id);
          }}
          disabled={uploadMutation.isPending && uploadingTemplateId === item.id}
        >
          {uploadMutation.isPending && uploadingTemplateId === item.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Upload className="h-4 w-4 mr-1" />
              Upload CSV
            </>
          )}
        </Button>
      ),
    },
  ];

  const calDetail = calibrationDetailQuery.data;
  const distractorData = calDetail?.distractorProfile
    ? Object.entries(calDetail.distractorProfile).map(([key, val]) => ({
        option: key,
        probability: val,
      }))
    : [];

  const DISTRACTOR_COLORS = ["#6366f1", "#f43f5e", "#f59e0b", "#22c55e"];

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".csv"
        onChange={handleFileChange}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calibration</h1>
        <p className="text-muted-foreground">
          Manage field tests and IRT parameter calibration for question templates
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              Pending Calibration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingQuery.data?.total ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-blue-500" />
              Field Testing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fieldTestingQuery.data?.total ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Calibrated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calibratedQuery.data?.total ?? "..."}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates Pending Calibration</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable<QuestionTemplate>
            columns={pendingColumns}
            data={[
              ...(pendingQuery.data?.items || []),
              ...(fieldTestingQuery.data?.items || []),
            ]}
            keyExtractor={(item) => item.id}
            pageSize={50}
            onRowClick={setSelectedTemplate}
            isLoading={pendingQuery.isLoading}
            emptyMessage="No templates pending calibration."
          />
        </CardContent>
      </Card>

      {/* Calibration Detail Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Calibration Details — {selectedTemplate?.subject} / {selectedTemplate?.topic}
            </DialogTitle>
          </DialogHeader>

          {calibrationDetailQuery.isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : calDetail ? (
            <div className="space-y-6">
              {/* IRT Parameters */}
              {calDetail.irtParams && (
                <div>
                  <h3 className="font-semibold mb-3">IRT Parameters (3PL Model)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Discrimination (a)</div>
                        <div className="text-xl font-bold">{calDetail.irtParams.aMean.toFixed(3)}</div>
                        {calDetail.confidenceIntervals?.a && (
                          <div className="text-xs text-muted-foreground">
                            95% CI: [{calDetail.confidenceIntervals.a[0].toFixed(3)},{" "}
                            {calDetail.confidenceIntervals.a[1].toFixed(3)}]
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          SD: {calDetail.irtParams.aStd.toFixed(3)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Difficulty (b)</div>
                        <div className="text-xl font-bold">{calDetail.irtParams.bMean.toFixed(3)}</div>
                        {calDetail.confidenceIntervals?.b && (
                          <div className="text-xs text-muted-foreground">
                            95% CI: [{calDetail.confidenceIntervals.b[0].toFixed(3)},{" "}
                            {calDetail.confidenceIntervals.b[1].toFixed(3)}]
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          SD: {calDetail.irtParams.bStd.toFixed(3)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Guessing (c)</div>
                        <div className="text-xl font-bold">{calDetail.irtParams.cMean.toFixed(3)}</div>
                        {calDetail.confidenceIntervals?.c && (
                          <div className="text-xs text-muted-foreground">
                            95% CI: [{calDetail.confidenceIntervals.c[0].toFixed(3)},{" "}
                            {calDetail.confidenceIntervals.c[1].toFixed(3)}]
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          SD: {calDetail.irtParams.cStd.toFixed(3)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Isomorphic Equivalence */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    {calDetail.isomorphicEquivalence ? (
                      <>
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                        <div>
                          <div className="font-semibold text-green-700 dark:text-green-400">
                            Isomorphic Equivalence: VERIFIED
                          </div>
                          <div className="text-sm text-muted-foreground">
                            All parameter instantiations produce statistically equivalent difficulty.
                            IRT params within tolerance (delta-a &lt; 0.3, delta-b &lt; 0.15, delta-c &lt; 0.05).
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-6 w-6 text-red-500" />
                        <div>
                          <div className="font-semibold text-red-700 dark:text-red-400">
                            Isomorphic Equivalence: FAILED
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Parameter instantiations produce significantly different difficulty levels.
                            Template needs revision before entering production bank.
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Distractor Profile */}
              {distractorData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Distractor Attractiveness Profile</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={distractorData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="option" />
                        <YAxis
                          label={{
                            value: "Selection Probability",
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip />
                        <Bar dataKey="probability" radius={[4, 4, 0, 0]}>
                          {distractorData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={DISTRACTOR_COLORS[index % DISTRACTOR_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No calibration data available yet. Upload field test data to begin calibration.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
