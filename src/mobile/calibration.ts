// APEX-SENTINEL — Calibration State Machine
// FR-W3-11

export type CalibrationStep =
  | 'idle'
  | 'mic_test'
  | 'gps_lock'
  | 'nats_ping'
  | 'test_detection'
  | 'complete'
  | 'failed';

export interface CalibrationResult {
  step: CalibrationStep;
  passed: boolean;
  errorMessage?: string;
}

const STEP_ORDER: CalibrationStep[] = [
  'idle',
  'mic_test',
  'gps_lock',
  'nats_ping',
  'test_detection',
  'complete',
];

export class CalibrationStateMachine {
  private currentStep: CalibrationStep = 'idle';
  private completedSteps: CalibrationStep[] = [];

  getCurrentStep(): CalibrationStep {
    return this.currentStep;
  }

  advance(result: CalibrationResult): CalibrationStep {
    if (!this.canAdvance()) {
      return this.currentStep;
    }

    if (!result.passed) {
      this.currentStep = 'failed';
      return 'failed';
    }

    // Mark the current step as completed (the step that just passed)
    this.completedSteps.push(this.currentStep);

    const currentIndex = STEP_ORDER.indexOf(this.currentStep);
    const nextIndex = currentIndex + 1;

    if (nextIndex < STEP_ORDER.length) {
      this.currentStep = STEP_ORDER[nextIndex];
    }

    return this.currentStep;
  }

  isComplete(): boolean {
    return this.currentStep === 'complete';
  }

  isFailed(): boolean {
    return this.currentStep === 'failed';
  }

  canAdvance(): boolean {
    return this.currentStep !== 'failed' && this.currentStep !== 'complete';
  }

  reset(): void {
    this.currentStep = 'idle';
    this.completedSteps = [];
  }

  getCompletedSteps(): CalibrationStep[] {
    return [...this.completedSteps];
  }
}
