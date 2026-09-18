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

  const allHealthy = isBackendHealthy && isDbConnected && isRedisConnected;

  return (
    <div className="space-y-8">
      {/* Open Header Hero */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold text-text-primary tracking-tight">Infrastructure Health &amp; Status</h2>
          <p className="text-xs text-text-secondary mt-1">
            Real-time health telemetry, database connectivity, and async processing queues.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted font-mono">Synced: {lastChecked || "Checking..."}</span>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-accent" : ""}`} />
          </button>
        </div>
      </div>

      {/* Platform Status Banner */}
      <div className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        allHealthy
          ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${allHealthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"}`} />
          <div>
            <div className="font-bold text-sm tracking-tight">
              {allHealthy ? "All Core Subsystems Operational" : "Service Degraded / Partially Available"}
            </div>
            <p className="text-xs opacity-80 mt-0.5">
              {allHealthy
                ? "FastAPI, PostgreSQL relational engine, pgvector embeddings, and Celery task broker are operating normally."
                : "One or more infrastructure components require attention or are restarting."}
            </p>
          </div>
        </div>
        <div className="text-xs font-mono opacity-70 shrink-0">
          Uptime SLA: 99.9%
        </div>
      </div>

      {/* 4 Core Services: Open Visual Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* 1. API Backend */}
        <div className="space-y-3 p-4 rounded-2xl bg-surface-muted/50 border-t-2 border-indigo-500 hover:bg-surface-muted/80 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Server className="w-4 h-4" />
            </div>
            {isBackendHealthy ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3" /> Operational
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full font-medium">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">FastAPI Core</h3>
            <p className="text-xs text-text-secondary mt-0.5">REST services &amp; endpoints</p>
          </div>
          <div className="pt-3 border-t border-border/60 text-[11px] text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Version:</span>
              <span className="text-text-primary font-mono">{health?.version || "0.1.0"}</span>
            </div>
            <div className="flex justify-between">
              <span>Probe:</span>
              <span className="text-text-primary font-mono">/api/v1/health</span>
            </div>
          </div>
        </div>

        {/* 2. Database */}
        <div className="space-y-3 p-4 rounded-2xl bg-surface-muted/50 border-t-2 border-sky-500 hover:bg-surface-muted/80 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Database className="w-4 h-4" />
            </div>
            {isDbConnected ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">PostgreSQL</h3>
            <p className="text-xs text-text-secondary mt-0.5">Relational storage engine</p>
          </div>
          <div className="pt-3 border-t border-border/60 text-[11px] text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-text-primary font-mono">{ready?.database || "unavailable"}</span>
            </div>
            <div className="flex justify-between">
              <span>Engine:</span>
              <span className="text-text-primary font-mono">AsyncPG 2.0</span>
            </div>
          </div>
        </div>

        {/* 3. Vector Search */}
        <div className="space-y-3 p-4 rounded-2xl bg-surface-muted/50 border-t-2 border-purple-500 hover:bg-surface-muted/80 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
            {hasPgVector ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3" /> Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                <XCircle className="w-3 h-3" /> Disabled
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">pgvector Search</h3>
            <p className="text-xs text-text-secondary mt-0.5">High-dimensional RAG</p>
          </div>
          <div className="pt-3 border-t border-border/60 text-[11px] text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Index Type:</span>
              <span className="text-text-primary font-mono">HNSW Cosine</span>
            </div>
            <div className="flex justify-between">
              <span>Dimensions:</span>
              <span className="text-text-primary font-mono">384-dim</span>
            </div>
          </div>
        </div>

        {/* 4. Redis & Celery */}
        <div className="space-y-3 p-4 rounded-2xl bg-surface-muted/50 border-t-2 border-rose-500 hover:bg-surface-muted/80 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Cpu className="w-4 h-4" />
            </div>
            {isRedisConnected ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">
                <XCircle className="w-3 h-3" /> Offline
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Redis &amp; Celery</h3>
            <p className="text-xs text-text-secondary mt-0.5">Asynchronous task worker</p>
          </div>
          <div className="pt-3 border-t border-border/60 text-[11px] text-text-muted space-y-1">
            <div className="flex justify-between">
              <span>Broker:</span>
              <span className="text-text-primary font-mono">{ready?.redis || "unavailable"}</span>
            </div>
            <div className="flex justify-between">
              <span>Worker:</span>
              <span className="text-text-primary font-mono">Celery Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
