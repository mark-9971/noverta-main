import React from "react";
import { 
  Bar, 
  BarChart, 
  Cell, 
  Pie, 
  PieChart, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis 
} from "recharts";

import { Sprout } from "lucide-react";

// --- DUMMY DATA ---

const donutData = [
  { name: "On Track", value: 19 },
  { name: "Off Track", value: 81 },
];

const barData = [
  { name: "Mon", delivered: 120, missed: 20 },
  { name: "Tue", delivered: 150, missed: 15 },
  { name: "Wed", delivered: 130, missed: 25 },
  { name: "Thu", delivered: 140, missed: 10 },
  { name: "Fri", delivered: 110, missed: 30 },
];

const complianceByService = [
  { service: "Speech Therapy", rate: "42%", status: "critical" },
  { service: "Occupational Therapy", rate: "78%", status: "warning" },
  { service: "Physical Therapy", rate: "85%", status: "ok" },
  { service: "Counseling", rate: "12%", status: "critical" },
  { service: "Reading Specialist", rate: "94%", status: "ok" },
];

// --- COMPONENTS ---

export function MonochromeGrid() {
  return (
    <div className="flex h-screen w-full bg-white text-black font-mono overflow-hidden selection:bg-black selection:text-white">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-black flex flex-col shrink-0">
        <div className="p-4 border-b border-black flex items-center gap-2">
          <Sprout className="w-5 h-5" />
          <span className="font-bold tracking-widest uppercase">Trellis</span>
        </div>
        <div className="px-4 py-2 text-[10px] uppercase tracking-widest border-b border-black text-gray-500">
          Built to support.
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-2">
          <NavItem active label="Dashboard" />
          <NavItem label="Students" />
          <NavItem label="Staff" />
          <NavItem label="Compliance" />
          <NavItem label="Reports" />
          <NavItem label="Settings" />
        </nav>

        <div className="p-4 border-t border-black text-xs">
          <div>SYS_STATUS: ONLINE</div>
          <div>LST_UPDT: {new Date().toLocaleTimeString()}</div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#f4f4f4]">
        {/* HEADER */}
        <header className="h-14 border-b border-black flex items-center justify-between px-6 shrink-0 bg-white">
          <h1 className="text-sm font-bold uppercase tracking-wider">Admin Overview</h1>
          <div className="text-xs uppercase flex items-center gap-4">
            <span>Usr: Admin_01</span>
            <button className="border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors">
              Logout
            </button>
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          
          {/* STATS ROW */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard title="Active Students" value="52" />
            <StatCard title="Open Alerts" value="18" alert />
            <StatCard title="Makeup Needed" value="836" />
            <StatCard title="Out of Compliance" value="25" alert />
          </div>

          <div className="grid grid-cols-3 gap-6 h-[400px]">
            {/* DONUT CHART */}
            <div className="border border-black bg-white flex flex-col">
              <div className="border-b border-black p-3 text-xs font-bold uppercase tracking-wider">
                Overall Compliance
              </div>
              <div className="flex-1 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      innerRadius="60%"
                      outerRadius="80%"
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#000000" />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: 0, border: '1px solid black', backgroundColor: 'white' }}
                      itemStyle={{ color: 'black' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                  <span className="text-4xl font-bold tracking-tighter">19%</span>
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">On Track</span>
                </div>
              </div>
            </div>

            {/* BAR CHART */}
            <div className="border border-black bg-white flex flex-col col-span-2">
              <div className="border-b border-black p-3 text-xs font-bold uppercase tracking-wider">
                Session Delivery (Trailing 5 Days)
              </div>
              <div className="flex-1 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} barGap={0}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'black', fontSize: 12, fontFamily: 'monospace' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'black', fontSize: 12, fontFamily: 'monospace' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f3f4f6' }}
                      contentStyle={{ borderRadius: 0, border: '1px solid black', backgroundColor: 'white' }}
                    />
                    <Bar dataKey="delivered" stackId="a" fill="#000000" />
                    <Bar dataKey="missed" stackId="a" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="border-t border-black p-2 flex gap-4 text-xs justify-end bg-gray-50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-black"></div>
                  <span>Delivered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500"></div>
                  <span>Missed</span>
                </div>
              </div>
            </div>
          </div>

          {/* LIST */}
          <div className="border border-black bg-white flex flex-col">
            <div className="border-b border-black p-3 text-xs font-bold uppercase tracking-wider flex justify-between items-center">
              <span>Compliance by Service</span>
              <button className="text-[10px] border border-black px-2 py-1 hover:bg-black hover:text-white transition-colors">
                Export CSV
              </button>
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-3 p-3 border-b border-black bg-gray-100 text-[10px] uppercase tracking-widest text-gray-600">
                <div>Service Area</div>
                <div className="text-right">Compliance Rate</div>
                <div className="text-right">Status</div>
              </div>
              {complianceByService.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`grid grid-cols-3 p-3 text-sm border-b border-black last:border-b-0 hover:bg-gray-50 transition-colors ${
                    item.status === 'critical' ? 'text-red-600 font-medium' : ''
                  }`}
                >
                  <div>{item.service}</div>
                  <div className="text-right">{item.rate}</div>
                  <div className="text-right flex justify-end">
                    {item.status === 'critical' && (
                      <span className="border border-red-600 px-2 py-0.5 text-[10px] uppercase tracking-wider bg-red-50 text-red-600">
                        Critical
                      </span>
                    )}
                    {item.status === 'warning' && (
                      <span className="border border-black px-2 py-0.5 text-[10px] uppercase tracking-wider">
                        Warning
                      </span>
                    )}
                    {item.status === 'ok' && (
                      <span className="border border-black px-2 py-0.5 text-[10px] uppercase tracking-wider bg-black text-white">
                        Nominal
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <div 
      className={`px-4 py-2 text-sm uppercase tracking-wider cursor-pointer border border-transparent transition-colors ${
        active ? 'bg-black text-white' : 'hover:border-black text-black'
      }`}
    >
      {label}
    </div>
  );
}

function StatCard({ title, value, alert }: { title: string; value: string; alert?: boolean }) {
  return (
    <div className={`border border-black bg-white p-4 flex flex-col justify-between h-32 ${alert ? 'border-red-500' : ''}`}>
      <div className={`text-xs uppercase tracking-wider font-bold ${alert ? 'text-red-500' : 'text-gray-500'}`}>
        {title}
      </div>
      <div className={`text-4xl font-black tracking-tighter ${alert ? 'text-red-500' : 'text-black'}`}>
        {value}
      </div>
    </div>
  );
}
