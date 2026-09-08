"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { cn } from "@/lib/utils";

/*
 * Charts.
 *
 * ECharts was already a dependency and unused. This wraps it so the
 * theme lives in one place: a chart configured at each call site is how
 * you end up with five axis colours and three tooltip styles.
 *
 * The rules, all visible in the reference:
 *
 *   - No axis lines and no tick marks. Faint dashed horizontal
 *     gridlines only. The data is the ink.
 *   - Curved lines, thick strokes, no point markers until hovered.
 *   - Tooltip is the one element allowed a real shadow, because it is
 *     the one element that genuinely floats.
 *   - Colour comes from the --viz tokens, so charts stay in step with
 *     the rest of the system.
 */

/** The values the tokens are expected to hold, and the SSR answer. */
const VIZ_FALLBACK = [
  "#f0821e",
  "#5b4be8",
  "#2e9e5b",
  "#d64545",
  "#9a9b94",
] as const;

/** Read a CSS custom property at runtime. */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/*
 * The chart palette, read from the CSS tokens.
 *
 * Resolved during render rather than in an effect. The first version
 * set state from a mount effect, which works but costs a second render
 * of every chart on the page for a value that never changes — and the
 * react-hooks lint rule flags exactly that.
 *
 * Reading in render is safe here in a way it usually is not: on the
 * server `token` returns the fallbacks, and the fallbacks are the same
 * values the tokens hold, so the server and client agree. If the two
 * ever diverge the charts would flicker once on hydration, which is why
 * VIZ_FALLBACK must be kept in step with the --viz-* tokens.
 */
export function useVizPalette(): string[] {
  return React.useMemo(
    () => VIZ_FALLBACK.map((fallback, index) => token(`--viz-${index + 1}`, fallback)),
    []
  );
}

/** The house style, merged under whatever a caller passes. */
export function baseChartOption(palette: string[]): EChartsOption {
  const ink = "#1a1a18";
  const muted = "#7c7d76";
  const hairline = "rgba(26, 26, 24, 0.08)";

  return {
    color: palette,
    textStyle: {
      fontFamily: "var(--font-poppins), system-ui, sans-serif",
      fontSize: 10,
      color: muted,
    },
    grid: {
      // containLabel so long axis labels cannot be clipped by the edge
      // of the canvas, which is the usual cause of a chart that looks
      // subtly misaligned with the card around it.
      left: 8,
      right: 12,
      top: 16,
      bottom: 4,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: "rgba(26, 26, 24, 0.07)",
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: ink, fontSize: 11 },
      extraCssText:
        "border-radius:12px;box-shadow:0 12px 32px rgba(26,26,24,0.12);",
      axisPointer: {
        type: "line",
        lineStyle: { color: "rgba(26, 26, 24, 0.18)", width: 1 },
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontSize: 10, margin: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      /*
       * Never below zero.
       *
       * Everything charted here is a count, and ECharts picks a negative
       * floor when the data is mostly zeroes — so a flat line sat above
       * an axis labelled -1, and the smoothed curve dipped visibly under
       * it. A count of minus one is not a thing.
       */
      min: 0,
      // Whole numbers only. Two signups cannot be 1.5.
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontSize: 10 },
      splitLine: {
        show: true,
        lineStyle: { color: hairline, type: "dashed" },
      },
    },
    /*
     * Hidden by default, but styled and positioned for when it is not.
     *
     * A caller turning this on used to get ECharts' own default, which
     * centres the legend at the very top of the canvas — directly over
     * the plot, because the grid starts at 16px. Setting the position
     * and the padding here means `legend: { show: true }` is the whole
     * change a caller needs to make.
     */
    legend: {
      show: false,
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 3,
      itemGap: 16,
      textStyle: { color: muted, fontSize: 11 },
    },
  };
}

/**
 * One chart.
 *
 * `option` is merged over the house style rather than replacing it, so
 * a caller can set series and data without restating the theme — and
 * cannot accidentally drop it by omitting a key.
 */
export function Chart({
  option,
  height = 260,
  className,
  loading,
}: {
  option: EChartsOption;
  height?: number;
  className?: string;
  loading?: boolean;
}) {
  const palette = useVizPalette();

  const merged = React.useMemo<EChartsOption>(() => {
    const base = baseChartOption(palette);
    return {
      ...base,
      ...option,
      // The axes and tooltip are merged a level deeper: spreading them
      // wholesale would discard the hidden axis lines and dashed grid
      // the moment a caller set nothing but `data`.
      xAxis: { ...(base.xAxis as object), ...(option.xAxis as object) },
      yAxis: { ...(base.yAxis as object), ...(option.yAxis as object) },
      tooltip: { ...(base.tooltip as object), ...(option.tooltip as object) },
      grid: { ...(base.grid as object), ...(option.grid as object) },
      // Same reason as the axes: a caller writing `{ show: true }` was
      // replacing the whole legend, losing its position and styling and
      // landing it on top of the plot.
      legend: { ...(base.legend as object), ...(option.legend as object) },
    };
  }, [option, palette]);

  if (loading) {
    return (
      <div
        className={cn("animate-skeleton rounded-xl", className)}
        style={{ height }}
      />
    );
  }

  return (
    <ReactECharts
      option={merged}
      style={{ height, width: "100%" }}
      className={className}
      opts={{ renderer: "svg" }}
      notMerge
      lazyUpdate
    />
  );
}

/**
 * A line series in the house style — curved, thick, no markers until
 * hovered, optionally filled with a fade.
 */
export function lineSeries(
  name: string,
  data: (number | null)[],
  color: string,
  options: { area?: boolean; width?: number } = {}
) {
  const { area = false, width = 2.5 } = options;

  return {
    name,
    type: "line" as const,
    data,
    smooth: 0.4,
    /*
     * Clamped, so the curve cannot bulge past its own points.
     *
     * A spline through spiky count data overshoots between them: a run
     * of zeroes either side of one spike bows the line below zero, which
     * draws a day where minus one person signed up. clampToData keeps
     * the curve inside the values it is drawn from.
     */
    smoothMonotone: "x" as const,
    showSymbol: false,
    symbolSize: 7,
    lineStyle: { width, color },
    itemStyle: { color },
    emphasis: { focus: "series" as const },
    ...(area
      ? {
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${color}22` },
                { offset: 1, color: `${color}00` },
              ],
            },
          },
        }
      : {}),
  };
}

/** A bar series: rounded caps, flat colour. */
export function barSeries(name: string, data: number[], color: string) {
  return {
    name,
    type: "bar" as const,
    data,
    barMaxWidth: 22,
    itemStyle: { color, borderRadius: [6, 6, 2, 2] },
  };
}
