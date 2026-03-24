# APEX-SENTINEL W4 — IMPLEMENTATION PLAN
## W4 | PROJECTAPEX Doc 17/20 | 2026-03-24

> Wave: W4 — C2 Dashboard
> Duration: 35 days (5 phases × 7 days)
> Engineer allocation: 1 full-stack engineer (Nico)
> TDD law: no implementation code before failing tests committed.

---

## Phase Overview

| Phase | Days | Focus | Deliverable |
|-------|------|-------|-------------|
| P1 | 1–7 | App scaffold + CesiumJS + TrackStore + Realtime | Globe with live tracks |
| P2 | 8–14 | NATS.ws + AlertStore + AlertBanner + TrackTable | Alert streaming + track list |
| P3 | 15–21 | OpenMCT plugin + NodeStore + NodeOverlay + Stats | Analytics + node health |
| P4 | 22–28 | CoT export + Supabase Auth + RBAC + Keyboard shortcuts | Auth + export |
| P5 | 29–35 | E2E tests + performance + Vercel deploy + Lighthouse | Production deploy |

---

## Phase 1 (Days 1–7): Globe Foundation

### Day 1: Project Scaffold

```bash
# From project root (monorepo: npm workspaces)
npx create-next-app@14.2.0 packages/dashboard \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-experimental-app

# Install W4 dependencies
cd packages/dashboard
npm install \
  cesium@1.116.0 \
  @supabase/supabase-js@2.43.0 \
  nats.ws@1.28.0 \
  zustand@4.5.0 \
  immer@10.1.1 \
  recharts@2.12.0 \
  @tanstack/react-virtual@3.5.0 \
  react-hook-form@7.51.0 \
  zod@3.23.0 \
  lucide-react@0.378.0 \
  class-variance-authority@0.7.0 \
  clsx@2.1.1 \
  tailwind-merge@2.3.0 \
  date-fns@3.6.0 \
  jszip@3.10.1

npm install --save-dev \
  vitest@1.6.0 \
  @vitest/coverage-v8@1.6.0 \
  @testing-library/react@15.0.7 \
  @testing-library/user-event@14.5.2 \
  @testing-library/jest-dom@6.4.2 \
  @playwright/test@1.44.0 \
  @sentry/nextjs@8.0.0 \
  prettier@3.2.5 \
  eslint-config-prettier@9.1.0

# shadcn/ui init
npx shadcn-ui@latest init --yes
```

### Day 1: Directory Structure
```
packages/dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              — root layout (dark theme, Sentry)
│   │   ├── page.tsx                — redirect to /dashboard
│   │   ├── login/page.tsx          — auth page
│   │   ├── auth/callback/route.ts  — Supabase auth callback
│   │   └── dashboard/
│   │       ├── layout.tsx          — dashboard layout (auth guard)
│   │       ├── page.tsx            — main C2 view
│   │       ├── tracks/page.tsx
│   │       ├── nodes/page.tsx
│   │       ├── alerts/page.tsx
│   │       └── analytics/page.tsx
│   ├── components/
│   │   ├── globe/
│   │   │   └── CesiumGlobe.tsx
│   │   ├── alerts/
│   │   │   ├── AlertBanner.tsx
│   │   │   └── AlertDetailPanel.tsx
│   │   ├── tracks/
│   │   │   └── TrackTable.tsx
│   │   ├── nodes/
│   │   │   └── NodeHealthPanel.tsx
│   │   ├── stats/
│   │   │   └── ThreatStatsPanel.tsx
│   │   └── ui/                     — shadcn/ui components
│   ├── lib/
│   │   ├── cesium/
│   │   │   ├── TrackMarker.ts
│   │   │   └── NodeOverlay.ts
│   │   ├── openmct/
│   │   │   └── apexSentinelPlugin.ts
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── realtime.ts
│   │   ├── nats/
│   │   │   └── client.ts
│   │   └── cot/
│   │       └── cotExport.ts
│   ├── stores/
│   │   ├── trackStore.ts
│   │   ├── alertStore.ts
│   │   ├── nodeStore.ts
│   │   └── uiStore.ts
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts
│   ├── middleware.ts                — Supabase Auth + RBAC middleware
│   └── types/
│       ├── index.ts                 — Track, Alert, SentinelNode, etc.
│       ├── openmct.d.ts
│       └── cesium-ext.d.ts
├── __tests__/
│   ├── stores/
│   ├── components/
│   ├── lib/
│   ├── hooks/
│   └── edge-functions/
├── e2e/
│   ├── auth.spec.ts
│   ├── globe.spec.ts
│   ├── tracks.spec.ts
│   ├── alerts.spec.ts
│   └── export.spec.ts
├── public/
│   └── cesium/                     — CesiumJS static assets (Workers, Assets)
├── next.config.mjs
├── vitest.config.ts
├── playwright.config.ts
└── vercel.json
```

