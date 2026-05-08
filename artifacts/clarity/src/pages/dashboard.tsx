import React, { useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useDeleteDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, ChevronRight, Inbox, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Doc = { id: number; title: string; status: string; createdAt: string };

function DashboardSkeleton() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
          <div className="space-y-3">
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-5 w-72 rounded-lg" />
          </div>
          <Skeleton className="h-11 w-40 rounded-xl" />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-pebble-gray bg-white/82 p-5 shadow-subtle space-y-3">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-9 w-16 rounded-lg" />
            </div>
          ))}
        </div>

        <section>
          <Skeleton className="h-7 w-36 rounded-lg mb-5" />
          <div className="bg-white/86 rounded-2xl border border-pebble-gray overflow-hidden shadow-subtle divide-y divide-pebble-gray">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 md:p-6 flex justify-between items-center gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-64 rounded-lg" />
                  <Skeleton className="h-3 w-36 rounded" />
                </div>
                <Skeleton className="h-9 w-28 rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function DocumentRow({ doc, onDeleted }: { doc: Doc; onDeleted: (id: number) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteDocument();
  const { toast } = useToast();

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteMutation.mutate(
      { id: doc.id },
      {
        onSuccess: () => { onDeleted(doc.id); },
        onError: () => {
          toast({ title: "Failed to delete paper", variant: "destructive" });
          setConfirmDelete(false);
        },
      }
    );
  };

  return (
    <div className="p-5 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-pebble-gray/12 transition-all group">
      <div className="min-w-0 space-y-2 flex-1">
        <Link href={`/documents/${doc.id}`} className="font-medium text-[18px] text-deep-shadow hover:text-onyx-outline transition-colors truncate block leading-tight">
          {doc.title}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-[12px] text-muted-stone uppercase tracking-[0.16em] flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 opacity-40" />
            {new Date(doc.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <span className={cn(
            "text-[10px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-[0.16em] border",
            doc.status === "completed"
              ? "bg-forest-green-action/5 border-forest-green-action text-forest-green-action"
              : "bg-onyx-outline/5 border-onyx-outline text-onyx-outline"
          )}>
            {doc.status}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {confirmDelete ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="outline" size="sm" className="group/btn">
              <Link href={`/documents/${doc.id}`}>
                View <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-stone hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
              onClick={handleDelete}
              title="Delete paper"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const handleDeleted = (id: number) => {
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  if (isLoading) return <DashboardSkeleton />;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
          <div className="space-y-2">
            <h1 className="text-[34px] md:text-[40px] font-semibold tracking-tight text-deep-shadow leading-none">Dashboard</h1>
            <p className="text-muted-stone text-[15px] md:text-[16px] max-w-2xl">An overview of your recent research reviews, follow-up questions, and plan usage.</p>
          </div>
          <Button asChild size="lg" className="group bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92">
            <Link href="/documents/new">
              <Plus className="w-4 h-4" /> Review new paper
            </Link>
          </Button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Reviews Completed", value: summary?.totalDocuments || 0 },
            { label: "AI Questions Asked", value: summary?.questionsAsked || 0 },
            { label: "Subscription", value: summary?.plan || "Free", extra: summary?.plan === "free" && "Upgrade available" },
          ].map((stat, i) => (
            <Card key={i} className="border border-pebble-gray/90 bg-white/82 p-5 shadow-subtle group transition-all hover:-translate-y-px hover:bg-white">
              <CardHeader className="pb-3 p-0">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone group-hover:text-onyx-outline transition-colors">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex items-baseline gap-3">
                  <div className="text-[34px] md:text-[38px] font-semibold tracking-tight text-deep-shadow capitalize leading-none">{stat.value}</div>
                  {stat.extra && (
                    <Link href="/billing">
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-onyx-outline cursor-pointer hover:underline underline-offset-4">
                        {stat.extra}
                      </span>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="mt-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[24px] font-semibold tracking-tight text-deep-shadow">Recent activity</h2>
          </div>

          <div className="bg-white/86 rounded-2xl border border-pebble-gray overflow-hidden shadow-subtle">
            {summary?.recentDocuments && summary.recentDocuments.length > 0 ? (
              <div className="divide-y divide-pebble-gray">
                {(summary.recentDocuments as Doc[]).map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onDeleted={handleDeleted} />
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-pebble-gray/5">
                <FileText className="h-10 w-10 mx-auto mb-5 text-muted-stone opacity-25" />
                <h3 className="text-[20px] font-semibold text-deep-shadow mb-2">No papers yet</h3>
                <p className="text-muted-stone text-[15px] mb-7 max-w-[34ch] mx-auto leading-[1.65]">
                  Upload a paper or paste the text and we'll break it down — methodology, findings, and the questions worth asking.
                </p>
                <Button asChild size="lg" className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92">
                  <Link href="/documents/new">
                    <Plus className="h-4 w-4" />
                    Upload your first paper
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
