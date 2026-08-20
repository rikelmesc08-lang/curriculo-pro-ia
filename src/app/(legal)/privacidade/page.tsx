import type { Metadata } from 'next';
import Link from 'next/link';
import { env } from '@/lib/env';
import { aiModeIsDemo, aiProviderLabel } from '@/services/ai';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description: 'Que dados o CurrículoPro IA guarda, para que servem e como excluí-los.',
};

/**
 * Política de privacidade.
 *
 * O texto é gerado a partir da CONFIGURAÇÃO REAL do ambiente: se a IA está em
 * modo demonstração, a página não afirma que o currículo é enviado a um
 * provedor externo, porque não é. Política de privacidade que descreve um
 * sistema imaginário é pior do que não ter política.
 */
export default function PrivacyPage() {
  const usaIaExterna = !aiModeIsDemo();
  const provedorIa = aiProviderLabel();
  const armazenamento = env.dbDriver();

  return (
    <>
      <h1>Política de privacidade</h1>
      <p>
        <strong>Última atualização:</strong> agosto de 2026. Este texto descreve o funcionamento
        real do sistema, não um modelo genérico.
      </p>

      <h2>Que dados guardamos</h2>
      <ul>
        <li>
          <strong>Dados de conta:</strong> nome, e-mail e senha (guardada apenas como hash, nunca
          em texto legível).
        </li>
        <li>
          <strong>Conteúdo do currículo:</strong> tudo que você digita no formulário — dados de
          contato, experiências, formação, cursos, competências, idiomas, projetos e atividades.
        </li>
        <li>
          <strong>Candidaturas:</strong> empresa, cargo, data, status, link e as anotações que você
          escrever.
        </li>
      </ul>
      <p>
        Não pedimos endereço residencial completo, CPF, RG, data de nascimento, estado civil nem
        foto. Nada disso é necessário para montar um currículo, e cada um deles seria mais um dado
        sensível circulando à toa.
      </p>

      <h2>Quem consegue ver</h2>
      <p>
        Apenas você. Toda consulta ao banco filtra pelo dono do registro, e não existe tela, link ou
        rota que mostre o currículo de uma pessoa para outra.
      </p>
      <p>
        O conteúdo do seu currículo não vai para registros de log. Mensagens de erro do sistema
        guardam o que falhou, não o que você escreveu.
      </p>

      <h2>Onde os dados ficam</h2>
      {armazenamento === 'supabase' ? (
        <p>
          Os dados ficam num banco Postgres hospedado no Supabase, com políticas de acesso por linha
          (RLS) que impedem uma conta de ler dados de outra no próprio banco.
        </p>
      ) : (
        <p>
          Este ambiente está em modo de desenvolvimento: os dados ficam num arquivo local na máquina
          que roda o sistema. Não é uma configuração destinada a uso real — o sistema recusa esse
          modo em produção.
        </p>
      )}

      <h2>Inteligência artificial</h2>
      {usaIaExterna ? (
        <>
          <p>
            Quando você clica em um botão de IA (melhorar resumo, analisar vaga, otimizar currículo,
            gerar carta, preparar entrevista ou escrever mensagem), o conteúdo do seu currículo e o
            texto da vaga que você colou são enviados para a <strong>{provedorIa}</strong>, que
            processa o pedido e devolve o resultado.
          </p>
          <p>
            Esse envio só acontece no momento em que você clica. Nada é enviado em segundo plano,
            e nenhuma parte do seu currículo sai daqui enquanto você apenas digita.
          </p>
          <p>
            <strong>O resultado fica guardado por um tempo.</strong> Para não pedir a mesma coisa
            duas vezes ao provedor, guardamos a resposta de cada análise junto com um código
            (um hash) que identifica a pergunta. O texto que você enviou não é guardado nesse
            registro — só o resultado e o código. Ao apagar sua conta, esses registros são apagados
            junto com todo o resto.
          </p>
        </>
      ) : (
        <p>
          Este ambiente está em <strong>modo demonstração</strong>: nenhum provedor de IA está
          configurado, e portanto <strong>nada do seu currículo é enviado para fora deste sistema</strong>.
          Os resultados são produzidos por regras fixas aplicadas ao texto que você mesmo digitou, e
          aparecem sempre marcados como demonstração.
        </p>
      )}

      <h2>Rastreamento e cookies</h2>
      <p>
        Usamos <strong>um único cookie</strong>, o de sessão, que serve para manter você conectado.
        Ele é <code>httpOnly</code> — não pode ser lido por JavaScript — e expira em 30 dias.
      </p>
      <p>
        Não há Google Analytics, pixel de rede social nem qualquer rastreador de terceiro neste
        sistema. Os eventos de uso previstos no código não são enviados para lugar nenhum enquanto
        um serviço não for configurado; se isso mudar, esta página muda junto.
      </p>

      <h2>Excluir seus dados</h2>
      <p>
        Em <Link href="/app/configuracoes">Configurações</Link> há a opção de excluir a conta. Ela
        apaga o currículo, as candidaturas e o perfil. A ação não tem volta — baixe o PDF do seu
        currículo antes, se quiser guardá-lo.
      </p>

      <h2>Contato</h2>
      <p>
        Para qualquer dúvida sobre seus dados, use o canal de contato informado pelo responsável
        por esta instalação do sistema.
      </p>
    </>
  );
}
