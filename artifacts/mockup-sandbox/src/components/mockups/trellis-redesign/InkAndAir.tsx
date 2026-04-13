import React from "react";
import { 
  Leaf, 
  Home, 
  Users, 
  Calendar, 
  FileText, 
  Settings, 
  Search, 
  Bell,
  ChevronDown
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

const data = [
  { name: "Mon", sessions: 140 },
  { name: "Tue", sessions: 210 },
  { name: "Wed", sessions: 180 },
  { name: "Thu", sessions: 250 },
  { name: "Fri", sessions: 190 },
];

const services = [
  { student: "Emma Thompson", type: "Speech Therapy", time: "09:00 AM", status: "Completed" },
  { student: "Lucas Garcia", type: "Occupational Therapy", time: "10:30 AM", status: "In Progress" },
  { student: "Maya Patel", type: "Physical Therapy", time: "11:45 AM", status: "Upcoming" },
  { student: "James Wilson", type: "Counseling", time: "01:15 PM", status: "Upcoming" },
];

export function InkAndAir() {
  return (
    <div className="flex h-screen w-full bg-[#fafaf8] text-[#1a1a1a] font-sans selection:bg-[#059669] selection:text-white">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-[#e5e5e5] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-[#e5e5e5]">
          <Leaf className="w-5 h-5 text-[#059669] mr-3 stroke-[1.5]" />
          <span className="font-medium tracking-wide">Trellis</span>
        </div>
        
        <div className="px-6 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">Built to support</p>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-4">
          <NavItem icon={<Home className="w-4 h-4" />} label="Dashboard" active />
          <NavItem icon={<Users className="w-4 h-4" />} label="Students" />
          <NavItem icon={<Calendar className="w-4 h-4" />} label="Schedule" />
          <NavItem icon={<FileText className="w-4 h-4" />} label="Reports" />
        </nav>

        <div className="p-4 border-t border-[#e5e5e5]">
          <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-10 border-b border-[#e5e5e5]">
          <div className="flex items-center text-sm text-gray-500">
            <span>Overview</span>
            <span className="mx-2">/</span>
            <span className="text-[#1a1a1a]">Today</span>
          </div>

          <div className="flex items-center gap-6">
            <Search className="w-4 h-4 text-gray-400 stroke-[1.5]" />
            <Bell className="w-4 h-4 text-gray-400 stroke-[1.5]" />
            <div className="flex items-center gap-2 pl-6 border-l border-[#e5e5e5]">
              <div className="w-7 h-7 bg-gray-200" />
              <span className="text-sm font-medium">Dr. Hayes</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto p-10">
          <div className="max-w-5xl mx-auto space-y-16">
            
            {/* Page Title */}
            <div>
              <h1 className="text-3xl font-light tracking-tight mb-2">Morning, Sarah</h1>
              <p className="text-gray-500 text-sm">Here is what's happening across the district today.</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-8">
              <Metric value="1,204" label="Active Students" />
              <Metric value="8,432" label="Sessions Logged" />
              <Metric value="98.2%" label="Compliance Rate" highlight />
              <Metric value="14" label="Pending IEPs" />
            </div>

            <div className="grid grid-cols-3 gap-16">
              {/* Chart */}
              <div className="col-span-2 space-y-6">
                <h2 className="text-sm uppercase tracking-widest text-gray-400">Weekly Sessions</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#e5e5e5" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 12 }} 
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 12 }} 
                      />
                      <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ 
                          backgroundColor: '#fafaf8', 
                          border: '1px solid #e5e5e5',
                          borderRadius: '0',
                          boxShadow: 'none'
                        }} 
                      />
                      <Bar dataKey="sessions" fill="#059669" radius={[0, 0, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Compliance Ring */}
              <div className="col-span-1 space-y-6">
                <h2 className="text-sm uppercase tracking-widest text-gray-400">District Health</h2>
                <div className="flex flex-col items-center justify-center h-64 border border-[#e5e5e5] relative">
                  <svg viewBox="0 0 36 36" className="w-32 h-32 transform -rotate-90">
                    <path
                      className="text-[#e5e5e5]"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                    <path
                      className="text-[#059669]"
                      strokeDasharray="98.2, 100"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-light">98%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Service List */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm uppercase tracking-widest text-gray-400">Upcoming Services</h2>
                <button className="text-sm text-gray-500 hover:text-[#1a1a1a] transition-colors">View All</button>
              </div>
              <div className="border-t border-[#e5e5e5]">
                {services.map((service, i) => (
                  <div key={i} className="flex items-center py-4 border-b border-[#e5e5e5] hover:bg-[#f2f2ef] transition-colors -mx-4 px-4 cursor-pointer">
                    <div className="w-32 text-sm text-gray-500">{service.time}</div>
                    <div className="flex-1 font-medium text-sm">{service.student}</div>
                    <div className="flex-1 text-sm text-gray-500">{service.type}</div>
                    <div className="w-32 text-right">
                      <span className={`text-xs tracking-wide uppercase ${
                        service.status === 'Completed' ? 'text-[#059669]' : 
                        service.status === 'In Progress' ? 'text-[#1a1a1a]' : 
                        'text-gray-400'
                      }`}>
                        {service.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center px-4 py-2.5 cursor-pointer transition-colors group relative ${
      active ? 'text-[#1a1a1a]' : 'text-gray-500 hover:text-[#1a1a1a]'
    }`}>
      {active && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#059669]" />
      )}
      <div className={`mr-3 stroke-[1.5] ${active ? 'text-[#059669]' : 'group-hover:text-[#059669]'}`}>
        {icon}
      </div>
      <span className="text-sm font-medium tracking-wide">{label}</span>
    </div>
  );
}

function Metric({ value, label, highlight = false }: { value: string, label: string, highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className={`text-4xl font-light mb-2 tracking-tight ${highlight ? 'text-[#059669]' : 'text-[#1a1a1a]'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}
