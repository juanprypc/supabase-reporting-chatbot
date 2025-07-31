'use client'

import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

export function DataVisualization({ data, rawData, intent }) {
  if (!data || data.length === 0) {
    return <p className="text-gray-500">No data found for your query.</p>
  }

  // Handle metric visualization
  if (intent.visualization === 'metric') {
    return (
      <div className="bg-blue-50 rounded-lg p-6 text-center">
        <div className="text-4xl font-bold text-blue-600">{data.length || '0'}</div>
        <div className="text-gray-600 mt-2">Total Records</div>
      </div>
    )
  }

  // Handle grouped data visualizations
  if (intent.groupBy && Array.isArray(data) && data[0]?.name && data[0]?.value) {
    if (intent.visualization === 'bar') {
      return (
        <div className="w-full">
          <p className="text-sm text-gray-600 mb-2">Total: {rawData?.length || data.reduce((sum, item) => sum + item.value, 0)} records</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )
    }

    if (intent.visualization === 'pie') {
      return (
        <div className="w-full">
          <p className="text-sm text-gray-600 mb-2">Distribution of {rawData?.length || data.reduce((sum, item) => sum + item.value, 0)} records</p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )
    }

    if (intent.visualization === 'line') {
      return (
        <div className="w-full">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#3B82F6" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )
    }
  }

  // Default table view for raw data
  const tableData = rawData || data
  if (!Array.isArray(tableData) || tableData.length === 0) {
    return <p className="text-gray-500">No data to display</p>
  }

  return (
    <div className="overflow-x-auto">
      <p className="text-sm text-gray-600 mb-2">Showing {Math.min(tableData.length, 20)} of {tableData.length} records</p>
      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
        <thead>
          <tr className="bg-gray-50">
            {Object.keys(tableData[0]).map(key => (
              <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {key.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tableData.slice(0, 20).map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {Object.entries(row).map(([key, value], i) => (
                <td key={i} className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {value === null ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}