### Day 1: TypeScript Types
```typescript
// src/types/index.ts

export type ThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type TrackStatus = 'active' | 'confirmed' | 'dropped';
export type NodeStatus = 'online' | 'degraded' | 'offline';
export type NodeTier = 'tier_1' | 'tier_2' | 'tier_3';
export type UserRole = 'operator' | 'analyst' | 'admin';
export type GlobeMode = '3d' | '2d';
export type Panel = 'tracks' | 'nodes' | 'alerts' | 'stats';
export type RealtimeStatus = 'connecting' | 'connected' | 'error' | 'disconnected';
export type NatsStatus = RealtimeStatus;
export type PollingStatus = 'idle' | 'polling' | 'error';
export type SortField = 'confidence' | 'first_seen_at' | 'last_updated_at' | 'threat_level';

export interface Track {
  track_id: string;
  threat_class: string;
  threat_level: ThreatLevel;
  lat: number;
  lon: number;
  alt_m: number | null;
  speed_ms: number | null;
  heading_deg: number | null;
  confidence: number;
  contributing_nodes: string[];
  status: TrackStatus;
  first_seen_at: string;
  last_updated_at: string;
}

export interface Alert {
  alert_id: string;
  threat_level: ThreatLevel;
  threat_class: string;
  confidence: number;
  geo_sector: string;
  lat: number | null;
  lon: number | null;
  track_id: string | null;
  dispatched_at: string;
  ttl_seconds: number;
  cot_xml?: string;
}

export interface SentinelNode {
  node_id: string;
  name: string;
  tier: NodeTier;
  status: NodeStatus;
  lat: number;
  lon: number;
  coverage_radius_m: number;
  last_seen: string;
  battery_pct: number | null;
  signal_rssi: number | null;
  detection_count_24hr: number;
}

export interface TrackFilter {
  threat_level?: ThreatLevel[];
  threat_class?: string;
  min_confidence?: number;
  status?: TrackStatus[];
  contributing_node?: string;
}

export interface CoverageStats {
  total_nodes: number;
  online_nodes: number;
  coverage_percent: number;
  aor_km2: number;
  detections_last_hour: number;
  detections_last_24hr: number;
  threat_breakdown: Record<ThreatLevel, number>;
}
```

### Day 2: CesiumJS Dynamic Import + Globe Component (TDD RED first)
```typescript
// __tests__/components/CesiumGlobe.test.tsx — WRITE FIRST (failing)

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CesiumJS entirely — no WebGL in Vitest
vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  Viewer: vi.fn().mockReturnValue({
    entities: { add: vi.fn(), remove: vi.fn(), getById: vi.fn() },
    scene: { globe: { enableLighting: false } },
    destroy: vi.fn(),
  }),
  Cartesian3: {
    fromDegrees: vi.fn((lon, lat, alt) => ({ lon, lat, alt })),
  },
  Color: {
    RED: { withAlpha: vi.fn() },
    ORANGE: { withAlpha: vi.fn() },
    YELLOW: { withAlpha: vi.fn() },
    CYAN: { withAlpha: vi.fn() },
    GREEN: { withAlpha: vi.fn() },
  },
  Entity: vi.fn(),
  createWorldTerrainAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock('next/dynamic', () => ({
  default: (fn: () => Promise<{ default: React.ComponentType }>) => {
    // Return a stub — CesiumGlobe tests focus on store integration
    const MockComponent = () => <div data-testid="cesium-globe-container" />;
    MockComponent.displayName = 'CesiumGlobe';
    return MockComponent;
  },
}));

describe('FR-W4-01: CesiumJS 3D Globe', () => {
  it('T-W4-01-01: renders globe container', () => {
    // FAILING until CesiumGlobe.tsx implemented
  });
  it('T-W4-01-02: TrackStore tracks appear as entities', () => {});
  it('T-W4-01-03: threat_level=critical renders red entity', () => {});
  // ... 12 more
});
```

```typescript
// src/components/globe/CesiumGlobe.tsx — implement AFTER tests RED
'use client';
import dynamic from 'next/dynamic';
import type { Track, SentinelNode } from '@/types';

// CesiumJS MUST be dynamically imported — it uses browser APIs unavailable in SSR
const CesiumViewerInner = dynamic(
  () => import('./CesiumViewerInner'),
  { ssr: false, loading: () => <div className="w-full h-full bg-gray-950 animate-pulse" /> }
);

interface CesiumGlobeProps {
  tracks: Track[];
  nodes: SentinelNode[];
  onTrackSelect: (trackId: string) => void;
  onNodeSelect: (nodeId: string) => void;
}

export function CesiumGlobe({ tracks, nodes, onTrackSelect, onNodeSelect }: CesiumGlobeProps) {
  return (
    <div data-testid="cesium-globe-container" className="w-full h-full relative">
      <CesiumViewerInner
        tracks={tracks}
        nodes={nodes}
        onTrackSelect={onTrackSelect}
        onNodeSelect={onNodeSelect}
      />
    </div>
  );
}
```

