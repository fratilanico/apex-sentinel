# APEX-SENTINEL W17 — HANDOFF

## Handoff to: Demo operator / next session

### What W17 delivers

The `src/demo/` module is a complete presentation layer. To use it:

```typescript
import { DemoApiExtensions } from './src/demo/demo-api-extensions.js';
import { FinalSystemVerification } from './src/demo/final-system-verification.js';
import { JudgePresentationPackage } from './src/demo/judge-presentation-package.js';

// Pre-demo GO check
const verifier = new FinalSystemVerification();
const report = await verifier.verifySystem();
const decision = verifier.getGoNoGo(report);
console.log(decision.verdict); // GO or NO_GO

// Mount demo API on existing HTTP server
const demoApi = new DemoApiExtensions();
// In your request handler:
if (demoApi.handles(url, method)) {
  await demoApi.handle(req, res);
}

// Generate judge package
const pkg = new JudgePresentationPackage();
const submission = pkg.generatePackage();
console.log(pkg.generateTelegramBrief());
```

### Known limitations

1. **Benchmark caching**: `GET /demo/benchmark` caches after first run. To re-run, create new `DemoApiExtensions` instance.
2. **Coverage map**: Only 3 demo nodes configured in NodeHealthAggregator. For full Romania coverage, inject real node positions.
3. **Scenario speed**: Scenarios run at 10x speed in API (`speedMultiplier=10`). For real-time demo, reduce to `speedMultiplier=1`.
4. **Telegram check**: `telegram_gateway_reachable` returns WARN (not FAIL) if TELEGRAM_BOT_TOKEN not set.

### Files to know

- `src/demo/extended-demo-scenario-engine.ts` — add new scenarios here
- `src/demo/eudis-compliance-scorecard.ts` — update evidence as new FRs land
- `src/demo/wave-manifest-generator.ts` — update WAVES and FR_REGISTRY for W18+

### Next wave (W18) entry point

Start with:
```bash
bash wave-formation.sh init W18
```

W18 priorities (from MEMORY.md):
1. 16kHz pipeline adoption
2. Gerbera + Shahed-131 + Shahed-238 profiles
3. TerminalPhaseDetector real coordinate injection
4. Wild Hornets live dataset integration
