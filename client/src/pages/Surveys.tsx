import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Plus, ArrowRight, Trash2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Surveys() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");

  const utils = trpc.useUtils();
  const { data: surveys, isLoading } = trpc.survey.list.useQuery();
  const createMutation = trpc.survey.create.useMutation({
    onSuccess: () => {
      utils.survey.list.invalidate();
      setOpen(false);
      setTitle("");
      setDescription("");
      setSheetUrl("");
      toast.success("Formulário criado com sucesso!");
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const deleteMutation = trpc.survey.delete.useMutation({
    onSuccess: () => {
      utils.survey.list.invalidate();
      toast.success("Formulário excluído");
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const handleCreate = () => {
    if (!title.trim() || !sheetUrl.trim()) {
      toast.error("Preencha título e URL da planilha");
      return;
    }
    createMutation.mutate({ title: title.trim(), description: description.trim() || undefined, sheetUrl: sheetUrl.trim() });
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este formulário? Todos os dados importados serão perdidos.")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Formulários</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cadastre e gerencie formulários do Google Forms para análise
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo formulário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Criar novo formulário</DialogTitle>
              <DialogDescription>
                Informe os dados do formulário vinculado ao Google Sheets. Você precisará da URL pública da planilha.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Pesquisa de satisfação — Oficina Antologia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrição do formulário e seus objetivos..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sheetUrl">URL pública do Google Sheets *</Label>
                <Input
                  id="sheetUrl"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <p className="text-xs text-muted-foreground">
                  Cole o link de compartilhamento da planilha vinculada ao Google Forms. Certifique-se de que a planilha esteja pública.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar formulário"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Survey list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : surveys && surveys.length > 0 ? (
        <div className="grid gap-4">
          {surveys.map(survey => (
            <Card key={survey.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/surveys/${survey.id}`} className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate hover:text-primary transition-colors">
                          {survey.title}
                        </h3>
                        {survey.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {survey.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{survey.responseCount} respostas</span>
                          {survey.lastSyncedAt && (
                            <span>Sincronizado em {new Date(survey.lastSyncedAt).toLocaleDateString("pt-BR")}</span>
                          )}
                          <span>Criado em {new Date(survey.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/surveys/${survey.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1">
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(survey.id)}
                      disabled={deleteMutation.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-16 pb-16">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Nenhum formulário cadastrado</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
                Crie seu primeiro formulário para começar a importar respostas do Google Sheets e gerar análises.
              </p>
              <Button className="gap-2 mt-6" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Criar formulário
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
