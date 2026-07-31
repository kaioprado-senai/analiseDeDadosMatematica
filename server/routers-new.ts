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

  throw new Error("Could not extract sheet ID from URL");
}

/**
 * Parse CSV string into rows
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      }
      if (char === "\r" && nextChar === "\n") i++;
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Calculate statistics from responses
 */
function calculateStatistics(responses: Record<string, string>[]) {
  if (responses.length === 0) return {};

  const columns = Object.keys(responses[0] || {});
  const stats: Record<string, any> = {};

  for (const col of columns) {
    const values = responses.map(r => r[col]).filter(v => v && v.length > 0);
    const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));

    const frequency: Record<string, number> = {};
    for (const val of values) {
      frequency[val] = (frequency[val] || 0) + 1;
    }

    const isNumeric = numericValues.length > 0 && numericValues.length === values.length;

    stats[col] = {
      total: values.length,
      unique: Object.keys(frequency).length,
      frequency,
      isNumeric,
      ...(isNumeric && {
        mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
      }),
    };
  }

  return stats;
}

// ---------------------------------------------------------------------------
// tRPC Router
// ---------------------------------------------------------------------------

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  survey: router({
    // List surveys for current user
    list: protectedProcedure.query(async ({ ctx }) => {
      return getSurveysByUserId(ctx.user.id);
    }),

    // Get single survey
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.id, ctx.user.id);
        if (!survey) throw new Error("Survey not found");
        const responses = await getResponsesBySurveyId(input.id);
        return {
          ...survey,
          responseCount: responses.length,
        };
      }),

    // Create survey
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
        });
        return { id };
      }),

    // Delete survey
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteSurvey(input.id, ctx.user.id);
        return { success: true };
      }),

    // Update survey
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
      .input(z.object({ surveyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        // Convert URL to CSV export format
        const csvUrl = sheetsUrlToCsv(survey.sheetUrl);

        // Fetch CSV
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error("Failed to fetch Google Sheets CSV");
        const csv = await response.text();

        // Parse CSV
        const rows = parseCSV(csv);
        if (rows.length < 2) throw new Error("CSV must have header and at least one row");

        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Convert to response objects
        const responses = dataRows.map(row => {
          const obj: Record<string, string> = {};
          for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = row[i] || "";
          }
          return obj;
        });

        // Replace responses in database
        await replaceSurveyResponses(input.surveyId, responses);

        return {
          imported: responses.length,
          columns: headers.length,
        };
      }),

    // Get responses for a survey
    responses: protectedProcedure
      .input(z.object({
        surveyId: z.number(),
        page: z.number().default(0),
        limit: z.number().default(10),
      }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const responses = await getResponsesBySurveyId(input.surveyId);
        const start = input.page * input.limit;
        const paginated = responses.slice(start, start + input.limit);

        return {
          data: paginated,
          total: responses.length,
          page: input.page,
          limit: input.limit,
        };
      }),

    // Get statistics for a survey
    statistics: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const responses = await getResponsesBySurveyId(input.surveyId);
        return calculateStatistics(responses);
      }),

    // Generate AI interpretation
    interpret: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const responses = await getResponsesBySurveyId(input.surveyId);
        if (responses.length === 0) throw new Error("No responses to analyze");

        const stats = calculateStatistics(responses);

        const userPrompt = `Analise os seguintes dados coletados no formulário "${survey.title}":

Estatísticas dos campos:
${JSON.stringify(stats, null, 2)}

Total de respostas: ${responses.length}

Gere uma análise completa que inclua:
1. **Visão Geral**: Resumo dos dados coletados
2. **Análise por Campo**: Detalhes de cada pergunta/campo
3. **Tendências**: Padrões e tendências identificadas
4. **Comparações**: Compare resultados entre diferentes campos quando fizer sentido.
5. **Conclusões**: Extraia conclusões possíveis dos dados.
6. **Contextualização com a Oficina "Antologia"**: Relacione os resultados aos objetivos da oficina, que envolve coleta de dados, análise estatística e interpretação crítica.

Seja detalhado, analítico e use linguagem acessível. Formate a resposta em Markdown.`;

        const systemPrompt = `Você é um especialista em análise de dados para a oficina "Antologia". Sua tarefa é analisar dados coletados em formulários e gerar insights significativos e contextualizados.`;

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

    // -----------------------------------------------------------------------
    // NEW: Export, Comparison, and Chat
    // -----------------------------------------------------------------------

    // Export analysis and statistics as Markdown
    exportMarkdown: protectedProcedure
      .input(z.object({ surveyId: z.number() }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const responses = await getResponsesBySurveyId(input.surveyId);
        const interpretations = await getInterpretationsBySurveyId(input.surveyId);
        const stats = calculateStatistics(responses);

        // Build Markdown report
        let markdown = `# Relatório de Análise — ${survey.title}\n\n`;
        markdown += `**Data de geração**: ${new Date().toLocaleString("pt-BR")}\n\n`;
        markdown += `**Total de respostas**: ${responses.length}\n\n`;

        if (survey.description) {
          markdown += `## Descrição\n\n${survey.description}\n\n`;
        }

        // Add statistics summary
        markdown += `## Estatísticas Resumidas\n\n`;
        for (const [col, stat] of Object.entries(stats)) {
          markdown += `### ${col}\n`;
          markdown += `- **Total de respostas**: ${(stat as any).total}\n`;
          markdown += `- **Valores únicos**: ${(stat as any).unique}\n`;
          if ((stat as any).isNumeric) {
            markdown += `- **Média**: ${((stat as any).mean).toFixed(2)}\n`;
            markdown += `- **Mínimo**: ${(stat as any).min}\n`;
            markdown += `- **Máximo**: ${(stat as any).max}\n`;
          }
          markdown += `\n`;
        }

        // Add latest interpretation
        if (interpretations.length > 0) {
          const latest = interpretations[0];
          markdown += `## Análise Gerada pela IA\n\n${latest.content}\n\n`;
          markdown += `*Modelo utilizado: ${latest.modelUsed}*\n\n`;
        }

        return markdown;
      }),

    // Get statistics for multiple surveys (for comparison)
    multipleStats: protectedProcedure
      .input(z.object({ surveyIds: z.array(z.number()) }))
      .query(async ({ ctx, input }) => {
        const results = [];
        for (const surveyId of input.surveyIds) {
          const survey = await getSurveyById(surveyId, ctx.user.id);
          if (!survey) continue;

          const responses = await getResponsesBySurveyId(surveyId);
          const stats = calculateStatistics(responses);
          results.push({
            survey,
            responseCount: responses.length,
            stats,
          });
        }
        return results;
      }),

    // Chat endpoint for interactive questions about survey data
    chat: protectedProcedure
      .input(z.object({
        surveyId: z.number(),
        question: z.string().min(1),
      }))
      .query(async ({ ctx, input }) => {
        const survey = await getSurveyById(input.surveyId, ctx.user.id);
        if (!survey) throw new Error("Survey not found");

        const responses = await getResponsesBySurveyId(input.surveyId);
        const stats = calculateStatistics(responses);

        const systemPrompt = `Você é um assistente especializado em análise de dados da oficina Antologia.

Formulário: ${survey.title}
Total de respostas: ${responses.length}

Dados disponíveis:
${JSON.stringify(stats, null, 2)}

Responda perguntas do usuário sobre os dados de forma clara, concisa e contextualizada com a oficina Antologia.`;

        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.question },
          ],
          maxTokens: 1024,
        });

        const answer = typeof llmResponse.choices[0].message.content === "string"
          ? llmResponse.choices[0].message.content
          : "";

        return { answer };
      }),
  }),
});

export type AppRouter = typeof appRouter;
