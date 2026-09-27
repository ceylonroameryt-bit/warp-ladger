"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileText,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { api } from "@/lib/api";

interface AgedItemDetail {
  document_id: string;
  document_number: string;
  reference?: string | null;
  issue_date: string;
  due_date: string;
  days_overdue: number;
  total_amount: number | string;
  paid_amount: number | string;
  remaining_balance: number | string;
  bucket: "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_OVER_90";
}

interface AgedContactSummary {
  contact_id: string;
  contact_name: string;
  company_number?: string | null;
  currency: string;
  current: number | string;
  days_1_30: number | string;
  days_31_60: number | string;
  days_61_90: number | string;
  days_over_90: number | string;
  total: number | string;
  items: AgedItemDetail[];
}

interface AgedReportSummaryBuckets {
  current: number | string;
  days_1_30: number | string;
  days_31_60: number | string;
  days_61_90: number | string;
  days_over_90: number | string;
  grand_total: number | string;
}

interface AgedReportResponse {
  report_type: "RECEIVABLES" | "PAYABLES";
  as_of_date: string;
  contacts: AgedContactSummary[];
  totals: AgedReportSummaryBuckets;
  currency: string;
  generated_at: string;
}

const EMPTY_AGED_RECEIVABLES: AgedReportResponse = {
  report_type: "RECEIVABLES",
  as_of_date: new Date().toISOString().split("T")[0],
  totals: {
    current: "0.00",
    days_1_30: "0.00",
    days_31_60: "0.00",
    days_61_90: "0.00",
    days_over_90: "0.00",
    grand_total: "0.00",
  },
  contacts: [],
  currency: "GBP",
  generated_at: new Date().toISOString(),
};

function fmtCur(amount: number | string | undefined | null, currency = "GBP") {
  if (amount === undefined || amount === null) return "£0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(num);
}

