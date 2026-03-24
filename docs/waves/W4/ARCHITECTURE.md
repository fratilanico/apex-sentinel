# APEX-SENTINEL — ARCHITECTURE.md
## C2 Dashboard System Architecture
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. ARCHITECTURE OVERVIEW

### 1.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL SYSTEMS                                                            │
│                                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ Sensor Nodes│    │ NATS Fortress│    │  Supabase DB │    │FreeTAKSvr │  │
│  │  (W1 app)   │    │ (W2 backbone)│    │ bymfcnwfy... │    │  (ATAK)   │  │
│  └──────┬──────┘    └──────┬───────┘    └──────┬───────┘    └─────┬─────┘  │
│         │  detections      │  tracks            │  tracks RT        │  CoT   │
│         ▼                  ▼                    ▼                   ▲        │
│  ┌─────────────────────────────────────────────────────────────────┘        │
│  │           TdoaCorrelator (W3) — fuses detections → track records         │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                     │
│                           writes tracks to DB
│                                     │
└─────────────────────────────────────▼───────────────────────────────────────┘

                    ┌──────────────────────────────────┐
                    │  C2 DASHBOARD (W4 — Next.js 14)  │
                    │                                  │
                    │  Supabase Realtime  ←──────────  │ ← tracks table changes
                    │  NATS.ws            ←──────────  │ ← sentinel.alerts.>
                    │  Edge Functions     ←──────────  │ ← history, stats, CoT
                    │                                  │
                    │  CesiumJS 3D Globe               │
                    │  OpenMCT Timeline                │
                    │  Zustand State                   │
                    └──────────────────────────────────┘
```

### 1.2 Deployment Topology

```
Browser (Chrome/Firefox/Edge)
  └── Next.js 14 App (Vercel / self-hosted)
        ├── /app directory (App Router)
        │     ├── Server Components: initial data fetch via Supabase service role
        │     └── Client Components: Realtime, NATS.ws, CesiumJS, OpenMCT
        ├── /api routes: relay-tak, export-cot-bundle (thin wrappers)
        └── Edge Functions (Supabase eu-west-2):
              ├── get-track-history
              ├── get-node-coverage
              ├── acknowledge-alert
              ├── export-cot-bundle
              └── get-threat-stats

