import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import {
  getSurveysByUserId,
  getSurveyById,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  getResponsesBySurveyId,
  replaceSurveyResponses,
  getInterpretationsBySurveyId,
  createInterpretation,
} from "./db";
import type { Survey } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

// ---------------------------------------------------------------------------
// Google Sheets CSV import helper
// ---------------------------------------------------------------------------

/**
 * Converts a Google Sheets public URL to a CSV export URL.
 * Accepts both /edit and /pub formats.
 */
function sheetsUrlToCsv(url: string): string {
  // Already a CSV export link
  if (url.includes("export?format=csv")) return url;

  // Try to extract the sheet ID from various URL formats
  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/, // /d/{id}/edit
    /id=([a-zA-Z0-9-_]+)/,   // ?id={id}
  ];

  let sheetId: string | null = null;
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      sheetId = match[1];
      break;
    }
  }

  if (sheetId) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  }

  // Fallback: assume it's already a direct CSV link
  return url;
}

/**
 * Parses CSV text into a 2D array, handling quoted fields with commas and newlines.
 */
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\n" || char === "\r") {
        // Handle \r\n
        if (char === "\r" && csvText[i + 1] === "\n") i++;
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.length > 0 && currentRow.some(f => f !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  // Last field
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Statistics helper
// ---------------------------------------------------------------------------

function computeStatistics(values: (string | number)[]) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== "");
  const total = nonEmpty.length;

  // Frequency map
  const freqMap: Record<string, number> = {};
  for (const v of nonEmpty) {
    const key = String(v);
    freqMap[key] = (freqMap[key] || 0) + 1;
  }

  const freqEntries = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);

  // Mode: most frequent value(s)
  const maxFreq = freqEntries.length > 0 ? freqEntries[0][1] : 0;
  const mode = freqEntries.filter(([_, count]) => count === maxFreq).map(([val]) => val);

  // Try numeric analysis
  const numericValues = nonEmpty
    .map(v => parseFloat(String(v).replace(",", ".")))
    .filter(v => !isNaN(v));

  let numericStats: Record<string, number | null> = {
    mean: null,
    median: null,
    min: null,
    max: null,
    stdDev: null,
  };

  if (numericValues.length > 0) {
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const mean = sum / numericValues.length;
    const sorted = [...numericValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const variance = numericValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numericValues.length;
    const stdDev = Math.sqrt(variance);

    numericStats = {
      mean: parseFloat(mean.toFixed(4)),
      median: parseFloat(median.toFixed(4)),
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      stdDev: parseFloat(stdDev.toFixed(4)),
    };
  }

  // Relative frequency (percentage)
  const relativeFreq = freqEntries.map(([val, count]) => ({
    value: val,
    count,
    percentage: parseFloat(((count / total) * 100).toFixed(2)),
  }));

  return {
    total,
    frequencies: freqEntries.map(([value, count]) => ({ value, count })),
    relativeFrequencies: relativeFreq,
    mode,
    isNumeric: numericValues.length > 0,
    numericStats,
  };
}

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // -------------------------------------------------------------------------
  // Survey router
  // -------------------------------------------------------------------------
  survey: router({
    list: protectedProcedure.query(({ ctx }) => {
      return getSurveysByUserId(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.id, ctx.user.id);
        if (!survey) throw new Error("Survey not found");
        return survey;
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        sheetUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createSurvey({
          userId: ctx.user.id,
          title: input.title,
          description: input.description || null,
          sheetUrl: input.sheetUrl,
          columnNames: [],
          responseCount: 0,
        });
        return { id };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteSurvey(input.id, ctx.user.id);
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        sheetUrl: z.string().url().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.id, ctx.user.id);
        if (!survey) throw new Error("Survey not found");
        const updates: Partial<Survey> = {};
        if (input.title !== undefined) updates.title = input.title;
        if (input.description !== undefined) updates.description = input.description;
        if (input.sheetUrl !== undefined) updates.sheetUrl = input.sheetUrl;
        await updateSurvey(input.id, updates);
        return { success: true };
      }),

    // -----------------------------------------------------------------------
    // Import from Google Sheets
    // -----------------------------------------------------------------------
    import: protectedProcedure
      .input(z.object({
        surveyId: z.number(),
        sheetUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get survey
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const url = input.sheetUrl || survey.sheetUrl;
        const csvUrl = sheetsUrlToCsv(url);

        // Fetch CSV
        const csvResponse = await fetch(csvUrl);
        if (!csvResponse.ok) {
          throw new Error(`Failed to fetch Google Sheets data: ${csvResponse.status}`);
        }
        const csvText = await csvResponse.text();
        const parsed = parseCsv(csvText);

        if (parsed.length < 1) {
          throw new Error("No data found in the spreadsheet");
        }

        // First row = headers (column names)
        const headers = parsed[0];
        const dataRows = parsed.slice(1);

        // Build response objects
        const responseRows = dataRows.map((row, index) => ({
          surveyId: input.surveyId,
          rowIndex: index,
          data: headers.reduce((obj, header, colIndex) => {
            obj[header] = row[colIndex] ?? "";
            return obj;
          }, {} as Record<string, string>),
        }));

        // Store in DB
        await replaceSurveyResponses(input.surveyId, responseRows);

        // Update survey metadata
        await updateSurvey(input.surveyId, {
          sheetUrl: url,
          columnNames: headers,
          responseCount: dataRows.length,
          lastSyncedAt: new Date(),
        });

        return {
          success: true,
          imported: dataRows.length,
          columns: headers,
        };
      }),

    // -----------------------------------------------------------------------
    // Get responses (with optional search/filter)
    // -----------------------------------------------------------------------
    responses: protectedProcedure
      .input(z.object({
        surveyId: z.number(),
        search: z.string().optional(),
        columnFilter: z.string().optional(),
        filterValue: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        let rows = await getResponsesBySurveyId(input.surveyId);

        // Apply column filter
        if (input.columnFilter && input.filterValue) {
          rows = rows.filter(r => {
            const data = r.data as Record<string, string>;
            return data[input.columnFilter!] === input.filterValue;
          });
        }

        // Apply text search
        if (input.search) {
          const searchLower = input.search.toLowerCase();
          rows = rows.filter(r => {
            const data = r.data as Record<string, string>;
            return Object.values(data).some(v =>
              String(v).toLowerCase().includes(searchLower)
            );
          });
        }

        return {
          columns: survey.columnNames as string[],
          rows: rows.map(r => ({
            id: r.id,
            rowIndex: r.rowIndex,
            data: r.data,
          })),
        };
      }),

    // -----------------------------------------------------------------------
    // Statistics per column
    // -----------------------------------------------------------------------
    statistics: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const rows = await getResponsesBySurveyId(input.surveyId);
        const columns = survey.columnNames as string[];

        const stats = columns.map(col => {
          const values = rows.map(r => (r.data as Record<string, string>)[col] || "");
          return {
            column: col,
            ...computeStatistics(values),
          };
        });

        return {
          totalResponses: rows.length,
          columns: stats,
        };
      }),

    // -----------------------------------------------------------------------
    // AI Interpretation
    // -----------------------------------------------------------------------
    interpret: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const rows = await getResponsesBySurveyId(input.surveyId);
        if (rows.length === 0) throw new Error("No responses to analyze");

        const columns = survey.columnNames as string[];

        // Build a summary of the data for the LLM
        const stats = columns.map(col => {
          const values = rows.map(r => (r.data as Record<string, string>)[col] || "");
          return { column: col, ...computeStatistics(values) };
        });

        // Build a compact data summary (not raw data, to save tokens)
        const summaryText = stats.map(s => {
          let text = `**${s.column}** (${s.total} respostas)\n`;
          text += `Frequências: ${s.relativeFrequencies.map(f => `${f.value} (${f.percentage}%)`).join(", ")}\n`;
          if (s.isNumeric) {
            text += `Média: ${s.numericStats.mean}, Mediana: ${s.numericStats.median}, Moda: ${s.mode.join(", ")}\n`;
            text += `Mín: ${s.numericStats.min}, Máx: ${s.numericStats.max}, Desvio Padrão: ${s.numericStats.stdDev}\n`;
          } else {
            text += `Moda: ${s.mode.join(", ")}\n`;
          }
          return text;
        }).join("\n");

        const systemPrompt = `Você é um analista de dados especialista em interpretação de resultados de pesquisas e formulários. O tema central da análise é "Antologia" — uma oficina que explora coleta de dados, análise estatística e interpretação crítica de informações. Sua tarefa é produzir uma interpretação textual rica e contextualizada dos dados, destacando tendências, padrões, comparações e conclusões relevantes. Sempre contextualize os resultados dentro dos objetivos da oficina "Antologia". Escreva em português brasileiro, em formato Markdown bem estruturado com seções, parágrafos e listas quando apropriado.`;

        const userPrompt = `Abaixo está o resumo estatístico das respostas de um formulário intitulado "${survey.title}". O total de respostas coletadas é ${rows.length}.

Estatísticas por campo:

${summaryText}

Por favor, produza uma análise interpretativa completa contendo:

1. **Visão Geral**: Um resumo executivo dos dados coletados.
2. **Análise por Campo**: Para cada campo, interprete os resultados, destacando os padrões mais relevantes.
3. **Tendências e Padrões**: Identifique tendências gerais nos dados.
4. **Comparações**: Compare resultados entre diferentes campos quando fizer sentido.
5. **Conclusões**: Extraia conclusões possíveis dos dados.
6. **Contextualização com a Oficina "Antologia"**: Relacione os resultados aos objetivos da oficina, que envolve coleta de dados, análise estatística e interpretação crítica.

Seja detalhado, analítico e use linguagem acessível. Formate a resposta em Markdown.`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 4096,
        });

        const rawContent = llmResponse.choices[0].message.content;
        const content = typeof rawContent === "string" ? rawContent : "";
        const modelUsed = (llmResponse as Record<string, unknown>).model as string || "default";

        // Save interpretation
        await createInterpretation({
          surveyId: input.surveyId,
          content,
          modelUsed,
        });

        return { content };
      }),

    // Get saved interpretations
    interpretations: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");
        return getInterpretationsBySurveyId(input.surveyId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
