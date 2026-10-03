// ============================================================
// Pilot Workload Analyzer — real-time workload estimation
// Models pilot workload across multiple channels (perceptual,
// cognitive, psychomotor, communication) inspired by NASA-TLX
// and Wickens' multiple resource theory. Produces a 0..100
// Workload Index plus a short-horizon forecast and adaptive
// task-shedding recommendations.
// ============================================================

export type FlightPhase = "CLIMB" | "CRUISE" | "DESCENT" | "APPROACH";

export interface FlightContext {
  timeSec: number;
  altitudeFt: number;
  airspeedKts: number;
  verticalSpeedFpm: number;
  phase: FlightPhase;
  trafficCount: number;
  weatherSeverity: number; // 0..10
  atcCallRatePerMin: number; // radio calls requiring response
  activeAlerts: number; // concurrent cockpit alerts
  autopilotEngaged: boolean;
  manualFlying: boolean;
}

// ---- Workload channels (Wickens multiple resource theory) ----
export type Channel = "PERCEPTUAL" | "COGNITIVE" | "PSYCHOMOTOR" | "COMMUNICATION";

export interface ChannelLoad {
  channel: Channel;
  load: number; // 0..100
  drivers: string[]; // human-readable contributors
}

// ---- NASA-TLX style subscales (estimated, not self-reported) ----
export interface TlxEstimate {
  mentalDemand: number; // 0..100
  physicalDemand: number;
  temporalDemand: number;
  performance: number; // higher = better self-performance estimate
  effort: number;
  frustration: number;
  overall: number; // weighted TLX-style index
}

export interface WorkloadSnapshot {
  index: number; // 0..100 composite workload index
  band: "LOW" | "MODERATE" | "HIGH" | "OVERLOAD";
  channels: ChannelLoad[];
  tlx: TlxEstimate;
  forecast: number[]; // predicted index, next 12 steps (6 min @ 30s)
  recommendations: string[];
  events: WorkloadEvent[];
}

export interface WorkloadEvent {
  timeSec: number;
  kind: "SPIKE" | "TASK_SHED" | "RECOVERY" | "OVERLOAD_ONSET" | "OVERLOAD_CLEAR";
  detail: string;
}

// ---------------- simulation ----------------

export const initialContext: FlightContext = {
  timeSec: 0,
  altitudeFt: 2000,
  airspeedKts: 180,
  verticalSpeedFpm: 2200,
  phase: "CLIMB",
  trafficCount: 1,
  weatherSeverity: 2,
  atcCallRatePerMin: 2,
  activeAlerts: 0,
  autopilotEngaged: true,
  manualFlying: false,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// Deterministic pseudo-random from time seed so the sim is reproducible
function noise(seed: number, scale = 1) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * scale;
}

export function tickContext(ctx: FlightContext, dtSec: number): FlightContext {
  const t = ctx.timeSec + dtSec;
  const c = { ...ctx, timeSec: t };

  // Phase progression
  if (c.phase === "CLIMB") {
    c.altitudeFt += c.verticalSpeedFpm * (dtSec / 60);
    if (c.altitudeFt >= 34000) {
      c.phase = "CRUISE";
      c.verticalSpeedFpm = 0;
      c.altitudeFt = 34000;
    }
  } else if (c.phase === "CRUISE") {
    if (t > 2100) c.phase = "DESCENT";
  } else if (c.phase === "DESCENT") {
    c.verticalSpeedFpm = -1800;
    c.altitudeFt = Math.max(3000, c.altitudeFt + c.verticalSpeedFpm * (dtSec / 60));
    if (c.altitudeFt <= 3200) c.phase = "APPROACH";
  } else {
    c.verticalSpeedFpm = -700;
    c.altitudeFt = Math.max(0, c.altitudeFt + c.verticalSpeedFpm * (dtSec / 60));
  }

  // Environment evolves with phase + noise
  const busy = c.phase === "APPROACH" || c.phase === "CLIMB";
  c.trafficCount = clamp(
    Math.round(c.trafficCount + noise(t * 0.7, 0.9) + (busy ? 0.15 : -0.1)),
    0,
    9,
  );
  c.weatherSeverity = clamp(
    c.weatherSeverity + noise(t * 0.31, 0.5) + (c.phase === "DESCENT" ? 0.06 : 0),
    0,
    10,
  );
  c.atcCallRatePerMin = clamp(
    c.atcCallRatePerMin + noise(t * 0.53, 0.8) + (busy ? 0.12 : -0.08),
    0,
    12,
  );

  // Alert pressure rises with weather & traffic
  const alertPressure =
    (c.weatherSeverity > 6 ? 1 : 0) + (c.trafficCount > 5 ? 1 : 0) + noise(t * 0.17, 0.6);
  c.activeAlerts = clamp(Math.round(c.activeAlerts + alertPressure * 0.4), 0, 6);

  // High workload phases may drop the autopilot (hands-on flying)
  if (c.phase === "APPROACH" && c.weatherSeverity > 5) {
    c.autopilotEngaged = false;
    c.manualFlying = true;
  } else if (c.phase === "CRUISE") {
    c.autopilotEngaged = true;
    c.manualFlying = false;
  }

  return c;
}

