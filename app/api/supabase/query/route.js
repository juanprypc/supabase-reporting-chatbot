import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

// Initialize Claude with proper error handling
let anthropic = null
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
}

export async function POST(request) {
  try {
    const { query } = await request.json()
    
    console.log('Received query:', query)
    
    // Parse the query
    let queryIntent
    try {
      queryIntent = await parseQueryWithClaude(query)
      console.log('Claude parsed query:', JSON.stringify(queryIntent, null, 2))
    } catch (error) {
      console.error('Claude parsing failed, using fallback:', error.message)
      queryIntent = basicParseQuery(query)
      console.log('Fallback parsed query:', JSON.stringify(queryIntent, null, 2))
    }
    
    // Build Supabase query
    let supabaseQuery = supabase.from(queryIntent.table)
    
    // Apply select
    if (queryIntent.select) {
      supabaseQuery = supabaseQuery.select(queryIntent.select)
    } else {
      // Default select all
      supabaseQuery = supabaseQuery.select('*')
    }
    
    // Apply filters
    if (queryIntent.filters && queryIntent.filters.length > 0) {
      for (const filter of queryIntent.filters) {
        console.log(`Applying filter: ${filter.column} ${filter.operator} ${filter.value}`)
        
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
      }
    }
    
    // Apply ordering
    if (queryIntent.order) {
      supabaseQuery = supabaseQuery.order(queryIntent.order.column, { 
        ascending: queryIntent.order.ascending 
      })
    } else {
      // Default ordering
      supabaseQuery = supabaseQuery.order('inquiry_created_ts', { ascending: false })
    }
    
    // Apply limit
    if (queryIntent.limit) {
      supabaseQuery = supabaseQuery.limit(queryIntent.limit)
    }
    
    // Execute query
    console.log('Executing Supabase query...')
    const { data, error } = await supabaseQuery
    
    if (error) {
      console.error('Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }
    
    console.log(`Query returned ${data ? data.length : 0} records`)
    
    // Post-process data for grouping
    let processedData = data
    let visualization = queryIntent.visualization || 'table'
    
    if (queryIntent.groupBy && data && data.length > 0) {
      const grouped = {}
      data.forEach(item => {
        let key = item[queryIntent.groupBy] || 'Unknown'
        
        // Special handling for agent grouping
        if (queryIntent.groupBy === 'agent_id' && item.agents) {
          key = `${item.agents.first_name} ${item.agents.last_name}`
        }
        
        grouped[key] = (grouped[key] || 0) + 1
      })
      
      processedData = Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
      
      // Force visualization for grouped data
      if (!queryIntent.visualization) {
        visualization = 'bar'
      }
    }
    
    // Return response
    return NextResponse.json({
      success: true,
      data: processedData,
      rawData: data,
      intent: { ...queryIntent, visualization },
      count: data ? data.length : 0,
      debug: {
        appliedFilters: queryIntent.filters,
        query: queryIntent
      }
    })
    
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        debug: {
          errorType: error.constructor.name,
          stack: error.stack
        }
      },
      { status: 500 }
    )
  }
}

