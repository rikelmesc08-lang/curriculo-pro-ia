'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importResumeFromFileAction, importResumeFromTextAction } from '@/server/actions/ai';
import { saveResumeAction } from '@/server/actions/resume';
import { useAiAction } from '@/hooks/useAiAction';
import { track } from '@/lib/analytics/track';
import { reduzirImagem } from '@/lib/files/downscale';
import { MAX_UPLOAD_BYTES, mensagemDeTamanho } from '@/lib/files/limits';
import type { ResumeImport } from '@/services/ai/resume-import-schema';
import type { ResumeContent } from '@/types/resume';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

/**
 * Importar o currículo que a pessoa já tem.
 *
 * O PROBLEMA QUE ESTA TELA RESOLVE: até aqui, quem chegava com um currículo
 * pronto era mandado preencher um formulário de quatro etapas do zero. Para
 * descobrir o que estava errado no próprio currículo, tinha que redigitá-lo
 * inteiro primeiro.
 *
 * TRÊS PORTAS, E CADA UMA COBRE UM PÚBLICO:
 *
 *   - PDF, para quem tem o arquivo no computador;
 *   - FOTO, para quem tem o currículo IMPRESSO e só o celular à mão — que é
 *     boa parte de quem procura emprego, e era o público sem saída nenhuma;
 *   - TEXTO COLADO, para quem tem o currículo no LinkedIn, no Word ou no corpo
 *     de um e-mail.
 *
 * A foto passa por `reduzirImagem` antes de subir. Sem isso, um arquivo de 6 MB
 * por dados móveis consome o orçamento de 60 segundos da tela antes de a IA
 * sequer começar a ler.
 */


/** Mínimo de texto colado que ainda pode ser um currículo. Igual ao do servidor. */
const MIN_TEXTO = 100;

type Modo = 'arquivo' | 'texto';

/**
 * Escolhe qual ação chamar.
 *
 * Fica FORA do componente para a referência ser estável: `useAiAction` guarda a
 * função nas dependências do `run`, e uma função recriada a cada render faria o
 * callback mudar de identidade sem parar.
 */
async function importar(modo: Modo, dado: FormData | string) {
  return modo === 'arquivo'
    ? importResumeFromFileAction(dado as FormData)
    : importResumeFromTextAction(dado as string);
}

/** Quantos itens de cada tipo foram lidos — o resumo que a pessoa confere antes de aceitar. */
function contagem(content: ResumeContent): { label: string; total: number }[] {
  return [
    { label: 'experiências', total: content.experiences.length },
    { label: 'formações', total: content.education.length },
    { label: 'competências', total: content.skills.length },
    { label: 'idiomas', total: content.languages.length },
    { label: 'cursos e certificações', total: content.certifications.length },
  ].filter((item) => item.total > 0);
}

