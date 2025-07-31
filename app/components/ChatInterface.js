'use client'

import { useState } from 'react'
import { Send, BarChart3, Save } from 'lucide-react'
import { MessageList } from './MessageList'

export default function ChatInterface() {
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      text: "Hello! I'm your AI-powered reporting assistant. I use Claude AI to understand your questions and query your Supabase database.\n\n⚠️ Note: Your data appears to be from June 2025, so queries for 'last week' (July 2025) may return no results.\n\nTry these queries:\n\n• Show me inquiries from June 2025 grouped by source\n• Show all lost inquiries with their reasons\n• What's the status distribution for all inquiries?\n• Show me won deals from June 2025\n• List the most recent 20 inquiries", 
      sender: 'bot' 
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedQueries, setSavedQueries] = useState([])

  const handleSendMessage = async () => {
    if (!input.trim()) return

    const userMessage = { id: Date.now(), text: input, sender: 'user' }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/supabase/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input })
      })

      const result = await response.json()

      if (result.success) {
        const botMessage = {
          id: Date.now() + 1,
          sender: 'bot',
          text: result.intent.explanation || `Found ${result.count} records`,
          data: result.data,
          rawData: result.rawData,
          intent: result.intent,
          query: input,
          debug: result.debug // Add debug info
        }
        setMessages(prev => [...prev, botMessage])
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: `Error: ${error.message}\n\nTip: If you're looking for data from June 2025, try queries like "Show me inquiries from June 2025" since that's when your data is from.`
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const saveQuery = (message) => {
    const savedQuery = {
      id: Date.now(),
      query: message.query,
      title: message.query.length > 50 ? `${message.query.substring(0, 50)}...` : message.query,
      data: message.data,
      rawData: message.rawData,
      intent: message.intent,
      timestamp: new Date().toISOString()
    }
    setSavedQueries(prev => [...prev, savedQuery])
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 flex flex-col">
        <div className="bg-white shadow-sm border-b">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              AI-Powered Reporting Assistant
            </h1>
            <p className="text-sm text-gray-600 mt-1">Powered by Claude AI and Supabase</p>
          </div>
        </div>

        <MessageList messages={messages} onSaveQuery={saveQuery} />

        {loading && (
          <div className="px-6">
            <div className="bg-white rounded-lg shadow-md p-4 inline-flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <p className="text-gray-600">Claude is analyzing your query...</p>
            </div>
          </div>
        )}

        <div className="bg-white border-t p-4">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask anything about your data in natural language..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendMessage}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="w-80 bg-white border-l overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Save className="w-5 h-5" />
            Saved Queries
          </h2>
        </div>
        <div className="p-4 space-y-3">
          {savedQueries.length === 0 ? (
            <p className="text-gray-500 text-sm">No saved queries yet. Save your favorite queries to build a custom dashboard!</p>
          ) : (
            savedQueries.map(query => (
              <div key={query.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <h3 className="font-medium text-sm text-gray-800 mb-1">{query.title}</h3>
                <p className="text-xs text-gray-500 mb-2">
                  {new Date(query.timestamp).toLocaleString()}
                </p>
                <p className="text-xs text-gray-600">
                  {query.intent.explanation}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}