// ---------------- workload model ----------------

export function computeChannels(ctx: FlightContext): ChannelLoad[] {
  const perceptual = clamp(
    ctx.trafficCount * 7 + ctx.weatherSeverity * 5 + ctx.activeAlerts * 6 + 12,
    0,
    100,
  );
  const cognitive = clamp(
    ctx.activeAlerts * 11 +
      ctx.atcCallRatePerMin * 3 +
      (ctx.phase === "APPROACH" ? 22 : ctx.phase === "DESCENT" ? 12 : 4) +
      ctx.weatherSeverity * 2,
    0,
    100,
  );
  const psychomotor = clamp(
    (ctx.manualFlying ? 45 : 8) +
      Math.abs(ctx.verticalSpeedFpm) / 120 +
      (ctx.phase === "APPROACH" ? 18 : 0),
    0,
    100,
  );
  const communication = clamp(ctx.atcCallRatePerMin * 8 + (ctx.phase === "CLIMB" ? 10 : 4), 0, 100);

  const drivers = (ch: Channel): string[] => {
    switch (ch) {
      case "PERCEPTUAL": {
        const d: string[] = [];
        if (ctx.trafficCount > 3) d.push(`${ctx.trafficCount} traffic contacts`);
        if (ctx.weatherSeverity >= 5) d.push(`weather ${ctx.weatherSeverity.toFixed(0)}/10`);
        if (ctx.activeAlerts > 0) d.push(`${ctx.activeAlerts} active alerts`);
        return d.length ? d : ["nominal scan"];
      }
      case "COGNITIVE": {
        const d: string[] = [];
        if (ctx.activeAlerts > 0) d.push("alert management");
        if (ctx.phase === "APPROACH") d.push("approach briefing & config");
        if (ctx.phase === "DESCENT") d.push("descent planning");
        if (ctx.weatherSeverity >= 6) d.push("reroute evaluation");
        return d.length ? d : ["routine monitoring"];
      }
      case "PSYCHOMOTOR":
        return ctx.manualFlying
          ? ["manual flight", `${Math.abs(Math.round(ctx.verticalSpeedFpm))} fpm vertical rate`]
          : ["autopilot engaged"];
      case "COMMUNICATION":
        return [`${ctx.atcCallRatePerMin.toFixed(0)} ATC calls/min`];
    }
  };

  return [
    { channel: "PERCEPTUAL", load: perceptual, drivers: drivers("PERCEPTUAL") },
    { channel: "COGNITIVE", load: cognitive, drivers: drivers("COGNITIVE") },
    { channel: "PSYCHOMOTOR", load: psychomotor, drivers: drivers("PSYCHOMOTOR") },
    { channel: "COMMUNICATION", load: communication, drivers: drivers("COMMUNICATION") },
  ];
}

// Composite index: channel conflict (Wickens) — concurrent high loads
// on multiple channels cost more than the sum of their parts.
export function workloadIndex(channels: ChannelLoad[]): number {
  const sorted = [...channels].map((c) => c.load).sort((a, b) => b - a);
  const [top = 0, second = 0, third = 0, fourth = 0] = sorted;
  const base = top * 0.4 + second * 0.3 + third * 0.2 + fourth * 0.1;
  const conflictPenalty = top > 60 && second > 60 ? 12 : top > 60 && second > 40 ? 6 : 0;
  return clamp(Math.round(base + conflictPenalty), 0, 100);
}

