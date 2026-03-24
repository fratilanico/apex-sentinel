// APEX-SENTINEL — Alert Store
// W4 C2 Dashboard — FR-W4-03

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DashboardAlert {
  alertId: string;
  trackId: string;
  threatClass: string;
  severity: AlertSeverity | string;
  message: string;
  lat: number;
  lon: number;
  confidence: number;
  receivedAt: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export class AlertStore {
  private alerts: Map<string, DashboardAlert> = new Map();

  addAlert(alert: DashboardAlert): void {
    this.alerts.set(alert.alertId, { ...alert });
  }

  acknowledgeAlert(alertId: string, operatorId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    alert.acknowledgedBy = operatorId;
    return true;
  }

  getUnacknowledged(): DashboardAlert[] {
    return Array.from(this.alerts.values()).filter((a) => !a.acknowledged);
  }

  getAlertsByTrack(trackId: string): DashboardAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.trackId === trackId);
  }

  getLatestAlert(): DashboardAlert | null {
    const all = Array.from(this.alerts.values());
    if (all.length === 0) return null;
    return all.reduce((latest, a) => (a.receivedAt > latest.receivedAt ? a : latest));
  }

  getCriticalCount(): number {
    return Array.from(this.alerts.values()).filter(
      (a) => a.severity === 'critical' && !a.acknowledged,
    ).length;
  }

  classifyThreat(threatClass: string, confidence: number): AlertSeverity {
    if (threatClass === 'unknown') return 'low';
    if (threatClass === 'shahed' && confidence >= 0.85) return 'critical';
    if (threatClass === 'fpv_drone' && confidence >= 0.90) return 'critical';
    if (confidence >= 0.70) return 'high';
    if (confidence >= 0.50) return 'medium';
    return 'low';
  }

  count(): number {
    return this.alerts.size;
  }

  clear(): void {
    this.alerts.clear();
  }
}
