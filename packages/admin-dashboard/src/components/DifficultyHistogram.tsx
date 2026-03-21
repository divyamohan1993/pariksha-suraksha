"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HistogramData {
  bin: string;
  count: number;
  label?: string;
}

interface DifficultyHistogramProps {
  data: HistogramData[];
  overlayData?: HistogramData[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  targetMean?: number;
  className?: string;
}

export function DifficultyHistogram({
  data,
  overlayData,
  title = "Difficulty Distribution",
  xLabel = "Difficulty (b parameter)",
  yLabel = "Count",
  targetMean,
  className,
}: DifficultyHistogramProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="bin"
              label={{ value: xLabel, position: "insideBottom", offset: -15 }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              label={{ value: yLabel, angle: -90, position: "insideLeft" }}
              tick={{ fontSize: 12 }}
            />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Bar
              dataKey="count"
              fill="hsl(239, 84%, 67%)"
              name="Paper Questions"
              opacity={0.8}
              radius={[4, 4, 0, 0]}
            />
            {overlayData && (
              <Bar
                dataKey="count"
                fill="hsl(142, 71%, 45%)"
                name="Target Distribution"
                opacity={0.5}
                radius={[4, 4, 0, 0]}
              />
            )}
            {targetMean !== undefined && (
              <ReferenceLine
                x={String(targetMean)}
                stroke="red"
                strokeDasharray="5 5"
                label={{ value: "Target Mean", position: "top" }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