DNS: c2.apex-sentinel.io → Vercel
NATS: wss://nats.apex-sentinel.io:4223 (NATS.ws TLS endpoint, fortress VM)
Supabase: https://bymfcnwfyxuivinuzurr.supabase.co
```

---

## 2. NEXT.JS 14 APP ROUTER STRUCTURE

### 2.1 Directory Layout

```
apex-sentinel/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    [SERVER] root layout, sets <html class="dark">
│   │   ├── page.tsx                      [SERVER] dashboard entry, prefetches initial tracks
│   │   ├── loading.tsx                   [SERVER] Suspense fallback
│   │   ├── error.tsx                     [CLIENT] error boundary
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx              [SERVER] login page
│   │   │   └── layout.tsx                [SERVER] auth layout (no sidebar)
│   │   └── api/
│   │       ├── relay-tak/route.ts        [SERVER] POST → Edge Function relay
│   │       └── health/route.ts           [SERVER] GET /api/health
│   ├── components/
│   │   ├── globe/
│   │   │   ├── CesiumGlobe.tsx           [CLIENT] dynamic import wrapper
│   │   │   ├── CesiumGlobeInner.tsx      [CLIENT] actual Cesium viewer
│   │   │   ├── TrackMarker.tsx           [CLIENT] entity manager for tracks
│   │   │   ├── NodeOverlay.tsx           [CLIENT] coverage circles
│   │   │   ├── AlertRing.tsx             [CLIENT] pulsing alert rings
│   │   │   └── TrajectoryLine.tsx        [CLIENT] EKF prediction polyline
│   │   ├── panels/
│   │   │   ├── LeftPanel.tsx             [CLIENT] sidebar wrapper
│   │   │   ├── RightPanel.tsx            [CLIENT] detail panel wrapper
│   │   │   ├── ThreatSummary.tsx         [CLIENT] threat count badges
│   │   │   ├── ThreatStatsPanel.tsx      [CLIENT] statistics bars
│   │   │   ├── NodeHealthList.tsx        [CLIENT] node status list
│   │   │   ├── LayerControls.tsx         [CLIENT] layer toggle checkboxes
│   │   │   ├── AlertFeed.tsx             [CLIENT] alert list
│   │   │   ├── AlertDetailPanel.tsx      [CLIENT] selected alert detail
│   │   │   ├── TrackTable.tsx            [CLIENT] sortable track table
│   │   │   └── TrackDetail.tsx           [CLIENT] single track detail view
│   │   ├── timeline/
│   │   │   ├── OpenMCTTimeline.tsx       [CLIENT] OpenMCT mount
│   │   │   └── PlaybackControls.tsx      [CLIENT] timeline toolbar
│   │   ├── ui/
│   │   │   ├── AlertBanner.tsx           [CLIENT] CRITICAL flash banner
│   │   │   ├── DefconBadge.tsx           [CLIENT] DEFCON level badge
│   │   │   ├── ThreatBadge.tsx           [CLIENT] threat class badge
│   │   │   ├── ConfidenceMeter.tsx       [CLIENT] confidence bar
│   │   │   ├── NodeStatusDot.tsx         [CLIENT] status indicator dot
│   │   │   ├── KeyboardShortcutModal.tsx [CLIENT] shortcut reference
│   │   │   ├── CotXmlModal.tsx           [CLIENT] CoT XML preview
│   │   │   └── AnnotationModal.tsx       [CLIENT] operator notes
│   │   ├── header/
│   │   │   ├── DashboardHeader.tsx       [CLIENT] top bar
│   │   │   └── ConnectionStatus.tsx      [CLIENT] realtime/NATS status
│   │   └── providers/
│   │       ├── SupabaseProvider.tsx      [CLIENT] Supabase client context
│   │       ├── NatsProvider.tsx          [CLIENT] NATS.ws context
│   │       └── RealtimeProvider.tsx      [CLIENT] starts Realtime subscriptions
│   ├── lib/
│   │   ├── cesium/
│   │   │   ├── trackEntityManager.ts     entity CRUD + batch update
│   │   │   ├── nodeEntityManager.ts      coverage circle CRUD
│   │   │   └── cesiumColors.ts           Color constants for Cesium
│   │   ├── openmct/
│   │   │   ├── ApexSentinelPlugin.ts     OpenMCT plugin definition
│   │   │   └── telemetryProviders.ts     Realtime + historical data
│   │   ├── nats/
│   │   │   ├── NatsWsClient.ts           NATS.ws connection singleton
│   │   │   └── alertSubscriber.ts        sentinel.alerts.> consumer
│   │   ├── supabase/
│   │   │   ├── client.ts                 browser Supabase client
│   │   │   ├── serverClient.ts           server-side service role client
│   │   │   ├── realtimeClient.ts         Realtime subscription factory
│   │   │   └── trackSubscriber.ts        tracks channel handler
│   │   ├── cot/
│   │   │   ├── cotExporter.ts            CoT XML builder
│   │   │   ├── cotValidator.ts           CoT XSD validation
│   │   │   └── cotRelay.ts               FreeTAKServer POST
│   │   └── hooks/
│   │       ├── useKeyboardShortcuts.ts   global keydown handler
│   │       ├── useTrackStore.ts          Zustand store selector
│   │       ├── useAlertStore.ts          Zustand store selector
│   │       ├── useNodeStore.ts           Zustand store selector
│   │       └── useUiStore.ts             Zustand store selector
│   ├── stores/
│   │   ├── trackStore.ts                 Zustand: active tracks state
│   │   ├── alertStore.ts                 Zustand: alert queue
│   │   ├── nodeStore.ts                  Zustand: node registry
│   │   └── uiStore.ts                    Zustand: UI state
│   └── types/
│       ├── track.ts                      Track, TrackUpdate types
│       ├── alert.ts                      Alert, AlertSeverity types
│       ├── node.ts                       SensorNode, NodeTier types
│       └── cot.ts                        CotEvent, CotPoint types
├── supabase/
│   ├── functions/
│   │   ├── get-track-history/
│   │   ├── get-node-coverage/
│   │   ├── acknowledge-alert/
│   │   ├── export-cot-bundle/
│   │   └── get-threat-stats/
│   └── migrations/
│       └── 0010_w4_dashboard_schema.sql
├── tests/
│   ├── unit/
│   ├── components/
│   └── e2e/
└── next.config.js
```

### 2.2 Server vs Client Component Boundary

```
Rule: Default to Server Components. Add 'use client' ONLY when:
  - Component uses useState, useEffect, useRef
  - Component subscribes to Supabase Realtime or NATS
  - Component uses browser APIs (window, document, WebGL)
  - Component uses event handlers (onClick, etc.)

