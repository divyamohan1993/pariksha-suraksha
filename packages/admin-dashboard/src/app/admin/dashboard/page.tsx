"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi, examsApi } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { ExamStatusBadge } from "@/components/ExamStatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  GraduationCap,
  FileQuestion,
  Radio,
  AlertTriangle,
  Plus,
  Sparkles,
  Bell,
  Activity,
  Clock,
} from "lucide-react";

export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30000,
  });

  const examsQuery = useQuery({
    queryKey: ["exams-list"],
    queryFn: examsApi.list,
  });

  const stats = statsQuery.data;
  const exams = examsQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            ParikshaSuraksha Admin Overview
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/exams/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Exam
            </Button>
          </Link>
          <Link href="/admin/questions/generate">
            <Button variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Questions
            </Button>
          </Link>
          <Link href="/admin/audit">
            <Button variant="outline">
              <Bell className="h-4 w-4 mr-2" />
              View Alerts
            </Button>
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Exams"
          value={stats?.totalExams ?? "..."}
          description="All exams created"
          icon={GraduationCap}
          trend={{ value: 12, positive: true }}
        />
        <StatCard
          title="Question Bank"
          value={stats?.questionBankSize ?? "..."}
          description="Calibrated templates"
          icon={FileQuestion}
          trend={{ value: 8, positive: true }}
        />
        <StatCard
          title="Active Exams"
          value={stats?.activeExams ?? "..."}
          description="Currently in progress"
          icon={Radio}
          className={stats?.activeExams ? "ring-2 ring-green-500/50" : ""}
        />
        <StatCard
          title="Pending Alerts"
          value={stats?.pendingAlerts ?? "..."}
          description="Unacknowledged alerts"
          icon={AlertTriangle}
          className={
            stats?.pendingAlerts && stats.pendingAlerts > 0
              ? "ring-2 ring-red-500/50"
              : ""
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                {(stats?.recentActivity || []).map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="mt-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {activity.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(activity.timestamp)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          by {activity.actor}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No recent activity
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active/Recent Exams */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Recent Exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            {examsQuery.isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-3">
                {exams.slice(0, 5).map((exam) => (
                  <Link
                    key={exam.id}
                    href={
                      exam.status === "active"
                        ? `/admin/exams/${exam.id}/monitor`
                        : exam.status === "completed" || exam.status === "graded"
                        ? `/admin/exams/${exam.id}/results`
                        : `/admin/exams/${exam.id}/blueprint`
                    }
                  >
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{exam.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {exam.subjects.join(", ")} | {exam.totalCandidates} candidates
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(exam.date).toLocaleDateString("en-IN")}
                        </span>
                        <ExamStatusBadge status={exam.status} />
                      </div>
                    </div>
                  </Link>
                ))}
                {exams.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-4">No exams yet</p>
                    <Link href="/admin/exams/create">
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Exam
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
