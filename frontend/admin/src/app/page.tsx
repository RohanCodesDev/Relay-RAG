"use client";

import { useState, useEffect, useRef } from "react";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"ingest" | "tenants">("ingest");
  
  // Ingest State
  const [tenantId, setTenantId] = useState("demo_tenant");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  
  // Stats & Tenants State
  const [stats, setStats] = useState({ vectors: 0, tenants: 0 });
  const [tenantList, setTenantList] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("http://localhost:8000/stats");
      if (res.ok) setStats(await res.json());
      
      const tenantsRes = await fetch("http://localhost:8000/admin/tenants");
      if (tenantsRes.ok) setTenantList(await tenantsRes.json());
    } catch (e) {
      console.error("Failed to fetch data");
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) return;
    if (!text.trim() && !file) return;

    setStatus("loading");
    setMessage("");

    try {
      let res;
      if (file) {
        // PDF Upload Route
        const formData = new FormData();
        formData.append("file", file);
        res = await fetch("http://localhost:8000/admin/ingest/file", {
          method: "POST",
          headers: { "X-Tenant-ID": tenantId },
          body: formData,
        });
      } else {
        // Text Route
        res = await fetch("http://localhost:8000/ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantId,
          },
          body: JSON.stringify({ text }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to ingest data");
      }

      const data = await res.json();
      setStatus("success");
      setMessage(data.message || "Knowledge successfully indexed.");
      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchStats(); 
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message);
    }
  };

  const handleGenerateKey = async (tid: str) => {
    try {
      await fetch(`http://localhost:8000/admin/tenants/${tid}/api-key`, { method: "POST" });
      fetchStats();
    } catch (e) {
      alert("Failed to generate key");
    }
  };

  const handleDeleteTenant = async (tid: str) => {
    if (!confirm(`WARNING: This will purge ALL vectors and chat logs for ${tid}. Continue?`)) return;
    try {
      await fetch(`http://localhost:8000/admin/tenants/${tid}`, { method: "DELETE" });
      fetchStats();
    } catch (e) {
      alert("Failed to delete tenant");
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans p-6 md:p-12 selection:bg-indigo-200">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-zinc-300 pb-6 gap-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-zinc-900 flex items-center justify-center rounded-lg">
              <span className="text-white font-bold text-2xl leading-none mt-[2px]">R</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Relay Workspace</h1>
              <p className="text-sm font-semibold text-zinc-500 mt-1 uppercase tracking-widest">Multi-Tenant Management Engine</p>
            </div>
          </div>
          
          <div className="flex bg-zinc-200 p-1 rounded-xl border-2 border-zinc-300">
            <button 
              onClick={() => setActiveTab("ingest")}
              className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "ingest" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Data Ingestion
            </button>
            <button 
              onClick={() => setActiveTab("tenants")}
              className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "tenants" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Manage Tenants
            </button>
          </div>
        </header>

        <main className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          {/* Main Content Area */}
          <section className="bg-white border-2 border-zinc-300 rounded-xl p-8 shadow-sm min-h-[500px]">
            
            {activeTab === "ingest" ? (
              <>
                <h2 className="text-2xl font-bold text-zinc-900 mb-8">Vector Ingestion</h2>
                <form onSubmit={handleIngest} className="space-y-8">
                  <div className="space-y-3">
                    <label className="block text-sm font-bold uppercase tracking-wider text-zinc-600">Target Tenant ID</label>
                    <input
                      type="text"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      className="w-full bg-[#fafafa] border-2 border-zinc-300 rounded-lg px-5 py-3 text-lg font-medium text-zinc-900 focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-bold uppercase tracking-wider text-zinc-600 flex justify-between">
                      <span>Raw Corpus</span>
                      <span className="text-zinc-400">PDF or Text</span>
                    </label>
                    
                    <div className="flex gap-4 mb-4">
                      <input 
                        type="file" 
                        accept="application/pdf"
                        ref={fileInputRef}
                        onChange={(e) => {
                          setFile(e.target.files?.[0] || null);
                          if(e.target.files?.[0]) setText("");
                        }}
                        className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-zinc-200 file:text-zinc-900 hover:file:bg-zinc-300 transition-all cursor-pointer"
                      />
                    </div>

                    {!file && (
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={8}
                        className="w-full bg-[#fafafa] border-2 border-zinc-300 rounded-lg px-5 py-4 text-lg font-medium text-zinc-900 focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 outline-none transition-all resize-y placeholder-zinc-400"
                        placeholder="Paste text here or upload a PDF above..."
                        required={!file}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    {message ? (
                      <div className={`text-sm font-bold flex items-center gap-3 ${status === "success" ? "text-emerald-700" : "text-red-700"}`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${status === "success" ? "bg-emerald-600" : "bg-red-600"} animate-pulse`}></span>
                        {message}
                      </div>
                    ) : <div className="text-sm font-bold text-zinc-400">Awaiting input...</div>}

                    <button
                      type="submit"
                      disabled={status === "loading" || (!text.trim() && !file)}
                      className="bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 font-bold text-lg py-3 px-8 rounded-lg transition-colors border-2 border-zinc-900 disabled:border-zinc-300"
                    >
                      {status === "loading" ? "Processing..." : "Execute Ingest"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-zinc-900 mb-8">Tenant Roster</h2>
                <div className="space-y-4">
                  {tenantList.map((t) => (
                    <div key={t.tenant_id} className="border-2 border-zinc-300 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center bg-[#fafafa]">
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900">{t.tenant_id}</h3>
                        <p className="text-sm font-semibold text-zinc-500 mt-1">Vectors: {t.vector_count} | {t.api_key}</p>
                      </div>
                      <div className="flex gap-3 mt-4 md:mt-0">
                        <button onClick={() => handleGenerateKey(t.tenant_id)} className="bg-zinc-200 hover:bg-zinc-300 text-zinc-900 font-bold px-4 py-2 rounded-lg border-2 border-zinc-300 text-sm">
                          Gen API Key
                        </button>
                        <button onClick={() => handleDeleteTenant(t.tenant_id)} className="bg-red-100 hover:bg-red-200 text-red-900 font-bold px-4 py-2 rounded-lg border-2 border-red-300 text-sm">
                          Purge
                        </button>
                      </div>
                    </div>
                  ))}
                  {tenantList.length === 0 && <p className="text-zinc-500 font-bold text-center py-10">No tenants active.</p>}
                </div>
              </>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-8">
            <div className="bg-white border-2 border-zinc-300 rounded-xl p-8 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-6">Metrics</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-4xl font-bold text-zinc-900">{stats.vectors}</div>
                  <div className="text-xs font-bold text-zinc-500 uppercase mt-2 tracking-widest">Vectors</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-zinc-900">{stats.tenants}</div>
                  <div className="text-xs font-bold text-zinc-500 uppercase mt-2 tracking-widest">Tenants</div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
