"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { questionsApi, type QuestionTemplate } from "@/lib/api";
import { useQuestionStore } from "@/lib/stores/question-store";
import { DataTable, type Column } from "@/components/DataTable";
import { QuestionRenderer } from "@/components/QuestionRenderer";
import { ExamStatusBadge } from "@/components/ExamStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology", "Computer Science"];
const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
const CALIBRATION_STATUSES = ["pending", "field_testing", "calibrated", "rejected"];

export default function QuestionBankPage() {
  const { filters, page, setFilters, setPage } = useQuestionStore();
  const [selectedTemplate, setSelectedTemplate] = useState<QuestionTemplate | null>(null);

  const questionsQuery = useQuery({
    queryKey: ["questions", filters, page],
    queryFn: () =>
      questionsApi.list({
        page,
        pageSize: 50,
        subject: filters.subject || undefined,
        topic: filters.topic || undefined,
        bloomLevel: filters.bloomLevel || undefined,
        calibrationStatus: filters.calibrationStatus || undefined,
        search: filters.search || undefined,
      }),
  });

  const columns: Column<QuestionTemplate>[] = [
    {
      key: "id",
      header: "ID",
      sortable: true,
      className: "w-32",
      render: (item) => (
        <span className="font-mono text-xs">{item.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      sortable: true,
      render: (item) => <Badge variant="outline">{item.subject}</Badge>,
    },
    {
      key: "topic",
      header: "Topic",
      sortable: true,
    },
    {
      key: "subtopic",
      header: "Subtopic",
      render: (item) => (
        <span className="text-muted-foreground">{item.subtopic || "-"}</span>
      ),
    },
    {
      key: "bloomLevel",
      header: "Bloom Level",
      sortable: true,
      render: (item) => (
        <Badge
          variant={
            item.bloomLevel === "remember" || item.bloomLevel === "understand"
              ? "success"
              : item.bloomLevel === "apply" || item.bloomLevel === "analyze"
              ? "warning"
              : "destructive"
          }
        >
          {item.bloomLevel}
        </Badge>
      ),
    },
    {
      key: "calibrationStatus",
      header: "Status",
      sortable: true,
      render: (item) => <ExamStatusBadge status={item.calibrationStatus} />,
    },
    {
      key: "fieldTestCount",
      header: "Field Tests",
      sortable: true,
      className: "text-right",
    },
    {
      key: "updatedAt",
      header: "Updated",
      sortable: true,
      render: (item) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(item.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Question Bank</h1>
        <p className="text-muted-foreground">
          Browse, search, and manage parameterized question templates
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.subject}
          onValueChange={(val) => setFilters({ subject: val === "all" ? "" : val })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {SUBJECTS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.bloomLevel}
          onValueChange={(val) => setFilters({ bloomLevel: val === "all" ? "" : val })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Bloom Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bloom Levels</SelectItem>
            {BLOOM_LEVELS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.calibrationStatus}
          onValueChange={(val) => setFilters({ calibrationStatus: val === "all" ? "" : val })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CALIBRATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <DataTable<QuestionTemplate>
        columns={columns}
        data={questionsQuery.data?.items || []}
        keyExtractor={(item) => item.id}
        pageSize={50}
        currentPage={page}
        totalItems={questionsQuery.data?.total}
        onPageChange={setPage}
        onRowClick={setSelectedTemplate}
        onSearch={(q) => setFilters({ search: q })}
        searchValue={filters.search}
        searchPlaceholder="Search templates by text, topic..."
        isLoading={questionsQuery.isLoading}
        emptyMessage="No question templates found. Try adjusting your filters."
        serverSide
      />

      {/* Template Detail Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Template Details</DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <QuestionRenderer template={selectedTemplate} showMetadata />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
