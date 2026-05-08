import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ name, email, passwordHash, plan: "free" })
    .returning();

  // Create default subscription
  await db.insert(subscriptionsTable).values({
    userId: user.id,
    plan: "free",
    status: "active",
  });

  req.session.userId = user.id;

  req.log.info({ userId: user.id }, "User registered");
  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt },
    message: "Registration successful",
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;

  req.log.info({ userId: user.id }, "User logged in");
  res.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt },
    message: "Login successful",
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, "Session destroy error");
    }
  });
  res.json({ message: "Logged out" });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json({ id: user.id, name: user.name, email: user.email, plan: user.plan, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt });
});

export default router;
