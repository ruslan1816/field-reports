// ═══════════════════════════════════════════════════════════════════════
//  analyze-drawing — Supabase Edge Function
//  Sends a rendered PDF page image to Claude, returns structured HVAC data.
//
//  Deploy:
//    1. In Supabase Dashboard → Edge Functions → Create a new function
//       named 'analyze-drawing' and paste this file's contents.
//    2. Add secret: Dashboard → Settings → Edge Functions → Secrets
//       → ANTHROPIC_API_KEY = sk-ant-...
//    3. Deploy. Frontend calls it via supabaseClient.functions.invoke().
//
//  Request body:
//    { image_base64: "...", prompt_type: "equipment" | "scope" | "rfi",
//      drawing_no?: string, project_name?: string }
//  Response:
//    { ok: true, model: "...", extracted: {...JSON per prompt...} }
//    { ok: false, error: "..." }
// ═══════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file no-explicit-any

const ANTHROPIC_KEY = (globalThis as any).Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-opus-4-5-20251008";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS: Record<string, string> = {
  equipment: `You are a senior HVAC estimator reviewing a mechanical drawing sheet.
List every piece of equipment you can identify — RTUs, AHUs, VAVs, FCUs, ERVs,
condensers, split systems, exhaust fans, baseboard heaters, dampers, diffusers,
grilles, whatever appears with a tag (RTU-1, EF-3, VAV-2, etc.).

Also read the equipment SCHEDULE table if present — capture each row with its
manufacturer, model number, size / capacity, and weight if listed.

Return STRICT JSON matching this shape (no markdown, no prose):
{
  "equipment_schedule": [
    {"tag": "RTU-1", "count": 1, "manufacturer": "Trane", "model": "YHC120E",
     "capacity": "10 tons", "weight_lb": 1200, "refrigerant": "R-410A",
     "notes": "seen on M-201, north side"}
  ],
  "air_outlets": [
    {"type": "diffuser",       "size": "24x24", "count": 15},
    {"type": "linear diffuser","size": "48\\" long", "count": 8},
    {"type": "VAV box",        "size": "10\\"", "count": 6},
    {"type": "fire/smoke damper", "size": "12x12", "count": 4},
    {"type": "return grille",  "size": "12x8", "count": 3}
  ],
  "refrigerant": "R-410A or R-454B, or null if not stated",
  "confidence": "high | medium | low",
  "notes": "anything worth flagging — unclear tags, low-resolution areas, etc."
}`,

  scope: `You are a senior HVAC estimator hunting for scope items the mechanical
contractor is on the hook for. Read every General Note, Keyed Note, and any
callouts on the drawing. Do NOT include HVAC scope that a competent bidder
would already know — only flag items that are:
  (a) explicitly assigned to the mechanical/HVAC contractor by note,
  (b) commonly missed or often excluded by vendor quotes,
  (c) coordination items with another trade the mechanical must own.

Return STRICT JSON:
{
  "scope_items": [
    {"source": "GN-10", "description": "Contractor to provide in-duct smoke detectors",
     "typical_gap": true, "notes": "vendor equipment quotes routinely exclude this"},
    {"source": "M-501 Key Note 3", "description": "Wet-tap to existing CWS", "typical_gap": false}
  ],
  "exclusion_flags": [
    {"item": "controls / BMS", "reason": "no BMS quote visible in schedule"}
  ],
  "confidence": "high | medium | low"
}`,

  rfi: `You are a senior HVAC estimator writing draft RFIs for a bid due tomorrow.
Read the drawing critically. Return ONE RFI per real ambiguity — do NOT invent
RFIs for standard drawings. Return STRICT JSON:
{
  "rfis": [
    {"topic": "Damper counts", "question": "Schedule shows 12 fire/smoke dampers but plan shows 15 — please confirm which count is correct.", "sheet_ref": "M-201, M-501", "priority": "high|medium|low"}
  ],
  "confidence": "high | medium | low"
}`,
};

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ ok: false, error: "POST only" }),
      { status: 405, headers: { ...CORS, "content-type": "application/json" } });

  if (!ANTHROPIC_KEY)
    return new Response(JSON.stringify({
      ok: false,
      error: "ANTHROPIC_API_KEY not set. Add it in Dashboard → Settings → Edge Functions → Secrets."
    }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });

  let body: any;
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: "invalid JSON body" }); }

  const image_base64 = String(body.image_base64 || "");
  const prompt_type  = String(body.prompt_type || "equipment");
  const project_name = String(body.project_name || "");
  const drawing_no   = String(body.drawing_no   || "");

  if (!image_base64) return json(400, { ok: false, error: "image_base64 required" });
  if (!PROMPTS[prompt_type])
    return json(400, { ok: false, error: "prompt_type must be one of: " + Object.keys(PROMPTS).join(", ") });

  const contextLine = project_name || drawing_no
    ? `Context — project: ${project_name || "?"}, sheet: ${drawing_no || "?"}.\n\n`
    : "";
  const prompt = contextLine + PROMPTS[prompt_type];

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "content-type":     "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key":         ANTHROPIC_KEY,
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 4096,
        messages: [{
          role:    "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image_base64 } },
            { type: "text",  text: prompt }
          ]
        }]
      })
    });

    const data = await resp.json();
    if (!resp.ok)
      return json(resp.status, { ok: false, error: data?.error?.message || ("Anthropic " + resp.status) });

    // Claude returns { content: [{ type: 'text', text: '{...json...}' }, ...] }
    const txt = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    let extracted: any = null;
    try { extracted = JSON.parse(txt); }
    catch {
      // Strip common wrappers
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) { try { extracted = JSON.parse(m[0]); } catch { /* leave null */ } }
    }
    return json(200, {
      ok: true,
      model: data.model || MODEL,
      raw_text:  extracted ? undefined : txt,
      extracted: extracted,
      usage:     data.usage,
    });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

(globalThis as any).Deno.serve(handle);
