import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request) {
  try {
    const { query } = await request.json()
    
    console.log('API Route - Received query:', query)
    console.log('Environment check:', {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      keyLength: process.env.ANTHROPIC_API_KEY?.length || 0
    })
    
    // Use Claude to parse the query
    const queryIntent = await parseQueryWithClaude(query)
    
    console.log('API Route - Query intent:', JSON.stringify(queryIntent, null, 2))
    
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
      count: data ? data.length : 0,
      debug: {
        totalRecords: data ? data.length : 0,
        queryUsed: queryIntent,
        timestamp: new Date().toISOString()
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
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    )
  }
}

is",
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
    intent.order.column = 'sign_up_timestamp'
  }
  
  // Date filtering
  if (lowerQuery.includes('last week') || lowerQuery.includes('past week')) {
    const lastWeek = new Date(today)
    lastWeek.setDate(today.getDate() - 7)
    lastWeek.setHours(0, 0, 0, 0)
    
    const dateColumn = intent.table === 'agents' ? 'sign_up_timestamp' : 'inquiry_created_ts'
    
    intent.filters.push({
      column: dateColumn,
      operator: 'gte',
      value: lastWeek.toISOString()
    })
    intent.filters.push({
      column: dateColumn,
      operator: 'lte',
      value: today.toISOString()
    })
    intent.explanation = `Showing ${intent.table} from the last 7 days (${lastWeek.toLocaleDateString()} to ${today.toLocaleDateString()}) - using fallback parser`
  } else if (lowerQuery.includes('this month')) {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const dateColumn = intent.table === 'agents' ? 'sign_up_timestamp' : 'inquiry_created_ts'
    
    intent.filters.push({
      column: dateColumn,
      operator: 'gte',
      value: monthStart.toISOString()
    })
    intent.explanation = `Showing ${intent.table} from this month - using fallback parser`
  } else if (lowerQuery.includes('last 30 days')) {
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)
    const dateColumn = intent.table === 'agents' ? 'sign_up_timestamp' : 'inquiry_created_ts'
    
    intent.filters.push({
      column: dateColumn,
      operator: 'gte',
      value: thirtyDaysAgo.toISOString()
    })
    intent.explanation = `Showing ${intent.table} from the last 30 days - using fallback parser`
  }
  
  // Status filtering
  if (lowerQuery.includes('won deal') || lowerQuery.includes('won inquir')) {
    intent.filters.push({
      column: 'status',
      operator: 'eq',
      value: 'Won'
    })
    intent.explanation += ' (Won status only)'
  } else if (lowerQuery.includes('lost')) {
    intent.filters.push({
      column: 'status',
      operator: 'eq',
      value: 'Lost'
    })
    intent.explanation += ' (Lost status only)'
  }
  
  // Grouping
  if (lowerQuery.includes('by source') || lowerQuery.includes('grouped by source')) {
    intent.groupBy = 'source'
    intent.visualization = 'bar'
  } else if (lowerQuery.includes('by status')) {
    intent.groupBy = 'status'
    intent.visualization = 'bar'
  } else if (lowerQuery.includes('by agent')) {
    intent.select = '*,agents(first_name,last_name)'
    intent.groupBy = 'agent_id'
    intent.visualization = 'bar'
  }
  
  // Recent/Last inquiries
  if (lowerQuery.includes('last inquiries') || lowerQuery.includes('recent inquiries')) {
    intent.limit = 20
    intent.explanation = 'Showing the 20 most recent inquiries - using fallback parser'
  }
  
  return intent
}