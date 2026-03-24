# APEX-SENTINEL — TEST_STRATEGY.md
## W4 Test Strategy — C2 Dashboard
### Wave 4 | Project: APEX-SENTINEL | Version: 4.0.0
### Date: 2026-03-24 | Status: APPROVED

---

## 1. TESTING PHILOSOPHY

W4 is a real-time dashboard consuming external data streams. Testing strategy:
- **Mock external dependencies**: Supabase Realtime replaced by EventEmitter, NATS.ws by mock server
- **Test behavior, not implementation**: TrackTable tests assert "row appears when track arrives", not "upsertTrack was called"
- **CesiumJS mocked in unit tests**: WebGL unavailable in CI; Cesium entities tested via mock
- **E2E tests use real Supabase test project**: no mocking of DB in E2E (uses dedicated test schema)
- **TDD RED first**: all tests written before implementation, committed in failing state

---

## 2. TEST STACK

```
Layer              Tool                          When run
─────────────────────────────────────────────────────────────────────
Unit               Vitest 1.x                    Every commit (fast)
Component          React Testing Library 14.x    Every commit
API Integration    Vitest + msw 2.x              Every commit
E2E                Playwright 1.x                PR + pre-deploy
Coverage           @vitest/coverage-v8           Every commit
Type checking      tsc --noEmit                  Every commit
Lint               ESLint + Prettier             Every commit
```

---

## 3. TEST PYRAMID

```
                    ┌──────────┐
                    │   E2E    │  20 scenarios (Playwright)
                   /└──────────┘\
                  /  Component   \  45 test suites (RTL)
                 /────────────────\
                /  Unit + API Int  \  120 test suites (Vitest)
               /────────────────────\
```

---

## 4. UNIT TESTS (Vitest)

### 4.1 trackStore

```typescript
// tests/unit/stores/trackStore.test.ts
// FR-W4-02, FR-W4-04

describe('FR-W4-02-00: trackStore', () => {
  describe('upsertTrack', () => {
    it('adds new track to store', () => {});
    it('updates existing track position without full re-render', () => {});
    it('sets _clientReceivedAt on upsert', () => {});
    it('multiple upserts of same track ID: only one entry in store', () => {});
  });

  describe('removeTrack', () => {
    it('removes track by ID', () => {});
    it('no-op for unknown track ID', () => {});
  });

  describe('replaceAll', () => {
    it('replaces all tracks with new set', () => {});
    it('sets _clientReceivedAt on all new tracks', () => {});
    it('removes tracks not in new set', () => {});
  });

  describe('getActiveCount', () => {
    it('counts tracks updated within 120s', () => {});
    it('excludes tracks older than 120s', () => {});
    it('returns 0 for empty store', () => {});
  });

  describe('getByThreatClass', () => {
    it('returns only FPV_DRONE tracks', () => {});
    it('returns empty array for unknown class', () => {});
  });

  describe('connectionStatus', () => {
    it('starts as connecting', () => {});
    it('updates to connected on setConnectionStatus', () => {});
  });
});
```

### 4.2 alertStore

```typescript
// tests/unit/stores/alertStore.test.ts
// FR-W4-03

describe('FR-W4-03-00: alertStore', () => {
  describe('enqueueAlert', () => {
    it('adds alert to queue', () => {});
    it('deduplicates by alert_id: second enqueue is no-op', () => {});
    it('FIFO drop: max 200 alerts, oldest dropped on overflow', () => {});
    it('increments unacknowledgedCount on new alert', () => {});
    it('adds CRITICAL alert to criticalAlerts array', () => {});
    it('non-CRITICAL alert: criticalAlerts unchanged', () => {});
    it('invalid JSON in message: caught, not added', () => {});
  });

  describe('acknowledgeAlert', () => {
    it('marks alert acknowledged', () => {});
    it('decrements unacknowledgedCount', () => {});
    it('removes from criticalAlerts', () => {});
    it('no-op for unknown alert_id', () => {});
    it('unacknowledgedCount never goes below 0', () => {});
  });

  describe('clearAcknowledged', () => {
    it('removes all acknowledged alerts from queue', () => {});
    it('retains unacknowledged alerts', () => {});
  });
});
```

### 4.3 cotExporter