async function parseQueryWithClaude(userQuery) {
  if (!anthropic) {
    throw new Error('Claude API not initialized')
  }
  
  const currentDate = new Date('2025-07-31')
  const prompt = `You are a SQL query builder for Supabase. Current date is ${currentDate.toISOString()}.

User query: "${userQuery}"

Available tables and columns:

1. inquiries table:
   - inquiry_id (text)
   - agent_id (text, foreign key to agents.agents_id)
   - property_id (text)
   - inquiry_created_ts (timestamp)
   - source (text: "PRYPCO One", "Campaign Handover", etc.)
   - status (text: "Won", "Lost", "Pending", "New", "Contacted")
   - lost_reason (text: "Unresponsive", "Not interested", "Duplicate", etc.)
   - ts_contacted (timestamp)
   - ts_lost_reason (timestamp)
   - ts_won (timestamp)
   - new_viewings (text)

2. agents table:
   - agents_id (text)
   - first_name (text)
   - last_name (text)
   - email_address (text)
   - whatsapp_number_supabase (text)
   - years_of_experience (integer)
   - sign_up_timestamp (date)
   - sales_team_agency_supabase (text)
   - agency_name_supabase (text)

IMPORTANT CONTEXT: The data in the database is from June 2025, not July 2025. When the user asks for "last week" or "recent" data, you should interpret this as data from late June 2025.

Convert the user query to this exact JSON format:
{
  "table": "inquiries" or "agents",
  "select": "column1,column2" or "*" or "*,agents(first_name,last_name)" for joins,
  "filters": [
    {
      "column": "column_name",
      "operator": "eq|neq|gt|gte|lt|lte|like|ilike|in|is",
      "value": "value (for dates use ISO format)"
    }
  ],
  "order": {
    "column": "column_name",
    "ascending": true or false
  },
  "limit": number or null,
  "groupBy": "column_name" or null,
  "visualization": "table|bar|pie|line|metric",
  "explanation": "Human-readable explanation"
}

Guidelines:
- For "last week" from July 31, 2025: use June 24-30, 2025
- For "this month" from July 31, 2025: suggest looking at June 2025 data instead
- For "recent" or "latest": order by inquiry_created_ts DESC with limit 20-50
- For joins with agents: use select: "*,agents(first_name,last_name)"
- For grouping: set groupBy AND include all columns in select
- Choose appropriate visualization based on query type
- Use exact column names as listed above

RESPOND ONLY WITH VALID JSON.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
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
    const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    return JSON.parse(cleanedResponse)
  } catch (error) {
    console.error('Claude API Error:', error)
    throw error
  }
}

// Enhanced fallback parser
function basicParseQuery(query) {
  const lowerQuery = query.toLowerCase()
  const currentDate = new Date('2025-07-31')
  
  const intent = {
    table: 'inquiries',
    select: '*',
    filters: [],
    order: {
      column: 'inquiry_created_ts',
      ascending: false
    },
    limit: null,
    groupBy: null,
    visualization: 'table',
    explanation: 'Showing data based on your query'
  }
  
  // Determine table
  if (lowerQuery.includes('agent') && !lowerQuery.includes('inquir') && !lowerQuery.includes('by agent')) {
    intent.table = 'agents'
    intent.order.column = 'sign_up_timestamp'
  }
  
  // Handle date filtering - adjust for June data
  if (lowerQuery.includes('last week') || lowerQuery.includes('past week')) {
    // Since data is from June, show last week of June
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'gte',
      value: '2025-06-24T00:00:00Z'
    })
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'lte',
      value: '2025-06-30T23:59:59Z'
    })
    intent.explanation = 'Showing inquiries from the last week of June 2025 (your most recent data)'
  } else if (lowerQuery.includes('june') || lowerQuery.includes('last month')) {
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'gte',
      value: '2025-06-01T00:00:00Z'
    })
    intent.filters.push({
      column: 'inquiry_created_ts',
      operator: 'lte',
      value: '2025-06-30T23:59:59Z'
    })
    intent.explanation = 'Showing all inquiries from June 2025'
  }
  
  // Status filtering
  if (lowerQuery.includes('won')) {
    intent.filters.push({
      column: 'status',
      operator: 'eq',
      value: 'Won'
    })
    intent.explanation = 'Showing all won deals'
  } else if (lowerQuery.includes('lost')) {
    intent.filters.push({
      column: 'status',
      operator: 'eq',
      value: 'Lost'
    })
    intent.explanation = 'Showing all lost inquiries'
  } else if (lowerQuery.includes('pending')) {
    intent.filters.push({
      column: 'status',
      operator: 'eq',
      value: 'Pending'
    })
    intent.explanation = 'Showing all pending inquiries'
  }
  
  // Source filtering
  if (lowerQuery.includes('prypco one')) {
    intent.filters.push({
      column: 'source',
      operator: 'eq',
      value: 'PRYPCO One'
    })
    intent.explanation = 'Showing inquiries from PRYPCO One source'
  }
  
  // Grouping
  if (lowerQuery.includes('by source') || lowerQuery.includes('grouped by source')) {
    intent.groupBy = 'source'
    intent.visualization = 'bar'
    intent.explanation = 'Showing inquiries grouped by source'
  } else if (lowerQuery.includes('by status')) {
    intent.groupBy = 'status'
    intent.visualization = 'bar'
    intent.explanation = 'Showing inquiries grouped by status'
  } else if (lowerQuery.includes('by agent')) {
    intent.select = '*,agents(first_name,last_name)'
    intent.groupBy = 'agent_id'
    intent.visualization = 'bar'
    intent.explanation = 'Showing inquiries grouped by agent'
  }
  
  // Limits
  if (lowerQuery.includes('last') && lowerQuery.includes('inquir')) {
    const match = lowerQuery.match(/last (\d+)/);
    intent.limit = match ? parseInt(match[1]) : 20
    intent.explanation = `Showing the last ${intent.limit} inquiries`
  } else if (lowerQuery.includes('recent')) {
    intent.limit = 50
    intent.explanation = 'Showing the 50 most recent inquiries'
  }
  
  // Count only
  if (lowerQuery.includes('how many') || lowerQuery.includes('count')) {
    intent.visualization = 'metric'
  }
  
  return intent
}
