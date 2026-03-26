# W16 DATABASE SCHEMA

No new Supabase migrations required for W16. All state is in-process:
- Boot manifest: in-memory (exported as JSON on demand)
- Performance ring buffers: in-memory (1000 samples per component)
- Health scores: in-memory + NATS `system.health` publish
- Deployment manifests: written to local filesystem as `deployment-manifest.json`

## Deployment Manifest Schema (JSON file)
```json
{
  "version": "string (semver)",
  "ts": "string (ISO-8601)",
  "files": [
    {
      "path": "string (relative path)",
      "sha256": "string (hex)"
    }
  ],
  "totalFiles": "number"
}
```

## NATS Subject: system.health
```json
{
  "score": "number (0-100)",
  "components": [
    {
      "name": "string",
      "status": "online|degraded|offline",
      "detail": "string?"
    }
  ],
  "degradations": ["string"],
  "ts": "number (epoch ms)"
}
```