Server Components used for:
  - layout.tsx: sets HTML structure, injects auth session via cookies
  - page.tsx: prefetches initial track list, node list, recent alerts
  - login/page.tsx: static login form

Client Components (marked 'use client'):
  - All globe components (Cesium requires browser APIs)
  - All real-time panel components (useState for updates)
  - All components with user interaction
  - Providers (Supabase, NATS, Realtime)
```

---

## 3. CESIUMJS INTEGRATION

### 3.1 Dynamic Import Pattern

CesiumJS must NOT be imported at module level. It will crash SSR.

```typescript
// src/components/globe/CesiumGlobe.tsx
'use client';

import dynamic from 'next/dynamic';

const CesiumGlobeInner = dynamic(
  () => import('./CesiumGlobeInner'),
  {
    ssr: false,
    loading: () => <GlobeLoadingSkeleton />
  }
);

export function CesiumGlobe() {
  return <CesiumGlobeInner />;
}
```

```typescript
// next.config.js
const nextConfig = {
  webpack: (config) => {
    // CesiumJS requires these for WASM + WebWorker support
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };

    // Copy Cesium static assets to public/cesium
    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          { from: 'node_modules/cesium/Build/Cesium/Workers', to: '../public/cesium/Workers' },
          { from: 'node_modules/cesium/Build/Cesium/ThirdParty', to: '../public/cesium/ThirdParty' },
          { from: 'node_modules/cesium/Build/Cesium/Assets', to: '../public/cesium/Assets' },
          { from: 'node_modules/cesium/Build/Cesium/Widgets', to: '../public/cesium/Widgets' },
        ],
      })
    );
    return config;
  },
  env: {
    CESIUM_BASE_URL: '/cesium',
  },
};
```

### 3.2 Viewer Initialization

```typescript
// src/components/globe/CesiumGlobeInner.tsx
'use client';

import { useEffect, useRef } from 'react';
import type { Viewer } from 'cesium';

export default function CesiumGlobeInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    let viewer: Viewer;

    async function initCesium() {
      const Cesium = await import('cesium');

      // Set base URL before any Cesium operation
      window.CESIUM_BASE_URL = process.env.NEXT_PUBLIC_CESIUM_BASE_URL!;
      Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN!;

      viewer = new Cesium.Viewer(containerRef.current!, {
        terrainProvider: await Cesium.createWorldTerrainAsync(),
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,          // custom info panels
        sceneModePicker: false,  // controlled by our G key shortcut
        selectionIndicator: false,
        timeline: false,         // OpenMCT is our timeline
        navigationHelpButton: false,
        skyBox: false,           // dark background
        skyAtmosphere: false,    // dark background
      });

      // Military dark background
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0A0C10');
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0F1117');

      // Dark imagery: Mapbox satellite-streets-v12 dark style
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
          maximumLevel: 19,
        })
      );

      viewerRef.current = viewer;
    }

    initCesium();
    return () => { viewer?.destroy(); };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full"
         style={{ background: '#0A0C10' }} />
  );
}
```

### 3.3 Track Entity Manager

```typescript
// src/lib/cesium/trackEntityManager.ts
// Manages CesiumJS Entity objects for tracks
// KEY: entities are created once, then POSITION UPDATED (not destroyed/recreated)

import type { Viewer, Entity } from 'cesium';
import type { Track } from '@/types/track';

interface EntityRecord {
  entity: Entity;
  trackId: string;
  lastUpdated: number;
}

export class TrackEntityManager {
  private viewer: Viewer;
  private entities: Map<string, EntityRecord> = new Map();
  private Cesium: typeof import('cesium');

  constructor(viewer: Viewer, Cesium: typeof import('cesium')) {
    this.viewer = viewer;
    this.Cesium = Cesium;
  }

  upsert(track: Track): void {
    const existing = this.entities.get(track.id);
    if (existing) {
      this.updatePosition(existing.entity, track);
    } else {
      this.create(track);
    }
  }

  remove(trackId: string): void {
    const record = this.entities.get(trackId);
    if (record) {
      this.viewer.entities.remove(record.entity);
      this.entities.delete(trackId);
    }
  }

