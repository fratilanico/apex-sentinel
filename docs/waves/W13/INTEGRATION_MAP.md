# W13 INTEGRATION MAP

## Upstream Integrations
- **W10 AwningIntegrationPipeline** → emits `awning.alert` on NATS with AwningAlert payload
- **W10 NatoAlertFormatter** → provides AwningAlert type definition
- **W10 Stage35TrajectoryPredictor** → AwningAlert.trajectory (TrajectoryPrediction[])
- **W10 StageTransitionAudit** → /awning command reads last 10 transitions
- **W11 IntelligencePipelineOrchestrator** → emits `intel.brief` on NATS

## Downstream Integrations
- **Telegram Bot API** → `https://api.telegram.org/bot{TOKEN}/sendMessage`
- **Telegram Webhook** → incoming commands from operators

## Type Imports
```typescript
// From W10
import type { AwningAlert } from '../nato/nato-alert-formatter.js';
import type { TrajectoryPrediction } from '../nato/stage35-trajectory-predictor.js';
import { StageTransitionAudit } from '../nato/stage-transition-audit.js';

// From W11
import type { IntelligencePack } from '../intel/intelligence-pack-builder.js';
```

## NATS Subjects
- `awning.alert` — AwningAlert JSON
- `intel.brief` — IntelligencePack JSON (hourly)

## No Database Integration in W13
All state is in-memory. W14 will add Supabase persistence.