```typescript
// tests/unit/lib/cot/cotExporter.test.ts
// FR-W4-08

describe('FR-W4-08-00: cotExporter', () => {
  describe('buildCotEvent', () => {
    it('produces valid CoT 2.0 XML string', () => {});
    it('sets correct CoT type for FPV_DRONE: a-h-A-M-F-Q', () => {});
    it('sets correct CoT type for SHAHED: a-h-A-M-F', () => {});
    it('sets correct CoT type for UNKNOWN: a-u-A', () => {});
    it('coarsens coordinates to ±50m for non-admin role', () => {});
    it('uses exact coordinates for admin role', () => {});
    it('sets ce=50 for coarsened export, ce=10 for exact', () => {});
    it('does not include operator user_id in CoT XML', () => {});
    it('does not include node_id in CoT XML detail', () => {});
    it('sets stale time to detected_at + 30 minutes', () => {});
    it('UNIX epoch timestamps converted to ISO 8601 correctly', () => {});
  });

  describe('buildCotBatch', () => {
    it('produces one CoT event per track', () => {});
    it('batch of 0 tracks returns empty array', () => {});
    it('validates each track has required fields', () => {});
  });

  describe('cotToXmlString', () => {
    it('produces well-formed XML (no unclosed tags)', () => {});
    it('escapes special characters in callsign', () => {});
    it('encoding declaration: UTF-8', () => {});
  });
});
```

### 4.4 locationCoarsener

```typescript
// tests/unit/lib/privacy/locationCoarsener.test.ts
// FR-W4-08 (privacy), PRIVACY_ARCHITECTURE.md §2.1

describe('FR-W4-08-01: locationCoarsener', () => {
  it('coarsens to nearest 0.00045° grid', () => {});
  it('admin role: returns exact coordinates unchanged', () => {});
  it('operator role: coordinates coarsened', () => {});
  it('civil_defense role: coordinates coarsened', () => {});
  it('coarsened lat within ±50m of original', () => {});
  it('coarsened lon within ±50m of original', () => {});
  it('repeated calls with same input produce same output (deterministic)', () => {});
});
```

### 4.5 alertSeverity mapping

```typescript
// tests/unit/lib/alertSeverity.test.ts
// FR-W4-03 (severity display)

describe('FR-W4-03-01: alertSeverity', () => {
  it('confidence ≥0.85 + dual-gate + FPV = CRITICAL', () => {});
  it('confidence ≥0.70 + single-gate = HIGH', () => {});
  it('confidence ≥0.50 = MEDIUM', () => {});
  it('confidence ≥0.30 = LOW', () => {});
  it('confidence <0.30 = INFO', () => {});
  it('returns alert color hex for CRITICAL: #FF2D2D', () => {});
});
```

### 4.6 trackEntityManager (mocked Cesium)

```typescript
// tests/unit/lib/cesium/trackEntityManager.test.ts
// FR-W4-01

// Mock Cesium:
const mockCesium = {
  Cartesian3: { fromDegrees: vi.fn().mockReturnValue({}) },
  Color: { fromCssColorString: vi.fn().mockReturnValue({}) },
  ConstantPositionProperty: vi.fn(),
  ConstantProperty: vi.fn(),
  // ... etc
};

describe('FR-W4-01-00: TrackEntityManager', () => {
  describe('upsert', () => {
    it('creates entity on first upsert', () => {});
    it('updates entity position on second upsert — no entity remove/re-add', () => {});
    it('entity map size stays 1 after 100 upserts of same track', () => {});
  });

  describe('remove', () => {
    it('removes entity from viewer and map', () => {});
    it('no-op for unknown track ID', () => {});
  });

  describe('batchUpdate', () => {
    it('upserts all tracks in batch', () => {});
    it('removes entities for tracks not in new batch', () => {});
    it('100 tracks: viewer.entities.add called ≤100 times total', () => {});
  });
});
```

---

## 5. COMPONENT TESTS (React Testing Library)

### 5.1 TrackTable component

