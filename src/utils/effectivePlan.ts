import type { PlanType } from "../types";
export function effectivePlan(
  subscription: {
    plan_type: string;
    status: string;
    current_period_end?: string | null;
    team_trial_ends_at?: string | null;
  } | null,
  now = Date.now(),
): PlanType {
  if (
    subscription?.status === "active" &&
    subscription.team_trial_ends_at &&
    Date.parse(subscription.team_trial_ends_at) > now
  )
    return "team";
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
