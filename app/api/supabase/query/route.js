import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { pgPool } from '@/lib/db';
import OpenAI from 'openai';
export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------- 1. GPT‑4 prompt ---------- */
const systemPrompt = `
You are a staff data‑scientist with full SQL access to two tables.

TABLE SCHEMAS:
1. agents table:
   - agents_id (text, PRIMARY KEY)
   - first_name (text)
   - last_name (text)
   - email_address (text)
   - whatsapp_number_supabase (text)
   - years_of_experience (integer)
   - sign_up_timestamp (date)
   - sales_team_agency_supabase (text)
   - agency_name_supabase (text)

2. inquiries table:
   - inquiry_id (text, PRIMARY KEY)
   - agent_id (text, FOREIGN KEY references agents.agents_id)
   - property_id (text)
   - inquiry_created_ts (timestamp) - when the inquiry was created
   - source (text)
   - status (text) - can be null, "Won", "Lost", etc.
   - lost_reason (text)
   - ts_contacted (timestamp)
   - ts_lost_reason (timestamp)
   - ts_won (timestamp) - when the inquiry was won/closed
   - new_viewings (text)

Users may also supply "parameters" e.g.
   <PROPERTY_ID>=PROP-25-00111
Use them to replace placeholders in the query.

Return **valid JSON only** in one of two shapes:

### Builder mode  (simple)
{
  "mode":"builder",
  "table":"agents"|"inquiries",
  "select":"* | column list | aggregates",
  "filters":[{ "column":"", "operator":"", "value":"" }],
  "groupBy": null | "col",
  "order": null | { "column":"", "ascending":true|false },
  "limit": null | 100,
  "visualization":"table"|"bar"|"pie"|"line"|"metric",
  "explanation":"text"
}

### SQL mode  (advanced)
{
  "mode":"sql",
  "sql":"WITH ... SELECT ...",           // runnable Postgres SQL
  "visualization":"table"|"bar"|"pie"|"line"|"metric"|"histogram"|"pivot",
  "explanation":"text",
  "labels": { "x":"", "y":"" }          // optional axis / legend labels
}

Rules:
• Builder mode ONLY when: single table, no join, no window, ≤1 groupBy.
• Otherwise choose SQL mode.
• Always append “LIMIT 10000” to SQL if user didn’t request a limit.
• Never output INSERT/UPDATE/DELETE/CREATE/ALTER statements – read‑only.
• Never wrap JSON in markdown fences.
`;

/* ---------- 2. Helpers ---------- */
async function gptAnalyse(question) {
  const { choices } = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 900,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: question }
    ]
  });
  return JSON.parse(
    choices[0].message.content.trim()
      .replace(/^```json\s*/i, '').replace(/```$/i, '')
  );
}

function applyFilters(sbq, filters = []) {
  return filters.reduce((q, f) => {
    const ops = {
      eq: 'eq', neq: 'neq', gt: 'gt', gte: 'gte',
      lt: 'lt', lte: 'lte', like: 'like', ilike: 'ilike',
      in: 'in', is: 'is', contains: 'contains', containedBy: 'containedBy',
    };
    if (f.operator === 'between') {
      return q.gte(f.column, f.value[0]).lte(f.column, f.value[1]);
    }
    if (f.operator === 'or') return q.or(f.value);        // "status.eq.Won,status.eq.Lost"
    if (!ops[f.operator]) throw Error(`Unsupported op ${f.operator}`);
    return q[ops[f.operator]](f.column, f.value);
  }, sbq);
}

function sqlIsSafe(sql) {
  return !/;\s*(insert|update|delete|create|alter|drop)\b/i.test(sql);
}

/* ---------- 3. Handler ---------- */
export async function POST(req) {
  try {
    const { query, parameters = '' } = await req.json();   // parameters optional

    /* -- 3.1 replace <PLACEHOLDERS>=value in the user string for GPT’s context -- */
    const enriched = parameters
      ? `${parameters}\n\n${query}`
      : query;

    const intent = await gptAnalyse(enriched);

    /* ----------  Builder path  ---------- */
    if (intent.mode === 'builder') {
      let sbq = supabase.from(intent.table).select(intent.select);

      sbq = applyFilters(sbq, intent.filters);
      if (intent.order) sbq = sbq.order(intent.order.column, { ascending: intent.order.ascending });
      if (intent.limit) sbq = sbq.limit(intent.limit);

      const { data: rows, error } = await sbq;
      if (error) throw error;

      let data = rows;
      if (intent.groupBy) {
        const grouped = {};
        rows.forEach(r => {
          const key = r[intent.groupBy] ?? 'Unknown';
          grouped[key] = (grouped[key] || 0) + 1;
        });
        data = Object.entries(grouped).map(([name, value]) => ({ name, value }));
      }

      return NextResponse.json({ success: true, count: rows.length, data, rawData: rows, intent });
    }

    /* ----------  SQL path  ---------- */
    if (intent.mode === 'sql') {
      if (!sqlIsSafe(intent.sql)) throw Error('Only read‑only SQL is permitted');

      // guarantee LIMIT 10000 unless user already put a limit
      const sqlFinal = /limit\s+\d+/i.test(intent.sql)
        ? intent.sql
        : `${intent.sql.trim().replace(/;$/, '')} LIMIT 10000`;

      const { rows } = await pgPool.query(sqlFinal);

      return NextResponse.json({
        success: true,
        count: rows.length,
        data: rows,
        rawData: rows,
        intent,
      });
    }

    throw Error('intent.mode must be "builder" or "sql"');
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
