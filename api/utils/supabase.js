// ===== Supabase 客户端 =====

import { createClient } from '@supabase/supabase-js';

function storageUrl(env, path) {
  const host = env.SUPABASE_URL.replace('https://', '');
  return `https://${host}/storage/v1/object/${path}`;
}

function makeSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function makeSupabaseAnon(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

export { storageUrl, makeSupabase, makeSupabaseAnon };
