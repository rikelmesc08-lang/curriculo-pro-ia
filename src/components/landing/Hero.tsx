import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ScoreRing } from '@/components/ui/Score';
import { MATCH_DISCLAIMER } from '@/types/ai';
import { FlowSteps } from './FlowSteps';

const FLOW = [
  { title: 'Currículo original', detail: 'Você escreve ou cola o que já tem. Nada é alterado sem você ver.' },
  { title: 'Análise da vaga', detail: 'Cole a descrição da vaga. Extraímos cargo, competências e palavras-chave.' },
  { title: 'Otimização com IA', detail: 'A IA reescreve seus textos com foco na vaga — usando só os seus fatos.', highlight: true },
  { title: 'Currículo personalizado', detail: 'Você revisa, escolhe o modelo e baixa em PDF.' },
];

export function Hero({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="border-b border-line bg-surface">
      <div className="container-page py-14 md:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Badge tone="info">Seu currículo mais preparado para cada oportunidade</Badge>

            <h1 className="mt-4 text-3xl font-bold leading-tight text-ink sm:text-4xl lg:text-[2.75rem]">
              Seu currículo pode estar te impedindo de conseguir entrevistas.
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
              Use inteligência artificial para transformar suas experiências em um currículo
              profissional, claro e adaptado à vaga que você deseja.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={isAuthenticated ? '/app/curriculo' : '/cadastro'} size="lg" className="uppercase tracking-wide">
                Criar meu currículo
              </ButtonLink>
              <ButtonLink
                href={isAuthenticated ? '/app/analisar-vaga' : '/cadastro?destino=analisar'}
                size="lg"
                variant="secondary"
                className="uppercase tracking-wide"
              >
                Analisar meu currículo
              </ButtonLink>
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {['Modelos legíveis por ATS', 'Download em PDF', 'A IA não inventa experiência'].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Icon name="check" className="h-4 w-4 text-success" strokeWidth={2.2} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/*
            Painel ilustrativo. Os números são rotulados como exemplo em dois
            lugares — no selo e na legenda — porque um indicador solto numa
            landing é lido como resultado real de alguém.
          */}
          <div className="rounded-card border border-line bg-canvas p-5 shadow-lift">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Compatibilidade com a vaga</p>
              <Badge tone="neutral">Exemplo ilustrativo</Badge>
            </div>

            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <ScoreRing value={78} size={124} />
              <div className="min-w-0 flex-1 space-y-2.5">
                {[
                  { label: 'Palavras-chave da vaga presentes', value: 'Atendimento, CRM, negociação' },
                  { label: 'Lacuna apontada', value: 'Excel avançado não aparece no currículo' },
                  { label: 'Sugestão honesta', value: 'Inclua apenas se você realmente usa' },
                ].map((row) => (
                  <div key={row.label} className="rounded-lg border border-line bg-surface px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{row.label}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted">{MATCH_DISCLAIMER}</p>
          </div>
        </div>

        <div className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Como o sistema trabalha
          </h2>
          <FlowSteps steps={FLOW} className="mt-4" />
        </div>
      </div>
    </section>
  );
}
