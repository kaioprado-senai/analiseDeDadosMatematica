# Project TODO — Antologia Analytics

## Database & Backend
- [x] Define database schema (surveys, responses, columns, ai_interpretations)
- [x] Generate and apply migration SQL
- [x] Implement DB helpers for surveys, responses, and interpretations
- [x] Implement tRPC routers: survey CRUD, Google Sheets import, statistics, AI interpretation

## Frontend — Layout & Navigation
- [x] Configure theme and global styles (dark theme, Antologia branding)
- [x] Set up DashboardLayout with sidebar navigation
- [x] Set up routing in App.tsx (Dashboard, Surveys, Survey Detail, AI Insights)

## Frontend — Pages
- [x] Dashboard page: KPIs, summary charts, overview
- [x] Surveys page: list surveys, create new survey (Google Sheets URL input)
- [x] Survey Detail page: data table with search, filter, sort
- [x] Survey Detail: statistical analysis per field (frequency, mean, mode, median)
- [x] Survey Detail: Recharts visualizations (bar, pie, line)
- [x] AI Insights page: LLM-generated interpretation contextualized to "Antologia"

## Testing & Delivery
- [x] Write vitest tests for key backend procedures
- [x] Verify build and dev server status
- [x] Final checkpoint and delivery


## Novas Funcionalidades (Fase 2)

### Exportação de Relatórios
- [ ] Criar tRPC procedure para gerar Markdown com análise IA + estatísticas
- [ ] Criar tRPC procedure para exportar PDF (usando weasyprint ou similar)
- [ ] Adicionar botões "Exportar Markdown" e "Exportar PDF" na página AiInsights
- [ ] Implementar download de arquivo no frontend

### Comparação de Múltiplos Formulários
- [ ] Criar página ComparisonDashboard com seleção multi-select
- [ ] Implementar visualização lado a lado de gráficos (bar, pie, line)
- [ ] Criar tRPC procedure para buscar estatísticas de múltiplos formulários
- [ ] Adicionar rota e menu item para página de comparação

### Chat Interativo
- [ ] Criar tRPC procedure para chat com streaming (question -> LLM resposta contextualizada)
- [ ] Implementar componente ChatBox na página AiInsights
- [ ] Adicionar histórico de conversa e contexto dos dados
- [ ] Testar streaming e UX do chat
