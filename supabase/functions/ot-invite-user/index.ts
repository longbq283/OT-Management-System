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

  // Use the caller's token so the database enforces system-admin access and audits the action.
  const { error: preparationError } = await caller.rpc("ot_save_user_invitation", {
    p_email: email, p_full_name: fullName, p_employee_code: employeeCode, p_active: true,
  });
  if (preparationError) {
    if (preparationError.code === "42501") return reply(403, "42501");
    if (preparationError.code === "PGRST202") return reply(503, "OT_USER_MIGRATION");
    return reply(400, preparationError.code === "23505" ? "23505" : preparationError.message === "OT_PROFILE_EXISTS"
      ? "OT_PROFILE_EXISTS" : "OT_INVALID");
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
