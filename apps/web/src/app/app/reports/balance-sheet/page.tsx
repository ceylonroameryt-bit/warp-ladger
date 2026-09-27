"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Scale,
  Calendar,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { api } from "@/lib/api";

interface ReportLineItem {
  account_id?: string;
  account_code: string;
  account_name: string;
  account_class: string;
  subtype?: string;
  amount: number | string;
}

interface BalanceSheetData {
  as_of_date: string;
  comparison_as_of_date?: string | null;
  currency: string;
  fixed_assets: ReportLineItem[];
  total_fixed_assets: number | string;
  current_assets: ReportLineItem[];
  total_current_assets: number | string;
  total_assets: number | string;
  current_liabilities: ReportLineItem[];
  total_current_liabilities: number | string;
  non_current_liabilities: ReportLineItem[];
  total_non_current_liabilities: number | string;
  total_liabilities: number | string;
  net_current_assets: number | string;
  net_assets: number | string;
  equity: ReportLineItem[];
  current_year_earnings: number | string;
  total_equity: number | string;
  total_liabilities_and_equity: number | string;
  is_balanced: boolean;
  equilibrium_discrepancy: number | string;
  generated_at: string;
}

const EMPTY_BALANCE_SHEET: BalanceSheetData = {
  as_of_date: new Date().toISOString().split("T")[0],
  currency: "GBP",
  fixed_assets: [],
  total_fixed_assets: "0.00",
  current_assets: [],
  total_current_assets: "0.00",
  total_assets: "0.00",
  current_liabilities: [],
  total_current_liabilities: "0.00",
  non_current_liabilities: [],
  total_non_current_liabilities: "0.00",
  total_liabilities: "0.00",
  net_current_assets: "0.00",
  net_assets: "0.00",
  equity: [],
  current_year_earnings: "0.00",
  total_equity: "0.00",
  total_liabilities_and_equity: "0.00",
  is_balanced: true,
  equilibrium_discrepancy: "0.00",
  generated_at: new Date().toISOString(),
};

function fmtCur(amount: number | string | undefined | null, currency = "GBP") {
  if (amount === undefined || amount === null) return "£0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(num);
}

