import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, usersTable, documentsTable, documentQuestionsTable, usageEventsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getLimits } from "../lib/usageLimits";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // User's own documents — drives all stats and counts
  const userDocs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.userId, userId))
    .orderBy(desc(documentsTable.createdAt));

  // Demo documents — shown separately, never counted in user stats
  const demoDocs = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.isDemo, true), eq(documentsTable.status, "completed")))
    .orderBy(desc(documentsTable.createdAt));

  const totalDocuments = userDocs.length;
  const completedDocuments = userDocs.filter((d: any) => d.status === "completed").length;
  const pendingDocuments = userDocs.filter(
    (d: any) => d.status === "uploaded" || d.status === "extracting" || d.status === "analysing",
  ).length;
  const failedDocuments = userDocs.filter((d: any) => d.status === "failed").length;

  const confidenceBreakdown = {
    low: userDocs.filter((d: any) => d.confidenceLevel === "low").length,
    medium: userDocs.filter((d: any) => d.confidenceLevel === "medium").length,
    high: userDocs.filter((d: any) => d.confidenceLevel === "high").length,
  };

  const allQuestions = await db
    .select()
    .from(documentQuestionsTable)
    .where(eq(documentQuestionsTable.userId, userId));
  const questionsAsked = allQuestions.length;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyEvents = await db
    .select()
    .from(usageEventsTable)
    .where(eq(usageEventsTable.userId, userId));
  const documentsAnalysedThisMonth = monthlyEvents.filter(
    (e: any) => e.eventType === "document_analysed" && e.createdAt >= startOfMonth,
  ).length;

  const limits = getLimits(user.plan);
  const mapDoc = (doc: any) => ({
    id: doc.id,
    userId: doc.userId,
    title: doc.title,
    documentType: doc.documentType ?? null,
    originalFileName: doc.originalFileName ?? null,
    sourceType: doc.sourceType,
    extractedText: null,
    pageCountEstimate: doc.pageCountEstimate ?? null,
    wordCount: doc.wordCount ?? null,
    status: doc.status,
    isDemo: doc.isDemo,
    researchField: doc.researchField ?? null,
    goal: doc.goal ?? null,
    confidenceLevel: doc.confidenceLevel ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });

  const recentDocuments = [
    ...userDocs.slice(0, 5).map(mapDoc),
    ...demoDocs.map(mapDoc),
  ];

  res.json({
    totalDocuments,
    completedDocuments,
    pendingDocuments,
    failedDocuments,
    questionsAsked,
    documentsAnalysedThisMonth,
    riskBreakdown: confidenceBreakdown,
    recentDocuments,
    plan: user.plan,
    usageRemaining: {
      documentsThisMonth: documentsAnalysedThisMonth,
      questionsThisDocument: 0,
      plan: user.plan,
      maxDocumentsPerMonth: limits.maxDocumentsPerMonth,
      maxQuestionsPerDocument: limits.maxQuestionsPerDocument,
      maxWordCount: limits.maxWordCount,
      maxPageCount: limits.maxPageCount,
    },
  });
});

export default router;