  private create(track: Track): void {
    const { Cesium } = this;
    const color = this.getThreatColor(track.threat_class);
    const position = Cesium.Cartesian3.fromDegrees(
      track.longitude, track.latitude, track.altitude_m
    );

    const entity = this.viewer.entities.add({
      id: track.id,
      position,
      billboard: {
        image: this.getThreatIcon(track.threat_class),
        scale: 1.0,
        color,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        eyeOffset: new Cesium.Cartesian3(0, 0, -100),
      },
      label: {
        text: `${track.id}\n${track.threat_class} ${Math.round(track.confidence * 100)}%`,
        font: '12px JetBrains Mono',
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 10),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#0A0C10').withAlpha(0.85),
      },
    });

    this.entities.set(track.id, {
      entity,
      trackId: track.id,
      lastUpdated: Date.now(),
    });
  }

  private updatePosition(entity: Entity, track: Track): void {
    const { Cesium } = this;
    // Mutate existing entity — NO entity removal/re-add
    (entity.position as any) = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(track.longitude, track.latitude, track.altitude_m)
    );
    if (entity.label) {
      (entity.label.text as any) = new Cesium.ConstantProperty(
        `${track.id}\n${track.threat_class} ${Math.round(track.confidence * 100)}%`
      );
    }
  }

  private getThreatColor(threatClass: string): any {
    const { Cesium } = this;
    const colors: Record<string, string> = {
      'FPV_DRONE':     '#FF2D2D',
      'SHAHED':        '#FF6B00',
      'HELICOPTER':    '#FFD700',
      'FIXED_WING':    '#FF9500',
      'MULTIROTOR':    '#FF4500',
      'UNKNOWN':       '#8B92A8',
      'FRIENDLY':      '#00E676',
    };
    return Cesium.Color.fromCssColorString(colors[threatClass] ?? colors['UNKNOWN']);
  }

  private getThreatIcon(threatClass: string): string {
    // Returns data URI for SVG icon
    // Icons defined in src/lib/cesium/icons/
    return `/cesium-icons/${threatClass.toLowerCase()}.svg`;
  }

  batchUpdate(tracks: Track[]): void {
    // Process all updates in one call to minimize Cesium scene re-renders
    const trackIds = new Set(tracks.map(t => t.id));

    // Remove entities not in current track set
    for (const [id] of this.entities) {
      if (!trackIds.has(id)) {
        this.remove(id);
      }
    }

    // Upsert all current tracks
    for (const track of tracks) {
      this.upsert(track);
    }
  }
}
```

---

## 4. SUPABASE REALTIME SUBSCRIPTION PATTERN

### 4.1 Subscription Setup

```typescript
// src/lib/supabase/trackSubscriber.ts

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useTrackStore } from '@/stores/trackStore';
import type { RealtimeChannel } from '@supabase/supabase-js';

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 30000;

export function useTrackSubscription() {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttempts = useRef(0);
  const { upsertTrack, removeTrack, setConnectionStatus } = useTrackStore();

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    function subscribe() {
      const channel = supabase
        .channel('tracks-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tracks',
            filter: "status=eq.'ACTIVE'",
          },
          (payload) => {
            reconnectAttempts.current = 0; // reset on successful message

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              upsertTrack(payload.new as Track);
            } else if (payload.eventType === 'DELETE') {
              removeTrack(payload.old.id);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
            reconnectAttempts.current = 0;
            // Full resync on reconnect
            resyncAllTracks(supabase);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setConnectionStatus('disconnected');
            scheduleReconnect();
          }
        });

      channelRef.current = channel;
    }

    function scheduleReconnect() {
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(1.5, reconnectAttempts.current),
        RECONNECT_MAX_MS
      );
      reconnectAttempts.current++;
      setTimeout(() => {
        channelRef.current?.unsubscribe();
        subscribe();
      }, delay);
    }

    async function resyncAllTracks(supabase: ReturnType<typeof createClient>) {
      const { data } = await supabase
        .from('tracks')
        .select('*')
        .eq('status', 'ACTIVE');
      if (data) {
        useTrackStore.getState().replaceAll(data as Track[]);
      }
    }

    subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, []);
}
```

### 4.2 WebSocket Connection Lifecycle

```
Browser opens dashboard
        │
        ▼
RealtimeProvider mounts
  → createClient() with anon key + auth JWT
  → channel('tracks-realtime').subscribe()
        │
        ▼
Status: CONNECTING
  [DashboardHeader shows ● amber "CONNECTING"]
        │
        ▼
