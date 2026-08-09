# analyze-drawing — Supabase Edge Function

Sends a rendered PDF page image to Claude with a HVAC-specific prompt,
returns structured JSON (equipment schedule, air outlets counts, scope
items pulled from general/keyed notes, RFI drafts).

## One-time setup

### 1. Get an Anthropic API key

- Go to https://console.anthropic.com/
- Settings → API Keys → Create Key
- Copy the `sk-ant-…` value
- Fund the account with a small starter balance (Settings → Billing).
  Rough cost per drawing analysis: **$0.05–$0.15** depending on page
  size and prompt type.

### 2. Add the key as a Supabase secret

Dashboard → Project Settings → Edge Functions → Secrets → **Add new secret**
- Name: `ANTHROPIC_API_KEY`
- Value: `sk-ant-…` (paste)
- Save.

### 3. Deploy the function

**Option A — via Dashboard (fastest, no CLI needed):**
1. Dashboard → Edge Functions → Deploy a new function
2. Name: `analyze-drawing`
3. Paste the entire contents of `index.ts` from this folder
4. Deploy

**Option B — via Supabase CLI (if installed):**
```bash
cd supabase/functions/analyze-drawing
supabase functions deploy analyze-drawing --project-ref vrscvnebznmomkdlhooi
```

### 4. Verify

From the frontend, on the takeoff page you'll see a **🤖 Analyze page**
button. Click it after loading a drawing. If the button says "Function
not deployed", the deploy step didn't take.

## What it returns

Three prompt modes, one call each:

| `prompt_type` | Returns |
|---|---|
| `equipment` | Equipment schedule (tag, mfr, model, weight, refrigerant) + air outlets counts by type |
| `scope`     | Scope items assigned to mechanical by note, plus exclusion flags |
| `rfi`       | Draft RFIs for real ambiguities on the sheet |

All three enforce STRICT JSON (no markdown, no prose) so the frontend
just parses the string and renders.

## Cost control

- Each call is one page at a time. Big drawing sets → run only sheets
  that matter (M-101, M-201, M-501 typically).
- Model = `claude-opus-4-5-20251008` (top-tier). Change to `claude-sonnet-4-5-…`
  in `index.ts` for ~3× cheaper if extraction quality is still good.
- `max_tokens: 4096` caps each response.
