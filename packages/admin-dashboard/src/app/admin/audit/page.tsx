"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi, type AuditEvent } from "@/lib/api";
import { AuditTimeline } from "@/components/AuditTimeline";
import { BlockchainVerifier } from "@/components/BlockchainVerifier";
import { DataTable, type Column } from "@/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, truncateHash } from "@/lib/utils";
import { Shield, Table, Clock, Filter } from "lucide-react";

const EVENT_TYPES = [
  "question_create",
  "encrypt",
  "key_generate",
  "distribute",
  "key_release",
  "decrypt",
  "submit",
  "grade",
  "scribe_action",
  "emergency_release",
];

export default function AuditPage() {
  const [filters, setFilters] = useState({
    examId: "",
    eventType: "",
    startDate: "",
    endDate: "",
  });
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [verifyEventId, setVerifyEventId] = useState("");

  const eventsQuery = useQuery({
    queryKey: ["audit-events", filters, page],
    queryFn: () =>
      auditApi.getEvents({
        examId: filters.examId || undefined,
        eventType: filters.eventType || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        page,
        pageSize: 50,
      }),
  });

  const columns: Column<AuditEvent>[] = [
    {
      key: "eventType",
      header: "Event Type",
      sortable: true,
      render: (item) => (
        <Badge variant="outline" className="font-mono text-xs">
          {item.eventType}
        </Badge>
      ),
    },
    {
      key: "examId",
      header: "Exam",
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs">{item.examId ? truncateHash(item.examId) : "-"}</span>
      ),
    },
    {
      key: "entityHash",
      header: "Entity Hash",
      render: (item) => (
        <span className="font-mono text-xs">{truncateHash(item.entityHash)}</span>
      ),
    },
    {
      key: "actorId",
      header: "Actor",
      render: (item) => (
        <span className="text-xs">{truncateHash(item.actorId, 6)}</span>
      ),
    },
    {
      key: "actorOrg",
      header: "Organization",
      sortable: true,
    },
    {
      key: "timestamp",
      header: "Timestamp",
      sortable: true,
      render: (item) => (
        <span className="text-xs">{formatDateTime(item.timestamp)}</span>
      ),
    },
    {
      key: "eventId",
      header: "",
      render: (item) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setVerifyEventId(item.eventId);
          }}
        >
          <Shield className="h-3 w-3 mr-1" />
          Verify
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Blockchain event explorer with Merkle proof verification
        </p>
      </div>

      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table" className="gap-2">
            <Table className="h-4 w-4" />
            Table View
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2">
            <Clock className="h-4 w-4" />
            Timeline View
          </TabsTrigger>
          <TabsTrigger value="verify" className="gap-2">
            <Shield className="h-4 w-4" />
            Verify Event
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Event Type</Label>
                <Select
                  value={filters.eventType}
                  onValueChange={(val) =>
                    setFilters((f) => ({ ...f, eventType: val === "all" ? "" : val }))
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Exam ID</Label>
                <Input
                  value={filters.examId}
                  onChange={(e) => setFilters((f) => ({ ...f, examId: e.target.value }))}
                  placeholder="Filter by exam..."
                  className="w-[200px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-[160px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({ examId: "", eventType: "", startDate: "", endDate: "" })}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table View */}
        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <DataTable<AuditEvent>
                columns={columns}
                data={eventsQuery.data?.items || []}
                keyExtractor={(item) => item.eventId}
                pageSize={50}
                currentPage={page}
                totalItems={eventsQuery.data?.total}
                onPageChange={setPage}
                onRowClick={setSelectedEvent}
                isLoading={eventsQuery.isLoading}
                emptyMessage="No audit events found for the selected filters."
                serverSide
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline View */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Chronological Event Flow</CardTitle>
              <CardDescription>
                Events displayed in time order. Click an event for details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <AuditTimeline
                  events={eventsQuery.data?.items || []}
                  onEventClick={(event) => {
                    setSelectedEvent(event);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verify View */}
        <TabsContent value="verify">
          <BlockchainVerifier eventId={verifyEventId} />
        </TabsContent>
      </Tabs>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Event ID</p>
                  <p className="font-mono break-all">{selectedEvent.eventId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Event Type</p>
                  <Badge variant="outline">{selectedEvent.eventType}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Exam ID</p>
                  <p className="font-mono break-all">{selectedEvent.examId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Timestamp</p>
                  <p>{formatDateTime(selectedEvent.timestamp)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actor</p>
                  <p className="font-mono text-xs break-all">{selectedEvent.actorId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Organization</p>
                  <p>{selectedEvent.actorOrg}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Entity Hash</p>
                  <p className="font-mono text-xs break-all">{selectedEvent.entityHash}</p>
                </div>
              </div>

              {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Metadata</p>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setVerifyEventId(selectedEvent.eventId);
                    setSelectedEvent(null);
                  }}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Verify Integrity
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
