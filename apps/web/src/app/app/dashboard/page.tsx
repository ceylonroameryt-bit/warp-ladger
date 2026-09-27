"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ArrowRight,
  CreditCard,
  Building2,
  FileText,
  Receipt,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { api, ApiError } from "@/lib/api";

interface DashboardSummaryData {
  currency: string;
  sales: {
    draft_count: number;
    draft_total: string;
    awaiting_payment_count: number;
    awaiting_payment_total: string;
    overdue_count: number;
    overdue_total: string;
  };
  purchases: {
    draft_count: number;
    draft_total: string;
    awaiting_approval_count: number;
    awaiting_approval_total: string;
    awaiting_payment_count: number;
    awaiting_payment_total: string;
    overdue_count: number;
    overdue_total: string;
  };
  documents: {
    needs_review: number;
    processing: number;
    ready_for_bill: number;
  };
  cash: {
    balance: string;
  };
}

interface BankAccountItem {
  id: string;
  account_name: string;
  account_type: string;
  currency: string;
  account_number?: string | null;
  sort_code?: string | null;
  current_balance: string;
  is_default: boolean;
}

export default function DashboardPage() {
  const { activeOrganisationId, activeOrganisation } = useOrganisation();

  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!activeOrganisationId) return;

    try {
      setLoading(true);
      setError(null);

      const [summaryRes, bankRes] = await Promise.allSettled([
        api.get<DashboardSummaryData>(`/api/v1/organisations/${activeOrganisationId}/dashboard-summary`),
        api.get<BankAccountItem[]>(`/api/v1/organisations/${activeOrganisationId}/bank-accounts`),
      ]);

      if (summaryRes.status === "fulfilled") {
        setSummary(summaryRes.value);
      } else {
        throw summaryRes.reason;
      }

      if (bankRes.status === "fulfilled") {
        setBankAccounts(bankRes.value || []);
      } else {
        setBankAccounts([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [activeOrganisationId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const currencySymbol = activeOrganisation?.currency === "USD" ? "$" : activeOrganisation?.currency === "EUR" ? "€" : "£";

  const formatAmount = (val: string | number | undefined) => {
    const num = typeof val === "number" ? val : parseFloat(val || "0");
    return `${currencySymbol}${num.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading && !summary) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse p-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
            <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
            <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
            <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error && !summary) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-xl border border-rose-200 p-8 text-center max-w-lg mx-auto shadow-sm">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900 mb-1">Unable to Load Dashboard</h2>
          <p className="text-xs text-slate-500 mb-4">{error}</p>
          <button
            onClick={loadDashboardData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const s = summary || {
    currency: "GBP",
    sales: { draft_count: 0, draft_total: "0.00", awaiting_payment_count: 0, awaiting_payment_total: "0.00", overdue_count: 0, overdue_total: "0.00" },
    purchases: { draft_count: 0, draft_total: "0.00", awaiting_approval_count: 0, awaiting_approval_total: "0.00", awaiting_payment_count: 0, awaiting_payment_total: "0.00", overdue_count: 0, overdue_total: "0.00" },
    documents: { needs_review: 0, processing: 0, ready_for_bill: 0 },
    cash: { balance: "0.00" },
  };

  const totalSalesOutstanding = parseFloat(s.sales.awaiting_payment_total) + parseFloat(s.sales.overdue_total);
  const totalBillsOutstanding = parseFloat(s.purchases.awaiting_payment_total) + parseFloat(s.purchases.overdue_total);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── TOP BANNER: ORG STATUS & QUICK ACTIONS ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Financial Overview</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                Authoritative GL Data
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeOrganisation?.name || "Your Organisation"} · Base Currency: {activeOrganisation?.currency || "GBP"} · Live Double-Entry
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadDashboardData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors"
              title="Refresh Authoritative Metrics"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/app/documents?upload=true"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              Capture Document
            </Link>
            <Link
              href="/app/sales/invoices/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#0073B7] hover:bg-[#005f96] text-white shadow-sm transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Invoice
            </Link>
            <Link
              href="/app/purchases/bills/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Bill
            </Link>
          </div>
        </div>

        {/* ── METRIC WIDGETS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ══════════════════════════════════════════════════════════ */}
          {/* WIDGET 1: INVOICES OWED TO YOU (SALES RECEIVABLES)       */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Invoices owed to you</h3>
                <p className="text-[11px] text-slate-500">Sales ledger receivables awaiting settlement</p>
              </div>
              <Link
                href="/app/sales/invoices/new"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0073B7] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> New invoice
              </Link>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total outstanding receivables</p>
                <p className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight mt-0.5">
                  {formatAmount(totalSalesOutstanding)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium block">Draft</span>
                  <span className="text-sm font-bold text-slate-700 font-mono mt-0.5 block">
                    {formatAmount(s.sales.draft_total)}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {s.sales.draft_count} {s.sales.draft_count === 1 ? "invoice" : "invoices"}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-100">
                  <span className="text-[11px] text-sky-800 font-medium block">Awaiting payment</span>
                  <span className="text-sm font-bold text-sky-900 font-mono mt-0.5 block">
                    {formatAmount(s.sales.awaiting_payment_total)}
                  </span>
                  <span className="text-[10px] text-sky-700 mt-1 block">
                    {s.sales.awaiting_payment_count} {s.sales.awaiting_payment_count === 1 ? "invoice" : "invoices"}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-100">
                  <span className="text-[11px] text-rose-800 font-medium block">Overdue</span>
                  <span className="text-sm font-bold text-rose-900 font-mono mt-0.5 block">
                    {formatAmount(s.sales.overdue_total)}
                  </span>
                  <span className="text-[10px] text-rose-700 mt-1 block">
                    {s.sales.overdue_count} {s.sales.overdue_count === 1 ? "invoice" : "invoices"}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Live sales subledger</span>
                <Link
                  href="/app/sales/invoices"
                  className="text-xs font-bold text-[#0073B7] hover:underline flex items-center gap-1"
                >
                  View all invoices ({s.sales.draft_count + s.sales.awaiting_payment_count + s.sales.overdue_count})
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* WIDGET 2: BILLS YOU NEED TO PAY (PURCHASES PAYABLES)     */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Bills you need to pay</h3>
                <p className="text-[11px] text-slate-500">Supplier accounts payable commitments</p>
              </div>
              <Link
                href="/app/purchases/bills/new"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0073B7] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> New bill
              </Link>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Total outstanding payables</p>
                <p className="text-3xl font-extrabold text-slate-900 font-mono tracking-tight mt-0.5">
                  {formatAmount(totalBillsOutstanding)}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 font-medium block">Draft</span>
                  <span className="text-xs font-bold text-slate-700 font-mono mt-0.5 block truncate">
                    {formatAmount(s.purchases.draft_total)}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {s.purchases.draft_count}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                  <span className="text-[10px] text-amber-800 font-medium block">Approval</span>
                  <span className="text-xs font-bold text-amber-900 font-mono mt-0.5 block truncate">
                    {formatAmount(s.purchases.awaiting_approval_total)}
                  </span>
                  <span className="text-[10px] text-amber-700 mt-1 block">
                    {s.purchases.awaiting_approval_count}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-sky-50/60 border border-sky-100">
                  <span className="text-[10px] text-sky-800 font-medium block">Awaiting</span>
                  <span className="text-xs font-bold text-sky-900 font-mono mt-0.5 block truncate">
                    {formatAmount(s.purchases.awaiting_payment_total)}
                  </span>
                  <span className="text-[10px] text-sky-700 mt-1 block">
                    {s.purchases.awaiting_payment_count}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-100">
                  <span className="text-[10px] text-rose-800 font-medium block">Overdue</span>
                  <span className="text-xs font-bold text-rose-900 font-mono mt-0.5 block truncate">
                    {formatAmount(s.purchases.overdue_total)}
                  </span>
                  <span className="text-[10px] text-rose-700 mt-1 block">
                    {s.purchases.overdue_count}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Live purchases subledger</span>
                <Link
                  href="/app/purchases/bills"
                  className="text-xs font-bold text-[#0073B7] hover:underline flex items-center gap-1"
                >
                  View all bills ({s.purchases.draft_count + s.purchases.awaiting_approval_count + s.purchases.awaiting_payment_count + s.purchases.overdue_count})
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* WIDGET 3: BANK ACCOUNTS & CASH POSITION                   */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Bank Accounts & Cash</h3>
                  <p className="text-[11px] text-slate-500">Authoritative balance in General Ledger</p>
                </div>
              </div>

              <Link
                href="/app/payments/new"
                className="text-xs font-semibold text-[#0073B7] hover:underline"
              >
                Record Payment
              </Link>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              {bankAccounts.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <Building2 className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800">No bank accounts configured</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1 mb-4">
                    Configure your business checking or savings account to record disbursements and deposits.
                  </p>
                  <Link
                    href="/app/payments"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0073B7] hover:bg-[#005f96] text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Bank Account
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {bankAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{account.account_name}</span>
                          {account.is_default && (
                            <span className="text-[10px] bg-sky-100 text-sky-800 font-semibold px-1.5 py-0.2 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        {(account.sort_code || account.account_number) && (
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {account.sort_code && `Sort: ${account.sort_code}`}
                            {account.sort_code && account.account_number && " · "}
                            {account.account_number && `Acc: ${account.account_number}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900 font-mono block">
                          {formatAmount(account.current_balance)}
                        </span>
                        <span className="text-[10px] text-slate-500">General Ledger Balance</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Cash balance in ledger</span>
                <span className="text-xs font-bold text-slate-900 font-mono">{formatAmount(s.cash.balance)}</span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* WIDGET 4: SMART DOCUMENT INBOX (PIPELINE)                 */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Smart Document Inbox</h3>
                    <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded">
                      Optical Capture
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">Receipt & supplier invoice processing</p>
                </div>
              </div>

              <Link
                href="/app/documents"
                className="text-xs font-bold text-[#0073B7] hover:underline"
              >
                Go to Inbox
              </Link>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <Link
                href="/app/documents?upload=true"
                className="p-4 rounded-lg border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/40 hover:bg-sky-50/80 transition-all flex items-center justify-center gap-3 group text-center"
              >
                <UploadCloud className="h-6 w-6 text-sky-600 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="text-xs font-bold text-slate-800">Upload PDF invoice or receipt</p>
                  <p className="text-[11px] text-slate-500">Auto-extracted, security scanned & ready for human review</p>
                </div>
              </Link>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                  <span className="text-lg font-bold text-slate-900 font-mono block">{s.documents.processing}</span>
                  <span className="text-[10px] text-slate-500 font-medium">Processing</span>
                </div>
                <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100 text-center">
                  <span className="text-lg font-bold text-amber-900 font-mono block">{s.documents.needs_review}</span>
                  <span className="text-[10px] text-amber-800 font-medium">Needs Review</span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100 text-center">
                  <span className="text-lg font-bold text-emerald-900 font-mono block">{s.documents.ready_for_bill}</span>
                  <span className="text-[10px] text-emerald-800 font-medium">Ready for Bill</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {s.documents.needs_review + s.documents.processing + s.documents.ready_for_bill} active documents
                </span>
                <Link
                  href="/app/documents"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#0073B7] hover:underline"
                >
                  Manage documents in Inbox
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
