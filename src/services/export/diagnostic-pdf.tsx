import 'server-only';

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { buildHeader, buildSections } from '@/lib/resume/sections';
import {
  SEVERITY_COLORS,
  dominantSeverity,
  entryKey,
  resolveIssueMarks,
  type IssueMark,
} from '@/lib/resume/marks';
import type { ReviewIssue } from '@/types/ai';
import type { ResumeContent } from '@/types/resume';

/**
 * O currículo ATUAL, com os problemas marcados em cima dele.
 *
 * POR QUE ESTE DOCUMENTO EXISTE: ler "o resumo profissional está genérico" numa
 * lista e olhar para o próprio currículo são duas coisas diferentes. A lista
 * exige que a pessoa encontre sozinha o trecho citado — e quem não encontra não
 * corrige. Marcado, o defeito fica onde ele está.
 *
 * ESTE ARQUIVO NÃO É O CURRÍCULO DELA, E PRECISA SER IMPOSSÍVEL CONFUNDIR.
 * Alguém vai baixar os dois PDFs no mesmo dia e anexar um deles numa
 * candidatura. Se anexar o errado, entrega ao recrutador um documento cheio de
 * marcas vermelhas dizendo o que há de ruim no próprio currículo. Daí a tarja no
 * topo de TODA página, em vermelho, repetida com `fixed` — e não um aviso só na
 * primeira, que some ao imprimir a partir da segunda folha.
 *
 * O visual aqui é deliberadamente diferente do currículo real: cinza e
 * vermelho, sem a cor do modelo escolhido. Parecer o currículo dela seria
 * exatamente o que não queremos.
 */

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#1f2937',
    lineHeight: 1.4,
  },

  tarja: {
    backgroundColor: '#b91c1c',
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 14,
    letterSpacing: 0.6,
  },

  nome: { fontFamily: 'Helvetica-Bold', fontSize: 17, color: '#111827' },
  cargo: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#374151', marginTop: 2 },
  contato: { fontSize: 8.5, color: '#6b7280', marginTop: 2 },

  notas: {
    flexDirection: 'row',
    marginTop: 10,
    borderTopWidth: 0.8,
    borderTopColor: '#e5e7eb',
    borderBottomWidth: 0.8,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 7,
  },
  notaBloco: { flex: 1 },
  notaRotulo: { fontSize: 7.5, color: '#6b7280', letterSpacing: 0.5 },
  notaValor: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: '#111827' },

  secao: { marginTop: 13 },
  secaoTitulo: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 1,
    color: '#374151',
  },
  regua: { height: 0.7, backgroundColor: '#e5e7eb', marginTop: 2.5 },
  paragrafo: { marginTop: 5 },

  entrada: { marginTop: 7 },
  entradaTopo: { flexDirection: 'row', justifyContent: 'space-between' },
  entradaTitulo: { fontFamily: 'Helvetica-Bold', color: '#111827', flexShrink: 1, paddingRight: 8 },
  entradaMeta: { fontSize: 8.5, color: '#6b7280' },
  entradaSubtitulo: { fontSize: 9, color: '#4b5563', marginTop: 1 },
  itemLinha: { flexDirection: 'row', marginTop: 2 },
  itemMarca: { width: 9 },
  itemTexto: { flex: 1 },

  /** Envelope do trecho marcado: barra colorida à esquerda e fundo tingido. */
  marcado: {
    borderLeftWidth: 2.5,
    paddingLeft: 7,
    paddingRight: 5,
    paddingVertical: 4,
    marginTop: 5,
  },
  etiquetas: { flexDirection: 'row', marginBottom: 3 },
  etiqueta: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#ffffff',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    marginRight: 3,
  },

  /* --- página do diagnóstico --- */
  diagTitulo: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#111827' },
  diagIntro: { fontSize: 9, color: '#4b5563', marginTop: 4 },
  legenda: { flexDirection: 'row', marginTop: 10, marginBottom: 4 },
  legendaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  legendaCor: { width: 8, height: 8, marginRight: 4 },
  legendaTexto: { fontSize: 8, color: '#4b5563' },

  problema: {
    borderLeftWidth: 2.5,
    paddingLeft: 8,
    paddingVertical: 5,
    marginTop: 8,
  },
  problemaTopo: { flexDirection: 'row', marginBottom: 2 },
  problemaNumero: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#ffffff',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    marginRight: 5,
  },
  problemaOnde: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: '#111827', flex: 1 },
  problemaRotulo: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#6b7280' },
  problemaTexto: { fontSize: 9, marginTop: 1 },

  subtitulo: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: '#374151',
    marginTop: 16,
    marginBottom: 2,
  },
  aviso: { fontSize: 8, color: '#6b7280', marginTop: 3 },
  rodape: {
    position: 'absolute',
    bottom: 18,
    left: 40,
    right: 40,
    fontSize: 7.5,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

const TARJA = 'CÓPIA DE DIAGNÓSTICO — USO PESSOAL. NÃO ENVIE ESTE ARQUIVO PARA VAGAS.';

/** Etiquetas numeradas de um trecho marcado. */
function Etiquetas({ marks }: { marks: IssueMark[] }) {
  return (
    <View style={s.etiquetas}>
      {marks.map((mark) => (
        <Text
          key={mark.number}
          style={[s.etiqueta, { backgroundColor: SEVERITY_COLORS[mark.issue.severity].mark }]}
        >
          {mark.number}
        </Text>
      ))}
    </View>
  );
}

/**
 * Embrulha um trecho quando ele tem problema, e devolve o trecho cru quando
 * não tem. Sem isto, todo trecho ganharia caixa e a marcação perderia o sentido
 * — o que destaca tudo não destaca nada.
 */
function Marcado({ marks, children }: { marks: IssueMark[] | undefined; children: React.ReactNode }) {
  if (!marks || marks.length === 0) return <>{children}</>;

  const cor = SEVERITY_COLORS[dominantSeverity(marks)];
  return (
    <View style={[s.marcado, { borderLeftColor: cor.mark, backgroundColor: cor.tint }]}>
      <Etiquetas marks={marks} />
      {children}
    </View>
  );
}

export interface DiagnosticInput {
  resume: ResumeContent;
  issues: ReviewIssue[];
  score: number;
  potentialScore: number;
}

function DiagnosticDocument({ resume, issues, score, potentialScore }: DiagnosticInput) {
  const header = buildHeader(resume);
  const sections = buildSections(resume);
  const plan = resolveIssueMarks(sections, issues);

  return (
    <Document
      title={`Diagnóstico do currículo — ${header.name || 'sem nome'}`}
      author="CurrículoPro IA"
      creator="CurrículoPro IA"
      producer="CurrículoPro IA"
    >
      <Page size="A4" style={s.page}>
        {/* `fixed`: repete em toda página. O aviso não pode existir só na
            primeira folha — quem imprime a partir da segunda não o veria. */}
        <Text style={s.tarja} fixed>
          {TARJA}
        </Text>

        <Text style={s.nome}>{header.name || 'Seu nome completo'}</Text>
        {header.role ? <Text style={s.cargo}>{header.role}</Text> : null}
        {header.contactLines.map((line) => (
          <Text key={line} style={s.contato}>
            {line}
          </Text>
        ))}

        <View style={s.notas}>
          <View style={s.notaBloco}>
            <Text style={s.notaRotulo}>NOTA DE HOJE</Text>
            <Text style={s.notaValor}>{score}/100</Text>
          </View>
          <View style={s.notaBloco}>
            <Text style={s.notaRotulo}>DEPOIS DAS CORREÇÕES</Text>
            <Text style={s.notaValor}>{potentialScore}/100</Text>
          </View>
          <View style={s.notaBloco}>
            {/*
              "APONTADOS", e não "marcados": nem todo problema recebe marca no
              corpo — os de endereço inválido caem no grupo do fim. Dizer
              "6 marcados" mandaria a pessoa procurar duas marcas que não existem.
            */}
            <Text style={s.notaRotulo}>PONTOS APONTADOS</Text>
            <Text style={s.notaValor}>{plan.all.length}</Text>
          </View>
        </View>

        {sections.map((section) => {
          const marcasDaSecao = plan.bySection.get(section.id);

          return (
            <View key={section.id} style={s.secao}>
              <Text style={s.secaoTitulo}>{section.title.toUpperCase()}</Text>
              <View style={s.regua} />

              <Marcado marks={marcasDaSecao}>
                {section.kind === 'paragraph' && <Text style={s.paragrafo}>{section.paragraph}</Text>}

                {section.kind === 'inline' && (
                  <Text style={s.paragrafo}>{section.items.join('  •  ')}</Text>
                )}

                {section.kind === 'entries' &&
                  section.entries.map((entry, index) => (
                    <Marcado key={`${entry.title}-${index}`} marks={plan.byEntry.get(entryKey(section.id, index))}>
                      <View style={s.entrada} wrap={false}>
                        <View style={s.entradaTopo}>
                          <Text style={s.entradaTitulo}>{entry.title || '—'}</Text>
                          {entry.meta ? <Text style={s.entradaMeta}>{entry.meta}</Text> : null}
                        </View>
                        {entry.subtitle ? <Text style={s.entradaSubtitulo}>{entry.subtitle}</Text> : null}
                        {entry.description ? <Text style={{ marginTop: 2.5 }}>{entry.description}</Text> : null}
                        {entry.bullets.map((bullet, bulletIndex) => (
                          <View key={`${bullet}-${bulletIndex}`} style={s.itemLinha}>
                            <Text style={s.itemMarca}>•</Text>
                            <Text style={s.itemTexto}>{bullet}</Text>
                          </View>
                        ))}
                      </View>
                    </Marcado>
                  ))}
              </Marcado>
            </View>
          );
        })}

        <Text style={s.rodape} fixed render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.tarja} fixed>
          {TARJA}
        </Text>

        <Text style={s.diagTitulo}>O que precisa melhorar</Text>
        <Text style={s.diagIntro}>
          Cada número abaixo corresponde a uma marca no seu currículo, nas páginas anteriores.
        </Text>

        <View style={s.legenda}>
          {(['alta', 'media', 'baixa'] as const).map((severity) => (
            <View key={severity} style={s.legendaItem}>
              <View style={[s.legendaCor, { backgroundColor: SEVERITY_COLORS[severity].mark }]} />
              <Text style={s.legendaTexto}>{SEVERITY_COLORS[severity].label}</Text>
            </View>
          ))}
        </View>

        {plan.all.length === 0 && (
          <Text style={s.problemaTexto}>
            A análise não apontou problemas concretos neste currículo.
          </Text>
        )}

        {plan.all
          .filter((mark) => mark.sectionId)
          .map((mark) => (
            <Problema key={mark.number} mark={mark} />
          ))}

        {plan.unplaced.length > 0 && (
          <>
            <Text style={s.subtitulo}>Pontos sem marca no documento</Text>
            <Text style={s.aviso}>
              Não foi possível localizar com segurança o trecho exato destes pontos, então eles não
              receberam marca nas páginas anteriores. O que está escrito abaixo vale igual — só
              exige que você encontre o trecho.
            </Text>
            {plan.unplaced.map((mark) => (
              <Problema key={mark.number} mark={mark} />
            ))}
          </>
        )}

        <Text style={s.aviso}>
          Este diagnóstico é uma leitura automática e não é promessa de contratação. A decisão do que
          mudar no seu currículo é sua.
        </Text>

        <Text style={s.rodape} fixed render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}

function Problema({ mark }: { mark: IssueMark }) {
  const cor = SEVERITY_COLORS[mark.issue.severity];

  return (
    <View style={[s.problema, { borderLeftColor: cor.mark, backgroundColor: cor.tint }]} wrap={false}>
      <View style={s.problemaTopo}>
        <Text style={[s.problemaNumero, { backgroundColor: cor.mark }]}>{mark.number}</Text>
        <Text style={s.problemaOnde}>{mark.issue.where}</Text>
        <Text style={[s.problemaRotulo, { color: cor.mark }]}>{cor.label.toUpperCase()}</Text>
      </View>
      <Text style={s.problemaTexto}>{mark.issue.problem}</Text>
      <Text style={[s.problemaRotulo, { marginTop: 3 }]}>COMO CORRIGIR</Text>
      <Text style={s.problemaTexto}>{mark.issue.fix}</Text>
    </View>
  );
}

export async function renderDiagnosticPdf(input: DiagnosticInput): Promise<Uint8Array> {
  return renderToBuffer(<DiagnosticDocument {...input} />);
}
