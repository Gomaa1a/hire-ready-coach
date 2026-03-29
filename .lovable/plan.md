

## Security Audit: Weak Points & Fixes

### Critical Vulnerability: No Authentication on Edge Functions

**Every single edge function** in this project has the same flaw: they accept `interviewId` and/or `userId` from the request body but **never verify who is calling**. There is no `Authorization` header check, no `getClaims()`, no identity validation whatsoever.

This means **anyone with your project URL can**:
- Generate reports for any user's interview
- Get OpenAI Realtime session tokens for any interview
- Read any user's interview data, messages, and profile
- Trigger the negotiation simulator for any interview
- Access the pre-interview coach for any session
- Get platform stats (minor, but still unprotected)

All functions use `SUPABASE_SERVICE_ROLE_KEY` (which bypasses RLS entirely), so the database policies you carefully set up are **completely bypassed** by the edge functions.

### Other Weak Points

1. **No input validation** — Functions trust raw `req.json()` without schema validation (no Zod, no type checks beyond basic null checks)
2. **`userId` passed from client** — `generate-report` accepts `userId` in the request body instead of extracting it from the JWT. An attacker can pass any user ID.
3. **CORS allows all origins** — `Access-Control-Allow-Origin: *` means any website can call your functions
4. **No rate limiting** — Functions can be called unlimited times, burning your OpenAI/ElevenLabs API credits
5. **Service role key used everywhere** — Even for simple reads that could use the caller's own auth token + RLS

### Fix Plan

**For all 10 edge functions** (`realtime-session-token`, `generate-report`, `generate-question-bank`, `interview-orchestrator`, `pre-interview-coach`, `narrate-report`, `negotiation-session-token`, `score-negotiation`, `elevenlabs-token`, `elevenlabs-scribe-token`):

Add this authentication block at the top of each function:

```typescript
// 1. Extract and validate the caller's identity
const authHeader = req.headers.get("Authorization");
if (!authHeader?.startsWith("Bearer ")) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), 
    { status: 401, headers: corsHeaders });
}

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
});

const token = authHeader.replace("Bearer ", "");
const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
if (claimsErr || !claims?.claims) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), 
    { status: 401, headers: corsHeaders });
}

const callerUserId = claims.claims.sub;

// 2. Use callerUserId instead of trusting req.body.userId
// 3. Verify caller owns the interviewId before proceeding
```

**Specific changes per function:**

| Function | Fix |
|----------|-----|
| `realtime-session-token` | Verify `interview.user_id === callerUserId` before issuing OpenAI token |
| `generate-report` | Remove `userId` from request body, use `callerUserId` from JWT instead |
| `generate-question-bank` | Verify caller owns the interview |
| `interview-orchestrator` | Verify caller owns the interview |
| `pre-interview-coach` | Verify caller owns the interview |
| `narrate-report` | Verify caller owns the interview |
| `negotiation-session-token` | Verify caller owns the interview |
| `score-negotiation` | Verify caller owns the interview (or negotiation session) |
| `elevenlabs-token` | Verify caller owns the interview |
| `elevenlabs-scribe-token` | Add auth check (currently has zero validation) |
| `get-platform-stats` | Keep public (no auth needed) but add basic rate-limit header |

**Input validation** — Add Zod schema validation to each function:
```typescript
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const schema = z.object({
  interviewId: z.string().uuid(),
});
const parsed = schema.safeParse(await req.json());
if (!parsed.success) {
  return new Response(JSON.stringify({ error: "Invalid input" }), 
    { status: 400, headers: corsHeaders });
}
```

**Frontend update** — The `supabase.functions.invoke()` calls already send the auth header automatically, so no frontend changes needed for authentication. Only `generate-report` needs a small change to stop sending `userId` in the body.

### Changes Summary

| File | Change |
|------|--------|
| All 10 edge functions | Add JWT validation + ownership check + Zod input validation |
| `supabase/functions/generate-report/index.ts` | Use caller's JWT `sub` instead of `req.body.userId` |
| `src/pages/Report.tsx` (or wherever generate-report is called) | Remove `userId` from the request body |
| `get-platform-stats` | Keep public, no auth needed |

No database changes required — the RLS policies are already correct, the problem is that edge functions bypass them entirely by using the service role key without verifying the caller first.

