// APEX-SENTINEL — W10 NatoAlertFormatter
// FR-W10-05 | src/nato/nato-alert-formatter.ts

import type { AwningLevel } from './awning-level-publisher.js';
import type { StageResult, Stage } from './stage-classifier.js';
import type { TrajectoryPrediction } from './stage35-trajectory-predictor.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AwningAlert {
  alertId: string;
  awningLevel: AwningLevel;
  stage: Stage | null;
  droneType: string;
  trajectory?: TrajectoryPrediction[];
  ts: string;
  summary: string;
}

// ── NatoAlertFormatter ───────────────────────────────────────────────────────

export class NatoAlertFormatter {
  private seq = 0;

  /**
   * Formats a structured AWNING alert.
   * Alert ID: AWNING-{YYYYMMDD}-{seq:04d}
   */
  format(
    level: AwningLevel,
    stageResult: StageResult,
    droneType: string,
    trajectory?: TrajectoryPrediction[],
  ): AwningAlert {
    this.seq++;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const alertId = `AWNING-${dateStr}-${String(this.seq).padStart(4, '0')}`;
    const ts = now.toISOString();

    const alert: AwningAlert = {
      alertId,
      awningLevel: level,
      stage: stageResult.stage,
      droneType,
      ts,
      summary: '',
    };

    if (trajectory && trajectory.length > 0) {
      alert.trajectory = trajectory;
    }

    alert.summary = this.buildSummary(alert);
    return alert;
  }

  /**
   * Builds a human-readable Telegram summary string.
   */
  formatSummary(alert: AwningAlert): string {
    return this.buildSummary(alert);
  }

  /**
   * Resets the sequence counter (for testing).
   */
  reset(): void {
    this.seq = 0;
  }

  private buildSummary(alert: AwningAlert): string {
    const parts: string[] = [
      `AWNING ${alert.awningLevel}`,
      `Stage ${alert.stage ?? '?'}`,
      alert.droneType,
    ];

    if (alert.trajectory && alert.trajectory.length > 0) {
      const nearest = alert.trajectory[0];
      const latStr = nearest.lat.toFixed(3);
      const lonStr = nearest.lon.toFixed(3);
      const r = Math.round(nearest.confidenceRadius_m);
      parts.push(`ETA ${nearest.tSeconds}s, impact zone ${latStr},${lonStr} ±${r}m`);
    }

    return parts.join(' | ');
  }
}