### Day 2: next.config.mjs for CesiumJS
```javascript
// next.config.mjs
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cesiumBuildPath = path.join(path.dirname(require.resolve('cesium/package.json')), 'Build', 'Cesium');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { buildId, dev, isServer }) => {
    if (!isServer) {
      // CesiumJS requires its Workers and Assets in the public directory
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            { from: path.join(cesiumBuildPath, 'Workers'), to: path.join(__dirname, 'public/cesium/Workers') },
            { from: path.join(cesiumBuildPath, 'Assets'), to: path.join(__dirname, 'public/cesium/Assets') },
            { from: path.join(cesiumBuildPath, 'Widgets'), to: path.join(__dirname, 'public/cesium/Widgets') },
            { from: path.join(cesiumBuildPath, 'ThirdParty'), to: path.join(__dirname, 'public/cesium/ThirdParty') },
          ],
        })
      );
      // Tell CesiumJS where its static assets live at runtime
      config.plugins.push(
        new (require('webpack').DefinePlugin)({
          CESIUM_BASE_URL: JSON.stringify('/cesium'),
        })
      );
    }
    return config;
  },
  // Exclude CesiumJS from tree-shaking (breaks with standard module resolution)
  transpilePackages: ['cesium'],
};

export default nextConfig;
```

### Day 3: TrackStore (TDD RED → GREEN)
```typescript
// __tests__/stores/trackStore.test.ts (TDD RED — write first)

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useTrackStore } from '@/stores/trackStore';

const mockTrack = (overrides = {}): Track => ({
  track_id: 'TRK-001',
  threat_class: 'quadcopter',
  threat_level: 'high',
  lat: 51.5,
  lon: -0.12,
  alt_m: 80,
  speed_ms: 15,
  heading_deg: 270,
  confidence: 0.87,
  contributing_nodes: ['node-001', 'node-002'],
  status: 'active',
  first_seen_at: new Date().toISOString(),
  last_updated_at: new Date().toISOString(),
  ...overrides,
});

describe('FR-W4-02: TrackStore', () => {
  beforeEach(() => {
    useTrackStore.setState({ tracks: new Map(), activeTrackId: null });
  });

  it('T-W4-02-01: upsertTrack adds new track', () => {
    act(() => useTrackStore.getState().upsertTrack(mockTrack()));
    expect(useTrackStore.getState().tracks.size).toBe(1);
  });

  it('T-W4-02-02: upsertTrack updates existing track', () => {
    const track = mockTrack();
    act(() => {
      useTrackStore.getState().upsertTrack(track);
      useTrackStore.getState().upsertTrack({ ...track, confidence: 0.95 });
    });
    expect(useTrackStore.getState().tracks.size).toBe(1);
    expect(useTrackStore.getState().tracks.get('TRK-001')!.confidence).toBe(0.95);
  });

  it('T-W4-02-03: removeTrack deletes track by id', () => {
    act(() => {
      useTrackStore.getState().upsertTrack(mockTrack());
      useTrackStore.getState().removeTrack('TRK-001');
    });
    expect(useTrackStore.getState().tracks.size).toBe(0);
  });

  it('T-W4-02-04: getFilteredSortedTracks returns filtered set', () => {
    act(() => {
      useTrackStore.getState().upsertTrack(mockTrack({ threat_level: 'critical' }));
      useTrackStore.getState().upsertTrack(mockTrack({ track_id: 'TRK-002', threat_level: 'low' }));
      useTrackStore.getState().setFilter({ threat_level: ['critical'] });
    });
    const filtered = useTrackStore.getState().getFilteredSortedTracks();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].threat_level).toBe('critical');
  });

  it('T-W4-02-05: setRealtimeStatus updates status field', () => {
    act(() => useTrackStore.getState().setRealtimeStatus('connected'));
    expect(useTrackStore.getState().realtimeStatus).toBe('connected');
  });

  // ... 10 more tests
});
```

