import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Database, Server, Cpu } from "lucide-react";
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
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const isBackendHealthy = health?.status === "healthy";
  const isDbConnected = ready?.database === "connected";
  const isRedisConnected = ready?.redis === "connected";
  const hasPgVector = dbHealth?.pgvector ?? false;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-white">System Health & Services</h2>
          <p className="text-xs text-gray-400">
            Real-time status of Phase 0 microservices and infrastructure
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Backend Process */}
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-gray-200">FastAPI Process</span>
            </div>
            {isBackendHealthy ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" /> Healthy
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded-full border border-rose-800/40">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            <div>Version: <span className="text-gray-300">{health?.version || "N/A"}</span></div>
            <div>Probe: <span className="text-gray-300 font-mono">/api/v1/health</span></div>
          </div>
        </div>

        {/* PostgreSQL & pgvector */}
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-medium text-gray-200">PostgreSQL / pgvector</span>
            </div>
            {isDbConnected ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-800/40">
                <XCircle className="w-3 h-3" /> Unavailable
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            <div>Status: <span className="text-gray-300">{ready?.database || "unavailable"}</span></div>
            <div>pgvector: <span className={hasPgVector ? "text-emerald-400 font-medium" : "text-gray-400"}>{hasPgVector ? "Enabled" : "Not Initialized"}</span></div>
          </div>
        </div>

        {/* Redis & Celery */}
        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-rose-400" />
              <span className="text-sm font-medium text-gray-200">Redis & Celery</span>
            </div>
            {isRedisConnected ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-800/40">
                <XCircle className="w-3 h-3" /> Unavailable
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            <div>Status: <span className="text-gray-300">{ready?.redis || "unavailable"}</span></div>
            <div>Worker: <span className="text-gray-300">Celery 5.x Ready</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
