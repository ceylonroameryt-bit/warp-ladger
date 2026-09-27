"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  email_verified: boolean;
  is_superadmin: boolean;
  locale: string;
  timezone: string;
}

export interface OrganisationItem {
  id: string;
  name: string;
  slug: string;
  currency: string;
  status: string;
  company_number?: string | null;
  vat_number?: string | null;
  logo_url?: string | null;
  role?: string | null;
  financial_year_end_month?: number | null;
  financial_year_end_day?: number | null;
}

interface OrganisationContextValue {
  user: UserProfile | null;
  organisations: OrganisationItem[];
  activeOrganisation: OrganisationItem | null;
  activeOrganisationId: string | null;
  loading: boolean;
  error: string | null;
  switchOrganisation: (orgId: string) => void;
  refreshOrganisations: () => Promise<void>;
  logout: () => Promise<void>;
}

const OrganisationContext = createContext<OrganisationContextValue | undefined>(undefined);

export function OrganisationProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organisations, setOrganisations] = useState<OrganisationItem[]>([]);
  const [activeOrganisation, setActiveOrganisation] = useState<OrganisationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch user profile
      const userRes = await api.get<UserProfile>("/api/v1/auth/me");
      setUser(userRes);

      // Check email verification if required
      if (!userRes.email_verified && !pathname.startsWith("/verify-email") && !pathname.startsWith("/login")) {
        // Warning or onboarding state
      }

      // 2. Fetch organisations
      const orgsRes = await api.get<OrganisationItem[]>("/api/v1/organisations/");
      setOrganisations(orgsRes || []);

      if (orgsRes && orgsRes.length > 0) {
        const storedOrgId = typeof window !== "undefined" ? localStorage.getItem("active_org_id") : null;
        const matched = orgsRes.find((o) => o.id === storedOrgId);
        const selected = matched || orgsRes[0];
        setActiveOrganisation(selected);
        if (typeof window !== "undefined") {
          localStorage.setItem("active_org_id", selected.id);
        }
      } else {
        setActiveOrganisation(null);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        // Redirection handled by apiFetch
        return;
      }
      setError(err?.message || "Failed to load organisation context");
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const switchOrganisation = useCallback(
    (orgId: string) => {
      const target = organisations.find((o) => o.id === orgId);
      if (target) {
        setActiveOrganisation(target);
        if (typeof window !== "undefined") {
          localStorage.setItem("active_org_id", target.id);
        }
      }
    },
    [organisations]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("active_org_id");
      }
      setUser(null);
      setActiveOrganisation(null);
      setOrganisations([]);
      router.push("/login");
    }
  }, [router]);

  return (
    <OrganisationContext.Provider
      value={{
        user,
        organisations,
        activeOrganisation,
        activeOrganisationId: activeOrganisation?.id || null,
        loading,
        error,
        switchOrganisation,
        refreshOrganisations: loadData,
        logout,
      }}
    >
      {children}
    </OrganisationContext.Provider>
  );
}

export function useOrganisation() {
  const context = useContext(OrganisationContext);
  if (!context) {
    throw new Error("useOrganisation must be used within an OrganisationProvider");
  }
  return context;
}
