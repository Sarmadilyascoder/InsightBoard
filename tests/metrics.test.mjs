import assert from "node:assert/strict";

import { buildWorldBankUrl, chronologicalSeries, formatValue, latestObservation, percentChange } from "../metrics.js";



const sparseRows = [
  
  { date: "2024", value: null },
  
  { date: "2023", value: 1500 },
  
  { date: "2022", value: 1200 },
  
];



assert.equal(latestObservation(sparseRows).date, "2023", "latest observation ignores unreported values");

assert.equal(formatValue(2_500_000_000_000, "currency"), "$2.50T", "currency formatting handles trillions");

assert.equal(formatValue(243_000_000, "integer"), "243.0M", "integer formatting handles millions");

assert.equal(formatValue(4.321, "percent"), "4.3%", "percent formatting rounds to one decimal");

assert.equal(percentChange(sparseRows), 25, "percent change compares newest reported value with oldest reported value");

assert.deepEqual(chronologicalSeries(sparseRows), [{ year: 2022, value: 1200 }, { year: 2023, value: 1500 }], "chronological series filters nulls and sorts years");

assert.equal(buildWorldBankUrl(["PAK", "IND"], "NY.GDP.MKTP.CD"), "https://api.worldbank.org/v2/country/PAK;IND/indicator/NY.GDP.MKTP.CD?format=json&date=2015:2024&per_page=500", "API helper creates cited live endpoint");



console.log("InsightBoard metrics tests passed.");