```typescript
// tests/components/panels/TrackTable.test.tsx
// FR-W4-04

describe('FR-W4-04-00: TrackTable', () => {
  describe('rendering', () => {
    it('renders all active tracks as rows', () => {});
    it('shows empty state when no active tracks', () => {});
    it('stale track (>120s) shows [STALE] badge', () => {});
    it('row background tinted by threat class color', () => {});
    it('confidence column colored by confidence level', () => {});
  });

  describe('sorting', () => {
    it('default sort: confidence DESC', () => {});
    it('click ID column: sorts by ID ASC then DESC on second click', () => {});
    it('click CONF column: sorts confidence DESC then ASC', () => {});
    it('sort indicator: ▲ or ▼ in column header', () => {});
  });

  describe('filtering', () => {
    it('class filter "FPV Only": shows only FPV_DRONE rows', () => {});
    it('confidence filter "High >70%": shows only rows with conf>0.7', () => {});
    it('text filter "NODE-0": shows rows where node matches', () => {});
    it('clear filter: all tracks visible again', () => {});
    it('combined filter: class + confidence applied simultaneously', () => {});
  });

  describe('interaction', () => {
    it('row click: calls selectTrack with track ID', () => {});
    it('selected row has Surface-active background', () => {});
    it('keyboard ↑↓: navigates rows', () => {});
    it('keyboard Enter: opens TrackDetail for selected row', () => {});
    it('keyboard /: focuses filter input', () => {});
  });
});
```

### 5.2 AlertBanner component

```typescript
// tests/components/ui/AlertBanner.test.tsx
// FR-W4-03

describe('FR-W4-03-02: AlertBanner', () => {
  it('not rendered when no CRITICAL alerts', () => {});
  it('renders when CRITICAL alert in criticalAlerts store', () => {});
  it('has role="alert" and aria-live="assertive"', () => {});
  it('shows track ID, threat class, timestamp', () => {});
  it('ACK button calls acknowledgeAlert on click', () => {});
  it('→ TRACK button calls selectTrack', () => {});
  it('multiple CRITICALs: all shown in stacked list', () => {});
  it('>5 CRITICALs: shows first 5 + "+N more"', () => {});
  it('expand: click expands to show CoT XML preview', () => {});
});
```

### 5.3 ThreatStatsPanel component

```typescript
// tests/components/panels/ThreatStatsPanel.test.tsx
// FR-W4-09

describe('FR-W4-09-00: ThreatStatsPanel', () => {
  it('renders all 7 metric bars', () => {});
  it('detections/hr bar width proportional to value', () => {});
  it('node uptime % displayed correctly', () => {});
  it('trend indicator ▲ shown when positive trend', () => {});
  it('trend indicator ▼ shown when negative trend', () => {});
  it('zero state: "--" not "0%" for new deployments', () => {});
  it('civil_defense role: shows simplified metrics only', () => {});
  it('tooltip on hover each metric', () => {});
  it('refreshes every 60s (mock timers)', () => {});
});
```

### 5.4 AlertDetailPanel component

```typescript
// tests/components/panels/AlertDetailPanel.test.tsx
// FR-W4-07

describe('FR-W4-07-00: AlertDetailPanel', () => {
  it('shows track ID, class, confidence, coordinates', () => {});
  it('coordinates shown coarsened (±50m) for operator role', () => {});
  it('coordinates shown exact for admin role', () => {});
  it('CoT XML preview: collapsed by default', () => {});
  it('CoT XML preview: expands on "View full CoT" click', () => {});
  it('ACKNOWLEDGE button disabled for analyst role', () => {});
  it('ACKNOWLEDGE button enabled for operator role', () => {});
  it('EXPORT COT button present for operator and analyst', () => {});
  it('EXPORT COT button absent for civil_defense', () => {});
  it('RELAY TAK button present for operator', () => {});
  it('RELAY TAK button absent for analyst', () => {});
  it('already-acknowledged: shows acknowledgement record', () => {});
  it('empty state when no alert selected', () => {});
});
```

### 5.5 NodeHealthList component

```typescript
// tests/components/panels/NodeHealthList.test.tsx
// FR-W4-06

describe('FR-W4-06-00: NodeHealthList', () => {
  it('renders all online nodes', () => {});
  it('offline nodes shown with red status dot', () => {});
  it('TIER-1 nodes shown with green tier badge', () => {});
  it('last_heartbeat >30s: time label turns amber', () => {});
  it('last_heartbeat >120s: time label turns red', () => {});
  it('not rendered for civil_defense role', () => {});
  it('node count: "47 online · 3 offline" in header', () => {});
  it('click node: dispatches globe fly-to event', () => {});
  it('filter "Online": only online nodes shown', () => {});
});
```

---

## 6. E2E TESTS (Playwright)

### 6.1 Authentication