```typescript
// src/stores/trackStore.ts — implement AFTER tests are RED
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Track, TrackFilter, SortField, RealtimeStatus } from '@/types';

interface TrackState {
  tracks: Map<string, Track>;
  activeTrackId: string | null;
  filter: TrackFilter;
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  realtimeStatus: RealtimeStatus;
  lastUpdatedAt: Date | null;
}

interface TrackActions {
  upsertTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  setActiveTrack: (trackId: string | null) => void;
  setFilter: (filter: Partial<TrackFilter>) => void;
  setSort: (field: SortField, dir: 'asc' | 'desc') => void;
  setRealtimeStatus: (status: RealtimeStatus) => void;
  getFilteredSortedTracks: () => Track[];
}

export const useTrackStore = create<TrackState & TrackActions>()(
  immer((set, get) => ({
    tracks: new Map(),
    activeTrackId: null,
    filter: {},
    sortField: 'last_updated_at',
    sortDir: 'desc',
    realtimeStatus: 'disconnected',
    lastUpdatedAt: null,

    upsertTrack: (track) =>
      set((state) => {
        state.tracks.set(track.track_id, track);
        state.lastUpdatedAt = new Date();
      }),

    removeTrack: (trackId) =>
      set((state) => {
        state.tracks.delete(trackId);
        if (state.activeTrackId === trackId) state.activeTrackId = null;
      }),

    setActiveTrack: (trackId) =>
      set((state) => { state.activeTrackId = trackId; }),

    setFilter: (filter) =>
      set((state) => { state.filter = { ...state.filter, ...filter }; }),

    setSort: (field, dir) =>
      set((state) => { state.sortField = field; state.sortDir = dir; }),

    setRealtimeStatus: (status) =>
      set((state) => { state.realtimeStatus = status; }),

    getFilteredSortedTracks: () => {
      const { tracks, filter, sortField, sortDir } = get();
      let result = Array.from(tracks.values());

      if (filter.threat_level?.length) {
        result = result.filter((t) => filter.threat_level!.includes(t.threat_level));
      }
      if (filter.threat_class) {
        result = result.filter((t) => t.threat_class.includes(filter.threat_class!));
      }
      if (filter.min_confidence != null) {
        result = result.filter((t) => t.confidence >= filter.min_confidence!);
      }
      if (filter.status?.length) {
        result = result.filter((t) => filter.status!.includes(t.status));
      }
      if (filter.contributing_node) {
        result = result.filter((t) => t.contributing_nodes.includes(filter.contributing_node!));
      }

      const dir = sortDir === 'asc' ? 1 : -1;
      result.sort((a, b) => {
        if (sortField === 'confidence') return dir * (a.confidence - b.confidence);
        if (sortField === 'threat_level') {
          const order: Record<ThreatLevel, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
          return dir * (order[a.threat_level] - order[b.threat_level]);
        }
        return dir * (new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime());
      });

      return result;
    },
  }))
);
```

### Day 4: Supabase Realtime Subscription
```typescript
// src/lib/supabase/realtime.ts
import { createClient } from '@supabase/supabase-js';
import { useTrackStore } from '@/stores/trackStore';
import type { Track } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

let channel: ReturnType<typeof supabase.channel> | null = null;

export function startTracksSubscription(): void {
  const { upsertTrack, removeTrack, setRealtimeStatus } = useTrackStore.getState();

  setRealtimeStatus('connecting');

  channel = supabase
    .channel('tracks-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tracks', filter: 'status=in.(active,confirmed)' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          removeTrack((payload.old as Track).track_id);
        } else {
          upsertTrack(payload.new as Track);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
      if (status === 'CHANNEL_ERROR') setRealtimeStatus('error');
      if (status === 'CLOSED') setRealtimeStatus('disconnected');
    });
}

export function stopTracksSubscription(): void {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  useTrackStore.getState().setRealtimeStatus('disconnected');
}
```

### Days 5–7: TrackMarker + Globe render loop
```typescript
// src/lib/cesium/TrackMarker.ts
import type { Track, ThreatLevel } from '@/types';
// Cesium imported inside function to avoid SSR (this file loaded from client-only component)

const THREAT_COLORS: Record<ThreatLevel, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#06b6d4',
  info:     '#22c55e',
};

export function createTrackEntity(track: Track, Cesium: typeof import('cesium'), viewer: import('cesium').Viewer) {
  const position = Cesium.Cartesian3.fromDegrees(track.lon, track.lat, track.alt_m ?? 0);
  const color = Cesium.Color.fromCssColorString(THREAT_COLORS[track.threat_level]);

  const entity = viewer.entities.add({
    id: track.track_id,
    position,
    billboard: {
      image: buildDroneSvg(track.threat_level),
      width: 32,
      height: 32,
      color,
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.2, 1e6, 0.4),
    },
    label: {
      text: `${track.threat_class} ${Math.round(track.confidence * 100)}%`,
      font: '11px monospace',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e5),
    },
    properties: {
      type: 'track',
      trackId: track.track_id,
    },
  });

  return entity;
}

function buildDroneSvg(level: ThreatLevel): string {
  const color = THREAT_COLORS[level];
  // Inline SVG as data URI — avoids external asset load in CI
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="6" fill="${color}" stroke="white" stroke-width="2"/>
      <line x1="4" y1="16" x2="12" y2="16" stroke="${color}" stroke-width="2"/>
      <line x1="20" y1="16" x2="28" y2="16" stroke="${color}" stroke-width="2"/>
      <line x1="16" y1="4" x2="16" y2="12" stroke="${color}" stroke-width="2"/>
      <line x1="16" y1="20" x2="16" y2="28" stroke="${color}" stroke-width="2"/>
    </svg>
  `)}`;
}

export function updateTrackEntity(entity: import('cesium').Entity, track: Track, Cesium: typeof import('cesium')) {
  (entity.position as any) = new Cesium.ConstantPositionProperty(
    Cesium.Cartesian3.fromDegrees(track.lon, track.lat, track.alt_m ?? 0)
  );
}
```

