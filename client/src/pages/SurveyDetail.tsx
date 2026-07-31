import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Download, RefreshCw, Search, Sparkles, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { toast } from "sonner";

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)",
  "oklch(0.60 0.20 30)", "oklch(0.65 0.20 100)",
  "oklch(0.55 0.20 200)", "oklch(0.60 0.20 250)",
];

const PAGE_SIZE = 10;

export default function SurveyDetail() {
  const params = useParams();
  const surveyId = parseInt(params.id as string);
  const utils = trpc.useUtils();

  const { data: survey, isLoading: surveyLoading } = trpc.survey.get.useQuery({ id: surveyId });
  const [search, setSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState<string>("__all");
  const [filterValue, setFilterValue] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState("data");

  const { data: responseData, isLoading: responsesLoading } = trpc.survey.responses.useQuery({
    surveyId,
    search: search || undefined,
    columnFilter: filterColumn !== "__all" ? filterColumn : undefined,
    filterValue: filterValue || undefined,
  });

  const { data: stats, isLoading: statsLoading } = trpc.survey.statistics.useQuery({ surveyId });

  const importMutation = trpc.survey.import.useMutation({
    onSuccess: (data) => {
      utils.survey.get.invalidate({ id: surveyId });
      utils.survey.responses.invalidate({ surveyId });
      utils.survey.statistics.invalidate({ surveyId });
      utils.survey.list.invalidate();
      toast.success(`${data.imported} respostas importadas com sucesso!`);
    },
    onError: (err) => toast.error(`Erro na importação: ${err.message}`),
  });

  const handleImport = () => {
    importMutation.mutate({ surveyId });
  };

  // Sorting
  const sortedRows = useMemo(() => {
    if (!responseData || !sortColumn) return responseData?.rows ?? [];
    const rows = [...responseData.rows];
    rows.sort((a, b) => {
      const aVal = (a.data as Record<string, string>)[sortColumn] ?? "";
      const bVal = (b.data as Record<string, string>)[sortColumn] ?? "";
      const aNum = parseFloat(aVal.replace(",", "."));
      const bNum = parseFloat(bVal.replace(",", "."));
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === "asc" ? aNum - bNum : bNum - aNum;
      }
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return rows;
  }, [responseData, sortColumn, sortDir]);

  const totalPages = Math.ceil((sortedRows?.length ?? 0) / PAGE_SIZE);
  const paginatedRows = sortedRows?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  // Get unique values for filter dropdown
  const filterOptions = useMemo(() => {
    if (!responseData?.columns) return [];
    const col = filterColumn !== "__all" ? filterColumn : null;
    if (!col) return [];
    const values = new Set<string>();
    responseData.rows.forEach(r => {
      const val = (r.data as Record<string, string>)[col];
      if (val) values.add(val);
    });
    return Array.from(values).sort();
  }, [responseData, filterColumn]);

  if (surveyLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!survey) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Formulário não encontrado.</p>
        <Link href="/surveys"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/surveys">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{survey.title}</h1>
            {survey.description && (
              <p className="text-muted-foreground text-sm mt-1">{survey.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={importMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${importMutation.isPending ? "animate-spin" : ""}`} />
            {importMutation.isPending ? "Importando..." : "Importar / Sincronizar"}
          </Button>
          <Link href={`/surveys/${surveyId}/insights`}>
            <Button className="gap-2">
              <Sparkles className="h-4 w-4" />
              Análise IA
            </Button>
          </Link>
        </div>
      </div>

      {/* Info badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary">{survey.responseCount} respostas</Badge>
        <Badge variant="secondary">{(survey.columnNames as string[]).length} campos</Badge>
        {survey.lastSyncedAt && (
          <Badge variant="outline">
            Sincronizado: {new Date(survey.lastSyncedAt).toLocaleString("pt-BR")}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="data">Dados</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
          <TabsTrigger value="charts">Gráficos</TabsTrigger>
        </TabsList>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-4">
          {/* Search and filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar em todas as colunas..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-10"
              />
            </div>
            <Select value={filterColumn} onValueChange={(v) => { setFilterColumn(v); setFilterValue(""); setPage(0); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os campos</SelectItem>
                {(survey.columnNames as string[]).map((col: string) => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filterColumn !== "__all" && filterOptions.length > 0 && (
              <Select value={filterValue || "__all_values"} onValueChange={(v) => { setFilterValue(v === "__all_values" ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Valor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_values">Todos</SelectItem>
                  {filterOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Data table */}
          {responsesLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : paginatedRows.length > 0 ? (
            <>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                      {(responseData?.columns ?? []).map(col => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:bg-accent select-none"
                          onClick={() => handleSort(col)}
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[200px]">{col}</span>
                            {sortColumn === col && (
                              sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, i) => (
                      <tr key={row.id} className="border-t hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground">{page * PAGE_SIZE + i + 1}</td>
                        {(responseData?.columns ?? []).map(col => {
                          const val = (row.data as Record<string, string>)[col] ?? "";
                          return (
                            <td key={col} className="px-3 py-2 max-w-[300px]">
                              <span className="truncate block" title={val}>{val}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} de {sortedRows.length} respostas
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">{page + 1} / {totalPages || 1}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="pt-16 pb-16">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">
                    {survey.responseCount === 0
                      ? "Nenhuma resposta importada ainda. Clique em \"Importar / Sincronizar\" para carregar os dados."
                      : "Nenhuma resposta encontrada com os filtros aplicados."}
                  </p>
                  {survey.responseCount === 0 && (
                    <Button onClick={handleImport} disabled={importMutation.isPending} className="gap-2">
                      <Download className="h-4 w-4" />
                      Importar dados
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="stats" className="space-y-4">
          {statsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : stats ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.totalResponses}</p>
                      <p className="text-sm text-muted-foreground">Total de respostas analisadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {stats.columns.map((col, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-base">{col.column}</CardTitle>
                    <CardDescription>{col.total} respostas {col.isNumeric && "• Campo numérico"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Frequency table */}
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">Frequências</h4>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Valor</th>
                                <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Freq.</th>
                                <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {col.relativeFrequencies.map((f, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-3 py-1.5 max-w-[200px] truncate" title={f.value}>{f.value}</td>
                                  <td className="px-3 py-1.5 text-right">{f.count}</td>
                                  <td className="px-3 py-1.5 text-right">{f.percentage}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Numeric stats */}
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Medidas de Tendência Central</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <StatBox label="Moda" value={col.mode.join(", ")} />
                            {col.isNumeric && col.numericStats.mean !== null && (
                              <>
                                <StatBox label="Média" value={String(col.numericStats.mean)} />
                                <StatBox label="Mediana" value={String(col.numericStats.median)} />
                              </>
                            )}
                          </div>
                        </div>
                        {col.isNumeric && col.numericStats.min !== null && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Dispersão</h4>
                            <div className="grid grid-cols-2 gap-2">
                              <StatBox label="Mínimo" value={String(col.numericStats.min)} />
                              <StatBox label="Máximo" value={String(col.numericStats.max)} />
                              <StatBox label="Desvio Padrão" value={String(col.numericStats.stdDev)} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : null}
        </TabsContent>

        {/* Charts Tab */}
        <TabsContent value="charts" className="space-y-4">
          {statsLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-80 w-full" />)}
            </div>
          ) : stats ? (
            stats.columns.map((col, idx) => {
              const chartData = col.relativeFrequencies.map(f => ({
                name: f.value.length > 25 ? f.value.substring(0, 25) + "..." : f.value,
                value: f.count,
                percentage: f.percentage,
              }));

              const isNumeric = col.isNumeric;
              const useBarChart = chartData.length > 6 || isNumeric;
              const useLineChart = isNumeric && col.numericStats.mean !== null;

              return (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-base">{col.column}</CardTitle>
                    <CardDescription>
                      {useLineChart ? "Gráfico de linha" : useBarChart ? "Gráfico de barras" : "Gráfico de pizza"} • {col.total} respostas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      {useLineChart ? (
                        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                          <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              color: "var(--foreground)",
                            }}
                          />
                          <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ fill: "var(--chart-1)", r: 4 }} />
                        </LineChart>
                      ) : useBarChart ? (
                        <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={150} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              color: "var(--foreground)",
                            }}
                          />
                          <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      ) : (
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            dataKey="value"
                            label={(entry: any) => `${entry.percentage}%`}
                          >
                            {chartData.map((_, i) => (
                              <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              color: "var(--foreground)",
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              );
            })
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold mt-1 truncate" title={value}>{value}</p>
    </div>
  );
}
