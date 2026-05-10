import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  useGetDocument,
  getGetDocumentQueryKey,
  useListDocumentQuestions,
  getListDocumentQuestionsQueryKey,
  useAskDocumentQuestion,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const SUGGESTED_QUESTIONS = [
  "What were the main findings?",
  "What were the limitations?",
  "What dosage or methodology was used?",
  "How confident should I be in these results?",
];

function AnswerBubble({ answer }: { answer: string }) {
  return (
    <div className="bg-card border p-4 rounded-2xl rounded-tl-sm max-w-[90%] shadow-sm text-sm leading-relaxed text-deep-shadow/80">
      {answer}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function DocumentQA({ id }: { id: string }) {
  const docId = parseInt(id, 10);
  const [question, setQuestion] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: document } = useGetDocument(docId, {
    query: {
      enabled: !!docId,
      queryKey: getGetDocumentQueryKey(docId),
    },
  });

  const { data: questions, refetch } = useListDocumentQuestions(docId, {
    query: {
      enabled: !!docId,
      queryKey: getListDocumentQuestionsQueryKey(docId),
    },
  });

  const askMutation = useAskDocumentQuestion();

  useEffect(() => {
    if (questions && questions.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [questions?.length]);

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || askMutation.isPending) return;

    askMutation.mutate(
      { id: docId, data: { question } },
      {
        onSuccess: () => {
          setQuestion("");
          refetch();
        },
      },
    );
  };

  const handleSuggestion = (q: string) => {
    setQuestion(q);
  };

  const isEmpty = !questions || questions.length === 0;

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col h-screen">
      <header className="p-4 border-b bg-card flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/documents/${docId}`} className="text-muted-foreground hover:text-foreground">
            &larr; Back
          </Link>
          <h1 className="font-bold truncate max-w-md">{document?.title || "Document Q&A"}</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
        {isEmpty && !askMutation.isPending ? (
          <div className="text-center text-muted-foreground my-16">
            <p className="text-xl mb-2 font-medium text-foreground">Ask anything about this document</p>
            <p className="mb-2 text-sm">Answers are grounded in the document text.</p>
            <p className="mb-8 text-xs text-muted-stone/60">
              Each sentence is labeled: <span className="text-forest-green-action font-medium">from paper</span> (cited from the document) or{" "}
              <span className="text-muted-stone font-medium">background</span> (general scientific context).
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            {questions?.map((q) => (
              <div key={q.id} className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm text-sm">
                    {q.question}
                  </div>
                </div>
                <div className="flex justify-start">
                  <AnswerBubble answer={q.answer} />
                </div>
              </div>
            ))}

            {askMutation.isPending && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm text-sm opacity-70">
                    {question || "…"}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-card border p-4 rounded-2xl rounded-tl-sm max-w-[85%] shadow-sm text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="animate-pulse">Searching the document</span>
                      <span className="animate-bounce delay-75">.</span>
                      <span className="animate-bounce delay-150">.</span>
                      <span className="animate-bounce delay-300">.</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {askMutation.isError && (
              <div className="flex justify-start">
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-2xl rounded-tl-sm max-w-[85%] text-sm">
                  Something went wrong. Please try your question again.
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="p-4 bg-card border-t shrink-0">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleAsk} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about this document…"
              className="flex-1 p-3 border rounded-xl bg-muted/50 focus:bg-background outline-none ring-primary focus:ring-2 text-sm"
              disabled={askMutation.isPending}
              autoFocus
            />
            <Button
              type="submit"
              disabled={askMutation.isPending || !question.trim()}
              className="rounded-xl px-6"
            >
              {askMutation.isPending ? "Thinking…" : "Ask"}
            </Button>
          </form>
        </div>
      </footer>
    </div>
  );
}
