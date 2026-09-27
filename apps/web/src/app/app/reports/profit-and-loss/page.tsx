"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Calendar,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  RefreshCw,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useOrganisation } from "@/contexts/OrganisationContext";
import { api } from "@/lib/api";
import { generateDynamicPeriods } from "@/lib/periods";

interface ReportLineItem {
  account_id?: string;
  account_code: string;
  account_name: string;
  account_class: string;
  subtype?: string;
  amount: number | string;
  comparison_amount?: number | string | null;
  variance?: number | string | null;
  variance_percentage?: number | string | null;
}

interface ProfitAndLossData {
  from_date: string;
  to_date: string;
  comparison_from_date?: string | null;
  comparison_to_date?: string | null;
  currency: string;
  turnover: ReportLineItem[];
  total_turnover: number | string;
  comp_total_turnover?: number | string | null;
  cost_of_sales: ReportLineItem[];
  total_cost_of_sales: number | string;
  comp_total_cost_of_sales?: number | string | null;
  gross_profit: number | string;
  comp_gross_profit?: number | string | null;
  gross_profit_margin_pct: number | string;
  operating_expenses: ReportLineItem[];
  total_operating_expenses: number | string;
  comp_total_operating_expenses?: number | string | null;
  operating_profit: number | string;
  net_profit: number | string;
  comp_net_profit?: number | string | null;
  net_profit_margin_pct: number | string;
  generated_at: string;
}

const EMPTY_P_AND_L: ProfitAndLossData = {
  from_date: new Date().toISOString().split("T")[0],
  to_date: new Date().toISOString().split("T")[0],
  currency: "GBP",
  turnover: [],
  total_turnover: "0.00",
  cost_of_sales: [],
  total_cost_of_sales: "0.00",
  gross_profit: "0.00",
  gross_profit_margin_pct: "0.0",
  operating_expenses: [],
  total_operating_expenses: "0.00",
  operating_profit: "0.00",
  net_profit: "0.00",
  net_profit_margin_pct: "0.0",
  generated_at: new Date().toISOString(),
};

function fmtCur(amount: number | string | undefined | null, currency = "GBP") {
  if (amount === undefined || amount === null) return "£0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(num);
}

function fmtPct(pct: number | string | undefined | null) {
  if (pct === undefined || pct === null) return "0.0%";
  const num = typeof pct === "string" ? parseFloat(pct) : pct;
  return `${num.toFixed(1)}%`;
}