Status: SUBSCRIBED
  → resyncAllTracks() called
  → initial track list loaded into trackStore
  [DashboardHeader shows ● green "REALTIME"]
        │
        ▼
Normal operation: postgres_changes events arrive
  → handler fires ≤5ms after DB write (Supabase Realtime latency)
  → Zustand upsertTrack() called
  → TrackMarker entity position updated
  → TrackTable row re-renders (optimized: no full table re-render)
        │
  [Network drop]
        ▼
Status: CLOSED
  → setConnectionStatus('disconnected')
  → tracks retain last known positions
  → staleness timer starts per-track
  [DashboardHeader shows ● red "REALTIME OFFLINE"]
        │
  [scheduleReconnect: 5s, 7.5s, 11s, 17s, 25s, 30s, 30s... max]
        ▼
Status: SUBSCRIBED (reconnected)
  → resyncAllTracks() — full state sync
  → staleness timers reset
```

---

## 5. NATS.WS CLIENT

### 5.1 Connection Management

```typescript
// src/lib/nats/NatsWsClient.ts
// Reuses pattern from W2/W3 NatsClient, adapted for browser (nats.ws)

import { connect, StringCodec, NatsConnection, Subscription } from 'nats.ws';

const NATS_URL = process.env.NEXT_PUBLIC_NATS_WS_URL!; // wss://nats.apex-sentinel.io:4223
const MAX_RECONNECT_ATTEMPTS = 12;
const RECONNECT_INTERVAL_MS = 5000;

class NatsWsClient {
  private conn: NatsConnection | null = null;
  private sc = StringCodec();
  private subscriptions: Map<string, Subscription> = new Map();
  private reconnectCount = 0;
  private statusCallbacks: Set<(status: 'connected' | 'disconnected') => void> = new Set();

  async connect(): Promise<void> {
    try {
      this.conn = await connect({
        servers: [NATS_URL],
        user: process.env.NEXT_PUBLIC_NATS_USER!,
        pass: process.env.NEXT_PUBLIC_NATS_PASS!,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectTimeWait: RECONNECT_INTERVAL_MS,
        noEcho: true,
      });

      this.reconnectCount = 0;
      this.notifyStatus('connected');

      // Handle status changes
      (async () => {
        for await (const s of this.conn!.status()) {
          if (s.type === 'disconnect') {
            this.notifyStatus('disconnected');
          } else if (s.type === 'reconnect') {
            this.notifyStatus('connected');
          }
        }
      })();

    } catch (err) {
      this.notifyStatus('disconnected');
      throw err;
    }
  }

  subscribe(subject: string, handler: (data: unknown) => void): void {
    if (!this.conn) throw new Error('NATS not connected');

    const sub = this.conn.subscribe(subject);
    this.subscriptions.set(subject, sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const raw = this.sc.decode(msg.data);
          const parsed = JSON.parse(raw);
          handler(parsed);
        } catch (err) {
          console.warn('[NATS] malformed message on', subject, err);
        }
      }
    })();
  }

  unsubscribe(subject: string): void {
    this.subscriptions.get(subject)?.unsubscribe();
    this.subscriptions.delete(subject);
  }

  onStatus(cb: (status: 'connected' | 'disconnected') => void): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  async disconnect(): Promise<void> {
    await this.conn?.drain();
    this.conn = null;
  }

  private notifyStatus(status: 'connected' | 'disconnected'): void {
    this.statusCallbacks.forEach(cb => cb(status));
  }
}

// Singleton — one connection per browser tab
export const natsClient = new NatsWsClient();
```

### 5.2 Alert Subscriber

```typescript
// src/lib/nats/alertSubscriber.ts

import { natsClient } from './NatsWsClient';
import { useAlertStore } from '@/stores/alertStore';

interface AlertMessage {
  alert_id: string;
  track_id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  threat_class: string;
  confidence: number;
  latitude: number;
  longitude: number;
  altitude_m: number;
  detected_at: string;
  cot_xml?: string;
}

export function subscribeToAlerts(): () => void {
  const { enqueueAlert } = useAlertStore.getState();

  natsClient.subscribe('sentinel.alerts.>', (data) => {
    // RAF batching: don't update store synchronously during animation frame
    requestAnimationFrame(() => {
      enqueueAlert(data as AlertMessage);
    });
  });

  return () => natsClient.unsubscribe('sentinel.alerts.>');
}
```

---

## 6. ZUSTAND STORES

### 6.1 trackStore

```typescript
// src/stores/trackStore.ts

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Track } from '@/types/track';

