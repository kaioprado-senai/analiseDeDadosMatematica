import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Users, BarChart3, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)",
  "oklch(0.60 0.20 30)", "oklch(0.65 0.20 100)",
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: surveys, isLoading } = trpc.survey.list.useQuery();

  const totalSurveys = surveys?.length ?? 0;
  const totalResponses = surveys?.reduce((sum, s) => sum + s.responseCount, 0) ?? 0;
  const surveysWithInterpretations = surveys?.filter(s => s.lastSyncedAt).length ?? 0;

  // Build chart data: responses per survey
  const responsesPerSurvey = (surveys ?? []).map(s => ({
    name: s.title.length > 20 ? s.title.substring(0, 20) + "..." : s.title,
    respostas: s.responseCount,
  }));

  // Build pie data: surveys by status
  const synced = surveysWithInterpretations;
  const notSynced = totalSurveys - synced;
  const statusData = [
    { name: "Sincronizados", value: synced },
    { name: "Não sincronizados", value: notSynced },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Olá, {user?.name?.split(" ")[0] || "pesquisador"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral da plataforma de análise de dados — Oficina Antologia
          </p>
        </div>
        <Link href="/surveys">
          <Button variant="default" className="gap-2">
            Gerenciar formulários
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<FileText className="h-5 w-5" />}
          label="Formulários"
          value={totalSurveys}
          isLoading={isLoading}
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Total de Respostas"
          value={totalResponses}
          isLoading={isLoading}
        />
        <KpiCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Sincronizados"
          value={surveysWithInterpretations}
          isLoading={isLoading}
        />
        <KpiCard
          icon={<Sparkles className="h-5 w-5" />}
          label="Taxa de Cobertura"
          value={totalSurveys > 0 ? `${Math.round((surveysWithInterpretations / totalSurveys) * 100)}%` : "0%"}
          isLoading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar chart: responses per survey */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Respostas por Formulário</CardTitle>
            <CardDescription>Distribuição do volume de respostas coletadas</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : responsesPerSurvey.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={responsesPerSurvey} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--foreground)",
                    }}
                  />
                  <Bar dataKey="respostas" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        {/* Pie chart: sync status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status de Sincronização</CardTitle>
            <CardDescription>Formulários com dados importados</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent surveys list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Formulários Recentes</CardTitle>
          <CardDescription>Visão rápida dos formulários cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : surveys && surveys.length > 0 ? (
            <div className="space-y-2">
              {surveys.slice(0, 5).map(survey => (
                <Link key={survey.id} href={`/surveys/${survey.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{survey.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {survey.responseCount} respostas
                        {survey.lastSyncedAt && ` • Última sincronização: ${new Date(survey.lastSyncedAt).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">Nenhum formulário cadastrado ainda.</p>
              <Link href="/surveys">
                <Button variant="outline">Criar primeiro formulário</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, isLoading }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-20 mt-2" />
            ) : (
              <p className="text-2xl font-bold mt-1">{value}</p>
            )}
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-[300px] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Sem dados para exibir</p>
    </div>
  );
}
