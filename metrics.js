export const COUNTRIES = [
  { code: "PAK", name: "Pakistan", accent: "#d9ff65" },
  { code: "IND", name: "India", accent: "#69d5ff" },
  { code: "BGD", name: "Bangladesh", accent: "#c6a0ff" },
];

export const INDICATORS = {
  "NY.GDP.MKTP.CD": { label: "GDP", shortLabel: "Gross domestic product", unit: "currency", definition: "Current US dollars" },
  "NY.GDP.MKTP.KD.ZG": { label: "GDP growth", shortLabel: "GDP growth", unit: "percent", definition: "Annual percentage change" },
  "SP.POP.TOTL": { label: "Population", shortLabel: "Population", unit: "integer", definition: "Total people" },
  "SL.UEM.TOTL.ZS": { label: "Unemployment", shortLabel: "Unemployment", unit: "percent", definition: "Share of total labour force" },
  "IT.NET.USER.ZS": { label: "Internet access", shortLabel: "Internet use", unit: "percent", definition: "Individuals using the internet" },
};

export function latestObservation(rows) {
  return (rows || []).find((row) => row?.value !== null && row?.value !== undefined) || null;
}

export function formatValue(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not reported";
  if (unit === "currency") {
    if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    return `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (unit === "percent") return `${Number(value).toFixed(1)}%`;
  if (unit === "integer") {
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function percentChange(series) {
  const valid = (series || []).filter((point) => point?.value !== null && point?.value !== undefined);
  if (valid.length < 2 || valid[valid.length - 1].value === 0) return null;
  const newest = valid[0].value;
  const oldest = valid[valid.length - 1].value;
  return ((newest - oldest) / Math.abs(oldest)) * 100;
}

export function chronologicalSeries(rows) {
  return (rows || [])
    .filter((row) => row?.value !== null && row?.value !== undefined)
    .map((row) => ({ year: Number(row.date), value: Number(row.value) }))
    .sort((a, b) => a.year - b.year);
}

export function buildWorldBankUrl(countryCodes, indicatorCode) {
  return `https://api.worldbank.org/v2/country/${countryCodes.join(";")}/indicator/${indicatorCode}?format=json&date=2015:2024&per_page=500`;
}
