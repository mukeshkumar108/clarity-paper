import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, documentsTable, documentQuestionsTable, subscriptionsTable, usageEventsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { UpdateProfileBody } from "@workspace/api-zod";
import { getLimits } from "../lib/usageLimits";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.patch("/settings/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email } = parsed.data;
  const updates: Partial<{ name: string; email: string }> = {};
  if (name) updates.name = name;
  if (email) updates.email = email;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.session.userId!))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt });
});

router.patch("/settings/preferences", requireAuth, async (req, res): Promise<void> => {
  const { preferredLanguage } = req.body as { preferredLanguage?: string };
  const allowed = ["English", "Spanish", "French", "German", "Portuguese", "Italian"];
  if (!preferredLanguage || !allowed.includes(preferredLanguage)) {
    res.status(400).json({ error: "Invalid language selection" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ preferredLanguage })
    .where(eq(usersTable.id, req.session.userId!))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ preferredLanguage: user.preferredLanguage });
});

router.patch("/settings/change-password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Current password and a new password of at least 8 characters are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
  res.json({ message: "Password updated" });
});

router.delete("/settings/delete-account", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  await db.delete(usersTable).where(eq(usersTable.id, userId));

  req.session.destroy((err) => {
    if (err) logger.error({ err }, "Session destroy error on delete account");
  });

  res.json({ message: "Account deleted" });
});

router.get("/settings/export-data", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const documents = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.userId, userId));

  const questions = await db
    .select()
    .from(documentQuestionsTable)
    .where(eq(documentQuestionsTable.userId, userId));

  let [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  res.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, createdAt: user.createdAt },
    documents: documents.map((d: any) => ({
      id: d.id, title: d.title, documentType: d.documentType, status: d.status, createdAt: d.createdAt,
    })),
    questions: questions.map((q: any) => ({
      id: q.id, documentId: q.documentId, question: q.question, answer: q.answer, createdAt: q.createdAt,
    })),
    subscription: subscription
      ? { id: subscription.id, userId: subscription.userId, plan: subscription.plan, status: subscription.status, createdAt: subscription.createdAt }
      : null,
    exportedAt: new Date(),
  });
});

router.get("/usage", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const events = await db
    .select()
    .from(usageEventsTable)
    .where(eq(usageEventsTable.userId, userId));

  const documentsThisMonth = events.filter(
    (e: any) => e.eventType === "document_analysed" && e.createdAt >= startOfMonth,
  ).length;

  const limits = getLimits(user.plan);

  res.json({
    documentsThisMonth,
    questionsThisDocument: 0,
    plan: user.plan,
    maxDocumentsPerMonth: limits.maxDocumentsPerMonth,
    maxQuestionsPerDocument: limits.maxQuestionsPerDocument,
    maxWordCount: limits.maxWordCount,
    maxPageCount: limits.maxPageCount,
  });
});

export default router;
