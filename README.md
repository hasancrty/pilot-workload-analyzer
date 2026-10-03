# Pilot Workload Analyzer

Real-time pilot workload estimation and overload forecasting, built around a live flight simulation. The analyzer models crew workload across multiple resource channels, produces a NASA-TLX inspired demand profile, forecasts the next six minutes of workload, and issues adaptive task-shedding recommendations when the crew approaches saturation.

## Why

Most cockpit alerting research focuses on the alerts themselves. This project looks at the human side: even a perfectly prioritized alert stack can overwhelm a crew during a high-density approach in convective weather. The goal is to estimate *when* the crew is nearing overload so automation can shed tasks, defer non-critical messages, or suggest configuration changes before performance degrades.

## Model

- **Resource channels** (Wickens' multiple resource theory): perceptual, cognitive, psychomotor and communication loads are estimated independently from flight context — traffic density, weather severity, alert count, ATC call rate, flight phase and whether the autopilot is engaged.
- **Workload Index (0–100):** a weighted composite of channel loads with a *conflict penalty* when multiple channels are simultaneously saturated — concurrent demands cost more than the sum of their parts.
- **NASA-TLX estimate:** the six TLX subscales (mental, physical, temporal demand, performance, effort, frustration) are inferred from context rather than self-reported, giving a continuous TLX-style profile without interrupting the crew.
- **Forecast:** an autoregressive predictor projects the index six minutes ahead, driven by phase-dependent workload targets and environment trends.
- **Recommendations:** rule-based task-shedding advice (re-engage autopilot, delegate radio, silence acknowledged cautions, request reroute) triggered by band crossings and channel saturation.

## Stack

- React 19 + TypeScript
- TanStack Start (SSR)
- Tailwind CSS v4
- Vite

## Run

```bash
bun install
bun dev
```

The simulation advances 30 seconds of flight per tick through climb, cruise, descent and approach, with evolving traffic, weather and ATC demand.

## Disclaimer

Research/demo simulation — not certified flight software and not validated against real psychophysiological measurements.
