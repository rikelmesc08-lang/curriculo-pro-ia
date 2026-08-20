import { buildHeader, buildSections, type ResumeEntry } from '@/lib/resume/sections';
import { templateById } from './templates/definitions';
import type { ResumeContent } from '@/types/resume';

/**
 * Pré-visualização em HTML.
 *
 * Renderiza o MESMO modelo de seções que o gerador de PDF (`buildSections`),
 * para que o que a pessoa confere na tela seja o que sai no arquivo. As
 * medidas são proporcionais a uma folha A4: `aspect-ratio` fixo e padding em
 * porcentagem, de modo que a prévia encolha inteira no celular em vez de
 * cortar o conteúdo.
 */
export function ResumeSheet({ resume, scale = 1 }: { resume: ResumeContent; scale?: number }) {
  const template = templateById(resume.template);
  const header = buildHeader(resume);
  const sections = buildSections(resume);
  const compact = template.density === 'compacto';

  const fontFamily =
    template.family === 'serif'
      ? 'var(--font-serif)'
      : 'var(--font-sans)';

  return (
    <div
      data-print="sheet"
      className="mx-auto w-full max-w-[820px] overflow-hidden rounded-lg border border-line bg-white shadow-card"
      style={{ fontFamily, fontSize: `${(compact ? 12.5 : 13.5) * scale}px`, color: '#1f2937' }}
    >
      <div style={{ padding: compact ? '32px 36px' : '40px 44px' }}>
        <header style={{ textAlign: template.headerAlign }}>
          <h1
            style={{
              fontSize: `${template.nameSize * scale}px`,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#111827',
              lineHeight: 1.2,
            }}
          >
            {header.name || 'Seu nome completo'}
          </h1>

          {header.role && (
            <p style={{ marginTop: 4, fontSize: `${13 * scale}px`, color: template.accent, fontWeight: 600 }}>
              {header.role}
            </p>
          )}

          {header.contactLines.map((line) => (
            <p key={line} style={{ marginTop: 4, fontSize: `${11.5 * scale}px`, color: '#4b5563' }}>
              {line}
            </p>
          ))}

          {header.contactLines.length === 0 && (
            <p style={{ marginTop: 4, fontSize: `${11.5 * scale}px`, color: '#9ca3af' }}>
              Telefone • E-mail • Cidade/UF
            </p>
          )}
        </header>

        <div style={{ marginTop: compact ? 18 : 24 }}>
          {sections.length === 0 && (
            <p style={{ fontSize: `${12 * scale}px`, color: '#9ca3af', textAlign: 'center', padding: '48px 0' }}>
              Preencha o formulário ao lado para ver seu currículo tomando forma aqui.
            </p>
          )}

          {sections.map((section) => (
            <section key={section.id} style={{ marginBottom: compact ? 14 : 20 }}>
              <SectionHeading
                title={section.title}
                accent={template.accent}
                uppercase={template.uppercaseHeadings}
                rule={template.sectionRule}
                scale={scale}
              />

              {section.kind === 'paragraph' && (
                <p style={{ marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{section.paragraph}</p>
              )}

              {section.kind === 'inline' && (
                <p style={{ marginTop: 6, lineHeight: 1.55 }}>{section.items.join('  •  ')}</p>
              )}

              {section.kind === 'entries' && (
                <div style={{ marginTop: 6 }}>
                  {section.entries.map((entry, index) => (
                    <EntryBlock
                      key={`${entry.title}-${index}`}
                      entry={entry}
                      compact={compact}
                      scale={scale}
                      last={index === section.entries.length - 1}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  accent,
  uppercase,
  rule,
  scale,
}: {
  title: string;
  accent: string;
  uppercase: boolean;
  rule: 'full' | 'short' | 'none';
  scale: number;
}) {
  return (
    <div>
      <h2
        style={{
          fontSize: `${(uppercase ? 11.5 : 14) * scale}px`,
          fontWeight: 700,
          letterSpacing: uppercase ? '0.08em' : '-0.01em',
          textTransform: uppercase ? 'uppercase' : 'none',
          color: accent,
        }}
      >
        {title}
      </h2>
      {rule !== 'none' && (
        <div
          style={{
            marginTop: 3,
            height: 1,
            width: rule === 'full' ? '100%' : 42,
            backgroundColor: rule === 'full' ? '#e5e7eb' : accent,
          }}
        />
      )}
    </div>
  );
}

function EntryBlock({
  entry,
  compact,
  scale,
  last,
}: {
  entry: ResumeEntry;
  compact: boolean;
  scale: number;
  last: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 0 : compact ? 10 : 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <p style={{ fontWeight: 700, color: '#111827' }}>{entry.title || '—'}</p>
        {entry.meta && (
          <p style={{ fontSize: `${11 * scale}px`, color: '#6b7280', whiteSpace: 'nowrap' }}>{entry.meta}</p>
        )}
      </div>

      {entry.subtitle && (
        <p style={{ fontSize: `${12 * scale}px`, color: '#4b5563', marginTop: 1 }}>{entry.subtitle}</p>
      )}

      {entry.description && (
        <p style={{ marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{entry.description}</p>
      )}

      {entry.bullets.length > 0 && (
        <ul style={{ marginTop: 4, paddingLeft: 16, listStyleType: 'disc' }}>
          {entry.bullets.map((bullet, index) => (
            <li key={`${bullet}-${index}`} style={{ lineHeight: 1.5, marginBottom: 2 }}>
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
