import type { Temperature } from "@/types";

interface ScoringInput {
  temperature: Temperature;
  hasEmail: boolean;
  hasPhone: boolean;
  hasCompany: boolean;
  hasDeals: boolean;
  dealValue: number;
}

export function calculateLeadScore(input: ScoringInput): number {
  let score = 0;

  // Temperature base score
  switch (input.temperature) {
    case "hot":
      score += 40;
      break;
    case "warm":
      score += 25;
      break;
    case "cold":
      score += 10;
      break;
  }

  // Contact completeness
  if (input.hasEmail) score += 10;
  if (input.hasPhone) score += 10;
  if (input.hasCompany) score += 5;

  // Deal value bonus
  if (input.hasDeals) score += 15; // Increased from 10
  if (input.dealValue > 100000) score += 10; // >$1,000 (increased from 5)
  if (input.dealValue > 500000) score += 10; // >$5,000 (increased from 5)

  return Math.max(0, Math.min(100, score));
}

export function suggestTemperature(score: number): Temperature {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}
