import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pgPool } from '@/lib/db';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET() {
  const tests = {
    supabase: false,
    postgres: false,
    openai: !!process.env.OPENAI_API_KEY,
    env: {
      hasDbUrl: !!process.env.SUPABASE_DB_URL,
      supabaseUrl,
      anonKeySet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    errors: []
  };

  // Supabase JS client test
  try {
    const { data, error } = await supabase.from('inquiries').select('*').limit(1);
    if (!error && data) tests.supabase = true;
    else if (error) tests.errors.push({ supabase: error.message });
  } catch (e) {
    tests.errors.push({ supabase_exception: e.message });
  }

  // Raw SQL test via pgPool
  try {
    const res = await pgPool.query('SELECT 1 as ok');
    if (res.rows && res.rows[0]?.ok === 1) {
      tests.postgres = true;
    } else {
      tests.errors.push({ postgres_unexpected: res.rows });
    }
  } catch (e) {
    tests.errors.push({ postgres_error: e.message });
  }

  return NextResponse.json(tests);
}
