import { createClient } from "npm:@supabase/supabase-js@2.107.0";

const allowedOrigin = "https://longbq283.github.io";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};
const reply = (status: number, code?: string) =>
  Response.json(code ? { code } : { invited: true }, { status, headers });

Deno.serve(async (request) => {
  if (request.headers.get("origin") !== allowedOrigin) return reply(403, "42501");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, "OT_INVALID");

  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return reply(401, "OT_INVITE_AUTH");

  const input = await request.json().catch(() => null);
  if (typeof input?.email !== "string" || typeof input?.fullName !== "string" || typeof input?.employeeCode !== "string") {
    return reply(400, "OT_INVALID");
  }
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const employeeCode = input.employeeCode;
  const project = input.project ?? null;
  if (project !== null && (typeof project !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(project))) {
    return reply(400, "OT_INVALID");
  }
  if (email.length > 254 || !/^[^\s@]+@bidv\.com\.vn$/.test(email)
    || fullName.length < 1 || fullName.length > 200 || !/^[0-9]{8}$/.test(employeeCode)) {
    return reply(400, "OT_INVALID");
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(503, "OT_INVITE_CONFIG");

  const auth = { persistSession: false, autoRefreshToken: false };
  const caller = createClient(url, anonKey, {
    auth,
    global: { headers: { Authorization: "Bearer " + match[1] } },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser(match[1]);
  if (identityError || !identity.user) return reply(401, "OT_INVITE_AUTH");

  // Use the caller's token so the database checks the requested scope before any Auth Admin API call.
  const { error: preparationError } = await caller.rpc("ot_prepare_account_activation", {
    p_email: email, p_full_name: fullName, p_employee_code: employeeCode, p_project: project,
  });
  if (preparationError) {
    if (preparationError.code === "42501") return reply(403, "42501");
    if (preparationError.code === "PGRST202") return reply(503, "OT_ACTIVATION_MIGRATION");
    if (preparationError.code === "23505") return reply(409, "23505");
    const knownErrors = ["OT_PROFILE_EXISTS", "OT_ACTIVATION_RESERVED", "OT_PROJECT_INACTIVE", "OT_INVALID"];
    if (knownErrors.includes(preparationError.message)) return reply(400, preparationError.message);
    return reply(500, "OT_ACTIVATION_SETUP");
  }

  // Supabase sends the invitation. The privileged key stays inside the Edge Function.
  const admin = createClient(url, serviceKey, { auth });
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, employee_code: employeeCode },
  });
  if (!inviteError) return reply(200);
  if (inviteError.code === "email_exists" || inviteError.code === "user_already_exists") {
    return reply(409, "OT_INVITE_EXISTING");
  }
  if (inviteError.status === 429) return reply(429, "OT_INVITE_RATE");
  return reply(502, "OT_INVITE_EMAIL");
});
