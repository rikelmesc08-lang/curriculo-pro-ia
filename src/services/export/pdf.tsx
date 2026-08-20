import 'server-only';

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { buildHeader, buildSections } from '@/lib/resume/sections';
import { templateById } from '@/components/resume/templates/definitions';
import type { ResumeContent } from '@/types/resume';

/**
 * Gerador do PDF.
 *
 * TEXTO DE VERDADE, NÃO IMAGEM. O arquivo sai com texto selecionável e
 * copiável, que é a condição para um ATS conseguir extrair qualquer coisa dele.
 * Um PDF gerado por captura de tela ficaria bonito e seria ilegível para a
 * máquina que faz a primeira triagem — o oposto do que este produto promete.
 *
 * FONTES: usamos as 14 fontes padrão do PDF (Helvetica e Times), que já vêm
 * embutidas no formato. Isso evita baixar arquivo de fonte no servidor a cada
 * geração — e evita o modo de falha em que o build funciona na máquina do
 * desenvolvedor e falha no servidor sem acesso à rede. As duas cobrem os
 * acentos do português.
 *
 * O conteúdo vem de `buildSections`, o mesmo que a pré-visualização usa. Não
 * existe "layout do PDF" separado do que a pessoa conferiu na tela.
 */

function createStyles(accent: string, compact: boolean, serif: boolean, nameSize: number) {
  const body = serif ? 'Times-Roman' : 'Helvetica';
  const bold = serif ? 'Times-Bold' : 'Helvetica-Bold';

  return StyleSheet.create({
    page: {
      paddingTop: compact ? 34 : 42,
      paddingBottom: compact ? 34 : 42,
      paddingHorizontal: compact ? 38 : 46,
      fontFamily: body,
      fontSize: compact ? 9.5 : 10,
      color: '#1f2937',
      lineHeight: 1.45,
    },
    name: { fontFamily: bold, fontSize: nameSize, color: '#111827' },
    role: { fontFamily: bold, fontSize: 10.5, color: accent, marginTop: 3 },
    contact: { fontSize: 8.5, color: '#4b5563', marginTop: 3 },
    section: { marginTop: compact ? 12 : 16 },
    sectionTitleUpper: {
      fontFamily: bold,
      fontSize: 9,
      letterSpacing: 1.1,
      color: accent,
      textTransform: 'uppercase',
    },
    sectionTitlePlain: { fontFamily: bold, fontSize: 11.5, color: accent },
    ruleFull: { height: 0.7, backgroundColor: '#e5e7eb', marginTop: 2.5 },
    ruleShort: { height: 0.9, width: 34, backgroundColor: accent, marginTop: 2.5 },
    paragraph: { marginTop: 5 },
    entry: { marginTop: compact ? 7 : 9 },
    entryTop: { flexDirection: 'row', justifyContent: 'space-between' },
    entryTitle: { fontFamily: bold, color: '#111827', flexShrink: 1, paddingRight: 8 },
    entryMeta: { fontSize: 8.5, color: '#6b7280' },
    entrySubtitle: { fontSize: 9.5, color: '#4b5563', marginTop: 1 },
    entryDescription: { marginTop: 2.5 },
    bulletRow: { flexDirection: 'row', marginTop: 2 },
    bulletMark: { width: 9 },
    bulletText: { flex: 1 },
  });
}

function ResumeDocument({ resume }: { resume: ResumeContent }) {
  const template = templateById(resume.template);
  const header = buildHeader(resume);
  const sections = buildSections(resume);
  const compact = template.density === 'compacto';
  const styles = createStyles(template.accent, compact, template.family === 'serif', template.nameSize);
  const centered = template.headerAlign === 'center';

  return (
    <Document
      title={`Currículo — ${header.name || 'sem nome'}`}
      author={header.name || undefined}
      creator="CurrículoPro IA"
      producer="CurrículoPro IA"
    >
      <Page size="A4" style={styles.page}>
        <View style={centered ? { alignItems: 'center' } : undefined}>
          <Text style={styles.name}>{header.name || 'Seu nome completo'}</Text>
          {header.role ? <Text style={styles.role}>{header.role}</Text> : null}
          {header.contactLines.map((line) => (
            <Text key={line} style={styles.contact}>
              {line}
            </Text>
          ))}
        </View>

        {sections.map((section) => (
          <View key={section.id} style={styles.section} wrap={false}>
            <Text style={template.uppercaseHeadings ? styles.sectionTitleUpper : styles.sectionTitlePlain}>
              {section.title}
            </Text>
            {template.sectionRule === 'full' && <View style={styles.ruleFull} />}
            {template.sectionRule === 'short' && <View style={styles.ruleShort} />}

            {section.kind === 'paragraph' && <Text style={styles.paragraph}>{section.paragraph}</Text>}

            {section.kind === 'inline' && (
              <Text style={styles.paragraph}>{section.items.join('  •  ')}</Text>
            )}

            {section.kind === 'entries' &&
              section.entries.map((entry, index) => (
                <View key={`${entry.title}-${index}`} style={styles.entry}>
                  <View style={styles.entryTop}>
                    <Text style={styles.entryTitle}>{entry.title || '—'}</Text>
                    {entry.meta ? <Text style={styles.entryMeta}>{entry.meta}</Text> : null}
                  </View>
                  {entry.subtitle ? <Text style={styles.entrySubtitle}>{entry.subtitle}</Text> : null}
                  {entry.description ? (
                    <Text style={styles.entryDescription}>{entry.description}</Text>
                  ) : null}
                  {entry.bullets.map((bullet, bulletIndex) => (
                    <View key={`${bullet}-${bulletIndex}`} style={styles.bulletRow}>
                      {/* Marcador como texto, não como `list-style`: o extrator
                          de PDF lê o caractere e mantém a estrutura de lista. */}
                      <Text style={styles.bulletMark}>•</Text>
                      <Text style={styles.bulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderResumePdf(resume: ResumeContent): Promise<Uint8Array> {
  return renderToBuffer(<ResumeDocument resume={resume} />);
}
