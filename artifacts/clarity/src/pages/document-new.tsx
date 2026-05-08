import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateDocument, useAnalyseDocument } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileText,
  ChevronRight,
  Loader2,
  Zap,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { getApiUrl } from "@/lib/api-url";

type Tab = "paste" | "upload";
const GOAL_OPTIONS = [
  "Understand results",
  "Check methodology",
  "Find gotchas",
  "What to verify?",
  "Explain in simple language",
] as const;

function useTypewriter(target: string, speed = 40) {
  const [displayed, setDisplayed] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any in-flight typewriter when target changes
    if (intervalRef.current) clearInterval(intervalRef.current);

    setDisplayed("");
    if (!target) return;

    let i = 0;
    intervalRef.current = setInterval(() => {
      i++;
      setDisplayed(target.slice(0, i));
      if (i >= target.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [target, speed]);

  return displayed;
}

export default function DocumentNew() {
  const [tab, setTab] = useState<Tab>("paste");
  const [title, setTitle] = useState("");
  const [titleTarget, setTitleTarget] = useState("");
  const [text, setText] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [researchField, setResearchField] = useState("");
  const [goal, setGoal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileVisible, setFileVisible] = useState(false);
  const [titleLoading, setTitleLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const typewrittenTitle = useTypewriter(titleTarget, 38);

  // Only sync typewriter → title when a target is active (not after user cleared it)
  useEffect(() => {
    if (titleTarget) setTitle(typewrittenTitle);
  }, [typewrittenTitle]);  // eslint-disable-line react-hooks/exhaustive-deps

  const createDocMutation = useCreateDocument();
  const analyseDocMutation = useAnalyseDocument();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const isPending = createDocMutation.isPending || analyseDocMutation.isPending;

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim()) return;

    createDocMutation.mutate(
      {
        data: {
          title,
          text,
          documentType: documentType || undefined,
          researchField: researchField || undefined,
          goal: goal || undefined,
        },
      },
      {
        onSuccess: (doc: { id: number }) => {
          analyseDocMutation.mutate(
            { id: doc.id },
            {
              onSuccess: () => setLocation(`/documents/${doc.id}`),
              onError: (err: unknown) => {
                toast({
                  title: "Analysis failed",
                  description: (err as { error?: string })?.error ?? "Something went wrong.",
                  variant: "destructive",
                });
                setLocation(`/documents/${doc.id}`);
              },
            },
          );
        },
        onError: () => {
          toast({ title: "Upload failed", description: "Could not save document.", variant: "destructive" });
        },
      },
    );
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || file.name);
    if (documentType) formData.append("documentType", documentType);
    if (researchField) formData.append("researchField", researchField);
    if (goal) formData.append("goal", goal);

    try {
      const res = await fetch(getApiUrl("/api/documents/upload"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" })) as { error?: string };
        toast({ title: "Upload failed", description: err.error ?? "Something went wrong.", variant: "destructive" });
        return;
      }

      const doc = await res.json() as { id: number };

      analyseDocMutation.mutate(
        { id: doc.id },
        {
          onSuccess: () => setLocation(`/documents/${doc.id}`),
          onError: (err: unknown) => {
            toast({
              title: "Analysis failed",
              description: (err as { error?: string })?.error ?? "Something went wrong.",
              variant: "destructive",
            });
            setLocation(`/documents/${doc.id}`);
          },
        },
      );
    } catch {
      toast({ title: "Upload failed", description: "Network error.", variant: "destructive" });
    }
  };

  const handleFileSelected = async (f: File) => {
    setFile(f);
    setFileVisible(false);
    requestAnimationFrame(() => setFileVisible(true));
    setTitleTarget("");
    setTitle("");
    setTitleLoading(true);

    const formData = new FormData();
    formData.append("file", f);
    try {
      const res = await fetch(getApiUrl("/api/documents/extract-title"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as { title: string };
        const extracted = data.title || f.name.replace(/\.[^.]+$/, "");
        setTitleTarget(extracted);
      } else {
        setTitleTarget(f.name.replace(/\.[^.]+$/, ""));
      }
    } catch {
      setTitleTarget(f.name.replace(/\.[^.]+$/, ""));
    } finally {
      setTitleLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-[34px] md:text-[40px] font-semibold tracking-tight text-deep-shadow mb-2">
            New Analysis
          </h1>
          <p className="text-muted-stone text-[15px] md:text-[16px] max-w-2xl leading-7">
            Upload a research paper, literature review, or academic study to get a clearer explanation of its findings, methodology, and limitations.
          </p>
        </header>

        <div className="flex gap-1 p-1 bg-pebble-gray/30 rounded-xl w-fit border border-pebble-gray mb-2">
          <button
            type="button"
            onClick={() => setTab("paste")}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${tab === "paste" ? "bg-canvas-parchment shadow-subtle text-inkwell" : "text-muted-stone hover:text-inkwell"}`}
          >
            Paste Text
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${tab === "upload" ? "bg-canvas-parchment shadow-subtle text-inkwell" : "text-muted-stone hover:text-inkwell"}`}
          >
            Upload File
          </button>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)] gap-5">
          <div className="space-y-5">
            {tab === "paste" ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full min-h-[560px] rounded-[24px] border border-pebble-gray bg-white p-6 font-mono text-[14px] leading-7 text-inkwell shadow-subtle outline-none transition-all placeholder:text-muted-stone/40 focus:border-inkwell resize-none"
                placeholder="Paste the contents of your research paper here..."
                required
              />
            ) : (
              <motion.div
                className={`h-[560px] rounded-[24px] border border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-200 ${
                  isDragOver
                    ? "border-inkwell bg-inkwell/5 ring-2 ring-inkwell/20"
                    : file
                    ? "border-inkwell bg-pebble-gray/10 shadow-subtle"
                    : "border-pebble-gray bg-white hover:border-inkwell hover:bg-pebble-gray/5"
                }`}
                animate={isDragOver ? { scale: 1.01 } : { scale: 1 }}
                transition={{ duration: 0.15 }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <div className={`w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-all shadow-subtle ${file ? "bg-inkwell text-canvas-parchment rotate-3" : isDragOver ? "bg-inkwell/10 text-inkwell" : "bg-pebble-gray text-muted-stone"}`}>
                  {file ? <FileText className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
                </div>
                <AnimatePresence mode="wait">
                  {file ? (
                    <motion.div
                      key="file-info"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <p className="text-[18px] font-semibold text-deep-shadow">{file.name}</p>
                      <p className="text-[11px] font-semibold text-muted-stone uppercase tracking-[0.16em]">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        variant="ghost"
                        className="mt-3 text-red-600 hover:bg-red-50"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setFile(null);
                          setFileVisible(false);
                          setTitleTarget("");
                          setTitle("");
                          setTitleLoading(false);
                        }}
                      >
                        Remove file
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3 px-12"
                    >
                      <p className="text-[20px] font-semibold text-deep-shadow">
                        {isDragOver ? "Drop to upload" : "Select a document"}
                      </p>
                      <p className="text-[15px] text-muted-stone max-w-sm mx-auto leading-7">
                        PDF, DOCX, or TXT. For best results, ensure the text is clear and readable.
                      </p>
                      {!isDragOver && <Button variant="secondary" className="mt-3">Browse files</Button>}
                    </motion.div>
                  )}
                </AnimatePresence>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                />
              </motion.div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="p-6 bg-white rounded-[24px] border border-pebble-gray shadow-subtle space-y-6">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">Paper title</Label>
                <div className="relative">
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setTitleTarget("");
                    }}
                    placeholder={titleLoading ? "Extracting title…" : "e.g. Impact of sleep on cognitive function"}
                    className={`h-11 border pr-10 ${titleLoading ? "opacity-60" : ""}`}
                    required
                  />
                  {titleLoading && (
                    <Loader2 className="absolute right-3 top-3 w-5 h-5 animate-spin text-muted-stone" />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">Study type</Label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full h-11 px-3 border border-muted-stone rounded-xl bg-transparent outline-none focus:border-inkwell transition-all text-[14px] appearance-none cursor-pointer text-inkwell"
                >
                  <option value="">Auto-detect</option>
                  <option value="research_paper">Research Paper</option>
                  <option value="literature_review">Literature Review</option>
                  <option value="clinical_trial">Clinical Trial</option>
                  <option value="meta_analysis">Meta-Analysis</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">Research field / Domain</Label>
                <Input
                  type="text"
                  value={researchField}
                  onChange={(e) => setResearchField(e.target.value)}
                  placeholder="e.g. Immunology, Psychology, Economics"
                  className="h-11 border"
                />
                <p className="text-[12px] leading-6 text-muted-stone">
                  Optional. Add the scientific domain to help orient the analysis.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">What do you want help with?</Label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_OPTIONS.map((option) => {
                    const selected = goal === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setGoal(selected ? "" : option)}
                        className={`rounded-full border px-3 py-2 text-[13px] transition-all ${
                          selected
                            ? "border-inkwell bg-inkwell text-canvas-parchment"
                            : "border-pebble-gray bg-canvas-parchment text-muted-stone hover:text-inkwell hover:border-inkwell/30"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                <Input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Optional custom goal"
                  className="h-11 border"
                />
              </div>

              <div className="pt-5 border-t border-pebble-gray">
                <Button
                  onClick={tab === "paste" ? handlePasteSubmit : handleFileSubmit}
                  disabled={isPending || !title.trim() || (tab === "paste" ? !text.trim() : !file)}
                  className="w-full bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92 group"
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Analyze paper <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-stone mt-4 uppercase tracking-[0.14em]">
                  Analysis takes ~45 seconds
                </p>
              </div>
            </div>

            <div className="p-5 bg-pebble-gray/18 rounded-[20px] border border-pebble-gray">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-goldenrod-accent fill-current" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-inkwell">Expert tip</span>
              </div>
              <p className="text-[14px] text-muted-stone leading-7">
                Clarity works best when it knows the research domain, study type, and whether you want a methodology check, plain-English summary, or results breakdown.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