```typescript
// tests/e2e/auth.spec.ts
// FR-W4-10

test.describe('FR-W4-10-00: Authentication', () => {
  test('unauthenticated access to / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('login with valid credentials: dashboard loads', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', process.env.TEST_OPERATOR_EMAIL!);
    await page.fill('[data-testid=password]', process.env.TEST_OPERATOR_PASSWORD!);
    await page.click('[data-testid=login-button]');
    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid=dashboard-header]')).toBeVisible();
  });

  test('login with invalid credentials: shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'wrong@test.com');
    await page.fill('[data-testid=password]', 'wrongpassword');
    await page.click('[data-testid=login-button]');
    await expect(page.locator('[data-testid=auth-error]')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('civil_defense role: nodes panel not visible', async ({ page }) => {
    // Login as civil_defense user
    await loginAs(page, 'civil_defense');
    await expect(page.locator('[data-testid=node-health-list]')).not.toBeVisible();
    await expect(page.locator('[data-testid=node-coverage-overlay]')).not.toBeVisible();
  });

  test('analyst role: ACK button disabled', async ({ page }) => {
    await loginAs(page, 'analyst');
    // Navigate to an alert
    await page.click('[data-testid=alert-row]');
    const ackButton = page.locator('[data-testid=acknowledge-button]');
    await expect(ackButton).toBeDisabled();
  });
});
```

### 6.2 Track Realtime Updates

```typescript
// tests/e2e/tracks.spec.ts
// FR-W4-02, FR-W4-01

test.describe('FR-W4-02-00: Realtime Track Updates', () => {
  test('track appears in table after Supabase INSERT event', async ({ page }) => {
    await loginAs(page, 'operator');
    const startTime = Date.now();

    // Insert test track into Supabase test schema
    await insertTestTrack(supabaseTestClient, {
      id: 'TRK-TEST-001',
      threat_class: 'FPV_DRONE',
      confidence: 0.92,
      latitude: 50.2341,
      longitude: 30.5124,
      altitude_m: 120,
      status: 'ACTIVE',
    });

    // Wait for track to appear in table
    await page.waitForSelector('[data-testid=track-row-TRK-TEST-001]', { timeout: 1000 });
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(100); // <100ms requirement

    // Verify row content
    await expect(page.locator('[data-testid=track-class-TRK-TEST-001]')).toHaveText('FPV Drone');
    await expect(page.locator('[data-testid=track-conf-TRK-TEST-001]')).toContainText('92%');
  });

  test('track UPDATE: confidence updates in table', async ({ page }) => {
    // Setup: insert track
    await insertTestTrack(supabaseTestClient, { id: 'TRK-TEST-002', confidence: 0.50, ... });
    await page.waitForSelector('[data-testid=track-row-TRK-TEST-002]');

    // Update confidence
    await updateTestTrack(supabaseTestClient, 'TRK-TEST-002', { confidence: 0.94 });

    // Verify updated value within 100ms
    await page.waitForFunction(
      () => document.querySelector('[data-testid=track-conf-TRK-TEST-002]')?.textContent?.includes('94%'),
      { timeout: 1000 }
    );
  });

  test('track DELETE: row removed from table', async ({ page }) => {
    await insertTestTrack(supabaseTestClient, { id: 'TRK-TEST-003', ... });
    await page.waitForSelector('[data-testid=track-row-TRK-TEST-003]');

    await deleteTestTrack(supabaseTestClient, 'TRK-TEST-003');

    await page.waitForFunction(
      () => !document.querySelector('[data-testid=track-row-TRK-TEST-003]'),
      { timeout: 1000 }
    );
  });
});
```

### 6.3 CRITICAL Alert Flow

