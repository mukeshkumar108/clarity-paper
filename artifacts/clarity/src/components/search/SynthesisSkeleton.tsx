import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function SynthesisSkeleton() {
  return (
    <div className="rounded-2xl border border-pebble-gray bg-fog-white p-6 space-y-4">
      {/* confidence badge placeholder */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>

      {/* synthesis text lines */}
      <div className="space-y-2.5 pt-1">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-[94%] rounded-md" />
        <Skeleton className="h-4 w-[88%] rounded-md" />
        <Skeleton className="h-4 w-[76%] rounded-md" />
      </div>

      {/* coverage note placeholder */}
      <Skeleton className="h-3 w-52 rounded-md mt-1" />
    </div>
  );
}
