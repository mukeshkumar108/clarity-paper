import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { UpgradePlanBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/billing/subscription", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  let [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  if (!subscription) {
    // Create default subscription
    const [newSub] = await db
      .insert(subscriptionsTable)
      .values({ userId, plan: "free", status: "active" })
      .returning();
    subscription = newSub;
  }

  res.json({
    id: subscription.id,
    userId: subscription.userId,
    plan: subscription.plan,
    status: subscription.status,
    stripeCustomerId: subscription.stripeCustomerId ?? null,
    stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
    createdAt: subscription.createdAt,
  });
});

router.post("/billing/upgrade", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpgradePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;

  // Stripe integration placeholder — ready to wire
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;

  if (STRIPE_SECRET_KEY && STRIPE_PRICE_ID) {
    // TODO: Create Stripe Checkout session
    // For now return a placeholder response indicating Stripe is ready to wire
    res.json({
      success: false,
      message: "Stripe integration ready. Complete wiring to enable payments.",
      checkoutUrl: null,
      plan: "free",
    });
    return;
  }

  // Demo upgrade: flip plan to pro without payment
  await db
    .update(usersTable)
    .set({ plan: "pro" })
    .where(eq(usersTable.id, userId));

  await db
    .update(subscriptionsTable)
    .set({ plan: "pro", status: "active" })
    .where(eq(subscriptionsTable.userId, userId));

  res.json({
    success: true,
    message: "Upgraded to Pro (demo mode — no payment required). Stripe integration is ready to wire.",
    checkoutUrl: null,
    plan: "pro",
  });
});

export default router;
