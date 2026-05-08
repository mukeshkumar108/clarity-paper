import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, FileCheck, MessageCircle, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const featureCards = [
  {
    title: "Methodology flags, not just summaries",
    description: "Small sample sizes, undisclosed funding, p-hacking patterns — surfaced before you trust the conclusion.",
    icon: ShieldAlert,
    tone: "bg-onyx-outline/10 text-onyx-outline",
  },
  {
    title: "Findings in plain English",
    description: "What the study actually found, what it doesn't prove, and the real-world gap between the two.",
    icon: Zap,
    tone: "bg-chartreuse-alert/12 text-forest-green-action",
  },
  {
    title: "Questions worth asking",
    description: "Every analysis ends with the follow-ups a skeptical reader should raise — so you know where the uncertainty lives.",
    icon: MessageCircle,
    tone: "bg-highlight-beige text-inkwell",
  },
  {
    title: "Any format, any field",
    description: "Upload a PDF or paste the text. Works with clinical trials, meta-analyses, observational studies, and case reports.",
    icon: FileCheck,
    tone: "bg-pebble-gray/70 text-inkwell",
  },
];

const audiences = [
  {
    label: "The curious reader",
    description: "You heard the claim on a podcast or saw the headline. Now you want to check whether the study actually says that.",
  },
  {
    label: "The biohacker",
    description: "You make decisions based on research. You need the methodology flags, not just the abstract.",
  },
  {
    label: "The grad student",
    description: "You have to read five papers this week. You want to understand them — not just skim them.",
  },
  {
    label: "The health professional",
    description: "You're reviewing studies outside your specialty. You want the honest read, not the marketing gloss.",
  },
  {
    label: "The science writer",
    description: "You need to report accurately. You want to see the caveats before you quote the finding.",
  },
];

