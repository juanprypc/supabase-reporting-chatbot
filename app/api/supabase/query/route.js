import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request) {
  try {
    const { query } = await request.json()
    
    // Use Claude to parse the query
    const queryIntent = await parseQueryWithClaude(query)
    
    // Build Supabase query
    let supabaseQuery = supabase.from(queryIntent.table)
    
    // Apply select
    if (queryIntent.select) {
      supabaseQuery = supabaseQuery.select(queryIntent.select)
    }
    
    // Apply filters
    if (queryIntent.filters) {
      queryIntent.filters.forEach(filter => {
        supabaseQuery = supabaseQuery[filter.operator](filter.column, filter.value)
      })
    }
    
    // Apply ordering
    if (queryIntent.order) {
      supabaseQuery = supabaseQuery.order(queryIntent.order.column, { 
        ascending: queryIntent.order.ascending 
      })
    }
    
    // Apply limit
    if (queryIntent.limit) {
      supabaseQuery = supabaseQuery.limit(queryIntent.limit)
    }
    
    // Execute query
    const { data, error } = await supabaseQuery
    
    if (error) {
      throw error
    }
    
    // Post-process data for grouping
    let processedData = data
    if (queryIntent.groupBy && data.length > 0) {
      const grouped = {}
      data.forEach(item => {
        let key = item[queryIntent.groupBy] || 'Unknown'
        if (queryIntent.groupBy === 'agent_id' && item.agents) {
          key = `${item.agents.first_name} ${item.agents.last_name}`
        }
        grouped[key] = (grouped[key] || 0) + 1
      })
      
      processedData = Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    }
    
    return NextResponse.json({
      success: true,
      data: processedData,
      rawData: data,
      intent: queryIntent,
      count: data.length
    })
    
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

async function parseQueryWithClaude(userQuery) {
  const today = new Date().toISOString().split('T')[0]
  
  const prompt = `You are a SQL query expert for a Supabase database. Convert this natural language query into parameters for Supabase JavaScript client.

Database schema:
1. agents table:
   - agents_id (text, primary key)
   - first_name (text)
   - last_name (text)
   - email_address (text)
   - whatsapp_number_supabase (text)
   - years_of_experience (integer)
   - sign_up_timestamp (date)
   - sales_team_agency_supabase (text)
   - agency_name_supabase (text)

2. inquiries table:
   - inquiry_id (text, primary key)
   - agent_id (text, foreign key to agents.agents_id)
   - property_id (text)
   - inquiry_created_ts (timestamp)
   - source (text)
   - status (text)
   - lost_reason (text)
   - ts_contacted (timestamp)
   - ts_lost_reason (timestamp)
   - ts_won (timestamp)

Today's date: ${today}

User query: "${userQuery}"

Respond with ONLY a valid JSON object with this structure:
{
  "table": "inquiries" or "agents",
  "select": "columns to select (use * for all, or specify columns. For joins use syntax like '*,agents(first_name,last_name)')",
  "filters": [
    {
      "column": "column_name",
      "operator": "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in",
      "value": "value"
    }
  ],
  "order": {
    "column": "column_name",
    "ascending": true | false
  },
  "limit": number or null,
  "groupBy": "column_name" or null,
  "visualization": "table" | "bar" | "pie" | "line" | "metric",
  "explanation": "Human-readable explanation of what this query does"
}

Guidelines:
- For date ranges, use gte and lte filters on inquiry_created_ts
- "last week" means the past 7 days from today
- "this month" means from the 1st of current month
- For grouping queries (by source, by status, by agent), set groupBy field
- For joins with agents table, use select: "*,agents(first_name,last_name)"
- Status values are typically: "Won", "Lost", "Pending", etc.
- Choose appropriate visualization based on query type
- For counting queries, use visualization: "metric"

RESPOND ONLY WITH VALID JSON, NO ADDITIONAL TEXT.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
    
    const responseText = message.content[0].text
    const queryIntent = JSON.parse(responseText)
    
    return queryIntent
  } catch (error) {
    console.error('Claude API Error:', error)
    // Fallback to basic parsing if Claude fails
    return basicParseQuery(userQuery)
  }
}

// Fallback parser in case Claude API fails
function basicParseQuery(query) {
  const lowerQuery = query.toLowerCase()
  const today = new Date()
  const intent = {
    table: 'inquiries',
    select: '*',
    filters: [],
    visualization: 'table',
    explanation: 'Showing data based on your query'
  }
  
  // Determine table
  if (lowerQuery.includes('agent') && !lowerQuery.includes('inquir')) {
    intent.table = 'agents'
  }
  
  // Basic date filtering
  if (lowerQuery.includes('last week')) {
    const lastWeek = new Date()
    lastWeek.setDate(today.getDate() - 7)
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'gte',
      value: lastWeek.toISOString()
    })
  }
  
  return intent
}