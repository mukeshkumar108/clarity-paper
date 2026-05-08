import React from "react";
import {
  useGetSubscription,
  useUpgradePlan,
  getGetSubscriptionQueryKey,
  getGetMeQueryKey,
  type UpgradePlanMutationResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Check, X } from "lucide-react";

export default function Billing() {
  const { data: subscription, isLoading } = useGetSubscription();
  const upgradeMutation = useUpgradePlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const isPro = user?.plan === "pro" || subscription?.plan === "pro";

  const handleUpgrade = () => {
    upgradeMutation.mutate(
      { data: { plan: "pro" } },
      {
        onSuccess: (data: UpgradePlanMutationResult) => {
          if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
          } else {
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
            toast({
              title: data.success ? "Upgraded to Pro!" : "Upgrade",
              description: data.message,
            });
          }
        },
        onError: () => {
          toast({ title: "Upgrade failed", description: "Please try again.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-[34px] md:text-[40px] font-semibold tracking-tight text-deep-shadow mb-2">Billing & Plans</h1>
          <p className="text-muted-stone text-[15px] md:text-[16px]">
            {isPro ? "You are currently on the Pro plan." : "Select a plan that fits your analysis needs."}
          </p>
        </header>

        {isLoading ? (
          <div className="text-muted-stone font-bold animate-pulse">Synchronizing billing data...</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            <div className={`p-6 rounded-2xl border transition-all ${!isPro ? "border-inkwell bg-white shadow-subtle" : "border-pebble-gray bg-white/70"}`}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[22px] font-semibold">Free</h3>
                {!isPro && <span className="text-[10px] bg-inkwell text-canvas-parchment px-2.5 py-1 rounded-md font-semibold uppercase tracking-[0.16em]">Active plan</span>}
              </div>
              <div className="mb-7">
                <span className="text-[40px] font-semibold tracking-tight text-deep-shadow">$0</span>
                <span className="text-muted-stone ml-2 text-[12px] uppercase tracking-[0.16em]">/ month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-[14px]"><Check className="w-4 h-4 text-forest-green-action" /> 5 papers per month</li>
                <li className="flex items-center gap-3 text-[14px]"><Check className="w-4 h-4 text-forest-green-action" /> 1,500 word limit</li>
                <li className="flex items-center gap-3 text-[14px] text-muted-stone/70"><X className="w-4 h-4 text-red-400" /> Deep risk analysis</li>
                <li className="flex items-center gap-3 text-[14px] text-muted-stone/70"><X className="w-4 h-4 text-red-400" /> Unlimited questions</li>
              </ul>
              <Button variant="secondary" className="w-full" disabled>
                {!isPro ? "Current subscription" : "Standard tier"}
              </Button>
            </div>

            <div className={`p-6 rounded-2xl border transition-all ${isPro ? "border-inkwell bg-white shadow-subtle" : "border-onyx-outline/35 bg-white hover:border-onyx-outline hover:-translate-y-px"}`}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[22px] font-semibold text-inkwell">Pro</h3>
                {isPro && <span className="text-[10px] bg-inkwell text-canvas-parchment px-2.5 py-1 rounded-md font-semibold uppercase tracking-[0.16em]">Active plan</span>}
              </div>
              <div className="mb-7 text-onyx-outline">
                <span className="text-[40px] font-semibold tracking-tight">$15</span>
                <span className="ml-2 text-[12px] uppercase tracking-[0.16em]">/ month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-[14px]"><Check className="w-4 h-4 text-forest-green-action" /> 100 papers per month</li>
                <li className="flex items-center gap-3 text-[14px]"><Check className="w-4 h-4 text-forest-green-action" /> 50,000 word limit</li>
                <li className="flex items-center gap-3 text-[14px]"><Check className="w-4 h-4 text-forest-green-action" /> Priority AI risk engine</li>
                <li className="flex items-center gap-3 text-[14px]"><Check className="w-4 h-4 text-forest-green-action" /> Deep analysis & Q&A</li>
              </ul>
              {isPro ? (
                <Button variant="secondary" className="w-full" disabled>
                  Current subscription
                </Button>
              ) : (
                <Button className="w-full bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92" onClick={handleUpgrade} disabled={upgradeMutation.isPending}>
                  {upgradeMutation.isPending ? "Processing..." : "Upgrade to Pro"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
