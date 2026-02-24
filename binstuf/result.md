# Review: `Plans/Analyze.md`

## Findings (Ordered by Severity)

1. **High**: Feature status can be overconfident because runtime verification is not required.  
   **Evidence**: `Plans/Analyze.md:89`, `Plans/Analyze.md:92`, `Plans/Analyze.md:94`  
   **Why this is a problem**: `Fully implemented` can be assigned from static code presence even when runtime is broken (startup errors, failing dependencies, dead routes, failing tests).  
   **Fix**: Add a mandatory validation step: run available tests/build/startup smoke checks; if execution is not possible, require status `Unverified` instead of `Fully Implemented`.

2. **High**: Evidence requirements are too weak for reproducibility.  
   **Evidence**: `Plans/Analyze.md:54`  
   **Why this is a problem**: `file paths + symbols` still allows vague claims and makes audits hard to verify quickly.  
   **Fix**: Require `path + line number + symbol`, and optionally a short excerpt per major claim.

3. **Medium**: Scope is ambiguous due to undefined `significant file/module`.  
   **Evidence**: `Plans/Analyze.md:100`  
   **Why this is a problem**: Different auditors can exclude different files, causing inconsistent coverage and missed dead code/security hotspots.  
   **Fix**: Define deterministic inclusion rules (for example: all files reachable from entry points, plus config files, scripts, and migration-folder scans for safety checks).

4. **Medium**: Absolute schema freeze has no explicit exception path for schema-caused defects.  
   **Evidence**: `Plans/Analyze.md:36`, `Plans/Analyze.md:38`  
   **Why this is a problem**: If a critical bug is fundamentally schema-driven, the prompt gives no formal blocked/escalation branch beyond generic wording, which can lead to incomplete plans.  
   **Fix**: Add explicit rule: if schema change is the only safe fix, mark as `Schema-Blocked`, provide interim mitigation, rollback, and decision record.

5. **Low**: `Docs only if docs match code` is not operationalized.  
   **Evidence**: `Plans/Analyze.md:89`  
   **Why this is a problem**: Matching criteria are undefined, so docs may be used inconsistently.  
   **Fix**: Define match checks (for example: route names, function signatures, environment variables, and last-modified recency).


IMPORTANT NOTE:

DONT RUN "npm run build" YOURSELF, ALWAYS ASK ME TO RUN IT MANUALLY AFTER THE UPDATES