'use client';

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

const COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316'
];

export function DataVisualization({ data, rawData, intent }) {
  if (!data || data.length === 0)
    return <p className="text-gray-500">No data.</p>;

  /* --------------------- Metric --------------------- */
  if (intent.visualization === 'metric') {
    const value =
      typeof data === 'number'
        ? data
        : Array.isArray(data)
        ? data.length
        : 0;
    return (
      <div className="bg-blue-50 rounded-lg p-6 text-center">
        <div className="text-4xl font-bold text-blue-600">{value}</div>
        <div className="text-gray-600 mt-2">Total Records</div>
      </div>
    );
  }

  /* --------------------- Histogram --------------------- */
  if (intent.visualization === 'histogram') {
    // Expect { bucket: <number|string>, cnt | value }
    const keyX = Object.keys(data[0])[0];
    const keyY =
      Object.keys(data[0]).find(k => k !== keyX) || 'value';

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={keyX} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey={keyY} fill="#3B82F6" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  /* --------------------- Pivot (stacked) --------------------- */
  if (intent.visualization === 'pivot') {
    // Assume first key is category, rest are series
    const keys = Object.keys(data[0]);
    const category = keys[0];
    const series = keys.slice(1);

    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={category} angle={-45} textAnchor="end" height={100} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          {series.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="pivot"
              fill={COLORS[i % COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  /* --------------------- Grouped bar / pie / line --------------------- */
  if (
    intent.groupBy &&
    Array.isArray(data) &&
    data[0]?.name !== undefined &&
    data[0]?.value !== undefined
  ) {
    if (intent.visualization === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#3B82F6" />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (intent.visualization === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={85}
              label={({ name, value }) => `${name}: ${value}`}
              dataKey="value"
            >
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={COLORS[idx % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (intent.visualization === 'line') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }
  }

  /* --------------------- Default: table --------------------- */
  const tableData = rawData || data;
  if (!Array.isArray(tableData))
    return <pre>{JSON.stringify(tableData, null, 2)}</pre>;

  return (
    <div className="overflow-x-auto">
      <p className="text-sm text-gray-600 mb-2">
        Showing {Math.min(tableData.length, 20)} of {tableData.length} rows
      </p>
      <table className="min-w-full bg-white border border-gray-200 rounded-lg text-xs">
        <thead>
          <tr className="bg-gray-50">
            {Object.keys(tableData[0]).map(k => (
              <th
                key={k}
                className="px-4 py-2 text-left font-medium text-gray-600 uppercase tracking-wider"
              >
                {k.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tableData.slice(0, 20).map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {Object.keys(row).map(k => (
                <td key={k} className="px-4 py-2 whitespace-nowrap">
                  {row[k] === null
                    ? '–'
                    : typeof row[k] === 'object'
                    ? JSON.stringify(row[k])
                    : String(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
