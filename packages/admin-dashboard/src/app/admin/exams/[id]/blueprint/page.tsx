"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { examsApi, type ExamBlueprint } from "@/lib/api";
import { useExamStore } from "@/lib/stores/exam-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Save, Loader2, AlertCircle, Check } from "lucide-react";

const PIE_COLORS = ["#6366f1", "#f43f5e", "#22c55e", "#f59e0b", "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function BlueprintPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const examId = params.id as string;

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => examsApi.getById(examId),
  });

  const exam = examQuery.data;

  const [difficulty, setDifficulty] = useState({ easy: 30, medium: 50, hard: 20 });
  const [topicCoverage, setTopicCoverage] = useState<Record<string, number>>({});
  const [questionsPerPaper, setQuestionsPerPaper] = useState(60);
  const [newTopic, setNewTopic] = useState("");

  useEffect(() => {
    if (exam?.blueprint) {
      setDifficulty(exam.blueprint.difficultyDist);
      setTopicCoverage(exam.blueprint.topicCoverage);
      setQuestionsPerPaper(exam.blueprint.questionsPerPaper);
    }
  }, [exam]);

  const saveMutation = useMutation({
    mutationFn: () =>
      examsApi.updateBlueprint(examId, {
        difficultyDist: difficulty,
        topicCoverage,
        questionsPerPaper,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam", examId] });
    },
  });

  const totalDiff = difficulty.easy + difficulty.medium + difficulty.hard;
  const totalTopic = Object.values(topicCoverage).reduce((s, v) => s + v, 0);

  const difficultyChartData = [
    { name: "Easy", value: difficulty.easy, fill: "#22c55e" },
    { name: "Medium", value: difficulty.medium, fill: "#f59e0b" },
    { name: "Hard", value: difficulty.hard, fill: "#ef4444" },
  ];

  const topicChartData = Object.entries(topicCoverage).map(([topic, pct]) => ({
    name: topic,
    value: pct,
  }));

  const addTopic = () => {
    if (newTopic && !topicCoverage[newTopic]) {
      setTopicCoverage((prev) => ({ ...prev, [newTopic]: 10 }));
      setNewTopic("");
    }
  };

  const removeTopic = (topic: string) => {
    setTopicCoverage((prev) => {
      const next = { ...prev };
      delete next[topic];
      return next;
    });
  };

  const validDifficulty = totalDiff === 100;
  const validTopics = Math.abs(totalTopic - 100) < 1;
  const isValid = validDifficulty && (topicChartData.length === 0 || validTopics);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Blueprint Editor</h1>
          <p className="text-muted-foreground">
            {exam?.name || "Loading..."} — Define difficulty and topic distribution
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!isValid || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : saveMutation.isSuccess ? (
            <Check className="h-4 w-4 mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saveMutation.isSuccess ? "Saved" : "Save Blueprint"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Difficulty Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Difficulty Distribution</CardTitle>
            <CardDescription>
              Must sum to 100%.{" "}
              {!validDifficulty && (
                <span className="text-destructive">Currently: {totalDiff}%</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {(["easy", "medium", "hard"] as const).map((level) => {
                const colors = { easy: "text-green-600", medium: "text-yellow-600", hard: "text-red-600" };
                return (
                  <div key={level}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize">{level}</span>
                      <span className={`font-semibold ${colors[level]}`}>
                        {difficulty[level]}%
                      </span>
                    </div>
                    <Slider
                      value={[difficulty[level]]}
                      onValueChange={([val]) =>
                        setDifficulty((prev) => ({ ...prev, [level]: val }))
                      }
                      max={100}
                      step={5}
                    />
                  </div>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={difficultyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {difficultyChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Topic Coverage */}
        <Card>
          <CardHeader>
            <CardTitle>Topic Coverage</CardTitle>
            <CardDescription>
              Distribution across topics.{" "}
              {topicChartData.length > 0 && !validTopics && (
                <span className="text-destructive">
                  Total: {totalTopic.toFixed(0)}% (should be 100%)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="Add topic..."
                onKeyDown={(e) => e.key === "Enter" && addTopic()}
              />
              <Button variant="outline" onClick={addTopic}>
                Add
              </Button>
            </div>

            <div className="space-y-3">
              {Object.entries(topicCoverage).map(([topic, pct]) => (
                <div key={topic}>
                  <div className="flex justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span>{topic}</span>
                      <button
                        onClick={() => removeTopic(topic)}
                        className="text-xs text-destructive hover:underline"
                      >
                        remove
                      </button>
                    </div>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                  <Slider
                    value={[pct]}
                    onValueChange={([val]) =>
                      setTopicCoverage((prev) => ({ ...prev, [topic]: val }))
                    }
                    max={100}
                    step={5}
                  />
                </div>
              ))}
            </div>

            {topicChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={topicChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}%`}
                  >
                    {topicChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Questions per paper */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <Label className="w-48">Questions Per Paper</Label>
            <Slider
              value={[questionsPerPaper]}
              onValueChange={([val]) => setQuestionsPerPaper(val)}
              min={10}
              max={200}
              step={5}
              className="flex-1"
            />
            <span className="font-bold text-lg w-16 text-right">{questionsPerPaper}</span>
          </div>
        </CardContent>
      </Card>

      {/* Validation */}
      {!isValid && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>
            Fix validation errors before saving:
            {!validDifficulty && " Difficulty must sum to 100%."}
            {topicChartData.length > 0 && !validTopics && " Topic coverage must sum to 100%."}
          </span>
        </div>
      )}
    </div>
  );
}
