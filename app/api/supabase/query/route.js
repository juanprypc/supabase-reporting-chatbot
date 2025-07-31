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
   - agents_id (text, PRIMARY KEY) - unique agent identifier
   - first_name (text)
   - last_name (text)
   - email_address (text)
   - whatsapp_number_supabase (text)
   - years_of_experience (integer)
   - sign_up_timestamp (date)
   - sales_team_agency_supabase (text) - team name like "Team-A"
   - agency_name_supabase (text) - agency name like "Agency A"

2. inquiries table:
   - inquiry_id (text, PRIMARY KEY) - format like "P1I-25-00001"
   - agent_id (text, FOREIGN KEY references agents.agents_id)
   - property_id (text) - format like "PROP-25-00813"
   - inquiry_created_ts (timestamp) - when inquiry was created
   - source (text) - values include "PRYPCO One", "Campaign Handover", etc.
   - status (text) - values: "New", "Pending", "Contacted", "Won", "Lost", or null
   - lost_reason (text) - values: "Not interested", "Unresponsive", "Duplicate", etc.
   - ts_contacted (timestamp) - when agent first contacted the inquiry
   - ts_lost_reason (timestamp) - when inquiry was marked as lost
   - ts_won (timestamp) - when inquiry was won/closed successfully
   - new_viewings (text) - comma-separated viewing IDs like "VI-25-00113,VI-25-00114"

IMPORTANT SQL PATTERNS TO FOLLOW:
1. For "this month" queries: WHERE ts_won >= DATE_TRUNC('month', CURRENT_DATE)
2. For "last X days": WHERE inquiry_created_ts >= CURRENT_DATE - INTERVAL 'X days'
3. For win rate calculations: COUNT(*) FILTER (WHERE status='Won')::numeric / NULLIF(COUNT(*),0)
4. For time calculations: EXTRACT(EPOCH FROM (ts_contacted - inquiry_created_ts)) / 3600 for hours
5. For agent names: WHERE first_name = 'X' AND last_name = 'Y'
6. For rolling windows: Use window functions with ROWS BETWEEN X PRECEDING AND CURRENT ROW
7. For median: Use PERCENTILE_CONT(0.5) WITHIN GROUP
8. Always use single quotes for string literals in SQL

Users may supply parameters like <PROPERTY_ID>=PROP-25-00111
Replace <PROPERTY_ID> with the actual value in the SQL.

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

COMMON QUERY EXAMPLES:
1. "Which agents closed the most won deals this month?"
   → SELECT with JOIN, WHERE status='Won' AND ts_won >= DATE_TRUNC('month', CURRENT_DATE)

2. "Show rolling 7-day win rate trend" (for last 30 days)
   → WITH daily_data AS (SELECT DATE(inquiry_created_ts) as day, status FROM inquiries WHERE inquiry_created_ts >= CURRENT_DATE - INTERVAL '30 days')
     Then use window functions on the aggregated daily data

3. "Inquiries from July" (assumes current year unless specified)
   → WHERE inquiry_created_ts >= DATE_TRUNC('month', CONCAT(EXTRACT(YEAR FROM CURRENT_DATE)::text, '-07-01')::date)
     AND inquiry_created_ts < DATE_TRUNC('month', CONCAT(EXTRACT(YEAR FROM CURRENT_DATE)::text, '-07-01')::date) + INTERVAL '1 month'

4. "This month" vs "Last month"
   → This month: WHERE inquiry_created_ts >= DATE_TRUNC('month', CURRENT_DATE)
   → Last month: WHERE inquiry_created_ts >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
                 AND inquiry_created_ts < DATE_TRUNC('month', CURRENT_DATE)

5. "How many viewings this month?"
   → For counting comma-separated values: 
     SELECT SUM(CASE WHEN new_viewings IS NOT NULL AND new_viewings != '' 
                     THEN array_length(string_to_array(new_viewings, ','), 1) 
                     ELSE 0 END) as total_viewings

6. "Win rate by source/agent/team"
   → COUNT(*) FILTER (WHERE status='Won')::numeric / NULLIF(COUNT(*),0) AS win_rate

7. "Property with most inquiries"
   → GROUP BY property_id, ORDER BY COUNT(*) DESC LIMIT 1

8. Follow-up queries like "and this month?" or "from the previous list"
   → Return clear error message explaining the query needs to be self-contained

Rules:
• Builder mode ONLY when: single table, no join, no window, ≤1 groupBy.
• Otherwise choose SQL mode.
• Always append "LIMIT 10000" to SQL if user didn't request a limit.
• Never output INSERT/UPDATE/DELETE/CREATE/ALTER statements – read‑only.
• Never wrap JSON in markdown fences.
`;

/* ---------- 2. Helpers ---------- */
async function gptAnalyse(question) {
  try {
    const { choices } = await openai.chat.completions.create({
      model: 'gpt-4o',  // Using gpt-4o for better SQL generation
      temperature: 0,
      max_tokens: 1500,  // Increased for complex queries
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question }
      ]
    });
    
    const content = choices[0].message.content.trim()
      .replace(/^```json\s*/i, '').replace(/```$/i, '');
    
    // Handle cases where GPT returns explanation instead of JSON
    if (!content.startsWith('{')) {
      // If it's a follow-up query that can't be handled
      if (content.toLowerCase().includes('previous') || content.toLowerCase().includes('follow-up')) {
        return {
          mode: 'error',
          error: 'Please provide a complete query. I cannot reference previous results.'
        };
      }
      throw new Error('Invalid response format from AI');
    }
    
    return JSON.parse(content);
  } catch (error) {
    console.error('GPT Analysis Error:', error);
    throw new Error('Failed to analyze query: ' + error.message);
  }
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

    /* ----------  Error handling  ---------- */
    if (intent.mode === 'error') {
      return NextResponse.json({ success: false, error: intent.error }, { status: 400 });
    }

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