export default function BalanceSheetPage() {
  const { activeOrganisation, activeOrganisationId } = useOrganisation();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState<BalanceSheetData>(EMPTY_BALANCE_SHEET);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    if (!activeOrganisationId) return;
    setLoading(true);
    try {
      const url = `/api/v1/organisations/${activeOrganisationId}/reports/balance-sheet?as_of_date=${asOfDate}`;
      const data = await api.get<any>(url);

      if (data) {
        const faLines = data.fixed_assets?.lines || [];
        const caLines = data.current_assets?.lines || [];
        const clLines = data.current_liabilities?.lines || [];
        const nclLines = data.non_current_liabilities?.lines || [];
        const eqLines = data.equity?.lines || [];

        const faSub = data.fixed_assets?.subtotal ?? "0.00";
        const caSub = data.current_assets?.subtotal ?? "0.00";
        const clSub = data.current_liabilities?.subtotal ?? "0.00";
        const nclSub = data.non_current_liabilities?.subtotal ?? "0.00";

        const caNum = parseFloat(String(caSub));
        const clNum = parseFloat(String(clSub));
        const netCurrent = (caNum - clNum).toFixed(2);

        const totLiab = parseFloat(String(data.total_liabilities ?? "0"));
        const totEq = parseFloat(String(data.total_equity ?? "0"));
        const totLiabAndEq = (totLiab + totEq).toFixed(2);

        setReport({
          as_of_date: data.as_of_date || asOfDate,
          comparison_as_of_date: data.comparison_as_of_date,
          currency: data.currency || "GBP",
          fixed_assets: faLines,
          total_fixed_assets: faSub,
          current_assets: caLines,
          total_current_assets: caSub,
          total_assets: data.total_assets ?? "0.00",
          current_liabilities: clLines,
          total_current_liabilities: clSub,
          non_current_liabilities: nclLines,
          total_non_current_liabilities: nclSub,
          total_liabilities: data.total_liabilities ?? "0.00",
          net_current_assets: netCurrent,
          net_assets: data.net_assets ?? "0.00",
          equity: eqLines,
          current_year_earnings: data.current_year_earnings ?? "0.00",
          total_equity: data.total_equity ?? "0.00",
          total_liabilities_and_equity: totLiabAndEq,
          is_balanced: Boolean(data.is_balanced),
          equilibrium_discrepancy: data.balance_discrepancy ?? "0.00",
          generated_at: data.generated_at || new Date().toISOString(),
        });
      } else {
        setReport(EMPTY_BALANCE_SHEET);
      }
    } catch {
      setReport(EMPTY_BALANCE_SHEET);
    } finally {
      setLoading(false);
    }
  }, [activeOrganisationId, asOfDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCSV = () => {
    const rows = [
      ["Balance Sheet (Statement of Financial Position)"],
      [`Entity: ${activeOrganisation?.name || "Warp Organisation"}`],
      [`As of: ${report.as_of_date}`],
      [`Currency: ${report.currency}`],
      [`Balanced: ${report.is_balanced ? "YES" : "NO"}`],
      [],
      ["Account Code", "Account Name", "Amount (£)"],
      ["FIXED ASSETS"],
      ...report.fixed_assets.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL FIXED ASSETS", "", Number(report.total_fixed_assets).toFixed(2)],
      [],
      ["CURRENT ASSETS"],
      ...report.current_assets.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL CURRENT ASSETS", "", Number(report.total_current_assets).toFixed(2)],
      ["TOTAL ASSETS", "", Number(report.total_assets).toFixed(2)],
      [],
      ["CURRENT LIABILITIES"],
      ...report.current_liabilities.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL CURRENT LIABILITIES", "", Number(report.total_current_liabilities).toFixed(2)],
      [],
      ["NON-CURRENT LIABILITIES"],
      ...report.non_current_liabilities.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL NON-CURRENT LIABILITIES", "", Number(report.total_non_current_liabilities).toFixed(2)],
      ["TOTAL LIABILITIES", "", Number(report.total_liabilities).toFixed(2)],
      ["NET CURRENT ASSETS", "", Number(report.net_current_assets).toFixed(2)],
      ["TOTAL NET ASSETS", "", Number(report.net_assets).toFixed(2)],
      [],
      ["EQUITY"],
      ...report.equity.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["CURRENT YEAR EARNINGS", "Current Period Net Earnings", Number(report.current_year_earnings).toFixed(2)],
      ["TOTAL EQUITY", "", Number(report.total_equity).toFixed(2)],
      ["TOTAL LIABILITIES & EQUITY", "", Number(report.total_liabilities_and_equity).toFixed(2)],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `balance_sheet_${report.as_of_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasLines =
    report.fixed_assets.length > 0 ||
    report.current_assets.length > 0 ||
    report.current_liabilities.length > 0 ||
    report.non_current_liabilities.length > 0 ||
    report.equity.length > 0;

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
              <span className="text-slate-800">Balance Sheet</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Scale className="h-6 w-6 text-[#0073B7]" />
              Balance Sheet (Statement of Financial Position)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Snapshot of assets, liabilities, and equity derived directly from general ledger balances.
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
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">As of Date:</span>
              <input
                type="date"
                aria-label="As of Date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0073B7]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-medium">
              Basis: <span className="font-bold text-slate-800">Accrual</span>
            </span>
            <button
              onClick={fetchReport}
              disabled={loading}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              title="Refresh Statement"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-[#0073B7]" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── ACCOUNTING EQUILIBRIUM SEAL ── */}
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            report.is_balanced
              ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
              : "bg-rose-50/70 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {report.is_balanced ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0" />
            )}
            <div>
              <p className="font-bold">
                {report.is_balanced
                  ? "Double-Entry Balance Verified: Total Assets = Total Liabilities & Equity"
                  : "Attention: Ledger Equilibrium Discrepancy Detected"}
              </p>
              <p className="text-[11px] text-slate-600">
                Total Assets: <span className="font-mono font-semibold">{fmtCur(report.total_assets, report.currency)}</span> ·
                Total Liabilities & Equity: <span className="font-mono font-semibold">{fmtCur(report.total_liabilities_and_equity, report.currency)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full font-bold bg-white/80 border text-[11px] shadow-2xs">
              Net Assets: {fmtCur(report.net_assets, report.currency)}
            </span>
          </div>
        </div>

        {/* ── STATEMENT TABLE ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {activeOrganisation?.name || "Organisation"} — Statement of Financial Position
              </h2>
              <p className="text-xs text-slate-500">
                As at {report.as_of_date} (Currency: {report.currency})
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              Generated: {new Date(report.generated_at).toLocaleString("en-GB")}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-6 w-28">Code</th>
                  <th className="py-2.5 px-4">Account Description</th>
                  <th className="py-2.5 px-6 text-right">As at {report.as_of_date} ({report.currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!hasLines && !loading && (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-400">
                      No posted asset, liability, or equity transactions recorded as of this date.
                    </td>
                  </tr>
                )}

                {/* ── FIXED ASSETS ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide">
                    Fixed Assets (Non-Current)
                  </td>
                </tr>
                {report.fixed_assets.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">{fmtCur(item.amount, report.currency)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Fixed Assets</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">{fmtCur(report.total_fixed_assets, report.currency)}</td>
                </tr>

                {/* ── CURRENT ASSETS ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide pt-4">
                    Current Assets
                  </td>
                </tr>
                {report.current_assets.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">{fmtCur(item.amount, report.currency)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Current Assets</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">{fmtCur(report.total_current_assets, report.currency)}</td>
                </tr>

                {/* ── TOTAL ASSETS ── */}
                <tr className="bg-sky-50/60 font-black border-t-2 border-b-2 border-sky-300 text-sky-950 text-sm">
                  <td className="py-3 px-6 font-mono"></td>
                  <td className="py-3 px-4">TOTAL ASSETS</td>
                  <td className="py-3 px-6 font-mono text-right text-base font-black">{fmtCur(report.total_assets, report.currency)}</td>
                </tr>

                {/* ── CURRENT LIABILITIES ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide pt-4">
                    Current Liabilities (Due within 1 Year)
                  </td>
                </tr>
                {report.current_liabilities.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">{fmtCur(item.amount, report.currency)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Current Liabilities</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">{fmtCur(report.total_current_liabilities, report.currency)}</td>
                </tr>

                {/* ── NET CURRENT ASSETS ── */}
                <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-800">
                  <td className="py-2.5 px-6 font-mono"></td>
                  <td className="py-2.5 px-4">Net Current Assets (Working Capital)</td>
                  <td className="py-2.5 px-6 font-mono text-right">{fmtCur(report.net_current_assets, report.currency)}</td>
                </tr>

                {/* ── NON-CURRENT LIABILITIES ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide pt-4">
                    Non-Current Liabilities
                  </td>
                </tr>
                {report.non_current_liabilities.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">{fmtCur(item.amount, report.currency)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Non-Current Liabilities</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">{fmtCur(report.total_non_current_liabilities, report.currency)}</td>
                </tr>

                {/* ── TOTAL LIABILITIES ── */}
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                  <td className="py-2.5 px-6 font-mono"></td>
                  <td className="py-2.5 px-4">TOTAL LIABILITIES</td>
                  <td className="py-2.5 px-6 font-mono text-right font-bold">{fmtCur(report.total_liabilities, report.currency)}</td>
                </tr>

                {/* ── NET ASSETS ── */}
                <tr className="bg-sky-50/80 font-black border-t-2 border-b-2 border-sky-300 text-sky-950 text-sm">
                  <td className="py-3 px-6 font-mono"></td>
                  <td className="py-3 px-4">TOTAL NET ASSETS</td>
                  <td className="py-3 px-6 font-mono text-right text-base font-black">{fmtCur(report.net_assets, report.currency)}</td>
                </tr>

                {/* ── EQUITY ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide pt-4">
                    Capital & Reserves (Equity)
                  </td>
                </tr>
                {report.equity.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">{fmtCur(item.amount, report.currency)}</td>
                  </tr>
                ))}
                <tr className="hover:bg-sky-50/40 transition-colors">
                  <td className="py-2.5 px-6 font-mono text-slate-500">—</td>
                  <td className="py-2.5 px-4 font-medium text-slate-800">Current Year Earnings</td>
                  <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">{fmtCur(report.current_year_earnings, report.currency)}</td>
                </tr>
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Equity</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">{fmtCur(report.total_equity, report.currency)}</td>
                </tr>

                {/* ── TOTAL LIABILITIES & EQUITY ── */}
                <tr className="bg-sky-50/60 font-black border-t-2 border-b-2 border-sky-300 text-sky-950 text-sm">
                  <td className="py-3 px-6 font-mono"></td>
                  <td className="py-3 px-4">TOTAL LIABILITIES & EQUITY</td>
                  <td className="py-3 px-6 font-mono text-right text-base font-black">{fmtCur(report.total_liabilities_and_equity, report.currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
