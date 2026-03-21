"use client";

import React, { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { QuestionTemplate, ParameterDef } from "@/lib/api";

interface QuestionRendererProps {
  template: QuestionTemplate;
  instantiatedParams?: Record<string, string | number>;
  showMetadata?: boolean;
  className?: string;
}

/**
 * Renders text that may contain LaTeX expressions using KaTeX.
 * Splits on LaTeX delimiters and renders each math portion via KaTeX,
 * using safe DOM manipulation (no innerHTML).
 */
function renderLatex(element: HTMLElement, text: string): void {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\[[\s\S]*?\\]|\\\([\s\S]*?\\\))/g);

  // Clear children safely
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }

  parts.forEach((part) => {
    if (
      (part.startsWith("$$") && part.endsWith("$$")) ||
      (part.startsWith("\\[") && part.endsWith("\\]"))
    ) {
      const math = part.replace(/^\$\$|\$\$$/g, "").replace(/^\\\[|\\\]$/g, "");
      const container = document.createElement("div");
      container.className = "katex-display my-2";
      // KaTeX.render uses safe DOM methods internally
      import("katex").then((katex) => {
        katex.default.render(math, container, { displayMode: true, throwOnError: false });
      }).catch(() => {
        container.textContent = math;
      });
      element.appendChild(container);
    } else if (
      (part.startsWith("$") && part.endsWith("$")) ||
      (part.startsWith("\\(") && part.endsWith("\\)"))
    ) {
      const math = part.replace(/^\$|\$$/g, "").replace(/^\\\(|\\\)$/g, "");
      const span = document.createElement("span");
      span.className = "katex-inline";
      import("katex").then((katex) => {
        katex.default.render(math, span, { displayMode: false, throwOnError: false });
      }).catch(() => {
        span.textContent = math;
      });
      element.appendChild(span);
    } else {
      const span = document.createElement("span");
      span.textContent = part;
      element.appendChild(span);
    }
  });
}

function instantiateText(
  text: string,
  params: Record<string, string | number>
): string {
  let result = text;
  Object.entries(params).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), String(value));
  });
  return result;
}

function generateSampleParams(parameters: ParameterDef[]): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  parameters.forEach((p) => {
    if (p.type === "integer" && p.min !== undefined && p.max !== undefined) {
      result[p.name] = Math.floor((p.min + p.max) / 2);
    } else if (p.type === "float" && p.min !== undefined && p.max !== undefined) {
      result[p.name] = parseFloat(((p.min + p.max) / 2).toFixed(2));
    } else if (p.type === "set" && p.values && p.values.length > 0) {
      result[p.name] = p.values[0];
    } else {
      result[p.name] = `<${p.name}>`;
    }
  });
  return result;
}

export function QuestionRenderer({
  template,
  instantiatedParams,
  showMetadata = true,
  className,
}: QuestionRendererProps) {
  const questionRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const params = instantiatedParams || generateSampleParams(template.parameters);
  const questionText = instantiateText(template.templateText, params);
  const answerText = instantiateText(template.answerFormula, params);

  useEffect(() => {
    if (questionRef.current) {
      renderLatex(questionRef.current, questionText);
    }
    if (answerRef.current) {
      renderLatex(answerRef.current, answerText);
    }
  }, [questionText, answerText]);

  return (
    <Card className={className}>
      {showMetadata && (
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{template.subject}</Badge>
            <Badge variant="outline">{template.topic}</Badge>
            {template.subtopic && (
              <Badge variant="secondary">{template.subtopic}</Badge>
            )}
            <Badge
              variant={
                template.bloomLevel === "remember" || template.bloomLevel === "understand"
                  ? "success"
                  : template.bloomLevel === "apply" || template.bloomLevel === "analyze"
                  ? "warning"
                  : "destructive"
              }
            >
              {template.bloomLevel}
            </Badge>
          </div>
          <CardTitle className="text-base mt-2">Template ID: {template.id}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Question</h4>
          <div ref={questionRef} className="prose prose-sm max-w-none" />
        </div>

        {template.parameters.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">
              Parameters (sample values)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {template.parameters.map((p) => (
                <div key={p.name} className="bg-muted rounded px-2 py-1 text-sm">
                  <span className="font-mono text-primary">{p.name}</span>
                  {" = "}
                  <span className="font-semibold">{String(params[p.name])}</span>
                  <span className="text-muted-foreground text-xs ml-1">
                    ({p.type}
                    {p.min !== undefined && `, ${p.min}-${p.max}`}
                    {p.values && `, [${p.values.join(", ")}]`})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
            Answer Formula
          </h4>
          <div ref={answerRef} className="prose prose-sm max-w-none bg-green-50 dark:bg-green-950/30 rounded p-3" />
        </div>

        {template.distractors.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">
              Distractors
            </h4>
            <div className="space-y-1">
              {template.distractors.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-red-50 dark:bg-red-950/20 rounded px-3 py-1">
                  <span className="font-semibold text-muted-foreground w-8">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <span className="font-mono">{d.formula}</span>
                  {d.label && (
                    <span className="text-muted-foreground">({d.label})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {template.irtParams && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">
              IRT Parameters
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-muted rounded p-2">
                <div className="text-muted-foreground">Discrimination (a)</div>
                <div className="font-semibold">
                  {template.irtParams.aMean.toFixed(3)} +/- {template.irtParams.aStd.toFixed(3)}
                </div>
              </div>
              <div className="bg-muted rounded p-2">
                <div className="text-muted-foreground">Difficulty (b)</div>
                <div className="font-semibold">
                  {template.irtParams.bMean.toFixed(3)} +/- {template.irtParams.bStd.toFixed(3)}
                </div>
              </div>
              <div className="bg-muted rounded p-2">
                <div className="text-muted-foreground">Guessing (c)</div>
                <div className="font-semibold">
                  {template.irtParams.cMean.toFixed(3)} +/- {template.irtParams.cStd.toFixed(3)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
