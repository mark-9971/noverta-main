import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Search, Target, BookOpen, Users, ChevronRight, Filter } from "lucide-react";

const API = "/api";

export default function IepSearch() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`${API}/search/iep?q=${encodeURIComponent(query.trim())}&type=${searchType}`);
      if (res.ok) setResults(await res.json());
    } catch (e) {
      console.error("Search failed:", e);
    }
    setSearching(false);
  }, [query, searchType]);

  const totalResults = results ? (results.goals?.length || 0) + (results.accommodations?.length || 0) + (results.students?.length || 0) : 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Global IEP Search</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Search across all students' goals, accommodations, and records</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doSearch()}
                placeholder="Search goals, accommodations, student names, disability categories..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <select
              value={searchType}
              onChange={e => setSearchType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="all">All</option>
              <option value="goals">Goals Only</option>
              <option value="accommodations">Accommodations Only</option>
              <option value="students">Students Only</option>
            </select>
            <Button className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px]" onClick={doSearch} disabled={searching || query.trim().length < 2}>
              {searching ? "Searching..." : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-4">
          <p className="text-[12px] text-gray-400">{totalResults} result{totalResults !== 1 ? "s" : ""} found</p>

          {results.goals?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-gray-600">IEP Goals ({results.goals.length})</h3>
                </div>
                <div className="space-y-2">
                  {results.goals.map((g: any) => (
                    <Link key={g.id} href={`/students/${g.studentId}/iep`}>
                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[12px] font-medium text-gray-700">{g.studentName}</span>
                            <span className="text-[10px] text-gray-400">Grade {g.grade}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700">{g.goalArea}</span>
                          </div>
                          <p className="text-[12px] text-gray-500 line-clamp-2">{g.annualGoal}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 mt-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.accommodations?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-gray-600">Accommodations ({results.accommodations.length})</h3>
                </div>
                <div className="space-y-2">
                  {results.accommodations.map((a: any) => (
                    <Link key={a.id} href={`/students/${a.studentId}/iep`}>
                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[12px] font-medium text-gray-700">{a.studentName}</span>
                            <span className="text-[10px] text-gray-400">Grade {a.grade}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-600 capitalize">{a.category}</span>
                          </div>
                          <p className="text-[12px] text-gray-500">{a.description}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 mt-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.students?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-gray-600">Students ({results.students.length})</h3>
                </div>
                <div className="space-y-2">
                  {results.students.map((s: any) => (
                    <Link key={s.id} href={`/students/${s.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-[11px] font-bold text-violet-600">
                          {(s.firstName?.[0] || "")}{(s.lastName?.[0] || "")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-700">{s.firstName} {s.lastName}</p>
                          <p className="text-[11px] text-gray-400">
                            Grade {s.grade} {s.disabilityCategory ? `· ${s.disabilityCategory}` : ""}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {totalResults === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No results found for "{query}"</p>
                <p className="text-xs text-gray-400 mt-1">Try different keywords or search type</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!results && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Search across all students' IEP data</p>
            <p className="text-xs text-gray-400 mt-1">Find goals, accommodations, or students by keyword</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
