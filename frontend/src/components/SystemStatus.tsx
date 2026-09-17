import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Database, Server, Cpu, Layers } from "lucide-react";
import { getBackendHealth, getBackendReadiness, getDatabaseHealth } from "@/lib/api";
import { DatabaseHealthStatus, HealthStatus, ReadyStatus } from "@/types";

export const SystemStatus: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [ready, setReady] = useState<ReadyStatus | null>(null);
  const [dbHealth, setDbHealth] = useState<DatabaseHealthStatus | null>(null);
  const [lastChecked, setLastChecked] = useState<string>("");

  const checkStatus = async () => {
    setLoading(true);
    const [healthRes, readyRes, dbRes] = await Promise.all([
      getBackendHealth(),
      getBackendReadiness(),
      getDatabaseHealth(),
    ]);

    setHealth(healthRes.data);
    setReady(readyRes.data);
    setDbHealth(dbRes.data);
    setLastChecked(new Date().toLocaleTimeString());
    setLoading(false);
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const isBackendHealthy = health?.status === "healthy";
  const isDbConnected = ready?.database === "connected";
  const isRedisConnected = ready?.redis === "connected";
  const hasPgVector = dbHealth?.pgvector ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">System Status</h2>
          <p className="text-xs text-gray-400 mt-1">
            Real-time health and connectivity metrics of backend services and infrastructure
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Last checked: {lastChecked || "Checking..."}</span>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="p-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-50"
            title="Refresh Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* API Backend */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Server className="w-4 h-4" />
            </div>
            {isBackendHealthy ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/40 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Operational
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-950/50 px-2.5 py-0.5 rounded-full border border-rose-800/40 font-medium">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">FastAPI Core</h3>
            <p className="text-xs text-gray-400 mt-1">API REST services & endpoints</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 text-[11px] text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Version:</span>
              <span className="text-gray-300 font-mono">{health?.version || "0.1.0"}</span>
            </div>
            <div className="flex justify-between">
              <span>Probe:</span>
              <span className="text-gray-300 font-mono">/api/v1/health</span>
            </div>
          </div>
        </div>

        {/* Database */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-sky-600/10 text-sky-400 border border-sky-500/20">
              <Database className="w-4 h-4" />
            </div>
            {isDbConnected ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/40 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-800/40 font-medium">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">PostgreSQL</h3>
            <p className="text-xs text-gray-400 mt-1">Primary relational storage engine</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 text-[11px] text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-gray-300">{ready?.database || "unavailable"}</span>
            </div>
            <div className="flex justify-between">
              <span>Engine:</span>
              <span className="text-gray-300">AsyncPG 2.0</span>
            </div>
          </div>
        </div>

        {/* Vector Search */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <Layers className="w-4 h-4" />
            </div>
            {hasPgVector ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/40 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Enabled
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-800/40 font-medium">
                <XCircle className="w-3 h-3" /> Disabled
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">pgvector Search</h3>
            <p className="text-xs text-gray-400 mt-1">High-dimensional RAG embeddings</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 text-[11px] text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Index Type:</span>
              <span className="text-gray-300 font-mono">HNSW Cosine</span>
            </div>
            <div className="flex justify-between">
              <span>Dimensions:</span>
              <span className="text-gray-300 font-mono">384-dim</span>
            </div>
          </div>
        </div>

        {/* Redis & Background Jobs */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-rose-600/10 text-rose-400 border border-rose-500/20">
              <Cpu className="w-4 h-4" />
            </div>
            {isRedisConnected ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-800/40 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-800/40 font-medium">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Redis & Celery</h3>
            <p className="text-xs text-gray-400 mt-1">Asynchronous task execution queue</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 text-[11px] text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Broker:</span>
              <span className="text-gray-300">{ready?.redis || "unavailable"}</span>
            </div>
            <div className="flex justify-between">
              <span>Worker:</span>
              <span className="text-gray-300">Celery Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
