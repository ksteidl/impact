"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { fmtCompact } from "@/lib/api"

const config = {
  input: { label: "Input-Tokens", color: "var(--chart-1)" },
  output: { label: "Output-Tokens", color: "var(--chart-3)" },
} satisfies ChartConfig

export function UsageChart({ data }: { data: { day: string; input: number; output: number }[] }) {
  const rows = data.map((d) => ({
    ...d,
    label: new Date(`${d.day}T12:00:00`).toLocaleDateString("de-AT", { day: "2-digit", month: "short" }),
  }))
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          {(["input", "output"] as const).map((k) => (
            <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.35} />
              <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${fmtCompact(v / 1000)} Tsd.` : String(v))} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <Area dataKey="output" type="monotone" stackId="a" stroke="var(--color-output)" fill="url(#fill-output)" strokeWidth={2} animationDuration={600} />
        <Area dataKey="input" type="monotone" stackId="a" stroke="var(--color-input)" fill="url(#fill-input)" strokeWidth={2} animationDuration={600} />
      </AreaChart>
    </ChartContainer>
  )
}