interface TrackStore {
  tracks: Map<string, Track>;
  selectedTrackId: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  upsertTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  replaceAll: (tracks: Track[]) => void;
  selectTrack: (id: string | null) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  getActiveCount: () => number;
  getByThreatClass: (cls: string) => Track[];
}

export const useTrackStore = create<TrackStore>()(
  subscribeWithSelector((set, get) => ({
    tracks: new Map(),
    selectedTrackId: null,
    connectionStatus: 'connecting',

    upsertTrack: (track) =>
      set((state) => {
        const next = new Map(state.tracks);
        next.set(track.id, {
          ...track,
          _clientReceivedAt: Date.now(), // for staleness calculation
        });
        return { tracks: next };
      }),

    removeTrack: (id) =>
      set((state) => {
        const next = new Map(state.tracks);
        next.delete(id);
        return { tracks: next };
      }),

    replaceAll: (tracks) =>
      set({ tracks: new Map(tracks.map(t => [t.id, { ...t, _clientReceivedAt: Date.now() }])) }),

    selectTrack: (id) => set({ selectedTrackId: id }),
    setConnectionStatus: (status) => set({ connectionStatus: status }),

    getActiveCount: () => {
      const now = Date.now();
      return Array.from(get().tracks.values())
        .filter(t => now - t._clientReceivedAt < 120_000).length;
    },

    getByThreatClass: (cls) =>
      Array.from(get().tracks.values()).filter(t => t.threat_class === cls),
  }))
);
```

### 6.2 alertStore

```typescript
// src/stores/alertStore.ts

import { create } from 'zustand';
import type { AlertMessage } from '@/types/alert';

const MAX_ALERTS = 200;

interface AlertStore {
  alerts: AlertMessage[];
  unacknowledgedCount: number;
  criticalAlerts: AlertMessage[];
  enqueueAlert: (alert: AlertMessage) => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAcknowledged: () => void;
}

export const useAlertStore = create<AlertStore>()((set, get) => ({
  alerts: [],
  unacknowledgedCount: 0,
  criticalAlerts: [],

  enqueueAlert: (alert) => {
    set((state) => {
      // Deduplication by alert_id
      if (state.alerts.some(a => a.alert_id === alert.alert_id)) {
        return state; // no-op
      }

      const next = [alert, ...state.alerts].slice(0, MAX_ALERTS);
      return {
        alerts: next,
        unacknowledgedCount: state.unacknowledgedCount + 1,
        criticalAlerts: alert.severity === 'CRITICAL'
          ? [alert, ...state.criticalAlerts]
          : state.criticalAlerts,
      };
    });
  },

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map(a =>
        a.alert_id === alertId ? { ...a, acknowledged: true, acknowledgedAt: Date.now() } : a
      ),
      unacknowledgedCount: Math.max(0, state.unacknowledgedCount - 1),
      criticalAlerts: state.criticalAlerts.filter(a => a.alert_id !== alertId),
    })),

  clearAcknowledged: () =>
    set((state) => ({
      alerts: state.alerts.filter(a => !a.acknowledged),
    })),
}));
```

### 6.3 nodeStore

```typescript
// src/stores/nodeStore.ts

import { create } from 'zustand';
import type { SensorNode } from '@/types/node';

interface NodeStore {
  nodes: Map<string, SensorNode>;
  lastRefreshed: number | null;
  upsertNode: (node: SensorNode) => void;
  replaceAll: (nodes: SensorNode[]) => void;
  setLastRefreshed: (ts: number) => void;
  getOnlineCount: () => number;
  getOfflineCount: () => number;
  getByTier: (tier: number) => SensorNode[];
}

export const useNodeStore = create<NodeStore>()((set, get) => ({
  nodes: new Map(),
  lastRefreshed: null,

  upsertNode: (node) =>
    set((state) => {
      const next = new Map(state.nodes);
      next.set(node.id, node);
      return { nodes: next };
    }),

  replaceAll: (nodes) =>
    set({ nodes: new Map(nodes.map(n => [n.id, n])) }),

  setLastRefreshed: (ts) => set({ lastRefreshed: ts }),

  getOnlineCount: () =>
    Array.from(get().nodes.values()).filter(n => n.status === 'ONLINE').length,

  getOfflineCount: () =>
    Array.from(get().nodes.values()).filter(n => n.status === 'OFFLINE').length,

  getByTier: (tier) =>
    Array.from(get().nodes.values()).filter(n => n.tier === tier),
}));
```

### 6.4 uiStore

```typescript
// src/stores/uiStore.ts