export default function ProfitAndLossPage() {
  const { activeOrganisation, activeOrganisationId } = useOrganisation();
  const periods = generateDynamicPeriods(activeOrganisation?.financial_year_end_month || 3);

  const initialPeriod = periods[0] || {
    id: "this_quarter",
    label: "Current Quarter",
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  };

  const [startDate, setStartDate] = useState(initialPeriod.startDate);
  const [endDate, setEndDate] = useState(initialPeriod.endDate);
  const [periodPreset, setPeriodPreset] = useState(initialPeriod.id);
  const [report, setReport] = useState<ProfitAndLossData>(EMPTY_P_AND_L);
  const [loading, setLoading] = useState(true);

  const handlePresetChange = (presetId: string) => {
    setPeriodPreset(presetId);
    const found = periods.find((p) => p.id === presetId);
    if (found) {
      setStartDate(found.startDate);
      setEndDate(found.endDate);
    }
  };

  const fetchReport = useCallback(async () => {
    if (!activeOrganisationId) return;
    setLoading(true);
    try {
      const url = `/api/v1/organisations/${activeOrganisationId}/reports/profit-and-loss?from_date=${startDate}&to_date=${endDate}`;
      const data = await api.get<any>(url);

      if (data) {
        const turnoverLines = data.turnover_section?.lines || [];
        const cogsLines = data.cogs_section?.lines || [];
        const opexLines = data.operating_expenses_section?.lines || [];

        const tNum = parseFloat(String(data.turnover || "0"));
        const gpNum = parseFloat(String(data.gross_profit || "0"));
        const npNum = parseFloat(String(data.net_profit || "0"));

        const gpMargin = tNum > 0.0001 ? (gpNum / tNum) * 100 : 0;
        const npMargin = tNum > 0.0001 ? (npNum / tNum) * 100 : 0;

        setReport({
          from_date: data.from_date || startDate,
          to_date: data.to_date || endDate,
          comparison_from_date: data.comparison_from_date,
          comparison_to_date: data.comparison_to_date,
          currency: data.currency || "GBP",
          turnover: turnoverLines,
          total_turnover: data.turnover ?? "0.00",
          comp_total_turnover: data.comparison_total_turnover,
          cost_of_sales: cogsLines,
          total_cost_of_sales: data.cost_of_sales ?? "0.00",
          comp_total_cost_of_sales: data.comparison_cost_of_sales,
          gross_profit: data.gross_profit ?? "0.00",
          comp_gross_profit: data.comparison_gross_profit,
          gross_profit_margin_pct: gpMargin,
          operating_expenses: opexLines,
          total_operating_expenses: data.operating_expenses ?? "0.00",
          comp_total_operating_expenses: data.comparison_operating_expenses,
          operating_profit: data.operating_profit ?? "0.00",
          net_profit: data.net_profit ?? "0.00",
          comp_net_profit: data.comparison_net_profit,
          net_profit_margin_pct: npMargin,
          generated_at: data.generated_at || new Date().toISOString(),
        });
      } else {
        setReport(EMPTY_P_AND_L);
      }
    } catch {
      setReport(EMPTY_P_AND_L);
    } finally {
      setLoading(false);
    }
  }, [activeOrganisationId, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCSV = () => {
    const rows = [
      ["Profit and Loss Statement (Income Statement)"],
      [`Entity: ${activeOrganisation?.name || "Warp Organisation"}`],
      [`Period: ${report.from_date} to ${report.to_date}`],
      [`Currency: ${report.currency}`],
      [],
      ["Account Code", "Account Name", "Amount (£)"],
      ["TURNOVER"],
      ...report.turnover.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL TURNOVER", "", Number(report.total_turnover).toFixed(2)],
      [],
      ["COST OF SALES"],
      ...report.cost_of_sales.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL COST OF SALES", "", Number(report.total_cost_of_sales).toFixed(2)],
      ["GROSS PROFIT", "", Number(report.gross_profit).toFixed(2)],
      [],
      ["OPERATING EXPENSES"],
      ...report.operating_expenses.map((item) => [
        item.account_code,
        `"${item.account_name.replace(/"/g, '""')}"`,
        Number(item.amount).toFixed(2),
      ]),
      ["TOTAL OPERATING EXPENSES", "", Number(report.total_operating_expenses).toFixed(2)],
      ["NET OPERATING PROFIT", "", Number(report.net_profit).toFixed(2)],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `profit_and_loss_${report.from_date}_to_${report.to_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasLines =
    report.turnover.length > 0 ||
    report.cost_of_sales.length > 0 ||
    report.operating_expenses.length > 0;

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
              <span className="text-slate-800">Profit & Loss</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-emerald-600" />
              Profit and Loss (Income Statement)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Trading performance summary derived strictly from posted general ledger journals.
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
          <div className="flex flex-wrap items-center gap-3">
            {/* Period presets */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Period:</span>
              <select
                aria-label="Preset Period"
                value={periodPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0073B7]"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* Date Pickers */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Start Date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriodPreset("custom");
                }}
                className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 font-mono text-slate-800"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                aria-label="End Date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriodPreset("custom");
                }}
                className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 font-mono text-slate-800"
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

        {/* ── KPI HIGHLIGHT STRIP ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Turnover</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold font-mono text-slate-900">
                {loading ? "..." : fmtCur(report.total_turnover, report.currency)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Gross Profit (Margin)</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold font-mono text-slate-900">
                {loading ? "..." : fmtCur(report.gross_profit, report.currency)}
              </span>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                {fmtPct(report.gross_profit_margin_pct)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Net Operating Profit</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold font-mono text-emerald-600">
                {loading ? "..." : fmtCur(report.net_profit, report.currency)}
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                {fmtPct(report.net_profit_margin_pct)} Net Margin
              </span>
            </div>
          </div>
        </div>

        {/* ── STATEMENT TABLE ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {activeOrganisation?.name || "Organisation"} — Profit and Loss Statement
              </h2>
              <p className="text-xs text-slate-500">
                For the period {report.from_date} to {report.to_date} (Currency: {report.currency})
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
                  <th className="py-2.5 px-6 text-right">
                    Amount ({report.currency})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!hasLines && !loading && (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-400">
                      No posted trading transactions found for this period.
                    </td>
                  </tr>
                )}

                {/* ── SECTION: TURNOVER ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide">
                    Turnover (Revenue)
                  </td>
                </tr>
                {report.turnover.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">
                      {fmtCur(item.amount, report.currency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t-2 border-slate-300">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Turnover</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">
                    {fmtCur(report.total_turnover, report.currency)}
                  </td>
                </tr>

                {/* ── SECTION: COST OF SALES ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide pt-4">
                    Cost of Sales
                  </td>
                </tr>
                {report.cost_of_sales.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">
                      {fmtCur(item.amount, report.currency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Cost of Sales</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">
                    {fmtCur(report.total_cost_of_sales, report.currency)}
                  </td>
                </tr>

                {/* ── GROSS PROFIT ROW ── */}
                <tr className="bg-sky-50/50 font-bold border-t-2 border-b-2 border-sky-200 text-sky-950">
                  <td className="py-3 px-6 font-mono"></td>
                  <td className="py-3 px-4">
                    Gross Profit <span className="text-xs font-normal text-sky-700">({fmtPct(report.gross_profit_margin_pct)} margin)</span>
                  </td>
                  <td className="py-3 px-6 font-mono text-right text-sm font-black">
                    {fmtCur(report.gross_profit, report.currency)}
                  </td>
                </tr>

                {/* ── SECTION: OPERATING EXPENSES ── */}
                <tr className="bg-slate-50/80">
                  <td colSpan={3} className="py-2 px-6 font-bold text-slate-900 uppercase tracking-wide pt-4">
                    Operating Expenses (Overheads)
                  </td>
                </tr>
                {report.operating_expenses.map((item, idx) => (
                  <tr key={item.account_id || idx} className="hover:bg-sky-50/40 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-500">{item.account_code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{item.account_name}</td>
                    <td className="py-2.5 px-6 font-mono font-semibold text-slate-900 text-right">
                      {fmtCur(item.amount, report.currency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100/60 font-bold border-t border-slate-200">
                  <td className="py-2.5 px-6 font-mono text-slate-500"></td>
                  <td className="py-2.5 px-4 text-slate-900">Total Operating Expenses</td>
                  <td className="py-2.5 px-6 font-mono text-slate-900 text-right">
                    {fmtCur(report.total_operating_expenses, report.currency)}
                  </td>
                </tr>

                {/* ── NET PROFIT ROW (FINAL GRAND TOTAL) ── */}
                <tr className="bg-emerald-50 font-black border-t-2 border-b-2 border-emerald-400 text-emerald-950 text-sm">
                  <td className="py-3.5 px-6 font-mono"></td>
                  <td className="py-3.5 px-4 flex items-center gap-2">
                    Net Operating Profit
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-200/60 text-emerald-800">
                      {fmtPct(report.net_profit_margin_pct)} Net Margin
                    </span>
                  </td>
                  <td className="py-3.5 px-6 font-mono text-right text-base text-emerald-800">
                    {fmtCur(report.net_profit, report.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