const faqs = [
  {
    question: "What kinds of papers can I upload?",
    answer: "Clinical trials, meta-analyses, observational studies, case reports, and most peer-reviewed research formats. If it's a research paper, it should work. Upload as a PDF or paste the text directly.",
  },
  {
    question: "How accurate is the analysis?",
    answer: "The analysis is designed to surface what's in the paper — not add opinions. It flags methodology concerns, extracts findings, and notes caveats. It won't catch every flaw, and it's not a substitute for domain expertise. But it's a reliable first pass.",
  },
  {
    question: "Is this a replacement for reading the paper?",
    answer: "No. It's a way to read the paper more clearly. The goal is to help you understand what you're looking at — not to read it for you. We show you the structure, surface the risks, and give you the questions to bring back to the source.",
  },
  {
    question: "Does it work on paywalled papers?",
    answer: "If you have access to the PDF — through your institution, a library, or a legal copy — yes. Upload the file directly. We don't pull papers from the web.",
  },
  {
    question: "What language are the analyses in?",
    answer: "English by default. If you prefer Spanish, French, German, Portuguese, or Italian, you can set your preferred language in account settings and all analyses will be delivered in that language.",
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-pebble-gray last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[16px] font-medium text-deep-shadow">{question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-stone transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-48 pb-5" : "max-h-0"}`}
      >
        <p className="text-[15px] leading-[1.65] text-muted-stone">{answer}</p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas-parchment text-inkwell selection:bg-onyx-outline/10 selection:text-onyx-outline">
      <header className="studio-header">
        <div className="studio-container flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-inkwell shadow-subtle">
              <div className="h-4 w-4 rotate-45 rounded-[2px] bg-canvas-parchment" />
            </div>
            <div>
              <span className="block text-[18px] font-semibold tracking-tight text-deep-shadow">Clarity Paper</span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-stone">Research intelligence</span>
            </div>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-[14px] text-muted-stone transition-colors hover:text-inkwell">Features</a>
            <a href="#for-who" className="text-[14px] text-muted-stone transition-colors hover:text-inkwell">Who it's for</a>
            <a href="#faq" className="text-[14px] text-muted-stone transition-colors hover:text-inkwell">FAQ</a>
            <Link href="/login" className="text-[14px] font-medium text-muted-stone transition-colors hover:text-inkwell">Log in</Link>
            <Button asChild className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92">
              <Link href="/register">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="pt-28 md:pt-32">
        {/* Hero */}
        <section className="studio-container py-14 md:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
            <div className="max-w-[680px] space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-pebble-gray bg-white/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone shadow-subtle"
              >
                <Sparkles className="h-3.5 w-3.5 text-goldenrod-accent" />
                Plain-English research analysis
              </motion.div>

              <div className="space-y-5">
                <h1 className="max-w-[14ch] text-[44px] font-semibold tracking-[-0.045em] text-deep-shadow sm:text-[56px] lg:text-[64px] leading-[0.94]">
                  Does the science actually back that up?
                </h1>
                <p className="max-w-[54ch] text-[17px] leading-[1.6] text-muted-stone md:text-[18px]">
                  You've seen the claim. Now read the paper. Clarity Paper breaks down research into plain English — methodology flags, key findings, and the questions worth asking before you change anything.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92">
                  <Link href="/documents/new">
                    Upload a paper
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/dashboard">
                    See an example
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                {[
                  ["Under a minute", "Typical analysis time"],
                  ["Plain English", "No jargon, no hedging"],
                  ["Methodology first", "Flags problems, not just findings"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-pebble-gray bg-white/72 p-4 shadow-subtle">
                    <div className="text-[22px] font-semibold tracking-tight text-deep-shadow">{value}</div>
                    <div className="mt-1 text-[12px] uppercase tracking-[0.16em] text-muted-stone">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[28px] border border-pebble-gray bg-white/82 p-4 shadow-xl backdrop-blur-sm md:p-5">
                <div className="overflow-hidden rounded-[22px] border border-pebble-gray bg-canvas-parchment">
                  <div className="grid min-h-[520px] md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="border-b border-pebble-gray bg-highlight-beige/30 p-5 md:border-b-0 md:border-r">
                      <div className="mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                        <FileCheck className="h-3.5 w-3.5" />
                        Library
                      </div>
                      <div className="space-y-2.5">
                        {["Longevity Study", "Nutrient Density", "Sleep Architecture", "Cold Exposure Meta-analysis"].map((item, index) => (
                          <div
                            key={item}
                            className={`rounded-xl border px-3 py-3 text-[13px] ${index === 0 ? "border-pebble-gray bg-white text-inkwell shadow-subtle" : "border-transparent bg-white/40 text-muted-stone"}`}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-5 md:p-6">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">Analysis</p>
                          <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-deep-shadow">Longevity Study</h2>
                        </div>
                        <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
                          High confidence
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-pebble-gray bg-white p-4 shadow-subtle">
                          <p className="text-[13px] font-medium leading-6 text-inkwell/85">
                            Zone 2 training improved mitochondrial efficiency. The sample size (n=450) is reasonable, but the 12-week window limits long-term conclusions.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">Key finding</div>
                          <p className="text-[14px] leading-6 text-inkwell/85">
                            Fasting groups showed 12% improvement in metabolic markers vs. control — but effect size varied significantly by baseline fitness.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-pebble-gray bg-highlight-beige/20 p-4">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">Methodology flag</div>
                          <p className="text-[14px] leading-6 text-inkwell/85">
                            Partially funded by a supplement company. Independent replication is recommended before acting on findings.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-2 rounded-2xl border border-pebble-gray bg-white/90 px-4 py-3 shadow-subtle md:-left-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">Built for evidence</div>
                <div className="mt-1 text-[18px] font-semibold tracking-tight text-deep-shadow">Read the paper. Not just the abstract.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="studio-section-padding border-y border-pebble-gray/80 bg-white/40">
          <div className="studio-container">
            <div className="mb-10 max-w-[760px] space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-stone">What it does</p>
              <h2 className="text-[34px] font-semibold tracking-[-0.03em] text-deep-shadow md:text-[44px]">
                The parts most people skip. We don't.
              </h2>
              <p className="text-[16px] leading-[1.6] text-muted-stone">
                Most people read the abstract and trust the headline. Clarity Paper reads the whole paper — and flags the parts that should give you pause.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {featureCards.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-pebble-gray bg-canvas-parchment p-5 shadow-subtle transition-all hover:-translate-y-px hover:bg-white">
                  <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${feature.tone}`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-[17px] font-semibold tracking-tight text-deep-shadow">{feature.title}</h3>
                  <p className="mt-3 text-[14px] leading-[1.65] text-muted-stone">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section id="for-who" className="studio-section-padding">
          <div className="studio-container grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-stone">Who it's for</p>
              <h2 className="text-[34px] font-semibold tracking-[-0.03em] text-deep-shadow md:text-[44px]">
                Anyone who has ever wanted to check the actual study.
              </h2>
              <p className="text-[16px] leading-[1.6] text-muted-stone">
                The same tool for the biohacker reviewing a clinical trial and the student trying to understand a paper without getting lost in the methods section.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {audiences.map((audience) => (
                <div key={audience.label} className="rounded-2xl border border-pebble-gray bg-white/78 p-5 shadow-subtle">
                  <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-stone">{audience.label}</div>
                  <div className="text-[14px] leading-[1.65] text-inkwell/85">{audience.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="studio-section-padding border-t border-pebble-gray/80 bg-white/40">
          <div className="studio-container grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-stone">FAQ</p>
              <h2 className="text-[34px] font-semibold tracking-[-0.03em] text-deep-shadow md:text-[40px]">
                Good questions deserve honest answers.
              </h2>
              <p className="text-[16px] leading-[1.6] text-muted-stone">
                If you're wondering whether this is right for your use case, here's what we'd tell you in person.
              </p>
            </div>

            <div className="rounded-2xl border border-pebble-gray bg-canvas-parchment px-6 shadow-subtle">
              {faqs.map((faq) => (
                <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* Social proof line */}
        <section className="border-t border-pebble-gray/80 bg-pebble-gray/16 py-10">
          <div className="studio-container text-center">
            <p className="text-[15px] leading-[1.6] text-muted-stone">
              Used by biohackers, grad students, and science writers who want to get closer to the evidence — not further from it.
            </p>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="studio-section-padding">
          <div className="studio-container">
            <div className="rounded-[28px] border border-pebble-gray bg-white/82 px-6 py-12 text-center shadow-xl md:px-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-stone">Start with a real paper</p>
              <h2 className="mx-auto mt-4 max-w-[16ch] text-[36px] font-semibold tracking-[-0.04em] text-deep-shadow md:text-[50px] leading-[0.96]">
                Stop trusting the headline. Read the study.
              </h2>
              <p className="mx-auto mt-5 max-w-[52ch] text-[16px] leading-[1.6] text-muted-stone">
                Upload any research paper and get a plain-English breakdown — methodology, findings, and the questions worth asking — in under a minute.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92">
                  <Link href="/documents/new">
                    Upload a paper
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/register">Create free account</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-pebble-gray/80 bg-canvas-parchment/80 py-8">
        <div className="studio-container flex flex-col gap-4 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div>
            <div className="text-[16px] font-semibold tracking-tight text-deep-shadow">Clarity Paper</div>
            <div className="text-[12px] text-muted-stone">Plain-English research analysis.</div>
          </div>
          <p className="text-[12px] text-muted-stone">
            Not medical advice. © {new Date().getFullYear()} Clarity Paper.
          </p>
        </div>
      </footer>
    </div>
  );
}