---

## Phase 2 (Days 8–14): NATS.ws + Alerts + Track Table

### Day 8: NATS.ws Client (reuse W2/W3 pattern)
```typescript
// src/lib/nats/client.ts — wraps @apex-sentinel/nats-client from W2
// W3 used nats.ws directly; W4 dashboard reuses same pattern

import { connect, StringCodec, type NatsConnection } from 'nats.ws';
import { useAlertStore } from '@/stores/alertStore';
import type { Alert } from '@/types';

const sc = StringCodec();
let nc: NatsConnection | null = null;

export async function startNatsClient(wsUrl: string): Promise<void> {
  const { addAlert, setNatsStatus } = useAlertStore.getState();
  setNatsStatus('connecting');

  nc = await connect({
    servers: [wsUrl],
    reconnect: true,
    maxReconnectAttempts: -1,  // unlimited
    reconnectTimeWait: 2000,
    pingInterval: 30000,
    maxPingOut: 3,
    name: 'apex-sentinel-dashboard',
  });

  setNatsStatus('connected');

  // Subscribe to all alert subjects
  const sub = nc.subscribe('sentinel.alerts.>');
  (async () => {
    for await (const msg of sub) {
      try {
        const alert: Alert = JSON.parse(sc.decode(msg.data));
        addAlert(alert);
      } catch {
        console.error('[NATS] Failed to parse alert message');
      }
    }
  })();

  // Monitor connection status
  (async () => {
    for await (const s of nc.status()) {
      if (s.type === 'disconnect' || s.type === 'error') {
        setNatsStatus('error');
      }
      if (s.type === 'reconnect') {
        setNatsStatus('connected');
      }
    }
  })();
}

export async function stopNatsClient(): Promise<void> {
  if (nc) {
    await nc.drain();
    nc = null;
  }
  useAlertStore.getState().setNatsStatus('disconnected');
}
```

### Day 9: AlertStore
```typescript
// src/stores/alertStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Alert, ThreatLevel, NatsStatus } from '@/types';

const MAX_ALERTS = 500;

interface AlertState {
  alerts: Alert[];
  activeAlertId: string | null;
  natsStatus: NatsStatus;
  unreadCount: number;
}

interface AlertActions {
  addAlert: (alert: Alert) => void;
  dismissAlert: (alertId: string) => void;
  markAllRead: () => void;
  setActiveAlert: (alertId: string | null) => void;
  setNatsStatus: (status: NatsStatus) => void;
  getAlertsByThreatLevel: (level: ThreatLevel) => Alert[];
}

export const useAlertStore = create<AlertState & AlertActions>()(
  persist(
    immer((set, get) => ({
      alerts: [],
      activeAlertId: null,
      natsStatus: 'disconnected',
      unreadCount: 0,

      addAlert: (alert) =>
        set((state) => {
          state.alerts.unshift(alert);  // newest first
          if (state.alerts.length > MAX_ALERTS) {
            state.alerts = state.alerts.slice(0, MAX_ALERTS);
          }
          state.unreadCount += 1;
        }),

      dismissAlert: (alertId) =>
        set((state) => {
          state.alerts = state.alerts.filter((a) => a.alert_id !== alertId);
          if (state.activeAlertId === alertId) state.activeAlertId = null;
        }),

      markAllRead: () => set((state) => { state.unreadCount = 0; }),

      setActiveAlert: (alertId) =>
        set((state) => { state.activeAlertId = alertId; }),

      setNatsStatus: (status) =>
        set((state) => { state.natsStatus = status; }),

      getAlertsByThreatLevel: (level) =>
        get().alerts.filter((a) => a.threat_level === level),
    })),
    {
      name: 'apex-sentinel-alerts',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ alerts: state.alerts.slice(0, 50) }),
    }
  )
);
```