```typescript
// tests/e2e/alerts.spec.ts
// FR-W4-03

test.describe('FR-W4-03-00: Alert Stream', () => {
  test('CRITICAL alert triggers red banner within 200ms', async ({ page }) => {
    await loginAs(page, 'operator');
    const startTime = Date.now();

    // Publish CRITICAL alert to NATS test server
    await publishTestAlert(natsTestClient, {
      alert_id: 'ALT-TEST-001',
      severity: 'CRITICAL',
      threat_class: 'FPV_DRONE',
      confidence: 0.93,
    });

    // Wait for banner
    await page.waitForSelector('[data-testid=alert-banner-critical]', { timeout: 500 });
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(200);
    await expect(page.locator('[data-testid=alert-banner-critical]')).toBeVisible();
    await expect(page.locator('[data-testid=alert-banner-critical]')).toContainText('CRITICAL');
    await expect(page.locator('[data-testid=alert-banner-critical]')).toContainText('FPV Drone');
  });

  test('LOW alert: no AlertBanner, appears in AlertFeed only', async ({ page }) => {
    await loginAs(page, 'operator');

    await publishTestAlert(natsTestClient, {
      alert_id: 'ALT-TEST-002',
      severity: 'LOW',
      threat_class: 'UNKNOWN',
      confidence: 0.35,
    });

    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid=alert-banner-critical]')).not.toBeVisible();
    await expect(page.locator('[data-testid=alert-feed-item-ALT-TEST-002]')).toBeVisible();
  });

  test('ACK button: acknowledges alert, removes from critical banner', async ({ page }) => {
    await loginAs(page, 'operator');
    await publishCriticalAlert(natsTestClient, 'ALT-TEST-003');
    await page.waitForSelector('[data-testid=alert-banner-critical]');

    await page.click('[data-testid=ack-button-ALT-TEST-003]');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid=alert-banner-critical]'),
      { timeout: 1000 }
    );

    // Verify in DB
    const ack = await supabaseTestClient
      .from('alert_acknowledgements')
      .select('*')
      .eq('alert_id', 'ALT-TEST-003')
      .single();
    expect(ack.data).not.toBeNull();
  });
});
```

### 6.4 CoT Export

```typescript
// tests/e2e/cot-export.spec.ts
// FR-W4-08

test.describe('FR-W4-08-00: CoT Export', () => {
  test('single track export: downloads valid XML', async ({ page }) => {
    await loginAs(page, 'operator');
    await insertTestTrack(supabaseTestClient, { id: 'TRK-EXPORT-001', ... });
    await page.waitForSelector('[data-testid=track-row-TRK-EXPORT-001]');
    await page.click('[data-testid=track-row-TRK-EXPORT-001]');

    // Setup download listener
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid=export-cot-button]'),
    ]);

    expect(download.suggestedFilename()).toMatch(/TRK-EXPORT-001.*\.cot$/);

    const content = await (await download.createReadStream()).text();
    expect(content).toContain('<?xml version="1.0"');
    expect(content).toContain('<event version="2.0"');
    expect(content).toContain('uid="APEX-TRK-EXPORT-001"');
    expect(content).not.toContain('NODE-');  // no node ID in export
    expect(content).not.toContain(session.user.id);  // no user ID in export
  });

  test('Ctrl+E keyboard shortcut: triggers CoT export for selected track', async ({ page }) => {
    await loginAs(page, 'operator');
    await insertAndSelectTrack(page, 'TRK-KBEXPORT-001');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+e'),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.cot$/);
  });

  test('civil_defense role: export button not present', async ({ page }) => {
    await loginAs(page, 'civil_defense');
    await page.goto('/');
    await expect(page.locator('[data-testid=export-cot-button]')).not.toBeVisible();
  });
});
```

### 6.5 Keyboard Shortcuts

```typescript
// tests/e2e/keyboard.spec.ts
// FR-W4-12

test.describe('FR-W4-12-00: Keyboard Shortcuts', () => {
  test('T: switches right panel to Tracks view', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.keyboard.press('t');
    await expect(page.locator('[data-testid=right-panel-tracks]')).toBeVisible();
  });

  test('N: switches right panel to Nodes view', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.keyboard.press('n');
    await expect(page.locator('[data-testid=right-panel-nodes]')).toBeVisible();
  });

  test('A: switches right panel to Alerts view', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.keyboard.press('a');
    await expect(page.locator('[data-testid=right-panel-alerts]')).toBeVisible();
  });

  test('ESC: clears selection and closes modals', async ({ page }) => {
    await loginAs(page, 'operator');
    // Open a modal
    await page.keyboard.press('?');
    await expect(page.locator('[data-testid=shortcut-modal]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid=shortcut-modal]')).not.toBeVisible();
  });

  test('G: toggles globe/2D map mode', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.keyboard.press('g');
    await expect(page.locator('[data-testid=mapbox-2d]')).toBeVisible();
    await page.keyboard.press('g');
    await expect(page.locator('[data-testid=cesium-globe]')).toBeVisible();
  });

  test('?: opens keyboard shortcut reference modal', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.keyboard.press('?');
    await expect(page.locator('[data-testid=shortcut-modal]')).toBeVisible();
    await expect(page.locator('[data-testid=shortcut-modal]')).toContainText('Keyboard Shortcuts');
  });

  test('shortcuts disabled when input is focused', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.focus('[data-testid=track-filter-input]');
    await page.keyboard.press('t');
    // 't' typed in input, not triggering panel switch
    await expect(page.locator('[data-testid=track-filter-input]')).toHaveValue('t');
    await expect(page.locator('[data-testid=right-panel-alerts]')).toBeVisible(); // unchanged
  });
});
```

