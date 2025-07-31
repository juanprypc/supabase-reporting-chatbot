import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request) {
  try {
    const { query } = await request.json()
    
    console.log('Received query:', query)
    
    // Use Claude to parse the query
    const queryIntent = await parseQueryWithClaude(query)
    
    console.log('Query intent from Claude:', JSON.stringify(queryIntent, null, 2))
    
    // Build Supabase query
    let supabaseQuery = supabase.from(queryIntent.table)
    
    // Apply select
    if (queryIntent.select) {
      supabaseQuery = supabaseQuery.select(queryIntent.select)
    }
    
    // Apply filters
    if (queryIntent.filters && queryIntent.filters.length > 0) {
      queryIntent.filters.forEach(filter => {
        console.log(`Applying filter: ${filter.column} ${filter.operator} ${filter.value}`)
        
        // Handle different operators
        switch(filter.operator) {
          case 'eq':
            supabaseQuery = supabaseQuery.eq(filter.column, filter.value)
            break
          case 'neq':
            supabaseQuery = supabaseQuery.neq(filter.column, filter.value)
            break
          case 'gt':
            supabaseQuery = supabaseQuery.gt(filter.column, filter.value)
            break
          case 'gte':
            supabaseQuery = supabaseQuery.gte(filter.column, filter.value)
            break
          case 'lt':
            supabaseQuery = supabaseQuery.lt(filter.column, filter.value)
            break
          case 'lte':
            supabaseQuery = supabaseQuery.lte(filter.column, filter.value)
            break
          case 'like':
            supabaseQuery = supabaseQuery.like(filter.column, filter.value)
            break
          case 'ilike':
            supabaseQuery = supabaseQuery.ilike(filter.column, filter.value)
            break
          case 'in':
            supabaseQuery = supabaseQuery.in(filter.column, filter.value)
            break
          case 'is':
            supabaseQuery = supabaseQuery.is(filter.column, filter.value)
            break
          default:
            console.warn(`Unknown operator: ${filter.operator}`)
        }
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
      console.error('Supabase error:', error)
      throw error
    }
    
    console.log(`Query returned ${data ? data.length : 0} records`)
    
    // Post-process data for grouping
    let processedData = data
    if (queryIntent.groupBy && data && data.length > 0) {
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
      count: data ? data.length : 0
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
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
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
   - inquiry_created_ts (timestamp without time zone)
   - source (text)
   - status (text)
   - lost_reason (text)
   - ts_contacted (timestamp without time zone)
   - ts_lost_reason (timestamp without time zone)
   - ts_won (timestamp without time zone)
   - new_viewings (text)

Current date and time: ${today.toISOString()}
Today's date: ${todayStr}

User query: "${userQuery}"

Respond with ONLY a valid JSON object with this structure:
{
  "table": "inquiries" or "agents",
  "select": "columns to select (use * for all, or specify columns. For joins use syntax like '*,agents(first_name,last_name)')",
  "filters": [
    {
      "column": "column_name",
      "operator": "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is",
      "value": "value (for dates use ISO format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
    }
  ],
  "order": {
    "column": "column_name",
    "ascending": true | false
  },
  "limit": number or null,
  "groupBy": "column_name" or null (use this for grouping by source, status, agent_id, etc),
  "visualization": "table" | "bar" | "pie" | "line" | "metric",
  "explanation": "Human-readable explanation of what this query does"
}

Important guidelines:
- For "last week", calculate dates from 7 days ago until today
- For "this month", use from the 1st of current month
- For "last month", use the previous month's date range
- Always use ISO format for dates: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
- For grouping queries (by source, by status, by agent), set groupBy field AND select all columns
- For joins with agents table, use select: "*,agents(first_name,last_name)"
- Common status values: "Won", "Lost", "Pending", "New", "Contacted"
- Common sources: "PRYPCO One", "Website", "Referral", etc.
- For "last inquiries" or "recent inquiries", order by inquiry_created_ts descending with a limit of 20-50
- Choose appropriate visualization based on query type

RESPOND ONLY WITH VALID JSON, NO ADDITIONAL TEXT.`

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not found in environment variables')
    }
    
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
    
    const responseText = message.content[0].text.trim()
    console.log('Claude response:', responseText)
    
    // Clean the response in case it has markdown
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    const queryIntent = JSON.parse(cleanedResponse)
    
    return queryIntent
  } catch (error) {
    console.error('Claude API Error:', error)
    console.error('Falling back to basic parser')
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
    order: {
      column: 'inquiry_created_ts',
      ascending: false
    },
    visualization: 'table',
    explanation: 'Showing data based on your query (using fallback parser)'
  }
  
  // Determine table
  if (lowerQuery.includes('agent') && !lowerQuery.includes('inquir') && !lowerQuery.includes('by agent')) {
    intent.table = 'agents'
  }
  
  // Date filtering
  if (lowerQuery.includes('last week') || lowerQuery.includes('past week')) {
    const lastWeek = new Date(today)
    lastWeek.setDate(today.getDate() - 7)
    lastWeek.setHours(0, 0, 0, 0)
    
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'gte',
      value: lastWeek.toISOString()
    })
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'lte',
      value: today.toISOString()
    })
    intent.explanation = `Showing inquiries from the last 7 days (${lastWeek.toLocaleDateString()} to ${today.toLocaleDateString()})`
  }
  
  // Grouping
  if (lowerQuery.includes('by source') || lowerQuery.includes('grouped by source')) {
    intent.groupBy = 'source'
    intent.visualization = 'bar'
  } else if (lowerQuery.includes('by status')) {
    intent.groupBy = 'status'
    intent.visualization = 'bar'
  }
  
  // Recent/Last inquiries
  if (lowerQuery.includes('last inquiries') || lowerQuery.includes('recent inquiries')) {
    intent.limit = 20
    intent.explanation = 'Showing the most recent inquiries'
  }
  
  return intent
}