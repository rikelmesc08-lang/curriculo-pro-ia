import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de uso',
  description: 'Regras de uso do CurrículoPro IA, limites das análises e responsabilidades.',
};

export default function TermsPage() {
  return (
    <>
      <h1>Termos de uso</h1>
      <p>
        <strong>Última atualização:</strong> agosto de 2026. Ao criar uma conta você concorda com o
        que está escrito aqui.
      </p>

      <h2>O que o serviço faz</h2>
      <p>
        O CurrículoPro IA ajuda você a montar, revisar e adaptar seu currículo, além de gerar carta
        de apresentação, preparação para entrevista e mensagens para recrutadores. Todo o conteúdo
        é produzido a partir das informações que <strong>você</strong> fornece.
      </p>

      <h2>O que o serviço não faz</h2>
      <ul>
        <li>Não garante entrevista, contratação nem retorno de nenhuma empresa.</li>
        <li>Não envia seu currículo para vagas nem se candidata por você.</li>
        <li>Não cria experiências, empresas, cursos, certificações, idiomas ou resultados.</li>
        <li>Não reproduz o funcionamento de nenhum sistema de triagem específico.</li>
      </ul>

      <h2>Sobre os indicadores</h2>
      <p>
        O <strong>indicador de compatibilidade</strong> e a <strong>pontuação ATS</strong> são
        estimativas calculadas a partir do texto que você forneceu e da vaga que você colou. Servem
        para orientar melhorias — não representam avaliação de nenhum recrutador, empresa ou
        software de triagem, e não devem ser lidos como probabilidade de contratação.
      </p>

      <h2>Sua responsabilidade</h2>
      <p>
        As informações do currículo são suas e é você quem responde por elas. O sistema é construído
        para <strong>não</strong> inventar fatos, mas a conferência final é sempre sua: leia o texto
        antes de enviá-lo para qualquer vaga.
      </p>
      <p>
        Você concorda em não usar o serviço para criar currículo de terceiro sem autorização, nem
        para produzir informação falsa sobre qualificação profissional.
      </p>

      <h2>Conteúdo gerado por IA</h2>
      <p>
        Modelos de linguagem podem errar. Quando a IA reescreve um texto, ela pode escolher palavras
        que mudam a nuance do que você quis dizer. Por isso toda sugestão aparece como proposta, com
        botão de aplicar ou descartar — nada entra no seu currículo sem a sua confirmação.
      </p>

      <h2>Conta e acesso</h2>
      <p>
        Você é responsável por manter sua senha em segurança. Pode excluir sua conta a qualquer
        momento em <Link href="/app/configuracoes">Configurações</Link>, o que remove seus dados
        conforme descrito na <Link href="/privacidade">política de privacidade</Link>.
      </p>

      <h2>Pagamento</h2>
      <p>
        O acesso é gratuito no momento. Se um plano pago for ativado no futuro, as condições serão
        informadas com antecedência e nenhum recurso que você já usa será cobrado retroativamente.
      </p>

      <h2>Mudanças nestes termos</h2>
      <p>
        Se estes termos mudarem de forma relevante, a alteração será comunicada na própria
        aplicação antes de passar a valer.
      </p>
    </>
  );
}
