import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  initialContext,
  tickContext,
  analyze,
  formatClock,
  type FlightContext,
  type WorkloadSnapshot,
} from "@/lib/workload";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pilot Workload Analyzer — Real-Time Crew Workload Estimation" },
      {
        name: "description",
        content:
          "Real-time pilot workload estimation across perceptual, cognitive, psychomotor and communication channels. NASA-TLX inspired scoring, short-horizon forecasting and adaptive task-shedding recommendations over a live flight simulation.",
      },
      { property: "og:title", content: "Pilot Workload Analyzer" },
      {
        property: "og:description",
        content:
          "Multi-channel workload estimation, NASA-TLX style subscales and overload forecasting for flight crews — live simulation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const BAND_STYLE: Record<WorkloadSnapshot["band"], string> = {
  LOW: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  MODERATE: "border-sky-500/50 bg-sky-500/10 text-sky-400",
  HIGH: "border-amber-500/60 bg-amber-500/10 text-amber-400",
  OVERLOAD: "border-destructive/60 bg-destructive/10 text-destructive",
};

const EVENT_ICON: Record<string, string> = {
  SPIKE: "▲",
  RECOVERY: "▼",
  TASK_SHED: "➜",
  OVERLOAD_ONSET: "⚠",
  OVERLOAD_CLEAR: "✓",
};

function Index() {
  const [ctx, setCtx] = useState<FlightContext>(initialContext);
  const [snap, setSnap] = useState<WorkloadSnapshot>(() => analyze(initialContext, null, []));
  const [running, setRunning] = useState(true);
  const ctxRef = useRef(ctx);
  const snapRef = useRef(snap);
  ctxRef.current = ctx;
  snapRef.current = snap;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const next = tickContext(ctxRef.current, 30); // 30s of flight per tick
      ctxRef.current = next;
      setCtx(next);
      const nextSnap = analyze(next, snapRef.current.index, snapRef.current.events);
      snapRef.current = nextSnap;
      setSnap(nextSnap);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-widest text-primary">
              PILOT WORKLOAD ANALYZER
            </h1>
            <p className="text-xs text-muted-foreground">
              multi-channel workload estimation · NASA-TLX inspired · overload forecasting
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">T+{formatClock(ctx.timeSec)}</span>
            <button
              onClick={() => setRunning((r) => !r)}
              className="rounded border border-border bg-secondary px-3 py-1 text-xs tracking-wider text-secondary-foreground hover:bg-accent"
            >
              {running ? "⏸ PAUSE SIM" : "▶ RESUME SIM"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-6 lg:grid-cols-3">
        {/* Workload index + forecast */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-muted-foreground">
            WORKLOAD INDEX
          </h2>
          <div className={`rounded-md border p-4 text-center ${BAND_STYLE[snap.band]}`}>
            <div className="text-5xl font-bold">{snap.index}</div>
            <div className="mt-1 text-xs font-bold tracking-widest">{snap.band}</div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
              <span>6-MIN FORECAST</span>
              <span>→ {snap.forecast[snap.forecast.length - 1]}</span>
            </div>
            <div className="flex h-16 items-end gap-[3px]">
              {snap.forecast.map((v, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${
                    v >= 85 ? "bg-destructive" : v >= 65 ? "bg-amber-400" : "bg-primary"
                  }`}
                  style={{ height: `${Math.max(6, v)}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Stat label="PHASE" value={ctx.phase} accent />
            <Stat label="ALT" value={`${Math.round(ctx.altitudeFt).toLocaleString()} ft`} />
            <Stat label="TRAFFIC" value={`${ctx.trafficCount}`} warn={ctx.trafficCount > 5} />
            <Stat label="WX" value={`${ctx.weatherSeverity.toFixed(1)}/10`} warn={ctx.weatherSeverity >= 7} />
            <Stat label="ATC RATE" value={`${ctx.atcCallRatePerMin.toFixed(0)}/min`} warn={ctx.atcCallRatePerMin > 7} />
            <Stat
              label="CONTROL"
              value={ctx.manualFlying ? "MANUAL" : "A/P"}
              warn={ctx.manualFlying && snap.index > 65}
            />
          </div>
        </section>

        {/* Channels + TLX */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-muted-foreground">
            RESOURCE CHANNELS
          </h2>
          <div className="space-y-3">
            {snap.channels.map((c) => (
              <div key={c.channel}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-bold tracking-wider">{c.channel}</span>
                  <span className="text-muted-foreground">{c.load}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-secondary">
                  <div
                    className={`h-full transition-all duration-700 ${
                      c.load >= 70 ? "bg-destructive" : c.load >= 45 ? "bg-amber-400" : "bg-primary"
                    }`}
                    style={{ width: `${c.load}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {c.drivers.join(" · ")}
                </div>
              </div>
            ))}
          </div>

          <h2 className="mb-2 mt-5 text-xs font-bold tracking-widest text-muted-foreground">
            NASA-TLX ESTIMATE
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <TlxRow label="Mental demand" v={snap.tlx.mentalDemand} />
            <TlxRow label="Physical demand" v={snap.tlx.physicalDemand} />
            <TlxRow label="Temporal demand" v={snap.tlx.temporalDemand} />
            <TlxRow label="Performance" v={snap.tlx.performance} invert />
            <TlxRow label="Effort" v={snap.tlx.effort} />
            <TlxRow label="Frustration" v={snap.tlx.frustration} />
          </div>
          <div className="mt-2 border-t border-border pt-2 text-xs">
            TLX overall: <span className="font-bold text-primary">{snap.tlx.overall}</span> / 100
          </div>
        </section>

        {/* Recommendations + event log */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-bold tracking-widest text-muted-foreground">
            ADAPTIVE RECOMMENDATIONS
          </h2>
          {snap.recommendations.length === 0 ? (
            <p className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
              No action needed — workload within nominal band.
            </p>
          ) : (
            <ul className="space-y-2">
              {snap.recommendations.map((r, i) => (
                <li
                  key={i}
                  className={`rounded border p-2 text-xs leading-relaxed ${
                    snap.band === "OVERLOAD"
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : "border-border bg-secondary/50"
                  }`}
                >
                  {r}
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-2 mt-5 text-xs font-bold tracking-widest text-muted-foreground">
            EVENT LOG
          </h2>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-[11px]">
            {[...snap.events].reverse().map((e, i) => (
              <li key={i} className="flex gap-2 rounded bg-secondary/40 px-2 py-1">
                <span className="text-primary">{EVENT_ICON[e.kind] ?? "•"}</span>
                <span className="text-muted-foreground">{formatClock(e.timeSec)}</span>
                <span>{e.detail}</span>
              </li>
            ))}
            {snap.events.length === 0 && (
              <li className="text-muted-foreground">No events yet.</li>
            )}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground">
        Simulation for research/demo purposes — not certified flight software.
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-secondary/50 px-3 py-2">
      <div className="text-[10px] tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-bold ${
          warn ? "text-destructive" : accent ? "text-primary" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function TlxRow({ label, v, invert }: { label: string; v: number; invert?: boolean }) {
  const bad = invert ? v < 45 : v > 70;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${bad ? "text-destructive" : ""}`}>{Math.round(v)}</span>
    </div>
  );
}
