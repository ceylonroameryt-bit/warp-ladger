"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Receipt,
  ChevronLeft,
  ChevronRight,
  X,
  FileClock,
  Filter,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import BillStatusBadge from "@/components/BillStatusBadge";
import { useOrganisation } from "@/contexts/OrganisationContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface BillItem {
  id: string;
  internal_bill_number?: string;
  supplier_invoice_number: string;
  supplier_name_snapshot?: string;
  bill_date: string;
  due_date: string;
  total: string | number;
  currency: string;
  status: string;
  effective_status: string;
  amount_due: string | number;
}

interface BillStats {
  draftCount: number;
  draftTotal: number;
  approvalCount: number;
  approvalTotal: number;
  awaitingCount: number;
  awaitingTotal: number;
  overdueCount: number;
  overdueTotal: number;
  paidCount: number;
  paidTotal: number;
}

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Awaiting Approval", value: "AWAITING_APPROVAL" },
  { label: "Awaiting Payment", value: "AWAITING_PAYMENT" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Paid", value: "PAID" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Void", value: "VOID" },
];

function fmt(v: string | number | undefined, currency = "GBP") {
  if (v === undefined || v === null) return "£0.00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  const s = { GBP: "£", USD: "$", EUR: "€" }[currency] ?? currency + " ";
  return `${s}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function BillListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bills, setBills] = useState<BillItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedBills, setSelectedBills] = useState<string[]>([]);

  const { activeOrganisationId } = useOrganisation();

  const [stats, setStats] = useState<BillStats>({
    draftCount: 0,
    draftTotal: 0,
    approvalCount: 0,
    approvalTotal: 0,
    awaitingCount: 0,
    awaitingTotal: 0,
    overdueCount: 0,
    overdueTotal: 0,
    paidCount: 0,
    paidTotal: 0,
  });

  const statusFilter = searchParams.get("status") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");

  const fetchBills = useCallback(async () => {
    if (!activeOrganisationId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("page_size", "20");

      const res = await fetch(
        `${API_BASE}/api/v1/organisations/${activeOrganisationId}/bills?${params.toString()}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setBills(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch {
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrganisationId, statusFilter, search, page]);

  // Load summary metrics from authoritative server endpoint
  useEffect(() => {
    if (!activeOrganisationId) return;
    async function loadStats() {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/organisations/${activeOrganisationId}/bills/metrics`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setStats({
            draftCount: data.draft_count ?? 0,
            draftTotal: parseFloat(data.draft_total ?? "0"),
            approvalCount: data.awaiting_approval_count ?? 0,
            approvalTotal: parseFloat(data.awaiting_approval_total ?? "0"),
            awaitingCount: data.awaiting_payment_count ?? 0,
            awaitingTotal: parseFloat(data.awaiting_payment_total ?? "0"),
            overdueCount: data.overdue_count ?? 0,
            overdueTotal: parseFloat(data.overdue_total ?? "0"),
            paidCount: data.paid_count ?? 0,
            paidTotal: parseFloat(data.paid_total ?? "0"),
          });
        }
      } catch {
        // Retain 0
      }
    }
    loadStats();
  }, [activeOrganisationId]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const updateUrl = (newStatus: string, newSearch: string, newPage: number) => {
    const p = new URLSearchParams();
    if (newStatus) p.set("status", newStatus);
    if (newSearch) p.set("search", newSearch);
    if (newPage > 1) p.set("page", String(newPage));
    router.push(`/app/purchases/bills?${p.toString()}`);
  };

  const handleTabClick = (val: string) => {
    updateUrl(val, search, 1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    updateUrl(statusFilter, searchInput, 1);
  };

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedBills(bills.map((b) => b.id));
    } else {
      setSelectedBills([]);
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedBills((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ── TOP HEADER (Supplier Bills Title & Action Bar) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Supplier Bills</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage accounts payable, supplier obligations, and payment terms
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/app/documents"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              Capture Bills
            </Link>
            <Link
              href="/app/purchases/approvals"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs transition-colors"
            >
              <FileClock className="h-3.5 w-3.5 text-amber-500" />
              Approvals ({stats.approvalCount})
            </Link>
            <Link
              href="/app/purchases/bills/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0073B7] hover:bg-[#005f96] rounded-md shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Bill
            </Link>
          </div>
        </div>

        {/* ── STATUS METRIC TABS BANNER ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => handleTabClick("DRAFT")}
            className={`p-3.5 rounded-lg text-left transition-all border ${
              statusFilter === "DRAFT"
                ? "bg-white border-[#0073B7] ring-1 ring-[#0073B7] shadow-sm"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 block">
              Draft ({stats.draftCount})
            </span>
            <span className="text-base font-bold text-slate-900 font-mono mt-1 block">
              {fmt(stats.draftTotal)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("AWAITING_APPROVAL")}
            className={`p-3.5 rounded-lg text-left transition-all border ${
              statusFilter === "AWAITING_APPROVAL"
                ? "bg-white border-[#0073B7] ring-1 ring-[#0073B7] shadow-sm"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="text-[11px] font-semibold text-amber-700 block">
              Awaiting Approval ({stats.approvalCount})
            </span>
            <span className="text-base font-bold text-slate-900 font-mono mt-1 block">
              {fmt(stats.approvalTotal)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("AWAITING_PAYMENT")}
            className={`p-3.5 rounded-lg text-left transition-all border ${
              statusFilter === "AWAITING_PAYMENT"
                ? "bg-white border-[#0073B7] ring-1 ring-[#0073B7] shadow-sm"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="text-[11px] font-semibold text-sky-700 block">
              Awaiting Payment ({stats.awaitingCount})
            </span>
            <span className="text-base font-bold text-slate-900 font-mono mt-1 block">
              {fmt(stats.awaitingTotal)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("OVERDUE")}
            className={`p-3.5 rounded-lg text-left transition-all border ${
              statusFilter === "OVERDUE"
                ? "bg-white border-[#0073B7] ring-1 ring-[#0073B7] shadow-sm"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="text-[11px] font-semibold text-rose-600 block">
              Overdue ({stats.overdueCount})
            </span>
            <span className="text-base font-bold text-slate-900 font-mono mt-1 block">
              {fmt(stats.overdueTotal)}
            </span>
          </button>
        </div>

        {/* ── FILTER TABS & SEARCH ROW ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
          {/* Horizontal Status Pills */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabClick(tab.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                  statusFilter === tab.value
                    ? "bg-[#0073B7] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by bill #, supplier, invoice..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-slate-200 focus:outline-none focus:border-[#0073B7]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                    updateUrl(statusFilter, "", 1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-md transition-colors"
            >
              Filter
            </button>
          </form>
        </div>

        {/* ── BILLS TABLE ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selectedBills.length === bills.length && bills.length > 0}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-[#0073B7] focus:ring-[#0073B7]"
                    />
                  </th>
                  <th className="px-5 py-3.5">Bill #</th>
                  <th className="px-5 py-3.5">Supplier</th>
                  <th className="px-5 py-3.5">Supplier Invoice #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Due Date</th>
                  <th className="px-5 py-3.5 text-right">Total</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-xs text-slate-400">
                      Loading bills...
                    </td>
                  </tr>
                ) : bills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                          <Receipt className="h-6 w-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">No bills found</h3>
                        <p className="text-xs text-slate-400 max-w-sm mt-1">
                          {statusFilter || search
                            ? "No supplier bills match your active filter or search query."
                            : "Record your first supplier invoice to keep track of payable obligations."}
                        </p>
                        <Link
                          href="/app/purchases/bills/new"
                          className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0073B7] hover:bg-[#005f96] rounded-md transition-colors"
                        >
                          + New Supplier Bill
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => {
                    const isOverdue =
                      bill.effective_status === "OVERDUE" ||
                      (bill.due_date && new Date(bill.due_date) < new Date() && bill.effective_status !== "PAID");
                    const isSelected = selectedBills.includes(bill.id);

                    return (
                      <tr
                        key={bill.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? "bg-sky-50/40" : ""
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(bill.id)}
                            className="rounded border-slate-300 text-[#0073B7] focus:ring-[#0073B7]"
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/app/purchases/bills/${bill.id}`}
                            className="font-bold text-[#0073B7] hover:underline"
                          >
                            {bill.internal_bill_number || "Draft Bill"}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-900">
                          {bill.supplier_name_snapshot || "Standard Supplier"}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-500">
                          {bill.supplier_invoice_number || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{fmtDate(bill.bill_date)}</td>
                        <td className="px-5 py-3.5">
                          <span className={isOverdue ? "text-rose-600 font-bold" : "text-slate-600"}>
                            {fmtDate(bill.due_date)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                          {fmt(bill.total, bill.currency)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <BillStatusBadge status={bill.effective_status} size="sm" />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={`/app/purchases/bills/${bill.id}`}
                            className="font-semibold text-[#0073B7] hover:underline"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Page <span className="font-semibold text-slate-700">{page}</span> of{" "}
                <span className="font-semibold text-slate-700">{totalPages}</span> ({total} bills)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateUrl(statusFilter, search, page - 1)}
                  disabled={page <= 1}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => updateUrl(statusFilter, search, page + 1)}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function BillListPage() {
  return (
    <React.Suspense fallback={null}>
      <BillListContent />
    </React.Suspense>
  );
}