export function ResumeImportTool({
  existingResumeId,
  destino,
}: {
  existingResumeId: string | null;
  /**
   * Para onde ir depois de salvar. Vem JÁ VALIDADO da página (`rotaDeRetorno`),
   * nunca direto da URL — ver a defesa contra redirecionamento aberto em
   * `AppNav.ts`.
   */
  destino: string;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('arquivo');
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [salvando, iniciarSalvamento] = useTransition();
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const leitura = useAiAction<ResumeImport, [Modo, FormData | string]>(importar);
  const importado = leitura.data?.data;

  /**
   * Confere o arquivo ANTES de subir.
   *
   * O servidor confere de novo, e é ele quem manda — esta checagem existe para
   * a pessoa não esperar o upload de 4 MB para ouvir que o arquivo é grande
   * demais.
   */
  const escolherArquivo = useCallback(async (file: File | null) => {
    setRecusa(null);
    if (!file) {
      setArquivo(null);
      return;
    }

    /**
     * Reduz a foto ANTES de medir.
     *
     * A ordem importa: medir primeiro recusaria uma foto de 6 MB que, depois de
     * reduzida, teria 700 KB e funcionaria perfeitamente. PDF passa intacto.
     */
    const pronto = await reduzirImagem(file);
    const foto = pronto.type.startsWith('image/') || file.type.startsWith('image/');

    // A recusa usa a MESMA frase do servidor, do mesmo módulo: quem bate nos
    // dois não pode receber duas explicações diferentes para o mesmo problema.
    if (pronto.size > MAX_UPLOAD_BYTES) {
      setRecusa(mensagemDeTamanho(pronto.size, foto));
      setArquivo(null);
      return;
    }

    setArquivo(pronto);
  }, []);

  const enviar = useCallback(() => {
    setRecusa(null);
    setErroAoSalvar(null);

    if (modo === 'arquivo') {
      if (!arquivo) {
        setRecusa('Escolha o arquivo do seu currículo — PDF ou foto.');
        return;
      }
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      track('resume_import', { modo: 'arquivo' });
      leitura.run('arquivo', formData);
      return;
    }

    if (texto.trim().length < MIN_TEXTO) {
      setRecusa('Cole o texto do seu currículo inteiro — o que veio é curto demais para ser um currículo.');
      return;
    }
    track('resume_import', { modo: 'texto' });
    leitura.run('texto', texto);
  }, [arquivo, leitura, modo, texto]);

  /**
   * Só AQUI a importação vira o currículo da pessoa.
   *
   * A leitura sozinha não grava nada. Quem decide é ela, no clique, depois de
   * ver o que foi lido — porque transcrição automática erra, e um currículo
   * errado gravado em silêncio é levado para uma entrevista sem ninguém notar.
   */
  const aceitar = useCallback(() => {
    if (!importado) return;
    setErroAoSalvar(null);

    iniciarSalvamento(async () => {
      const resultado = await saveResumeAction(existingResumeId, importado.content);
      if (resultado.ok) {
        /**
         * VOLTA PARA ONDE A PESSOA QUERIA IR, e não para o editor.
         *
         * Este destino era `/app/curriculo` fixo. Quem clicava em "Analisar
         * currículo" sem ter currículo salvo era mandado para cá, importava — e
         * aterrissava no editor, sem análise nenhuma na tela e sem nada
         * indicando que a análise ainda existia. A intenção com que a pessoa
         * começou se perdia no meio do caminho, e o sintoma relatado foi
         * "estou para analisar o currículo e só aparece para criar".
         *
         * `destino` já vem validado do servidor contra a lista de ferramentas
         * (`rotaDeRetorno`, em AppNav.ts) — não é o `?voltar=` cru da URL.
         */
        router.push(destino);
      } else {
        setErroAoSalvar(resultado.error);
      }
    });
  }, [destino, existingResumeId, importado, router]);

  return (
    <div className="space-y-5">
      {existingResumeId && (
        <Alert tone="warning" title="Você já tem um currículo salvo">
          Importar vai <strong>substituir</strong> o conteúdo dele. Se quiser manter o que já existe,
          volte e edite o currículo atual em vez de importar.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Importar meu currículo"
          description="Envie o PDF que você já tem — ou uma foto do currículo impresso — e a IA preenche o formulário para você. Nada é salvo antes de você conferir."
        />
        <CardBody className="space-y-4">
          <div className="flex gap-2" role="tablist" aria-label="Como enviar o currículo">
            <Button
              type="button"
              role="tab"
              aria-selected={modo === 'arquivo'}
              variant={modo === 'arquivo' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setModo('arquivo');
                setRecusa(null);
              }}
            >
              Enviar PDF ou foto
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={modo === 'texto'}
              variant={modo === 'texto' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setModo('texto');
                setRecusa(null);
              }}
            >
              Colar o texto
            </Button>
          </div>

          {modo === 'arquivo' ? (
            <div className="space-y-2">
              <label
                htmlFor="arquivo-curriculo"
                className="block rounded-lg border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-muted"
              >
                <span className="block font-medium text-ink">
                  {arquivo ? arquivo.name : 'Escolher o arquivo ou a foto do meu currículo'}
                </span>
                <span className="mt-1 block">
                  {arquivo
                    ? `${(arquivo.size / 1024).toFixed(0)} KB — clique para trocar`
                    : 'PDF, ou foto do currículo impresso (JPG, PNG, HEIC)'}
                </span>
              </label>
              <input
                ref={campoArquivo}
                id="arquivo-curriculo"
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(event) => {
                  void escolherArquivo(event.target.files?.[0] ?? null);
                }}
              />
              <p className="text-xs text-muted">
                Se for fotografar o currículo impresso: apoie numa mesa, com luz por cima e a folha
                inteira dentro do quadro. Foto torta ou com sombra faz a leitura errar.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <label htmlFor="texto-curriculo" className="block text-sm font-medium text-ink">
                Texto do seu currículo
              </label>
              <textarea
                id="texto-curriculo"
                rows={12}
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                placeholder="Cole aqui o texto do seu currículo, do começo ao fim."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted">
                Serve o texto copiado do Word, do LinkedIn ou de um PDF. Pode vir sem formatação.
              </p>
            </div>
          )}

          {recusa && <Alert tone="danger">{recusa}</Alert>}
          {leitura.error && <Alert tone="danger">{leitura.error}</Alert>}

          <Button
            type="button"
            onClick={enviar}
            loading={leitura.pending}
            loadingLabel="Lendo seu currículo..."
            className="uppercase tracking-wide"
          >
            Ler meu currículo
          </Button>
        </CardBody>
      </Card>

      {importado && (
        <Card>
          <CardHeader
            title="Confira o que foi lido"
            description="A leitura automática erra: junta colunas, troca datas, funde cargos. Nada foi salvo ainda."
          />
          <CardBody className="space-y-4">
            {importado.warnings.length > 0 && (
              <Alert tone="warning" title="A IA não conseguiu ler tudo com segurança">
                <ul className="list-disc space-y-1 pl-5">
                  {importado.warnings.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Nome</dt>
                <dd className="text-sm text-ink">
                  {importado.content.personal.fullName || (
                    <span className="text-muted">não foi possível ler</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Cargo pretendido</dt>
                <dd className="text-sm text-ink">
                  {importado.content.goal.targetRole || (
                    <span className="text-muted">não foi possível ler</span>
                  )}
                </dd>
              </div>
            </dl>

            {contagem(importado.content).length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {contagem(importado.content).map((item) => (
                  <li
                    key={item.label}
                    className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink-soft"
                  >
                    {item.total} {item.label}
                  </li>
                ))}
              </ul>
            ) : (
              <Alert tone="warning" title="Não foi possível ler nada deste arquivo">
                Costuma ser foto tremida, com sombra forte ou com parte da folha fora do quadro.
                Tente de novo com mais luz — ou cole o texto do currículo na outra aba.
              </Alert>
            )}

            {erroAoSalvar && <Alert tone="danger">{erroAoSalvar}</Alert>}

            <Button
              type="button"
              onClick={aceitar}
              loading={salvando}
              loadingLabel="Levando para o formulário..."
              className="uppercase tracking-wide"
            >
              Conferir e corrigir no formulário
            </Button>
            <p className="text-xs text-muted">
              Você vai poder editar tudo antes de usar. O que a IA leu errado, você corrige lá.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
