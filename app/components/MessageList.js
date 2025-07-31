'use client'

import { DataVisualization } from './Visualizations'
import { Save } from 'lucide-react'

export function MessageList({ messages, onSaveQuery }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.map(message => (
        <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-3xl ${message.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-white'} rounded-lg shadow-md p-4`}>
            <p className={`${message.sender === 'user' ? 'text-white' : 'text-gray-800'} whitespace-pre-line`}>
              {message.text}
            </p>
            {message.data && message.intent && (
              <div className="mt-4">
                <DataVisualization 
                  data={message.data} 
                  rawData={message.rawData}
                  intent={message.intent} 
                />
                {message.sender === 'bot' && onSaveQuery && (
                  <button
                    onClick={() => onSaveQuery(message)}
                    className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Save className="w-4 h-4" />
                    Save to Dashboard
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}