"use client";

import React, { useState } from "react";
import { OrganisationProvider, useOrganisation } from "@/contexts/OrganisationContext";
import { Building2, Plus, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

function ProtectedAppGuard({ children }: { children: React.ReactNode }) {
  const { user, organisations, activeOrganisation, loading, error, refreshOrganisations } = useOrganisation();
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="h-10 w-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Securing session and organisation data...</p>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white px-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-6 text-center shadow-2xl">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Session Error</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => (window.location.href = "/login")}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // User has no organisations
  if (user && organisations.length === 0) {
    const handleCreateOrg = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newOrgName.trim()) return;
      try {
        setCreating(true);
        setCreateError(null);
        await api.post("/api/v1/organisations/", {
          name: newOrgName.trim(),
          currency: "GBP",
          timezone: "Europe/London",
        });
        await refreshOrganisations();
      } catch (err: any) {
        setCreateError(err.message || "Failed to create organisation");
      } finally {
        setCreating(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white px-4">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="h-12 w-12 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-white text-center mb-1">Create Your Organisation</h2>
          <p className="text-slate-400 text-sm text-center mb-6">
            Welcome to Warp Ladger. To get started with commercial accounting, set up your company entity.
          </p>

          {createError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Organisation or Business Legal Name
              </label>
              <input
                type="text"
                required
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. Apex Global Logistics Ltd"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={creating || !newOrgName.trim()}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20"
            >
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating Organisation...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Organisation
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrganisationProvider>
      <ProtectedAppGuard>{children}</ProtectedAppGuard>
    </OrganisationProvider>
  );
}
