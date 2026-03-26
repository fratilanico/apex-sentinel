// APEX-SENTINEL — W13 OperatorNotificationRouter
// FR-W13-03 | src/operator/operator-notification-router.ts

import type { AwningAlert } from '../nato/nato-alert-formatter.js';
import { TelegramBotGateway } from './telegram-bot-gateway.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type OperatorRole = 'commander' | 'operator' | 'analyst';

export interface OperatorRecord {
  operatorId: string;
  role: OperatorRole;
  chatId: string;
}

export interface RouteResult {
  notifiedOperatorIds: string[];
  skippedOperatorIds: string[];
}

// ── Role routing rules ───────────────────────────────────────────────────────

const ROUTING_RULES: Record<string, OperatorRole[]> = {
  RED: ['commander', 'operator', 'analyst'],
  YELLOW: ['operator', 'analyst'],
  WHITE: ['commander'],
  INTEL_BRIEF: ['analyst'],
};

// ── OperatorNotificationRouter ───────────────────────────────────────────────

export class OperatorNotificationRouter {
  private readonly operators = new Map<string, OperatorRecord>();
  private readonly gateways = new Map<string, TelegramBotGateway>();
  private readonly botToken: string;

  constructor(config: {
    botToken: string;
    httpClient?: ConstructorParameters<typeof TelegramBotGateway>[0]['httpClient'];
  }) {
    this.botToken = config.botToken;
    // httpClient stored for gateway creation
    this._httpClient = config.httpClient;
  }

  private readonly _httpClient?: ConstructorParameters<typeof TelegramBotGateway>[0]['httpClient'];

  addOperator(operatorId: string, role: OperatorRole, chatId: string): void {
    this.operators.set(operatorId, { operatorId, role, chatId });

    // Create a gateway per chatId
    if (!this.gateways.has(chatId)) {
      this.gateways.set(chatId, new TelegramBotGateway({
        botToken: this.botToken,
        chatId,
        httpClient: this._httpClient,
      }));
    }
  }

  removeOperator(operatorId: string): void {
    this.operators.delete(operatorId);
  }

  /**
   * Routes alert to appropriate operators based on AWNING level.
   * Returns list of operator IDs that were notified.
   */
  async routeAlert(awningAlert: AwningAlert, text: string): Promise<string[]> {
    const targetRoles = ROUTING_RULES[awningAlert.awningLevel] ?? ['commander'];
    return this.deliverToRoles(targetRoles, text, awningAlert.awningLevel === 'RED');
  }

  /**
   * Routes intel brief to analysts only.
   */
  async routeIntelBrief(text: string): Promise<string[]> {
    return this.deliverToRoles(['analyst'], text, false);
  }

  /**
   * Returns all registered operators.
   */
  getOperators(): OperatorRecord[] {
    return Array.from(this.operators.values());
  }

  /**
   * Returns operators matching a given role.
   */
  getOperatorsByRole(role: OperatorRole): OperatorRecord[] {
    return Array.from(this.operators.values()).filter(o => o.role === role);
  }

  private async deliverToRoles(roles: OperatorRole[], text: string, urgent: boolean): Promise<string[]> {
    const notified: string[] = [];

    for (const record of this.operators.values()) {
      if (!roles.includes(record.role)) continue;

      const gateway = this.gateways.get(record.chatId);
      if (!gateway) continue;

      const result = urgent
        ? await gateway.sendAlert(text)
        : await gateway.sendSilent(text);

      if (result.ok) {
        notified.push(record.operatorId);
      }
    }

    return notified;
  }
}
