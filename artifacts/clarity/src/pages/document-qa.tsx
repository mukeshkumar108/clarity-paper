import React, { useState } from "react";
import { Link } from "wouter";
import { useGetDocument, getGetDocumentQueryKey, useListDocumentQuestions, getListDocumentQuestionsQueryKey, useAskDocumentQuestion } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function DocumentQA({ id }: { id: string }) {
  const docId = parseInt(id, 10);
  const [question, setQuestion] = useState("");
  
  const { data: document } = useGetDocument(docId, {
    query: {
      enabled: !!docId,
      queryKey: getGetDocumentQueryKey(docId)
    }
  });

  const { data: questions, refetch } = useListDocumentQuestions(docId, {
    query: {
      enabled: !!docId,
      queryKey: getListDocumentQuestionsQueryKey(docId)
    }
  });

  const askMutation = useAskDocumentQuestion();

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    
    askMutation.mutate(
      { id: docId, data: { question } },
      {
        onSuccess: () => {
          setQuestion("");
          refetch();
        }
      }
    );
  };

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
        {questions?.length === 0 ? (
          <div className="text-center text-muted-foreground my-20">
            <p className="text-xl mb-2 font-medium text-foreground">Ask anything about this document</p>
            <p>E.g. "Can I terminate this early?" or "Who owns the IP?"</p>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            {questions?.map((q) => (
              <div key={q.id} className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                    {q.question}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-card border p-4 rounded-2xl rounded-tl-sm max-w-[85%] shadow-sm">
                    {q.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="p-4 bg-card border-t shrink-0">
        <div className="max-w-4xl mx-auto relative">
          <form onSubmit={handleAsk} className="flex gap-2">
            <input 
              type="text" 
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your document..."
              className="flex-1 p-3 border rounded-xl bg-muted/50 focus:bg-background outline-none ring-primary focus:ring-2"
              disabled={askMutation.isPending}
            />
            <Button type="submit" disabled={askMutation.isPending || !question.trim()} className="rounded-xl px-6">
              {askMutation.isPending ? "..." : "Ask"}
            </Button>
          </form>
        </div>
      </footer>
    </div>
  );
}