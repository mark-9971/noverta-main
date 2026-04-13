import React from "react";

import { Sprout, BarChart, Users, FileText, Settings, ArrowUpRight, Search, Bell } from "lucide-react";
import { Progress } from "../../ui/progress";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

const data = [
  { name: "Mon", expected: 40, delivered: 40 },
  { name: "Tue", expected: 45, delivered: 42 },
  { name: "Wed", expected: 35, delivered: 35 },
  { name: "Thu", expected: 50, delivered: 45 },
  { name: "Fri", expected: 30, delivered: 28 },
];

const services = [
  { id: 1, student: "Alice Johnson", service: "Speech Therapy", time: "09:00 AM", status: "Completed" },
  { id: 2, student: "Michael Smith", service: "Occupational Therapy", time: "10:30 AM", status: "Missed" },
  { id: 3, student: "Sarah Davis", service: "Physical Therapy", time: "01:00 PM", status: "Pending" },
  { id: 4, student: "James Wilson", service: "Counseling", time: "02:15 PM", status: "Pending" },
];

export function SwissPrecision() {
  return (
    <div className="flex h-screen bg-white text-black font-sans selection:bg-red-600 selection:text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-black/10 flex flex-col justify-between py-8 px-8">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <Sprout className="w-6 h-6" strokeWidth={1.5} />
            <span className="font-bold tracking-tight text-lg">Trellis</span>
          </div>

          <nav className="space-y-4">
            <a href="#" className="block text-sm font-medium hover:text-red-600 transition-colors">Overview</a>
            <a href="#" className="block text-sm text-black/50 hover:text-black transition-colors">Students</a>
            <a href="#" className="block text-sm text-black/50 hover:text-black transition-colors">Compliance</a>
            <a href="#" className="block text-sm text-black/50 hover:text-black transition-colors">Reports</a>
            <a href="#" className="block text-sm text-black/50 hover:text-black transition-colors">Staff</a>
          </nav>
        </div>

        <div>
          <a href="#" className="flex items-center gap-3 text-sm text-black/50 hover:text-black transition-colors">
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            Settings
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-12 md:p-16 lg:p-24 space-y-24">
          
          {/* Header */}
          <header className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-black/50 mt-2 font-medium">Built to support. Massachusetts Special Education.</p>
            </div>
            <div className="flex items-center gap-6">
              <Search className="w-5 h-5 text-black/50 hover:text-black cursor-pointer" strokeWidth={1.5} />
              <Bell className="w-5 h-5 text-black/50 hover:text-black cursor-pointer" strokeWidth={1.5} />
            </div>
          </header>

          {/* Top Stats - No Cards */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-12 border-b border-black/10 pb-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-black/50 mb-4">Total Students</p>
              <div className="text-6xl font-bold tracking-tighter">1,248</div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-black/50 mb-4">Active IEPs</p>
              <div className="text-6xl font-bold tracking-tighter">892</div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-black/50 mb-4">Staff Members</p>
              <div className="text-6xl font-bold tracking-tighter">145</div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-red-600 mb-4">Critical Alerts</p>
              <div className="text-6xl font-bold tracking-tighter text-red-600">12</div>
            </div>
          </section>

          {/* Middle Section: Compliance & Chart */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-16 md:gap-24">
            
            {/* Compliance */}
            <div className="lg:col-span-1">
              <h2 className="text-xl font-medium tracking-tight mb-8">Service Compliance</h2>
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    className="text-black/5 stroke-current"
                    strokeWidth="2"
                    cx="50"
                    cy="50"
                    r="48"
                    fill="transparent"
                  ></circle>
                  <circle
                    className="text-black stroke-current"
                    strokeWidth="2"
                    strokeLinecap="square"
                    cx="50"
                    cy="50"
                    r="48"
                    fill="transparent"
                    strokeDasharray="301.59"
                    strokeDashoffset={301.59 - (301.59 * 92) / 100}
                  ></circle>
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-bold tracking-tighter">92<span className="text-2xl">%</span></span>
                </div>
              </div>
              <p className="text-sm text-black/50 mt-6 leading-relaxed">
                Overall district compliance across all special education services for the current academic year.
              </p>
            </div>

            {/* Session Delivery Chart */}
            <div className="lg:col-span-2">
              <h2 className="text-xl font-medium tracking-tight mb-8">Session Delivery</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#000', opacity: 0.5 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#000', opacity: 0.5 }} 
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #000', borderRadius: 0, padding: '12px' }}
                      itemStyle={{ color: '#000', fontSize: '14px', fontWeight: 500 }}
                      labelStyle={{ color: 'rgba(0,0,0,0.5)', fontSize: '12px', marginBottom: '4px' }}
                    />
                    <Bar dataKey="expected" fill="#e5e5e5" radius={[0, 0, 0, 0]} barSize={24} />
                    <Bar dataKey="delivered" fill="#000000" radius={[0, 0, 0, 0]} barSize={24} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </section>

          {/* Services List */}
          <section>
            <div className="flex justify-between items-center mb-8 border-b border-black/10 pb-4">
              <h2 className="text-xl font-medium tracking-tight">Today's Services</h2>
              <a href="#" className="text-sm font-medium flex items-center gap-1 hover:text-black/50 transition-colors">
                View All <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
              </a>
            </div>
            
            <div className="flex flex-col">
              {/* Table Header */}
              <div className="grid grid-cols-4 py-3 border-b border-black/10 text-xs font-semibold uppercase tracking-widest text-black/50">
                <div>Student</div>
                <div>Service</div>
                <div>Time</div>
                <div>Status</div>
              </div>
              
              {/* Table Rows */}
              {services.map((service) => (
                <div key={service.id} className="grid grid-cols-4 py-4 border-b border-black/5 text-sm hover:bg-black/[0.02] transition-colors">
                  <div className="font-medium">{service.student}</div>
                  <div className="text-black/70">{service.service}</div>
                  <div className="text-black/70">{service.time}</div>
                  <div>
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-bold uppercase tracking-wider ${
                      service.status === 'Completed' ? 'bg-black text-white' :
                      service.status === 'Missed' ? 'bg-red-600 text-white' :
                      'border border-black/20 text-black/70'
                    }`}>
                      {service.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

export default SwissPrecision;