### Days 10–12: AlertBanner + AlertDetailPanel
```typescript
// src/components/alerts/AlertBanner.tsx — implement after tests RED
// Key behaviors:
// 1. Slide in from top when alert != null
// 2. Color border by threat_level (critical=red, high=orange, etc.)
// 3. Auto-dismiss after ttl_seconds (setTimeout)
// 4. Play Audio for critical alerts (user preference from UIStore)
// 5. Click → opens AlertDetailPanel (calls onDetails)
// 6. ESC closes via UIStore.closeActivePanel → onDismiss

'use client';
import { useEffect, useRef } from 'react';
import type { Alert } from '@/types';
import { cn } from '@/lib/utils';

const THREAT_BORDER: Record<string, string> = {
  critical: 'border-red-500 bg-red-950/50',
  high:     'border-orange-500 bg-orange-950/50',
  medium:   'border-yellow-500 bg-yellow-950/50',
  low:      'border-cyan-500 bg-cyan-950/50',
  info:     'border-green-500 bg-green-950/50',
};

interface AlertBannerProps {
  alert: Alert | null;
  onDismiss: () => void;
  onDetails: (alertId: string) => void;
}

export function AlertBanner({ alert, onDismiss, onDetails }: AlertBannerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!alert) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, alert.ttl_seconds * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [alert, onDismiss]);

  if (!alert) return null;

  return (
    <div
      role="alert"
      data-testid="alert-banner"
      className={cn(
        'fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[600px] max-w-[90vw]',
        'border-2 rounded-lg px-4 py-3 cursor-pointer',
        'transition-transform duration-300 ease-out',
        THREAT_BORDER[alert.threat_level] ?? 'border-gray-500 bg-gray-950/50'
      )}
      onClick={() => onDetails(alert.alert_id)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={cn('text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded',
            alert.threat_level === 'critical' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200'
          )}>
            {alert.threat_level}
          </span>
          <span className="text-sm font-semibold text-white">{alert.threat_class}</span>
          <span className="text-xs text-gray-400">{Math.round(alert.confidence * 100)}% confidence</span>
          {alert.geo_sector && (
            <span className="text-xs text-gray-400">Sector: {alert.geo_sector}</span>
          )}
        </div>
        <button
          aria-label="Dismiss alert"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

### Days 13–14: TrackTable with virtual scrolling
```typescript
// Key TrackTable implementation notes:
// - @tanstack/react-virtual for rows >200 (virtualizer)
// - Column headers are clickable sort triggers (cycle asc/desc)
// - Filter bar at top (threat_level checkboxes, min_confidence slider, status filter)
// - Each row: click → setActiveTrack → globe flies to track
// - Export button per row → calls onExport(trackId)
// - Pagination: 50/page, page controls at bottom
// - Empty state: "No tracks match current filter" (not just blank)
// - Last updated badge (relative time, e.g. "2s ago")
```

---

## Phase 3 (Days 15–21): OpenMCT + Node Health + Stats

### Days 15–17: OpenMCT Plugin
```typescript
// src/lib/openmct/apexSentinelPlugin.ts
// This is the most complex W4 artifact. Full implementation notes:

// 1. Domain Objects (OpenMCT object model):
//    "apex-sentinel:nodes" folder → contains one object per node
//    Each node object has two telemetry series:
//      "apex-sentinel:nodes.{nodeId}.confidence" — float 0-1
//      "apex-sentinel:nodes.{nodeId}.detections"  — count per minute

// 2. Historical Telemetry Provider:
//    Implements { supportsRequest(domainObject), request(domainObject, options) }
//    Calls: GET /functions/v1/get-track-history?track_id=X (reusing track history endpoint)
//    Returns: Array<{ id: string, timestamp: number, value: number }>

// 3. Realtime Telemetry Provider:
//    Implements { supportsSubscribe(domainObject), subscribe(domainObject, callback) }
//    Source: NATS.ws sentinel.detections.{nodeId} subject
//    Returns unsubscribe function

// 4. Time API: OpenMCT time system = UTC, clock = Local Clock (real-time mode)

// 5. Layout setup:
//    Flexible layout with:
//      - Row 1: Detection timeline (aggregate all nodes, confidence over time)
//      - Row 2-N: Per-node telemetry panels (one per active node)
```

### Days 18–19: NodeStore + NodeOverlay
```typescript
// src/stores/nodeStore.ts — polling-based (not Realtime)
// Polls GET /functions/v1/get-node-status-batch every 30s
// Computes NodeStatus based on last_seen:
//   online:   last_seen < 5min ago
//   degraded: last_seen 5-15min ago
//   offline:  last_seen > 15min ago

// src/lib/cesium/NodeOverlay.ts — CesiumJS coverage circles
// Uses Cesium.CircleGeometry on the globe surface
// Circle radius = node.coverage_radius_m
// Color + opacity by tier + status (see ARTIFACT_REGISTRY.md ART-W4-004)
// Clickable: picks entity → sets NodeStore.activeNodeId
```

### Days 20–21: ThreatStatsPanel
```typescript
// src/components/stats/ThreatStatsPanel.tsx
// Reads from: useTrackStore (active tracks), NodeStore (node counts),
//             and polls get-coverage-stats Edge Function every 60s

// Recharts components:
//   LineChart: detections per hour, last 60 data points (1 per minute)
//   BarChart: threat level breakdown (critical/high/medium/low/info)

// Stats displayed:
//   Active Tracks: {count} ({breakdown by level})
//   Nodes Online: {online}/{total}
//   Coverage: {percent}% of AOR ({aor_km2} km²)
//   Detections/hr: {number}
//   Alerts (24hr): {number}
//   Top Threat Class: {class} (last 4hr)
```

---

## Phase 4 (Days 22–28): Auth + Export + Shortcuts

### Days 22–24: Supabase Auth + RBAC Middleware
```typescript
// src/middleware.ts — Next.js middleware (Edge runtime)
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { UserRole } from '@/types';

