"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"ingest" | "tenants" | "chats" | "kb">("ingest");
  
  // Ingest State
  const [tenantId, setTenantId] = useState("demo_tenant");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  
  // Stats & Entities
  const [stats, setStats] = useState({ vectors: 0, tenants: 0 });
  const [tenantList, setTenantList] = useState<any[]>([]);
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Tenant State
  const [newTenantId, setNewTenantId] = useState("");
  const [newTenantPrompt, setNewTenantPrompt] = useState("You are a helpful assistant.");
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);

  // Edit Prompt State
  const [editingTenant, setEditingTenant] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  
  // Edit Widget Config State
  const [editingWidget, setEditingWidget] = useState<string | null>(null);
  const [widgetConfig, setWidgetConfig] = useState({ primary_color: "", widget_title: "", bot_avatar_url: "", allowed_domains: "" });

  const fetchStats = async () => {
    try {
      const res = await fetch("http://localhost:8000/stats");
      if (res.ok) setStats(await res.json());
      
      const tenantsRes = await fetch("http://localhost:8000/admin/tenants");
      if (tenantsRes.ok) setTenantList(await tenantsRes.json());
      
      const chatsRes = await fetch("http://localhost:8000/admin/chats");
      if (chatsRes.ok) setChatLogs(await chatsRes.json());
      
      const docsRes = await fetch("http://localhost:8000/admin/documents");
      if (docsRes.ok) setDocuments(await docsRes.json());
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    chatLogs.forEach(log => {
      const date = new Date(log.created_at).toLocaleDateString();
      counts[date] = (counts[date] || 0) + 1;
    });
    // Ensure chronological order since chatLogs is DESC
    return Object.keys(counts).map(date => ({ date, chats: counts[date] })).reverse();
  }, [chatLogs]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) return;
    if (!text.trim() && !file) return;

    setStatus("loading");
    setMessage("");

    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        res = await fetch("http://localhost:8000/admin/ingest/file", {
          method: "POST",
          headers: { "X-Tenant-ID": tenantId },
          body: formData,
        });
      } else {
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

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newTenantId.trim()) return;
    try {
      const res = await fetch("http://localhost:8000/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: newTenantId, system_prompt: newTenantPrompt })
      });
      if(!res.ok) throw new Error("Failed to create tenant");
      setNewTenantId("");
      setIsCreatingTenant(false);
      fetchStats();
    } catch(err) {
      alert("Error creating tenant");
    }
  };

  const handleUpdatePrompt = async (tid: string) => {
    try {
      const res = await fetch(`http://localhost:8000/admin/tenants/${tid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt: editPrompt })
      });
      if(!res.ok) throw new Error("Failed to update prompt");
      setEditingTenant(null);
      fetchStats();
    } catch(err) {
      alert("Error updating prompt");
    }
  };

  const handleUpdateWidget = async (tid: string) => {
    try {
      const res = await fetch(`http://localhost:8000/admin/tenants/${tid}/widget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(widgetConfig)
      });
      if(!res.ok) throw new Error("Failed to update widget config");
      setEditingWidget(null);
      fetchStats();
    } catch(err) {
      alert("Error updating widget config");
    }
  };

  const handleGenerateKey = async (tid: string) => {
    try {
      await fetch(`http://localhost:8000/admin/tenants/${tid}/api-key`, { method: "POST" });
      fetchStats();
    } catch (e) {
      alert("Failed to generate key");
    }
  };

  const handleDeleteTenant = async (tid: string) => {
    if (!confirm(`WARNING: This will purge ALL vectors and chat logs for ${tid}. Continue?`)) return;
    try {
      await fetch(`http://localhost:8000/admin/tenants/${tid}`, { method: "DELETE" });
      fetchStats();
    } catch (e) {
      alert("Failed to delete tenant");
    }
  };

  const handleDeleteDocument = async (tid: string, fname: string) => {
    if (!confirm(`Delete all chunks for document ${fname}?`)) return;
    try {
      await fetch(`http://localhost:8000/admin/documents/${tid}/${encodeURIComponent(fname)}`, { method: "DELETE" });
      fetchStats();
    } catch (e) {
      alert("Failed to delete document");
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans p-6 md:p-12 selection:bg-indigo-200">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-zinc-300 pb-6 gap-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-zinc-900 flex items-center justify-center rounded-lg shadow-sm">
              <span className="text-white font-bold text-2xl leading-none mt-[2px]">R</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Relay Workspace</h1>
              <p className="text-sm font-semibold text-zinc-500 mt-1 uppercase tracking-widest">Multi-Tenant Management Engine</p>
            </div>
          </div>
          
          <div className="flex bg-zinc-200 p-1 rounded-xl border-2 border-zinc-300 flex-wrap gap-1">
            <button 
              onClick={() => setActiveTab("ingest")}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "ingest" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Data Ingestion
            </button>
            <button 
              onClick={() => setActiveTab("tenants")}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "tenants" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Tenants & Widget
            </button>
            <button 
              onClick={() => setActiveTab("kb")}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "kb" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Knowledge Base
            </button>
            <button 
              onClick={() => setActiveTab("chats")}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "chats" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              Chat Logs
            </button>
          </div>
        </header>

        <main className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          {/* Main Content Area */}
          <section className="bg-white border-2 border-zinc-300 rounded-xl p-8 shadow-sm min-h-[600px]">
            
            {activeTab === "ingest" && (
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
            )}

            {activeTab === "tenants" && (
              <>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-zinc-900">Tenant Roster</h2>
                  <button onClick={() => setIsCreatingTenant(!isCreatingTenant)} className="bg-zinc-900 text-white font-bold px-4 py-2 rounded-lg text-sm">
                    {isCreatingTenant ? "Cancel" : "+ New Tenant"}
                  </button>
                </div>
                
                {isCreatingTenant && (
                  <form onSubmit={handleCreateTenant} className="mb-8 p-6 bg-zinc-100 border-2 border-zinc-300 rounded-xl space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-zinc-600 mb-1">Tenant ID</label>
                      <input type="text" value={newTenantId} onChange={e=>setNewTenantId(e.target.value)} required className="w-full border-2 border-zinc-300 rounded-lg px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-zinc-600 mb-1">System Prompt</label>
                      <textarea value={newTenantPrompt} onChange={e=>setNewTenantPrompt(e.target.value)} required className="w-full border-2 border-zinc-300 rounded-lg px-3 py-2" rows={3}></textarea>
                    </div>
                    <button type="submit" className="bg-zinc-900 text-white font-bold px-4 py-2 rounded-lg text-sm">Create</button>
                  </form>
                )}

                <div className="space-y-6">
                  {tenantList.map((t) => (
                    <div key={t.tenant_id} className="border-2 border-zinc-300 rounded-xl p-5 bg-[#fafafa]">
                      <div className="flex flex-col md:flex-row justify-between items-start">
                        <div className="flex-1 w-full mr-4">
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-zinc-900">{t.tenant_id}</h3>
                            <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">Vectors: {t.vector_count}</span>
                          </div>
                          <p className="text-sm font-mono text-zinc-500 mt-1 break-all">API Key: {t.api_key}</p>
                          
                          {/* System Prompt Section */}
                          <div className="mt-4">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold uppercase text-zinc-500">System Prompt</span>
                              {editingTenant !== t.tenant_id && (
                                <button onClick={() => { setEditingTenant(t.tenant_id); setEditPrompt(t.system_prompt); }} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold">Edit</button>
                              )}
                            </div>
                            {editingTenant === t.tenant_id ? (
                              <div className="w-full">
                                <textarea className="w-full border-2 border-zinc-300 rounded-lg px-3 py-2 text-sm" rows={3} value={editPrompt} onChange={e=>setEditPrompt(e.target.value)}></textarea>
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleUpdatePrompt(t.tenant_id)} className="bg-zinc-900 text-white font-bold px-3 py-1 rounded text-xs">Save Prompt</button>
                                  <button onClick={() => setEditingTenant(null)} className="bg-zinc-300 text-zinc-700 font-bold px-3 py-1 rounded text-xs">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-zinc-700 italic border-l-4 border-zinc-300 pl-3">"{t.system_prompt}"</p>
                            )}
                          </div>

                          {/* Widget Config Section */}
                          <div className="mt-6 border-t-2 border-zinc-200 pt-4">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs font-bold uppercase text-zinc-500">Widget Customization</span>
                              {editingWidget !== t.tenant_id && (
                                <button onClick={() => { 
                                  setEditingWidget(t.tenant_id); 
                                  setWidgetConfig({ primary_color: t.primary_color, widget_title: t.widget_title, bot_avatar_url: t.bot_avatar_url, allowed_domains: t.allowed_domains }); 
                                }} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold">Configure</button>
                              )}
                            </div>
                            
                            {editingWidget === t.tenant_id ? (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><label className="block text-xs font-bold text-zinc-600">Title</label><input type="text" className="w-full border-2 border-zinc-300 rounded p-1" value={widgetConfig.widget_title} onChange={e=>setWidgetConfig({...widgetConfig, widget_title: e.target.value})}/></div>
                                <div><label className="block text-xs font-bold text-zinc-600">Color</label><input type="color" className="w-full h-8 border-2 border-zinc-300 rounded" value={widgetConfig.primary_color} onChange={e=>setWidgetConfig({...widgetConfig, primary_color: e.target.value})}/></div>
                                <div className="col-span-2"><label className="block text-xs font-bold text-zinc-600">Avatar URL</label><input type="text" className="w-full border-2 border-zinc-300 rounded p-1" value={widgetConfig.bot_avatar_url} onChange={e=>setWidgetConfig({...widgetConfig, bot_avatar_url: e.target.value})}/></div>
                                <div className="col-span-2"><label className="block text-xs font-bold text-zinc-600">Allowed Domains (CORS)</label><input type="text" className="w-full border-2 border-zinc-300 rounded p-1" value={widgetConfig.allowed_domains} onChange={e=>setWidgetConfig({...widgetConfig, allowed_domains: e.target.value})}/></div>
                                <div className="col-span-2 flex gap-2 mt-2">
                                  <button onClick={() => handleUpdateWidget(t.tenant_id)} className="bg-zinc-900 text-white font-bold px-3 py-1 rounded text-xs">Save Config</button>
                                  <button onClick={() => setEditingWidget(null)} className="bg-zinc-300 text-zinc-700 font-bold px-3 py-1 rounded text-xs">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-4 items-center">
                                <div className="w-6 h-6 rounded-full" style={{backgroundColor: t.primary_color}}></div>
                                <span className="text-sm font-bold text-zinc-700">{t.widget_title}</span>
                                <span className="text-xs text-zinc-500 bg-zinc-200 px-2 py-1 rounded">CORS: {t.allowed_domains}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 mt-4 md:mt-0 min-w-[120px]">
                          <button onClick={() => handleGenerateKey(t.tenant_id)} className="bg-zinc-200 hover:bg-zinc-300 text-zinc-900 font-bold px-3 py-2 rounded-lg border-2 border-zinc-300 text-xs text-center">Gen API Key</button>
                          <button onClick={() => handleDeleteTenant(t.tenant_id)} className="bg-red-100 hover:bg-red-200 text-red-900 font-bold px-3 py-2 rounded-lg border-2 border-red-300 text-xs text-center">Purge DB</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {tenantList.length === 0 && <p className="text-zinc-500 font-bold text-center py-10">No tenants active.</p>}
                </div>
              </>
            )}

            {activeTab === "kb" && (
              <>
                <h2 className="text-2xl font-bold text-zinc-900 mb-8">Knowledge Base</h2>
                <div className="overflow-x-auto border-2 border-zinc-300 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-100 border-b-2 border-zinc-300 text-zinc-700 uppercase font-bold text-xs">
                      <tr>
                        <th className="px-6 py-4">Tenant ID</th>
                        <th className="px-6 py-4">Filename / Source</th>
                        <th className="px-6 py-4">Chunks</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc, i) => (
                        <tr key={i} className="border-b border-zinc-200 hover:bg-zinc-50">
                          <td className="px-6 py-4 font-bold">{doc.tenant_id}</td>
                          <td className="px-6 py-4 text-zinc-600 font-mono">{doc.filename}</td>
                          <td className="px-6 py-4">
                            <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">{doc.chunks} vectors</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDeleteDocument(doc.tenant_id, doc.filename)} className="text-red-600 hover:text-red-800 font-bold text-xs uppercase tracking-wider">
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {documents.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-zinc-500 font-bold">No documents indexed yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeTab === "chats" && (
              <>
                <h2 className="text-2xl font-bold text-zinc-900 mb-8">Chat Logs Monitor</h2>
                <div className="space-y-6">
                  {chatLogs.map((log) => (
                    <div key={log.id} className="border-2 border-zinc-300 rounded-xl p-5 bg-[#fafafa]">
                      <div className="flex justify-between items-center mb-3 border-b-2 border-zinc-200 pb-2">
                        <span className="font-bold text-sm text-zinc-700">{log.tenant_id}</span>
                        <span className="text-xs text-zinc-500 font-mono">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className={`px-2 py-1 text-xs font-bold uppercase rounded ${log.role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {log.role}
                        </span>
                        <p className="text-sm text-zinc-800 whitespace-pre-wrap">{log.content}</p>
                      </div>
                    </div>
                  ))}
                  {chatLogs.length === 0 && <p className="text-zinc-500 font-bold text-center py-10">No chat logs found.</p>}
                </div>
              </>
            )}

          </section>

          {/* Sidebar */}
          <aside className="space-y-8">
            <div className="bg-white border-2 border-zinc-300 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-6">Metrics</h3>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div>
                  <div className="text-3xl font-bold text-zinc-900">{stats.vectors}</div>
                  <div className="text-xs font-bold text-zinc-500 uppercase mt-1 tracking-widest">Vectors</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-zinc-900">{stats.tenants}</div>
                  <div className="text-xs font-bold text-zinc-500 uppercase mt-1 tracking-widest">Tenants</div>
                </div>
              </div>

              {chartData.length > 0 && (
                <div className="mt-8 border-t-2 border-zinc-200 pt-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-4">Chat Activity</h3>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="chats" stroke="#0f172a" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