---

## 7. CESIUMJS MOCK STRATEGY

CesiumJS requires WebGL 2.0. CI runners do not have GPU. Strategy:

```typescript
// tests/__mocks__/cesium.ts
// Vitest mock for CesiumJS

export const Viewer = vi.fn().mockImplementation(() => ({
  entities: {
    add: vi.fn().mockReturnValue({}),
    remove: vi.fn(),
  },
  scene: {
    backgroundColor: null,
    globe: { baseColor: null },
  },
  camera: {
    flyTo: vi.fn(),
  },
  imageryLayers: {
    removeAll: vi.fn(),
    addImageryProvider: vi.fn(),
  },
  destroy: vi.fn(),
}));

export const Cartesian3 = {
  fromDegrees: vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
};
export const Color = {
  fromCssColorString: vi.fn().mockReturnValue({ red: 0, green: 0, blue: 0, alpha: 1 }),
  BLACK: {},
};
export const ConstantPositionProperty = vi.fn();
export const ConstantProperty = vi.fn();
export const LabelStyle = { FILL_AND_OUTLINE: 2 };
export const VerticalOrigin = { BOTTOM: -1 };
export const HorizontalOrigin = { CENTER: 0 };
export const Cartesian2 = vi.fn().mockReturnValue({ x: 0, y: 0 });
// ... etc
```

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    alias: {
      'cesium': path.resolve(__dirname, 'tests/__mocks__/cesium.ts'),
    },
  },
});
```

---

## 8. SUPABASE REALTIME MOCK

```typescript
// tests/__mocks__/supabaseRealtime.ts
// EventEmitter-based mock for Realtime subscriptions

import { EventEmitter } from 'events';

export class MockRealtimeChannel extends EventEmitter {
  on(event: string, filter: any, handler: Function) {
    this.addListener('postgres_changes', (payload: any) => {
      if (payload.eventType === filter.event || filter.event === '*') {
        handler(payload);
      }
    });
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    setTimeout(() => callback?.('SUBSCRIBED'), 0);
    return this;
  }

  unsubscribe() {
    this.removeAllListeners();
  }

  // Test helper: simulate an incoming event
  emit_postgres_change(payload: any) {
    this.emit('postgres_changes', payload);
  }
}

// Usage in tests:
// const mockChannel = new MockRealtimeChannel();
// mockChannel.emit_postgres_change({ eventType: 'INSERT', new: testTrack });
```

---

## 9. COVERAGE TARGETS

```
Metric              Target  Scope
──────────────────────────────────────────────────────
Statements          ≥80%    src/lib, src/stores, src/components
Branches            ≥80%    same
Functions           ≥80%    same
Lines               ≥80%    same

Excluded from coverage:
  - src/app/layout.tsx (Server Component, minimal logic)
  - CesiumGlobeInner.tsx (WebGL, mocked in tests)
  - OpenMCTTimeline.tsx (OpenMCT integration, mocked)
  - next.config.js
  - src/types/ (type definitions only)
```

---

## 10. CI PIPELINE

```yaml
# .github/workflows/test.yml
name: W4 Test Suite

on: [push, pull_request]

jobs:
  unit-and-component:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint src/
      - run: npx vitest run --coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }

  e2e:
    runs-on: ubuntu-latest
    needs: unit-and-component
    env:
      TEST_OPERATOR_EMAIL: ${{ secrets.TEST_OPERATOR_EMAIL }}
      TEST_OPERATOR_PASSWORD: ${{ secrets.TEST_OPERATOR_PASSWORD }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      NATS_TEST_URL: ${{ secrets.NATS_TEST_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium firefox
      - run: npm run build
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

---

*TEST_STRATEGY.md — APEX-SENTINEL W4 — approved 2026-03-24*
