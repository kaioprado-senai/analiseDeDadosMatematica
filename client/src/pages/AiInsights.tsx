import { trpc } from "@/lib/trpc";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Sparkles, RefreshCw, Clock } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

export default function AiInsights() {
  const params = useParams();
  const surveyId = parseInt(params.id as string);
  const utils = trpc.useUtils();

  const { data: survey, isLoading: surveyLoading } = trpc.survey.get.useQuery({ id: surveyId });
  const { data: interpretations, isLoading: interpLoading } = trpc.survey.interpretations.useQuery({ surveyId });

  const interpretMutation = trpc.survey.interpret.useMutation({
    onSuccess: () => {
      utils.survey.interpretations.invalidate({ surveyId });
      toast.success("Análise gerada com sucesso!");
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const handleGenerate = () => {
    interpretMutation.mutate({ surveyId });
  };

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
          <Link href={`/surveys/${surveyId}`}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Análise IA — {survey.title}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Interpretação automática dos dados contextualizada à oficina Antologia
            </p>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={interpretMutation.isPending || survey.responseCount === 0}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${interpretMutation.isPending ? "animate-spin" : ""}`} />
          {interpretMutation.isPending ? "Gerando análise..." : "Gerar nova análise"}
        </Button>
      </div>

      {/* Warning if no data */}
      {survey.responseCount === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Nenhuma resposta importada</p>
                <p className="text-sm text-muted-foreground">
                  Importe os dados do Google Sheets antes de gerar a análise. Volte para a página do formulário e clique em "Importar / Sincronizar".
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {interpretMutation.isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">A IA está analisando os dados...</p>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interpretations */}
      {interpLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : interpretations && interpretations.length > 0 ? (
        <div className="space-y-6">
          {interpretations.map((interp, idx) => (
            <Card key={interp.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Análise {interpretations.length > 1 ? `#${interpretations.length - idx}` : "Completa"}
                    </CardTitle>
                    <CardDescription>
                      Gerada em {new Date(interp.createdAt).toLocaleString("pt-BR")}
                      {interp.modelUsed && ` • Modelo: ${interp.modelUsed}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Streamdown>{interp.content}</Streamdown>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !interpretMutation.isPending ? (
        <Card>
          <CardContent className="pt-16 pb-16">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Nenhuma análise gerada ainda</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">
                Clique em "Gerar nova análise" para que a IA produza uma interpretação contextualizada dos dados coletados, relacionando os resultados aos objetivos da oficina Antologia.
              </p>
              {survey.responseCount > 0 && (
                <Button onClick={handleGenerate} disabled={interpretMutation.isPending} className="gap-2 mt-6">
                  <Sparkles className="h-4 w-4" />
                  Gerar primeira análise
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