const ROLE_REQUIRED: Record<string, UserRole[]> = {
  '/dashboard': ['operator', 'analyst', 'admin'],
  '/tracks':    ['operator', 'analyst', 'admin'],
  '/nodes':     ['operator', 'analyst', 'admin'],
  '/alerts':    ['operator', 'analyst', 'admin'],
  '/analytics': ['analyst', 'admin'],
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = session.user.user_metadata?.role as UserRole | undefined;
  const path = req.nextUrl.pathname;
  const requiredRoles = ROLE_REQUIRED[path];

  if (requiredRoles && (!role || !requiredRoles.includes(role))) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Log session to dashboard_sessions (via Edge Function call — not direct Supabase in middleware)
  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/tracks', '/nodes', '/alerts', '/analytics'],
};
```

### Days 25–26: CoT Export
```typescript
// src/lib/cot/cotExport.ts
import JSZip from 'jszip';
import type { Track } from '@/types';

export function buildCotXml(track: Track): string {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const typeCode = threatClassToCotType(track.threat_class);
  const hae = track.alt_m ?? 9999;

  return `<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
  uid="APEX-SENTINEL-${track.track_id}"
  type="${typeCode}"
  time="${now}"
  start="${track.first_seen_at}"
  stale="${stale}"
  how="m-g">
  <point lat="${track.lat}" lon="${track.lon}" hae="${hae}" ce="111" le="9999"/>
  <detail>
    <contact callsign="DRONE-${track.track_id.slice(-6)}"/>
    <track course="${track.heading_deg ?? 0}" speed="${track.speed_ms ?? 0}"/>
    <remarks>APEX-SENTINEL: ${track.threat_class} ${Math.round(track.confidence * 100)}% [${track.threat_level.toUpperCase()}]</remarks>
    <apex_sentinel track_id="${track.track_id}"
      threat_level="${track.threat_level}"
      contributing_nodes="${track.contributing_nodes.join(',')}"
      status="${track.status}"/>
  </detail>
</event>`;
}

export async function buildBulkCotZip(tracks: Track[]): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder('apex-sentinel-export')!;
  for (const track of tracks) {
    folder.file(`${track.track_id}.cot`, buildCotXml(track));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function threatClassToCotType(threatClass: string): string {
  const map: Record<string, string> = {
    quadcopter:   'a-h-A-C-F',
    'fixed-wing': 'a-h-A-C-F-A',
    helicopter:   'a-h-A-C-H',
  };
  return map[threatClass.toLowerCase()] ?? 'a-h-A-C-F';
}
```

### Days 27–28: Keyboard Shortcuts
```typescript
// src/hooks/useKeyboardShortcuts.ts
'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

const SHORTCUT_MAP: Record<string, () => void> = {};

export function useKeyboardShortcuts() {
  const { togglePanel, setFullscreen, isFullscreen, toggleShortcutsHelp, closeActivePanel } = useUIStore();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when focused on input/textarea/select
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toUpperCase()) {
        case 'T': togglePanel('tracks'); break;
        case 'N': togglePanel('nodes'); break;
        case 'A': togglePanel('alerts'); break;
        case 'S': togglePanel('stats'); break;
        case 'F':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setFullscreen(true));
          } else {
            document.exitFullscreen().then(() => setFullscreen(false));
          }
          break;
        case 'ESCAPE': closeActivePanel(); break;
        case '/': e.preventDefault(); toggleShortcutsHelp(); break;
        default: return;
      }
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel, setFullscreen, toggleShortcutsHelp, closeActivePanel]);
}
```

---

## Phase 5 (Days 29–35): E2E + Performance + Deploy

### Days 29–32: Playwright E2E
```typescript
// e2e/globe.spec.ts (example)
import { test, expect } from '@playwright/test';
import { loginAsOperator } from './helpers/auth';

test.describe('FR-W4-01: CesiumJS Globe', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOperator(page);
    await page.goto('/dashboard');
    // Wait for globe container to mount (CesiumJS loads async)
    await page.waitForSelector('[data-testid="cesium-globe-container"]', { timeout: 10000 });
  });

  test('T-W4-E2E-01: globe container renders on /dashboard', async ({ page }) => {
    await expect(page.locator('[data-testid="cesium-globe-container"]')).toBeVisible();
  });

  test('T-W4-E2E-02: keyboard shortcut T opens track table panel', async ({ page }) => {
    await page.keyboard.press('t');
    await expect(page.locator('[data-testid="track-table-panel"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="track-table-panel"]')).not.toBeVisible();
  });

  test('T-W4-E2E-03: keyboard shortcut N opens node health panel', async ({ page }) => {
    await page.keyboard.press('n');
    await expect(page.locator('[data-testid="node-health-panel"]')).toBeVisible();
  });

  // ... 11 more globe E2E tests
});
```

### Days 33–34: Performance Profiling
```bash
# Bundle analysis
cd packages/dashboard
ANALYZE=true npm run build
# Opens webpack-bundle-analyzer — verify CesiumJS is in deferred chunk only

