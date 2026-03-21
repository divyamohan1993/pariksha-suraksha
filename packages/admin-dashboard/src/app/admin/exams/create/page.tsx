"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { examsApi, type Center } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  GraduationCap,
  BarChart3,
  MapPin,
  ClipboardCheck,
} from "lucide-react";

const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology", "Computer Science"];

const Step1Schema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  date: z.string().min(1, "Date is required"),
  subjects: z.array(z.string()).min(1, "Select at least one subject"),
  totalQuestions: z.number().min(10).max(300),
  totalCandidates: z.number().min(1),
});

type Step1Data = z.infer<typeof Step1Schema>;

interface BlueprintState {
  easy: number;
  medium: number;
  hard: number;
  topicCoverage: Record<string, number>;
  questionsPerPaper: number;
}

interface CenterAssignment {
  centerId: string;
  seatCount: number;
}

export default function CreateExamPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [blueprint, setBlueprint] = useState<BlueprintState>({
    easy: 30,
    medium: 50,
    hard: 20,
    topicCoverage: {},
    questionsPerPaper: 60,
  });
  const [centerAssignments, setCenterAssignments] = useState<CenterAssignment[]>([]);

  const centersQuery = useQuery({
    queryKey: ["centers"],
    queryFn: examsApi.getCenters,
  });

  const form = useForm<Step1Data>({
    resolver: zodResolver(Step1Schema),
    defaultValues: {
      name: "",
      date: "",
      subjects: [],
      totalQuestions: 60,
      totalCandidates: 10000,
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const values = form.getValues();
      return examsApi.create({
        name: values.name,
        date: values.date,
        subjects: values.subjects,
        totalQuestions: values.totalQuestions,
        totalCandidates: values.totalCandidates,
        centers: centerAssignments,
      });
    },
    onSuccess: (exam) => {
      router.push(`/admin/exams/${exam.id}/blueprint`);
    },
  });

  const totalDifficulty = blueprint.easy + blueprint.medium + blueprint.hard;
  const totalAssignedSeats = centerAssignments.reduce((sum, c) => sum + c.seatCount, 0);

  const toggleSubject = (subject: string) => {
    const current = form.getValues("subjects");
    if (current.includes(subject)) {
      form.setValue(
        "subjects",
        current.filter((s) => s !== subject)
      );
    } else {
      form.setValue("subjects", [...current, subject]);
    }
  };

  const toggleCenter = (center: Center) => {
    const existing = centerAssignments.find((c) => c.centerId === center.id);
    if (existing) {
      setCenterAssignments(centerAssignments.filter((c) => c.centerId !== center.id));
    } else {
      setCenterAssignments([
        ...centerAssignments,
        { centerId: center.id, seatCount: center.capacity },
      ]);
    }
  };

  const steps = [
    { label: "Metadata", icon: GraduationCap },
    { label: "Blueprint", icon: BarChart3 },
    { label: "Centers", icon: MapPin },
    { label: "Review", icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Exam</h1>
        <p className="text-muted-foreground">Set up a new examination in four steps</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((s, i) => {
          const stepNum = i + 1;
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                  step === stepNum
                    ? "bg-primary text-primary-foreground"
                    : step > stepNum
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > stepNum ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Metadata */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Exam Metadata</CardTitle>
            <CardDescription>Basic information about the examination</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Exam Name</Label>
              <Input {...form.register("name")} placeholder="e.g., JEE Main 2026 Session 1" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Exam Date</Label>
              <Input type="datetime-local" {...form.register("date")} />
            </div>

            <div className="space-y-2">
              <Label>Subjects</Label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((subject) => {
                  const selected = form.watch("subjects").includes(subject);
                  return (
                    <Badge
                      key={subject}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleSubject(subject)}
                    >
                      {subject}
                      {selected && <Check className="h-3 w-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Questions Per Paper</Label>
                <Input
                  type="number"
                  {...form.register("totalQuestions", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Candidates (estimated)</Label>
                <Input
                  type="number"
                  {...form.register("totalCandidates", { valueAsNumber: true })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Blueprint */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Blueprint Builder</CardTitle>
            <CardDescription>
              Define difficulty distribution and topic coverage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-4">Difficulty Distribution</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Easy</span>
                    <span className="font-semibold text-green-600">{blueprint.easy}%</span>
                  </div>
                  <Slider
                    value={[blueprint.easy]}
                    onValueChange={([val]) =>
                      setBlueprint((prev) => ({
                        ...prev,
                        easy: val,
                        medium: Math.max(0, 100 - val - prev.hard),
                      }))
                    }
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Medium</span>
                    <span className="font-semibold text-yellow-600">{blueprint.medium}%</span>
                  </div>
                  <Slider
                    value={[blueprint.medium]}
                    onValueChange={([val]) =>
                      setBlueprint((prev) => ({
                        ...prev,
                        medium: val,
                        hard: Math.max(0, 100 - prev.easy - val),
                      }))
                    }
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Hard</span>
                    <span className="font-semibold text-red-600">{blueprint.hard}%</span>
                  </div>
                  <Slider
                    value={[blueprint.hard]}
                    onValueChange={([val]) =>
                      setBlueprint((prev) => ({
                        ...prev,
                        hard: val,
                        medium: Math.max(0, 100 - prev.easy - val),
                      }))
                    }
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>

                {totalDifficulty !== 100 && (
                  <p className="text-sm text-destructive">
                    Distribution must sum to 100% (currently {totalDifficulty}%)
                  </p>
                )}

                {/* Visual bar */}
                <div className="flex h-8 rounded-lg overflow-hidden">
                  <div
                    className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold"
                    style={{ width: `${blueprint.easy}%` }}
                  >
                    {blueprint.easy > 10 && `${blueprint.easy}%`}
                  </div>
                  <div
                    className="bg-yellow-500 flex items-center justify-center text-white text-xs font-semibold"
                    style={{ width: `${blueprint.medium}%` }}
                  >
                    {blueprint.medium > 10 && `${blueprint.medium}%`}
                  </div>
                  <div
                    className="bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
                    style={{ width: `${blueprint.hard}%` }}
                  >
                    {blueprint.hard > 10 && `${blueprint.hard}%`}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-4">Questions Per Paper</h3>
              <div className="flex items-center gap-4">
                <Slider
                  value={[blueprint.questionsPerPaper]}
                  onValueChange={([val]) =>
                    setBlueprint((prev) => ({ ...prev, questionsPerPaper: val }))
                  }
                  min={10}
                  max={200}
                  step={5}
                />
                <span className="font-semibold w-16 text-right">
                  {blueprint.questionsPerPaper}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Centers */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Center Assignment</CardTitle>
            <CardDescription>
              Select exam centers and assign seat counts. Total seats:{" "}
              <span className="font-semibold">{totalAssignedSeats}</span> /{" "}
              {form.watch("totalCandidates")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {centersQuery.isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-auto">
                {(centersQuery.data || []).map((center) => {
                  const assigned = centerAssignments.find((c) => c.centerId === center.id);
                  return (
                    <div
                      key={center.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        assigned
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => toggleCenter(center)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-4 w-4 rounded border ${
                            assigned
                              ? "bg-primary border-primary"
                              : "border-muted-foreground"
                          } flex items-center justify-center`}
                        >
                          {assigned && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{center.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {center.city}, {center.state} | Capacity: {center.capacity}
                          </p>
                        </div>
                      </div>
                      {assigned && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Label className="text-xs">Seats:</Label>
                          <Input
                            type="number"
                            value={assigned.seatCount}
                            onChange={(e) => {
                              setCenterAssignments((prev) =>
                                prev.map((c) =>
                                  c.centerId === center.id
                                    ? { ...c, seatCount: parseInt(e.target.value) || 0 }
                                    : c
                                )
                              );
                            }}
                            className="w-24 h-8"
                            min={1}
                            max={center.capacity}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Create</CardTitle>
            <CardDescription>Verify all details before creating the exam</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Exam Name</p>
                <p className="font-semibold">{form.watch("name")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-semibold">{form.watch("date")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subjects</p>
                <div className="flex gap-1 flex-wrap">
                  {form.watch("subjects").map((s) => (
                    <Badge key={s} variant="outline">{s}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Candidates</p>
                <p className="font-semibold">{form.watch("totalCandidates").toLocaleString()}</p>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground mb-2">Difficulty Distribution</p>
              <div className="flex h-6 rounded-lg overflow-hidden">
                <div className="bg-green-500 text-white text-xs flex items-center justify-center" style={{ width: `${blueprint.easy}%` }}>
                  {blueprint.easy}%
                </div>
                <div className="bg-yellow-500 text-white text-xs flex items-center justify-center" style={{ width: `${blueprint.medium}%` }}>
                  {blueprint.medium}%
                </div>
                <div className="bg-red-500 text-white text-xs flex items-center justify-center" style={{ width: `${blueprint.hard}%` }}>
                  {blueprint.hard}%
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Centers ({centerAssignments.length} selected, {totalAssignedSeats} seats)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {centerAssignments.map((ca) => {
                  const center = centersQuery.data?.find((c) => c.id === ca.centerId);
                  return (
                    <div key={ca.centerId} className="flex justify-between text-sm p-2 bg-muted rounded">
                      <span>{center?.name || ca.centerId}</span>
                      <span className="font-semibold">{ca.seatCount} seats</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>

        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Create Exam
          </Button>
        )}
      </div>
    </div>
  );
}
