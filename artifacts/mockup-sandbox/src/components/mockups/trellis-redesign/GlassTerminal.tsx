import React from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Activity, AlertTriangle, Clock, Users, BarChart3, ChevronRight, Settings, LayoutDashboard, FileText, Calendar } from 'lucide-react';

export default function GlassTerminal() {
  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-slate-300 font-sans selection:bg-emerald-500/30 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-emerald-900/30 bg-[#0d1117]/80 flex flex-col z-10 backdrop-blur-none shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-emerald-900/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-900/50 border border-emerald-500/50 flex items-center justify-center">
              <span className="text-emerald-500 text-lg font-bold">T</span>
            </div>
            <div>
              <h1 className="text-emerald-50 text-lg font-semibold tracking-wide">TRELLIS</h1>
              <p className="text-[10px] text-emerald-500/70 uppercase tracking-widest font-mono">Built to support</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1">
          <div className="text-[10px] uppercase font-mono tracking-widest text-slate-500 mb-4 px-2">Navigation</div>
          
          <a href="#" className="flex items-center gap-3 px-3 py-2 bg-emerald-900/20 text-emerald-400 border border-emerald-500/30">
            <LayoutDashboard size={16} />
            <span className="text-sm">Dashboard</span>
            <div className="ml-auto w-1.5 h-1.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          </a>
          
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent transition-colors">
            <Users size={16} />
            <span className="text-sm">Students</span>
          </a>
          
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent transition-colors">
            <FileText size={16} />
            <span className="text-sm">Compliance</span>
          </a>
          
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent transition-colors">
            <Calendar size={16} />
            <span className="text-sm">Sessions</span>
          </a>

          <div className="text-[10px] uppercase font-mono tracking-widest text-slate-500 mt-8 mb-4 px-2">System</div>
          
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent transition-colors">
            <Settings size={16} />
            <span className="text-sm">Settings</span>
          </a>
        </nav>
        
        <div className="p-4 border-t border-emerald-900/30">
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800">
            <div className="w-8 h-8 bg-slate-800 flex items-center justify-center">
              <span className="text-slate-400 text-xs font-mono">OP</span>
            </div>
            <div>
              <p className="text-sm text-slate-200">System Admin</p>
              <p className="text-[10px] text-emerald-500 font-mono">STATUS: ONLINE</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        <header className="h-16 flex items-center justify-between px-8 border-b border-emerald-900/30 bg-[#0d1117]/50 shrink-0">
          <h2 className="text-lg text-slate-200 font-medium tracking-wide">COMMAND CENTER</h2>
          <div className="flex items-center gap-4 text-sm font-mono text-slate-400">
            <span>SYS_TIME: <span className="text-emerald-500">14:02:45</span></span>
            <span className="px-2 py-0.5 bg-emerald-900/30 border border-emerald-500/50 text-emerald-400 text-xs">SECURE</span>
          </div>
        </header>
        
        <div className="p-8 space-y-6 flex-1">
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-[#0d1117]/80 border-slate-800 rounded-none p-5 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-slate-800 group-hover:bg-emerald-500/50 transition-colors"></div>
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Users size={16} className="text-emerald-500" />
                <span className="text-xs uppercase tracking-wider font-semibold">Active Students</span>
              </div>
              <div className="text-4xl font-mono text-slate-100">52</div>
            </Card>
            
            <Card className="bg-[#0d1117]/80 border-slate-800 rounded-none p-5 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-slate-800 group-hover:bg-amber-500/50 transition-colors"></div>
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="text-xs uppercase tracking-wider font-semibold">Open Alerts</span>
              </div>
              <div className="text-4xl font-mono text-slate-100">18</div>
            </Card>
            
            <Card className="bg-[#0d1117]/80 border-slate-800 rounded-none p-5 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-slate-800 group-hover:bg-blue-500/50 transition-colors"></div>
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Clock size={16} className="text-blue-500" />
                <span className="text-xs uppercase tracking-wider font-semibold">Makeup Needed</span>
              </div>
              <div className="text-4xl font-mono text-slate-100">836<span className="text-sm text-slate-500 ml-1">min</span></div>
            </Card>
            
            <Card className="bg-[#0d1117]/80 border-slate-800 rounded-none p-5 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-slate-800 group-hover:bg-red-500/50 transition-colors"></div>
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Activity size={16} className="text-red-500" />
                <span className="text-xs uppercase tracking-wider font-semibold">Out of Compliance</span>
              </div>
              <div className="text-4xl font-mono text-red-400">25</div>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Compliance Chart */}
            <Card className="col-span-1 bg-[#0d1117]/80 border-slate-800 rounded-none p-6 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm uppercase tracking-wider text-slate-300 font-semibold">Global Compliance</h3>
                <BarChart3 size={16} className="text-slate-500" />
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="w-40 h-40 rounded-full border-4 border-slate-800 flex items-center justify-center relative">
                  <svg className="absolute top-0 left-0 w-full h-full -rotate-90">
                    <circle cx="80" cy="80" r="78" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="4" />
                    <circle cx="80" cy="80" r="78" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray="490" strokeDashoffset="397" className="transition-all duration-1000 ease-out" />
                  </svg>
                  <div className="text-center flex flex-col items-center">
                    <span className="text-5xl font-mono text-emerald-400">19<span className="text-xl text-emerald-600">%</span></span>
                    <span className="text-xs text-slate-500 mt-1 uppercase font-mono">On Track</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-4 border-t border-slate-800/50 grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Target</div>
                  <div className="text-lg font-mono text-slate-300">95%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Variance</div>
                  <div className="text-lg font-mono text-red-400">-76%</div>
                </div>
              </div>
            </Card>

            {/* Session Delivery Bar Chart */}
            <Card className="col-span-2 bg-[#0d1117]/80 border-slate-800 rounded-none p-6 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm uppercase tracking-wider text-slate-300 font-semibold">Session Delivery (7 Days)</h3>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 bg-emerald-500"></div>
                    <span className="text-slate-400">Delivered</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs ml-3">
                    <div className="w-2 h-2 bg-slate-700"></div>
                    <span className="text-slate-400">Missed</span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 flex items-end gap-2 h-48">
                {[
                  { day: 'MON', delivered: 45, missed: 12 },
                  { day: 'TUE', delivered: 52, missed: 8 },
                  { day: 'WED', delivered: 38, missed: 15 },
                  { day: 'THU', delivered: 61, missed: 5 },
                  { day: 'FRI', delivered: 40, missed: 10 },
                  { day: 'SAT', delivered: 0, missed: 0 },
                  { day: 'SUN', delivered: 0, missed: 0 }
                ].map((data, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div className="w-full flex flex-col justify-end h-full px-2 gap-1 relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 p-2 text-xs font-mono hidden group-hover:block z-10 whitespace-nowrap">
                        <span className="text-emerald-400">{data.delivered}</span> / <span className="text-slate-400">{data.missed}</span>
                      </div>
                      <div 
                        className="w-full bg-slate-700/50 border-t border-slate-600/50 transition-all hover:bg-slate-600/50" 
                        style={{ height: `${data.missed}%` }}
                      ></div>
                      <div 
                        className="w-full bg-emerald-900/40 border-t border-emerald-500/50 transition-all group-hover:bg-emerald-800/60 group-hover:border-emerald-400" 
                        style={{ height: `${data.delivered}%` }}
                      ></div>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-3">{data.day}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Compliance by Service */}
          <Card className="bg-[#0d1117]/80 border-slate-800 rounded-none p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm uppercase tracking-wider text-slate-300 font-semibold">Compliance by Service</h3>
              <button className="text-xs font-mono text-emerald-500 hover:text-emerald-400 flex items-center gap-1 transition-colors">
                VIEW_ALL <ChevronRight size={14} />
              </button>
            </div>
            
            <div className="space-y-4">
              {[
                { name: 'Speech & Language', required: 420, delivered: 84, percentage: 20 },
                { name: 'Occupational Therapy', required: 240, delivered: 48, percentage: 20 },
                { name: 'Physical Therapy', required: 120, delivered: 18, percentage: 15 },
                { name: 'Counseling', required: 360, delivered: 64, percentage: 18 }
              ].map((service, i) => (
                <div key={i} className="p-3 border border-slate-800/50 bg-slate-900/30 hover:border-emerald-900/50 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-sm font-medium text-slate-300">{service.name}</div>
                    <div className="text-xs font-mono">
                      <span className="text-emerald-500">{service.delivered}</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-slate-400">{service.required} min</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                      style={{ width: `${service.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}