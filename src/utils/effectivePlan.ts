import type { PlanType } from "../types";
export function effectivePlan(
  subscription: {
    plan_type: string;
    status: string;
    current_period_end?: string | null;
  } | null,
  now = Date.now(),
): PlanType {
  if (
    !subscription ||
    subscription.status !== "active" ||
    (subscription.current_period_end &&
      !(Date.parse(subscription.current_period_end) > now))
  )
    return "express";
  return subscription.plan_type === "player" ||
    subscription.plan_type === "team" || subscription.plan_type === "premium"
    ? subscription.plan_type
    : "express";
}
