"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { questionsApi, type QuestionTemplate } from "@/lib/api";
import { useQuestionStore } from "@/lib/stores/question-store";
import { QuestionRenderer } from "@/components/QuestionRenderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Loader2,
  Check,
  RefreshCw,
  Pencil,
  Save,
  ArrowRight,
} from "lucide-react";

const generateSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  topic: z.string().min(1, "Topic is required"),
  subtopic: z.string().optional(),
  bloomLevel: z.string().min(1, "Bloom level is required"),
  exampleTemplate: z.string().optional(),
});

type GenerateFormData = z.infer<typeof generateSchema>;

const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology", "Computer Science"];
const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

export default function GenerateQuestionsPage() {
  const { generatedTemplate, setGeneratedTemplate } = useQuestionStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  const form = useForm<GenerateFormData>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      subject: "",
      topic: "",
      subtopic: "",
      bloomLevel: "",
      exampleTemplate: "",
    },
  });

  const generateMutation = useMutation({
    mutationFn: questionsApi.generate,
    onSuccess: (data) => {
      setGeneratedTemplate(data);
      setIsEditing(false);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (template: Partial<QuestionTemplate>) =>
      questionsApi.create(template),
    onSuccess: () => {
      setGeneratedTemplate(null);
      form.reset();
    },
  });

  const onSubmit = (data: GenerateFormData) => {
    generateMutation.mutate({
      subject: data.subject,
      topic: data.topic,
      subtopic: data.subtopic || "",
      bloomLevel: data.bloomLevel,
      exampleTemplate: data.exampleTemplate,
    });
  };

  const handleApprove = () => {
    if (!generatedTemplate) return;
    approveMutation.mutate({
      ...generatedTemplate,
      templateText: isEditing ? editedText : generatedTemplate.templateText,
    });
  };

  const handleRegenerate = () => {
    const values = form.getValues();
    generateMutation.mutate({
      subject: values.subject,
      topic: values.topic,
      subtopic: values.subtopic || "",
      bloomLevel: values.bloomLevel,
      exampleTemplate: values.exampleTemplate,
    });
  };

  const handleEdit = () => {
    if (generatedTemplate) {
      setEditedText(generatedTemplate.templateText);
      setIsEditing(true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate Questions</h1>
        <p className="text-muted-foreground">
          Use Gemini AI to generate parameterized question templates
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Generation Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generation Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Select
                  value={form.watch("subject")}
                  onValueChange={(val) => form.setValue("subject", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.subject && (
                  <p className="text-xs text-destructive">{form.formState.errors.subject.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  {...form.register("topic")}
                  placeholder="e.g., Kinematics, Organic Chemistry"
                />
                {form.formState.errors.topic && (
                  <p className="text-xs text-destructive">{form.formState.errors.topic.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtopic">Subtopic (optional)</Label>
                <Input
                  {...form.register("subtopic")}
                  placeholder="e.g., Projectile Motion"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bloomLevel">Bloom&apos;s Taxonomy Level</Label>
                <Select
                  value={form.watch("bloomLevel")}
                  onValueChange={(val) => form.setValue("bloomLevel", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOOM_LEVELS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b.charAt(0).toUpperCase() + b.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.bloomLevel && (
                  <p className="text-xs text-destructive">{form.formState.errors.bloomLevel.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="exampleTemplate">Example Template (optional)</Label>
                <Textarea
                  {...form.register("exampleTemplate")}
                  placeholder="Paste an example parameterized template to guide generation..."
                  rows={6}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate with Gemini
                  </>
                )}
              </Button>

              {generateMutation.isError && (
                <p className="text-sm text-destructive text-center">
                  Generation failed. Please try again.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <div className="space-y-4">
          {generatedTemplate ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Generated Template</span>
                    <Badge variant="warning">Pending Review</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <div className="space-y-4">
                      <Textarea
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        rows={10}
                        className="font-mono text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (generatedTemplate) {
                              setGeneratedTemplate({
                                ...generatedTemplate,
                                templateText: editedText,
                              });
                            }
                            setIsEditing(false);
                          }}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditing(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <QuestionRenderer
                      template={generatedTemplate}
                      showMetadata
                    />
                  )}
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="flex-1"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Approve & Save
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEdit}
                  disabled={isEditing}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={generateMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </div>

              {approveMutation.isSuccess && (
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" />
                    <span className="font-semibold">Template saved to question bank!</span>
                  </div>
                  <p className="text-sm mt-1">
                    Field test calibration has been triggered automatically.
                  </p>
                </div>
              )}
            </>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Configure parameters and click &quot;Generate with Gemini&quot; to create a new question template.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  The generated template will appear here for review with rendered LaTeX preview.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
