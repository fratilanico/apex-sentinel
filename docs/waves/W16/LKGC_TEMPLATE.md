# W16 LKGC TEMPLATE (Last Known Good Commit)

## To record LKGC after wave:complete
```bash
git rev-parse HEAD > docs/waves/W16/LKGC.sha
echo "LKGC recorded: $(cat docs/waves/W16/LKGC.sha)"
```

## LKGC criteria
- All tests pass (p2 suite GREEN)
- TypeScript strict mode passes (tsc --noEmit)
- wave-formation.sh complete W16 executed

## LKGC SHA
(recorded after wave:complete)

## Rollback procedure
```bash
LKGC=$(cat docs/waves/W16/LKGC.sha)
git checkout $LKGC -- src/system/
git commit -m "rollback: revert src/system to W16 LKGC $LKGC"
```
