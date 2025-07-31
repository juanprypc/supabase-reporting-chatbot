'use client';

import { useState } from 'react';
import { Send, BarChart3, Save } from 'lucide-react';
import { MessageList } from './MessageList';

export default function ChatInterface() {
  // initial bot greeting
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text:
        "Hi! I'm your GPT‑4‑powered reporting assistant connected to Supabase.\n\n" +
        "You can ask natural‑language questions and even advanced data‑science queries " +
        "using window functions, joins, CTEs, etc.\n\n" +
        "Tip ▶   To inject variables, add a line such as  <PROPERTY_ID>=PROP‑25‑00813  " +
        "before your question.\n\n" +
        "Example prompts:\n" +
        "• Which agents closed the most won deals this month?\n" +
        "• Show rolling 7‑day win‑rate trend\n" +
        "• <PROPERTY_ID>=PROP‑25‑123  Flag idle inquiries > 10 days"
    }
  ]);

  // UI state
  const [query, setQuery] = useState('');
  const [parameters, setParameters] = useState('');       // new
  const [loading, setLoading] = useState(false);
  const [savedQueries, setSavedQueries] = useState([]);

  /* ------------------------- interaction ------------------------- */
  const send = async () => {
    if (!query.trim()) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: parameters ? `${parameters}\n${query}` : query
    };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/supabase/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, parameters })
      });
      const result = await res.json();

      if (!result.success) throw new Error(result.error);

      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: result.intent.explanation || `Found ${result.count} records`,
        data: result.data,
        rawData: result.rawData,
        intent: result.intent,
        query: parameters ? `${parameters}\n${query}` : query,
        debug: result.debug
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          text: `❌ ${err.message}`
        }
      ]);
    } finally {
      setLoading(false);
      setParameters('');               // reset parameters after send
    }
  };

  const saveQuery = message => {
    setSavedQueries(prev => [
      ...prev,
      {
        id: Date.now(),
        query: message.query,
        title:
          message.query.length > 60
            ? `${message.query.slice(0, 60)}…`
            : message.query,
        data: message.data,
        rawData: message.rawData,
        intent: message.intent,
        timestamp: new Date().toISOString()
      }
    ]);
  };

  /* ----------------------------- UI ----------------------------- */
  return (
    <div className="flex h-screen bg-gray-50">
      {/* ------------- Main column ------------- */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            AI Reporting Assistant
          </h1>
          <p className="text-sm text-gray-600">
            Powered by GPT‑4o & Supabase
          </p>
        </header>

        <MessageList messages={messages} onSaveQuery={saveQuery} />

        {loading && (
          <div className="px-6">
            <div className="bg-white rounded-lg shadow-md p-4 inline-flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              <p className="text-gray-600">Thinking…</p>
            </div>
          </div>
        )}

        {/* ----------- Input area ----------- */}
        <footer className="bg-white border-t p-4">
          <div className="flex flex-col gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={parameters}
              onChange={e => setParameters(e.target.value)}
              placeholder="Optional parameters e.g. <PROPERTY_ID>=PROP‑25‑00111"
              className="px-4 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask anything about your data…"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={send}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* ------------- Saved queries panel ------------- */}
      <aside className="w-80 bg-white border-l overflow-y-auto">
        <div className="p-4 border-b flex items-center gap-2">
          <Save className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-gray-800">Saved Queries</h2>
        </div>
        <div className="p-4 space-y-3">
          {savedQueries.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No saved queries yet. Pin your favourites to build dashboards 🚀
            </p>
          ) : (
            savedQueries.map(q => (
              <div
                key={q.id}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                <h3 className="font-medium text-sm text-gray-800 mb-1">
                  {q.title}
                </h3>
                <p className="text-xs text-gray-500 mb-2">
                  {new Date(q.timestamp).toLocaleString()}
                </p>
                <p className="text-xs text-gray-600">{q.intent.explanation}</p>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
