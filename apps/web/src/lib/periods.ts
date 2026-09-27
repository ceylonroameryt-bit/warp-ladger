/**
 * Dynamic Accounting Periods Utility for Warp Ladger
 * Generates reporting periods dynamically from current date and organisation financial year settings.
 */

export interface PeriodOption {
  id: string;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function generateDynamicPeriods(
  financialYearEndMonth = 12,
  financialYearEndDay = 31,
  referenceDate = new Date()
): PeriodOption[] {
  const now = referenceDate;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // 1. Current Month
  const currentMonthStart = new Date(currentYear, currentMonth, 1);
  const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);

  // 2. Previous Month
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const prevMonthEnd = new Date(currentYear, currentMonth, 0);

  // 3. Current Quarter
  const quarterIndex = Math.floor(currentMonth / 3);
  const currentQuarterStart = new Date(currentYear, quarterIndex * 3, 1);
  const currentQuarterEnd = new Date(currentYear, (quarterIndex + 1) * 3, 0);

  // 4. Previous Quarter
  const prevQuarterStart = new Date(currentYear, (quarterIndex - 1) * 3, 1);
  const prevQuarterEnd = new Date(currentYear, quarterIndex * 3, 0);

  // 5. Financial Year calculation
  // E.g. If FY end is Dec 31, FY start is Jan 1. If FY end is Mar 31, FY start is Apr 1.
  let fyStartYear = currentYear;
  // If current month/day is before FY end in current year, then FY started in (currentYear - 1)
  const isAfterFyEndThisYear =
    currentMonth + 1 > financialYearEndMonth ||
    (currentMonth + 1 === financialYearEndMonth && now.getDate() > financialYearEndDay);

  if (!isAfterFyEndThisYear && financialYearEndMonth !== 12) {
    fyStartYear = currentYear - 1;
  }

  const fyStartMonth = (financialYearEndMonth % 12); // e.g. 12 % 12 = 0 (January)
  const fyStartDate = new Date(fyStartYear, fyStartMonth, 1);
  const prevFyStartDate = new Date(fyStartYear - 1, fyStartMonth, 1);
  const prevFyEndDate = new Date(fyStartYear, fyStartMonth, 0);

  const prevMonthName = prevMonthStart.toLocaleString("default", { month: "short" });
  const currentMonthName = currentMonthStart.toLocaleString("default", { month: "short" });

  return [
    {
      id: "current_month",
      label: `Current Month (${currentMonthName} ${currentMonthStart.getFullYear()})`,
      startDate: formatDate(currentMonthStart),
      endDate: formatDate(currentMonthEnd),
    },
    {
      id: "previous_month",
      label: `Previous Month (${prevMonthName} ${prevMonthStart.getFullYear()})`,
      startDate: formatDate(prevMonthStart),
      endDate: formatDate(prevMonthEnd),
    },
    {
      id: "current_quarter",
      label: `Current Quarter (Q${quarterIndex + 1} ${currentYear})`,
      startDate: formatDate(currentQuarterStart),
      endDate: formatDate(currentQuarterEnd),
    },
    {
      id: "previous_quarter",
      label: `Previous Quarter (Q${quarterIndex === 0 ? 4 : quarterIndex} ${prevQuarterStart.getFullYear()})`,
      startDate: formatDate(prevQuarterStart),
      endDate: formatDate(prevQuarterEnd),
    },
    {
      id: "ytd",
      label: `Financial Year to Date (FY ${fyStartYear}/${fyStartYear + 1})`,
      startDate: formatDate(fyStartDate),
      endDate: formatDate(now),
    },
    {
      id: "previous_fy",
      label: `Previous Financial Year (FY ${fyStartYear - 1}/${fyStartYear})`,
      startDate: formatDate(prevFyStartDate),
      endDate: formatDate(prevFyEndDate),
    },
  ];
}