export function estimateTlx(ctx: FlightContext, index: number): TlxEstimate {
  const mentalDemand = clamp(index * 0.9 + ctx.activeAlerts * 4, 0, 100);
  const physicalDemand = clamp((ctx.manualFlying ? 55 : 12) + Math.abs(ctx.verticalSpeedFpm) / 200, 0, 100);
  const temporalDemand = clamp(ctx.atcCallRatePerMin * 7 + ctx.activeAlerts * 6, 0, 100);
  const performance = clamp(100 - index * 0.55, 0, 100);
  const effort = clamp(index * 0.85 + (ctx.manualFlying ? 10 : 0), 0, 100);
  const frustration = clamp(index > 75 ? (index - 75) * 2.4 : index * 0.15, 0, 100);
  const overall = Math.round(
    (mentalDemand + physicalDemand + temporalDemand + (100 - performance) + effort + frustration) / 6,
  );
  return { mentalDemand, physicalDemand, temporalDemand, performance, effort, frustration, overall };
}

// Simple autoregressive forecast: index tends toward a phase-driven
// target; weather/traffic trends push it up or down.
export function forecastIndex(ctx: FlightContext, index: number, steps = 12): number[] {
  const phaseTarget =
    ctx.phase === "APPROACH" ? 72 : ctx.phase === "DESCENT" ? 55 : ctx.phase === "CLIMB" ? 50 : 30;
  const envPush = (ctx.weatherSeverity - 4) * 2 + (ctx.trafficCount - 3) * 1.5;
  const out: number[] = [];
  let cur = index;
  for (let i = 0; i < steps; i++) {
    const target = clamp(phaseTarget + envPush, 0, 100);
    cur = cur + (target - cur) * 0.25 + noise(ctx.timeSec + i * 7, 2);
    out.push(clamp(Math.round(cur), 0, 100));
  }
  return out;
}

export function recommend(ctx: FlightContext, index: number, channels: ChannelLoad[]): string[] {
  const recs: string[] = [];
  const worst = [...channels].sort((a, b) => b.load - a.load)[0];

  if (index >= 85) {
    recs.push("OVERLOAD: declare inability to accept further ATC instructions; request delay vectors or holding.");
  }
  if (ctx.manualFlying && index > 65) {
    recs.push("Re-engage autopilot to shed psychomotor load.");
  }
  if (ctx.atcCallRatePerMin > 7) {
    recs.push('Request "standby" on non-essential frequency; delegate radio to monitoring pilot.');
  }
  if (ctx.activeAlerts >= 3) {
    recs.push("Silence acknowledged cautions; handle WARNING-level items only until load decreases.");
  }
  if (ctx.weatherSeverity >= 7 && ctx.phase !== "APPROACH") {
    recs.push("Request reroute around convective cell now — later options shrink.");
  }
  if (worst && worst.load > 70 && recs.length === 0) {
    recs.push(`${worst.channel} channel saturated — offload: ${worst.drivers[0] ?? "primary task"}.`);
  }
  if (index < 40 && ctx.phase === "CRUISE") {
    recs.push("Low workload window: good time for briefing, fuel check and contingency review.");
  }
  return recs.slice(0, 3);
}

export function bandOf(index: number): WorkloadSnapshot["band"] {
  if (index >= 85) return "OVERLOAD";
  if (index >= 65) return "HIGH";
  if (index >= 40) return "MODERATE";
  return "LOW";
}

export function analyze(
  ctx: FlightContext,
  prevIndex: number | null,
  prevEvents: WorkloadEvent[],
): WorkloadSnapshot {
  const channels = computeChannels(ctx);
  const index = workloadIndex(channels);
  const tlx = estimateTlx(ctx, index);
  const forecast = forecastIndex(ctx, index);
  const recommendations = recommend(ctx, index, channels);

  const events = [...prevEvents];
  const push = (kind: WorkloadEvent["kind"], detail: string) =>
    events.push({ timeSec: ctx.timeSec, kind, detail });

  if (prevIndex !== null) {
    if (index - prevIndex >= 12) push("SPIKE", `Workload jumped +${index - prevIndex} in 30s`);
    if (prevIndex - index >= 12) push("RECOVERY", `Workload dropped ${prevIndex - index} in 30s`);
    if (prevIndex < 85 && index >= 85) push("OVERLOAD_ONSET", "Crew entered overload region");
    if (prevIndex >= 85 && index < 85) push("OVERLOAD_CLEAR", "Crew exited overload region");
  }
  if (recommendations.length > 0 && index >= 65 && events[events.length - 1]?.kind !== "TASK_SHED") {
    push("TASK_SHED", recommendations[0] ?? "Shed non-essential tasks");
  }

  return {
    index,
    band: bandOf(index),
    channels,
    tlx,
    forecast,
    recommendations,
    events: events.slice(-40),
  };
}

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