export default function AgedReceivablesPage() {
  const { activeOrganisation, activeOrganisationId } = useOrganisation();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<AgedReportResponse>(EMPTY_AGED_RECEIVABLES);
  const [loading, setLoading] = useState(true);
  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>({});

  const toggleContact = (id: string) => {
    setExpandedContacts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchReport = useCallback(async () => {
    if (!activeOrganisationId) return;
    setLoading(true);
    try {
      const data = await api.get<AgedReportResponse>(
        `/api/v1/organisations/${activeOrganisationId}/reports/aged-receivables?as_of_date=${asOfDate}`
      );
      if (data && data.totals) {
        setReport(data);
      } else {
        setReport(EMPTY_AGED_RECEIVABLES);
      }
    } catch {
      setReport(EMPTY_AGED_RECEIVABLES);
    } finally {
      setLoading(false);
    }
  }, [activeOrganisationId, asOfDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCSV = () => {
    const rows = [
      ["Aged Receivables (Debtors Aging Report)"],
      [`Entity: ${activeOrganisation?.name || "Warp Organisation"}`],
      [`As of Date: ${report.as_of_date}`],
      [`Currency: ${report.currency}`],
      [],
      ["Customer Name", "Company No", "Current (£)", "1-30 Days (£)", "31-60 Days (£)", "61-90 Days (£)", ">90 Days (£)", "Total Outstanding (£)"],
      ...report.contacts.map((c) => [
        `"${c.contact_name.replace(/"/g, '""')}"`,
        c.company_number || "",
        Number(c.current).toFixed(2),
        Number(c.days_1_30).toFixed(2),
        Number(c.days_31_60).toFixed(2),
        Number(c.days_61_90).toFixed(2),
        Number(c.days_over_90).toFixed(2),
        Number(c.total).toFixed(2),
      ]),
      [
        '"TOTAL"',
        '""',
        Number(report.totals.current).toFixed(2),
        Number(report.totals.days_1_30).toFixed(2),
        Number(report.totals.days_31_60).toFixed(2),
        Number(report.totals.days_61_90).toFixed(2),
        Number(report.totals.days_over_90).toFixed(2),
        Number(report.totals.grand_total).toFixed(2),
      ],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aged_receivables_${report.as_of_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* ── TOP HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <Link href="/app/reports" className="hover:text-[#0073B7]">
                Reports
              </Link>
              <span>/</span>
              <span className="text-slate-800">Aged Receivables</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              Aged Receivables (Debtors Aging)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Outstanding customer balances broken down by payment terms and aging brackets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" />
              Print
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export CSV
            </button>
          </div>
        </div>

        {/* ── CONTROLS TOOLBAR ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-600">As of Date:</span>
            <input
              type="date"
              aria-label="As of Date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0073B7]"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              title="Refresh Schedule"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-[#0073B7]" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── AGING BUCKETS METRIC CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Current</span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-emerald-600">
                {fmtCur(report.totals.current, report.currency)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Not yet due</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">1 - 30 Days</span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-amber-600">
                {fmtCur(report.totals.days_1_30, report.currency)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Overdue 1-30d</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">31 - 60 Days</span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-orange-600">
                {fmtCur(report.totals.days_31_60, report.currency)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Follow up required</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">61 - 90 Days</span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-rose-600">
                {fmtCur(report.totals.days_61_90, report.currency)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Overdue &gt;60d</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">&gt; 90 Days</span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-purple-700">
                {fmtCur(report.totals.days_over_90, report.currency)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Doubtful balance</p>
          </div>

          <div className="bg-slate-900 text-white rounded-xl border border-slate-800 p-3.5 shadow-sm">
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Grand Total</span>
            <div className="mt-1">
              <span className="text-lg font-black font-mono text-sky-400">
                {fmtCur(report.totals.grand_total, report.currency)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Total outstanding</p>
          </div>
        </div>

        {/* ── AGING SCHEDULE TABLE ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Customer Aging Analysis & Invoice Breakdown
              </h2>
              <p className="text-xs text-slate-500">
                {activeOrganisation?.name || "Organisation"} — as of {report.as_of_date}
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {report.contacts.length} Customers with balances
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-6">Customer</th>
                  <th className="py-2.5 px-4 text-right">Current</th>
                  <th className="py-2.5 px-4 text-right">1 - 30 Days</th>
                  <th className="py-2.5 px-4 text-right">31 - 60 Days</th>
                  <th className="py-2.5 px-4 text-right">61 - 90 Days</th>
                  <th className="py-2.5 px-4 text-right">&gt; 90 Days</th>
                  <th className="py-2.5 px-6 text-right font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.contacts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No outstanding receivables recorded as of this date.
                    </td>
                  </tr>
                )}

                {report.contacts.map((contact) => {
                  const isExpanded = !!expandedContacts[contact.contact_id];
                  return (
                    <React.Fragment key={contact.contact_id}>
                      <tr
                        onClick={() => toggleContact(contact.contact_id)}
                        className="hover:bg-sky-50/50 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-6">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-[#0073B7]" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700" />
                            )}
                            <div>
                              <span className="font-bold text-slate-900 group-hover:text-[#0073B7]">
                                {contact.contact_name}
                              </span>
                              {contact.company_number && (
                                <span className="ml-2 text-[10px] text-slate-400 font-mono">
                                  #{contact.company_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700">
                          {fmtCur(contact.current, report.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700">
                          {fmtCur(contact.days_1_30, report.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700">
                          {fmtCur(contact.days_31_60, report.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700">
                          {fmtCur(contact.days_61_90, report.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700">
                          {fmtCur(contact.days_over_90, report.currency)}
                        </td>
                        <td className="py-3 px-6 font-mono text-right font-black text-slate-900">
                          {fmtCur(contact.total, report.currency)}
                        </td>
                      </tr>

                      {/* Expanded Subledger Invoice List */}
                      {isExpanded && contact.items && contact.items.length > 0 && (
                        <tr className="bg-slate-50/70 border-y border-slate-200">
                          <td colSpan={7} className="py-3 px-8">
                            <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-xs">
                              <h5 className="text-[11px] font-bold text-slate-700 mb-2 uppercase tracking-wider">
                                Subledger Documents for {contact.contact_name}
                              </h5>
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-[10px] text-slate-500 font-semibold border-b border-slate-100 pb-1">
                                    <th className="py-1">Invoice Number</th>
                                    <th className="py-1">Issue Date</th>
                                    <th className="py-1">Due Date</th>
                                    <th className="py-1">Days Overdue</th>
                                    <th className="py-1 text-right">Invoice Total</th>
                                    <th className="py-1 text-right">Paid</th>
                                    <th className="py-1 text-right font-bold">Remaining Balance</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 text-[11px]">
                                  {contact.items.map((item) => (
                                    <tr key={item.document_id} className="hover:bg-slate-50">
                                      <td className="py-1.5 font-mono font-semibold text-[#0073B7]">
                                        <Link href={`/app/sales/invoices/${item.document_id}`}>
                                          {item.document_number}
                                        </Link>
                                      </td>
                                      <td className="py-1.5 text-slate-600 font-mono">{item.issue_date}</td>
                                      <td className="py-1.5 text-slate-600 font-mono">{item.due_date}</td>
                                      <td className="py-1.5">
                                        {item.days_overdue > 0 ? (
                                          <span className="text-rose-600 font-semibold">{item.days_overdue} days</span>
                                        ) : (
                                          <span className="text-emerald-600">Current</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right font-mono text-slate-600">
                                        {fmtCur(item.total_amount, report.currency)}
                                      </td>
                                      <td className="py-1.5 text-right font-mono text-slate-600">
                                        {fmtCur(item.paid_amount, report.currency)}
                                      </td>
                                      <td className="py-1.5 text-right font-mono font-bold text-slate-900">
                                        {fmtCur(item.remaining_balance, report.currency)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