# Core Web Vitals
npx playwright test e2e/lighthouse.spec.ts

# Realtime latency measurement (manual)
# Insert track row in Supabase → measure time until store update in browser devtools
# Target: < 100ms from Supabase row write to Zustand store update

# NATS.ws latency (manual)
# nats pub sentinel.alerts.test '{"alert_id":"test",...}'
# → measure time to AlertBanner appearance
# Target: < 200ms
```

### Day 35: Vercel Deploy + Final Verification
```bash
# Final deployment sequence
cd packages/dashboard
npx vitest run --coverage  # must be 0 failures
npx playwright test        # must be 0 failures
npx tsc --noEmit           # must be 0 errors
npm run build              # must succeed

# Deploy
vercel deploy --prod

# Capture LKGC
bash scripts/capture-lkgc-w4.sh

# Tag release
git tag v4.0.0-w4-lkgc
git push origin v4.0.0-w4-lkgc

# wave-formation.sh complete W4
./wave-formation.sh complete W4
```

---

## File Path Reference (Complete)

```
packages/dashboard/
  src/app/layout.tsx
  src/app/page.tsx
  src/app/login/page.tsx
  src/app/auth/callback/route.ts
  src/app/dashboard/layout.tsx
  src/app/dashboard/page.tsx
  src/app/dashboard/tracks/page.tsx
  src/app/dashboard/nodes/page.tsx
  src/app/dashboard/alerts/page.tsx
  src/app/dashboard/analytics/page.tsx
  src/components/globe/CesiumGlobe.tsx
  src/components/globe/CesiumViewerInner.tsx
  src/components/alerts/AlertBanner.tsx
  src/components/alerts/AlertDetailPanel.tsx
  src/components/tracks/TrackTable.tsx
  src/components/nodes/NodeHealthPanel.tsx
  src/components/stats/ThreatStatsPanel.tsx
  src/lib/cesium/TrackMarker.ts
  src/lib/cesium/NodeOverlay.ts
  src/lib/openmct/apexSentinelPlugin.ts
  src/lib/supabase/client.ts
  src/lib/supabase/realtime.ts
  src/lib/nats/client.ts
  src/lib/cot/cotExport.ts
  src/lib/utils.ts
  src/stores/trackStore.ts
  src/stores/alertStore.ts
  src/stores/nodeStore.ts
  src/stores/uiStore.ts
  src/hooks/useKeyboardShortcuts.ts
  src/middleware.ts
  src/types/index.ts
  src/types/openmct.d.ts
  src/types/cesium-ext.d.ts
  __tests__/stores/trackStore.test.ts
  __tests__/stores/alertStore.test.ts
  __tests__/stores/nodeStore.test.ts
  __tests__/stores/uiStore.test.ts
  __tests__/components/CesiumGlobe.test.tsx
  __tests__/components/AlertBanner.test.tsx
  __tests__/components/AlertDetailPanel.test.tsx
  __tests__/components/TrackTable.test.tsx
  __tests__/components/NodeHealthPanel.test.tsx
  __tests__/components/ThreatStatsPanel.test.tsx
  __tests__/lib/TrackMarker.test.ts
  __tests__/lib/NodeOverlay.test.ts
  __tests__/lib/openmct/apexSentinelPlugin.test.ts
  __tests__/hooks/useKeyboardShortcuts.test.ts
  __tests__/lib/cotExport.test.ts
  __tests__/lib/natsClient.test.ts
  __tests__/lib/supabaseRealtime.test.ts
  __tests__/middleware/rbac.test.ts
  __tests__/edge-functions/export-cot.test.ts
  __tests__/edge-functions/get-track-history.test.ts
  __tests__/edge-functions/get-coverage-stats.test.ts
  __tests__/edge-functions/get-node-status-batch.test.ts
  e2e/auth.spec.ts
  e2e/globe.spec.ts
  e2e/tracks.spec.ts
  e2e/alerts.spec.ts
  e2e/export.spec.ts
  next.config.mjs
  vitest.config.ts
  playwright.config.ts
  vercel.json
  tailwind.config.ts
  tsconfig.json
supabase/functions/export-cot/index.ts
supabase/functions/get-track-history/index.ts
supabase/functions/get-coverage-stats/index.ts
supabase/functions/get-node-status-batch/index.ts
supabase/migrations/0019_track_positions.sql
supabase/migrations/0020_dashboard_sessions.sql
supabase/migrations/0021_w4_views.sql
scripts/capture-lkgc-w4.sh
```
