// APEX-SENTINEL — Jammer Activation
// FR-W7-07 | src/output/jammer-activation.ts
//
// Controls RF jamming channels based on drone class.
// Channel map: fpv → 900MHz ELRS, shahed-136/131/gerbera → 1575MHz GPS.
// False-positive suppression: activate({isFalsePositive: true}) is silently ignored.
//
// INDIGO spec: FPV drones use ELRS 900MHz, Shaheds use GPS 1575.42MHz navigation.

export interface JammerConfig {
  channels: Record<string, string>; // droneClass → frequency string
}

export interface ActivateParams {
  droneClass: string;
  isFalsePositive: boolean;
}

export interface JammerActivationEvent {
  droneClass: string;
  channel: string;
  timestampMs: number;
}

export interface JammerDeactivationEvent {
  timestampMs: number;
}

interface ActivationLogEntry {
  droneClass: string;
  channel: string;
  timestampMs: number;
}

type JammerEventName = 'activation' | 'deactivation';
type ActivationListener = (event: JammerActivationEvent) => void;
type DeactivationListener = (event: JammerDeactivationEvent) => void;

export class JammerActivation {
  private readonly config: JammerConfig;
  private active = false;
  private readonly activationListeners: ActivationListener[] = [];
  private readonly deactivationListeners: DeactivationListener[] = [];
  private readonly _activationLog: ActivationLogEntry[] = [];

  constructor(config: JammerConfig) {
    this.config = config;
  }

  /** Get the jamming channel configured for the given drone class. */
  getChannel(droneClass: string): string | null {
    return this.config.channels[droneClass] ?? null;
  }

  /** Activate jamming for the given drone class. If isFalsePositive, silently no-ops. */
  activate(params: ActivateParams): void {
    if (params.isFalsePositive) return;

    const channel = this.getChannel(params.droneClass);
    if (!channel) return; // No channel configured — no-op

    const event: JammerActivationEvent = {
      droneClass: params.droneClass,
      channel,
      timestampMs: Date.now(),
    };
    this.active = true;
    this._activationLog.push({ droneClass: params.droneClass, channel, timestampMs: event.timestampMs });
    for (const l of this.activationListeners) l(event);
  }

  /** Deactivate all jamming. Emits deactivation event. */
  deactivate(): void {
    this.active = false;
    const event: JammerDeactivationEvent = { timestampMs: Date.now() };
    for (const l of this.deactivationListeners) l(event);
  }

  isActive(): boolean {
    return this.active;
  }

  get activationLog(): ReadonlyArray<ActivationLogEntry> {
    return this._activationLog;
  }

  on(event: 'activation', listener: ActivationListener): void;
  on(event: 'deactivation', listener: DeactivationListener): void;
  on(event: JammerEventName, listener: ActivationListener | DeactivationListener): void {
    if (event === 'activation') {
      this.activationListeners.push(listener as ActivationListener);
    } else {
      this.deactivationListeners.push(listener as DeactivationListener);
    }
  }
}