import { create } from 'zustand';

type RightPanelView = 'alerts' | 'tracks' | 'nodes' | 'stats';
type MapMode = '3d' | '2d';

interface UiStore {
  rightPanelView: RightPanelView;
  mapMode: MapMode;
  timelineVisible: boolean;
  leftPanelExpanded: boolean;
  activeModal: 'shortcuts' | 'cot-xml' | 'annotation' | null;
  selectedAlertId: string | null;
  cameraFollowTrackId: string | null;
  setRightPanelView: (view: RightPanelView) => void;
  setMapMode: (mode: MapMode) => void;
  toggleTimeline: () => void;
  toggleLeftPanel: () => void;
  openModal: (modal: UiStore['activeModal']) => void;
  closeModal: () => void;
  selectAlert: (id: string | null) => void;
  setCameraFollow: (trackId: string | null) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  rightPanelView: 'alerts',
  mapMode: '3d',
  timelineVisible: true,
  leftPanelExpanded: true,
  activeModal: null,
  selectedAlertId: null,
  cameraFollowTrackId: null,

  setRightPanelView: (view) => set({ rightPanelView: view }),
  setMapMode: (mode) => set({ mapMode: mode }),
  toggleTimeline: () => set((s) => ({ timelineVisible: !s.timelineVisible })),
  toggleLeftPanel: () => set((s) => ({ leftPanelExpanded: !s.leftPanelExpanded })),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  selectAlert: (id) => set({ selectedAlertId: id }),
  setCameraFollow: (trackId) => set({ cameraFollowTrackId: trackId }),
}));
```

---

## 7. OPENMCT PLUGIN ARCHITECTURE

### 7.1 Plugin Structure

```typescript
// src/lib/openmct/ApexSentinelPlugin.ts

export function ApexSentinelPlugin(
  supabaseUrl: string,
  supabaseKey: string
) {
  return function (openmct: OpenMCT) {

    // Register domain object type
    openmct.types.addType('apex-sentinel.track', {
      name: 'APEX Sentinel Track',
      description: 'Real-time UAV threat track from APEX Sentinel',
      cssClass: 'icon-telemetry',
    });

    // Register object provider
    openmct.objects.addProvider('apex-sentinel', {
      get: async (identifier) => {
        // Returns track/node/alert object definitions
        return buildDomainObject(identifier);
      }
    });

    // Register telemetry provider
    openmct.telemetry.addProvider({
      supportsRequest: (domainObject) =>
        domainObject.type === 'apex-sentinel.track',

      request: async (domainObject, options) => {
        // Historical data from get-track-history Edge Function
        const response = await fetch(
          `${supabaseUrl}/functions/v1/get-track-history`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              track_id: domainObject.identifier.key,
              start: options.start,
              end: options.end,
            }),
          }
        );
        const data = await response.json();
        return data.points;
      },

      supportsSubscribe: (domainObject) =>
        domainObject.type === 'apex-sentinel.track',

      subscribe: (domainObject, callback) => {
        // Subscribe to Zustand trackStore changes
        const unsubscribe = useTrackStore.subscribe(
          (state) => state.tracks.get(domainObject.identifier.key),
          (track) => {
            if (track) {
              callback({
                id: domainObject.identifier.key,
                timestamp: Date.now(),
                confidence: track.confidence,
                latitude: track.latitude,
                longitude: track.longitude,
                altitude: track.altitude_m,
              });
            }
          }
        );
        return unsubscribe;
      },
    });

    // Register root composition
    openmct.composition.addProvider({
      appliesTo: (domainObject) =>
        domainObject.type === 'folder' &&
        domainObject.identifier.key === 'root',
      load: () => buildRootChildren(),
    });
  };
}
```

---

## 8. AUTHENTICATION MIDDLEWARE

### 8.1 Next.js Middleware

```typescript
// src/middleware.ts

import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  // Unauthenticated: redirect to login
  if (!session && !req.nextUrl.pathname.startsWith('/login')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated: inject role into header for downstream use
  if (session) {
    const role = session.user.user_metadata?.role ?? 'analyst';
    res.headers.set('x-user-role', role);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|cesium/).*)'],
};
```

### 8.2 Role-Based UI Gating

```typescript
// src/lib/hooks/useRole.ts

