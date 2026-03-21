"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { examsApi, type MonitorData, type CenterMonitor, type AlertItem } from "@/lib/api";
import { useExamStore } from "@/lib/stores/exam-store";
import {
  connectSocket,
  joinExamRoom,
  leaveExamRoom,
  subscribeToMonitor,
  subscribeToAlerts,
} from "@/lib/socket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, formatDateTime } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import {
  Radio,
  Clock,
  Users,
  FileCheck,
  Zap,
  Cpu,
  AlertTriangle,
  Bell,
  CheckCircle2,
  XCircle,
  Activity,
  Wifi,
  WifiOff,
  Eye,
} from "lucide-react";

function CountdownTimer({ targetTime }: { targetTime: string }) {
  const [remaining, setRemaining] = useState("");
  const [isReleased, setIsReleased] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setRemaining("KEYS RELEASED");
        setIsReleased(true);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setRemaining(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return (
    <div
      className={cn(
        "text-center p-6 rounded-xl",
        isReleased
          ? "bg-green-50 dark:bg-green-950/30 ring-2 ring-green-500"
          : "bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-500"
      )}
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <Clock className="h-5 w-5" />
        <span className="text-sm font-medium">
          {isReleased ? "Key Release Status" : "Key Release Countdown"}
        </span>
      </div>
      <div
        className={cn(
          "text-4xl font-mono font-bold",
          isReleased ? "text-green-600" : "text-amber-600"
        )}
      >
        {remaining}
      </div>
    </div>
  );
}

function CenterStatusGrid({ centers }: { centers: CenterMonitor[] }) {
  const statusColors: Record<string, string> = {
    ready: "bg-green-500",
    active: "bg-blue-500",
    issue: "bg-red-500",
    offline: "bg-gray-400",
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {centers.map((center) => (
        <Card
          key={center.centerId}
          className={cn(
            "relative overflow-hidden",
            center.status === "issue" && "ring-2 ring-red-500 animate-pulse-slow"
          )}
        >
          <div className={cn("absolute top-0 left-0 right-0 h-1", statusColors[center.status])} />
          <CardContent className="pt-4 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold truncate">{center.centerName}</span>
              <div className={cn("h-2 w-2 rounded-full", statusColors[center.status])} />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Logged In</span>
                <span className="font-semibold">
                  {center.candidatesLoggedIn}/{center.totalSeats}
                </span>
              </div>
              <Progress
                value={(center.candidatesLoggedIn / center.totalSeats) * 100}
                className="h-1"
              />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Papers</span>
                <span className="font-semibold">{center.papersDelivered}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submitted</span>
                <span className="font-semibold">{center.responsesSubmitted}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MonitorPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const examId = params.id as string;

  const { monitorData, setMonitorData, alerts, addAlert, acknowledgeAlert } = useExamStore();
  const [isConnected, setIsConnected] = useState(false);

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => examsApi.getById(examId),
  });

  // Poll as fallback every 2 seconds
  const monitorQuery = useQuery({
    queryKey: ["monitor", examId],
    queryFn: () => examsApi.getMonitorData(examId),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  // Update store from polling data
  useEffect(() => {
    if (monitorQuery.data) {
      setMonitorData(monitorQuery.data);
    }
  }, [monitorQuery.data, setMonitorData]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    connectSocket();
    joinExamRoom(examId);
    setIsConnected(true);

    const unsubMonitor = subscribeToMonitor(examId, (data) => {
      setMonitorData(data as MonitorData);
    });

    const unsubAlerts = subscribeToAlerts(examId, (alert) => {
      addAlert({
        ...alert,
        acknowledged: false,
      } as AlertItem);
    });

    return () => {
      unsubMonitor();
      unsubAlerts();
      leaveExamRoom(examId);
      setIsConnected(false);
    };
  }, [examId, setMonitorData, addAlert]);

  const data = monitorData;
  const unackedAlerts = alerts.filter((a) => !a.acknowledged);

  // Latency mock data for chart
  const latencyHistory = Array.from({ length: 20 }, (_, i) => ({
    time: `${i * 6}s`,
    latency: Math.max(1, Math.random() * 8 + (data?.metrics?.avgPaperLatency || 3)),
    load: (data?.metrics?.systemLoad || 0.4) * 100 + Math.random() * 10,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Radio className="h-8 w-8 text-red-500 animate-pulse" />
            Exam Day Monitor
          </h1>
          <p className="text-muted-foreground">
            {examQuery.data?.name || "Loading..."} — Real-time exam monitoring dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? "success" : "destructive"} className="gap-1">
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? "Live" : "Disconnected"}
          </Badge>
          <Badge variant="outline">
            Auto-refresh: 2s
          </Badge>
        </div>
      </div>

      {/* Key Release Countdown */}
      {data?.keyReleaseTime && (
        <CountdownTimer targetTime={data.keyReleaseTime} />
      )}

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <div className="text-2xl font-bold">
              {data?.metrics?.activeConnections ?? "..."}
            </div>
            <p className="text-xs text-muted-foreground">Active Connections</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <FileCheck className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold">
              {data?.metrics?.responsesSubmitted ?? "..."} / {data?.metrics?.totalCandidates ?? "..."}
            </div>
            <p className="text-xs text-muted-foreground">Responses Submitted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Zap className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <div className="text-2xl font-bold">
              {data?.metrics?.avgPaperLatency?.toFixed(1) ?? "..."}ms
            </div>
            <p className="text-xs text-muted-foreground">Avg Paper Latency</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Cpu className="h-5 w-5 mx-auto text-purple-500 mb-1" />
            <div className="text-2xl font-bold">
              {data?.metrics?.systemLoad ? `${(data.metrics.systemLoad * 100).toFixed(0)}%` : "..."}
            </div>
            <p className="text-xs text-muted-foreground">System Load</p>
          </CardContent>
        </Card>
        <Card className={unackedAlerts.length > 0 ? "ring-2 ring-red-500" : ""}>
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <div className="text-2xl font-bold">{unackedAlerts.length}</div>
            <p className="text-xs text-muted-foreground">Active Alerts</p>
          </CardContent>
        </Card>
      </div>

      {/* Center Status Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Center Status Grid
          </CardTitle>
          <CardDescription>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Ready</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Active</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Issue</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Offline</span>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.centers ? (
            <CenterStatusGrid centers={data.centers} />
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Live Metrics Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Live Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={latencyHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" label={{ value: "Latency (ms)", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: "Load (%)", angle: 90, position: "insideRight", style: { fontSize: 10 } }} />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="latency" stroke="#6366f1" name="Paper Latency (ms)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="load" stroke="#f59e0b" name="System Load (%)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alert Panel */}
        <Card className={unackedAlerts.length > 0 ? "ring-2 ring-red-500/50" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alert Panel
              {unackedAlerts.length > 0 && (
                <Badge variant="destructive">{unackedAlerts.length} active</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                  <p>No alerts - all systems operational</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border text-sm",
                        !alert.acknowledged && alert.type === "error" && "bg-red-50 dark:bg-red-950/20 border-red-200",
                        !alert.acknowledged && alert.type === "warning" && "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200",
                        alert.acknowledged && "opacity-60"
                      )}
                    >
                      {alert.type === "error" ? (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      ) : alert.type === "warning" ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                      ) : (
                        <Bell className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{alert.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {alert.centerId && (
                            <Badge variant="outline" className="text-xs">
                              {alert.centerId}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          Ack
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
