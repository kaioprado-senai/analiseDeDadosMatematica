import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  InsertSurvey, surveys, Survey,
  InsertResponse, responses, Response,
  InsertAiInterpretation, aiInterpretations, AiInterpretation,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---------------------------------------------------------------------------
// User helpers (existing)
// ---------------------------------------------------------------------------

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------------------------------------------------------------------------
// Survey helpers
// ---------------------------------------------------------------------------

export async function getSurveysByUserId(userId: number): Promise<Survey[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select().from(surveys).where(eq(surveys.userId, userId)).orderBy(desc(surveys.createdAt));
  return result;
}

export async function getSurveyById(id: number, userId: number): Promise<Survey | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(surveys).where(and(eq(surveys.id, id), eq(surveys.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createSurvey(survey: InsertSurvey): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(surveys).values(survey);
  return result[0].insertId;
}

export async function updateSurvey(id: number, updates: Partial<Survey>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(surveys).set(updates).where(eq(surveys.id, id));
}

export async function deleteSurvey(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete responses and interpretations first
  await db.delete(responses).where(eq(responses.surveyId, id));
  await db.delete(aiInterpretations).where(eq(aiInterpretations.surveyId, id));
  await db.delete(surveys).where(and(eq(surveys.id, id), eq(surveys.userId, userId)));
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export async function getResponsesBySurveyId(surveyId: number): Promise<Response[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select().from(responses).where(eq(responses.surveyId, surveyId)).orderBy(responses.rowIndex);
  return result;
}

export async function replaceSurveyResponses(surveyId: number, rows: InsertResponse[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete existing responses
  await db.delete(responses).where(eq(responses.surveyId, surveyId));
  // Insert new ones
  if (rows.length > 0) {
    await db.insert(responses).values(rows);
  }
}

// ---------------------------------------------------------------------------
// AI Interpretation helpers
// ---------------------------------------------------------------------------

export async function getInterpretationsBySurveyId(surveyId: number): Promise<AiInterpretation[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select().from(aiInterpretations).where(eq(aiInterpretations.surveyId, surveyId)).orderBy(desc(aiInterpretations.createdAt));
  return result;
}

export async function createInterpretation(interp: InsertAiInterpretation): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiInterpretations).values(interp);
  return result[0].insertId;
}