import { useSupabase } from '@/components/providers/SupabaseProvider';

export type UserRole = 'operator' | 'analyst' | 'admin' | 'civil_defense';

export function useRole(): UserRole {
  const { session } = useSupabase();
  return (session?.user?.user_metadata?.role as UserRole) ?? 'analyst';
}

export function useCanExport(): boolean {
  const role = useRole();
  return role === 'operator' || role === 'admin' || role === 'analyst';
}

export function useCanAcknowledge(): boolean {
  const role = useRole();
  return role === 'operator' || role === 'admin';
}

export function useCanSetDefcon(): boolean {
  const role = useRole();
  return role === 'admin';
}

export function useCanSeeNodes(): boolean {
  const role = useRole();
  return role !== 'civil_defense';
}
```

---

## 9. DATA FLOW DIAGRAMS

### 9.1 Track Update Flow

```
TdoaCorrelator (W3)
      │
      │  INSERT/UPDATE tracks table
      ▼
Supabase PostgreSQL (bymfcnwfyxuivinuzurr, eu-west-2)
      │
      │  Realtime WAL replication → Realtime server
      ▼
Supabase Realtime WebSocket
      │
      │  postgres_changes event (≤50ms typical)
      ▼
trackSubscriber.ts (useEffect in RealtimeProvider)
      │
      │  handler fires
      ▼
useTrackStore.upsertTrack(track)
      │
      ├──────────────────────────────────────┐
      │                                      │
      ▼                                      ▼
TrackEntityManager.upsert(track)      TrackTable re-render
  → entity.position updated              → row position/confidence updated
  → Cesium renders next frame             → React reconciler (minimal diff)
  (≤16ms at 60fps)
```

### 9.2 Alert Flow

```
Sensor Node (W1) → detection
      │
      │  NATS publish sentinel.detections.*
      ▼
TdoaCorrelator (W3) → correlation
      │
      │  NATS publish sentinel.alerts.{track_id}
      ▼
NATS fortress (100.68.152.56:4222)
      │
      │  NATS.ws bridge → wss://nats.apex-sentinel.io:4223
      ▼
NatsWsClient.subscribe('sentinel.alerts.>')
      │
      │  message handler (RAF-batched)
      ▼
useAlertStore.enqueueAlert(alert)
      │
      ├──────────────────────────────────┐
      │                                  │
      ▼                                  ▼
AlertBanner (if CRITICAL)         AlertFeed list
  → red flash animation             → new row prepended
  → audio alert (if enabled)        → unread count badge
```

---

## 10. PERFORMANCE ARCHITECTURE

### 10.1 React Re-render Optimization

```
Strategy: minimize re-renders for high-frequency updates

TrackTable:
  - useTrackStore with selector: only re-renders when track count or
    sort/filter result changes
  - useMemo for sorted/filtered track array
  - React.memo on individual track rows
  - Key: track.id (stable, no re-mount on position update)

TrackMarker (CesiumJS):
  - Does NOT go through React at all
  - TrackEntityManager.upsert() called from Zustand subscription
    (useTrackStore.subscribe(), not a React hook)
  - Zero React re-render for position updates on globe

AlertBanner:
  - useAlertStore subscribeWithSelector: only re-renders when
    criticalAlerts array changes (not on every alert)

DashboardHeader connection status:
  - useNatsStore + useRealtimeStore selectors for connection status only
  - Does not subscribe to track/alert data
```

### 10.2 Cesium Performance Budget

```
Entity budget per scene:
  - Tracks: max 100 entities (TrackMarker × N)
  - Nodes: max 500 entities (NodeOverlay coverage circles)
  - Trails: max 100 polylines × 30 points = 3000 points
  - Alert rings: max 10 pulsing rings

Render optimizations:
  - viewer.requestRenderMode = true (only render when data changes)
  - viewer.maximumRenderTimeChange = 0.0 (immediate render on change)
  - Entity clustering: disabled (we need individual markers)
  - Terrain clamping: not used (tracks fly in air, already above terrain)
  - Imagery tile cache: default (Cesium manages LRU)

Frame budget:
  - 60fps = 16ms/frame
  - CesiumJS render budget: 12ms
  - JavaScript overhead (Realtime + Zustand): 2ms
  - React reconciler: 2ms
```

---

*ARCHITECTURE.md — APEX-SENTINEL W4 — approved 2026-03-24*
