import React from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-canvas-parchment px-6">
      <div className="max-w-md text-center space-y-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone">404</div>
        <h1 className="text-[38px] font-semibold tracking-[-0.03em] text-deep-shadow leading-[1.05]">
          This page doesn't exist. But the research does.
        </h1>
        <p className="text-[16px] leading-[1.65] text-muted-stone">
          Whatever you were looking for isn't here. Head back to your dashboard and pick up where you left off.
        </p>
        <div className="pt-2 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
