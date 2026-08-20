import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { aiModeIsDemo } from '@/services/ai';
import { formatDate } from '@/lib/utils';
import { Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { DeleteAccountForm, PasswordForm, ProfileForm } from '@/components/settings/SettingsForms';

export const metadata: Metadata = { title: 'Configurações' };

export default async function SettingsPage() {
  const user = await requireUser('/app/configuracoes');
  const demo = aiModeIsDemo();

  return (
    <>
      <SectionTitle title="Configurações" description="Sua conta, seus dados e como este ambiente está configurado." />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Sua conta" description={`Criada em ${formatDate(user.createdAt)}`} />
          <CardBody className="space-y-5">
            <div className="rounded-lg border border-line bg-canvas px-4 py-3">
              <p className="text-xs font-medium text-muted">E-mail</p>
              <p className="mt-0.5 text-sm text-ink">{user.email}</p>
            </div>
            <ProfileForm name={user.name} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Senha" />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Como este ambiente está configurado"
            description="Informação técnica, útil para quem instalou o projeto."
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-4 py-3">
              <span className="text-sm text-ink-soft">Provedor de IA</span>
              <Badge tone={demo ? 'warning' : 'success'}>
                {demo ? 'Modo demonstração (sem chave de API)' : 'IA real conectada'}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-4 py-3">
              <span className="text-sm text-ink-soft">Armazenamento</span>
              <Badge tone={user.driver === 'local' ? 'warning' : 'success'}>
                {user.driver === 'local' ? 'Arquivo local (desenvolvimento)' : 'Supabase'}
              </Badge>
            </div>

            {demo && (
              <Alert tone="warning" title="A IA real não está ligada">
                Os resultados vêm de regras fixas aplicadas ao que você digitou, e aparecem sempre
                marcados como demonstração. Configure <code className="font-mono">ANTHROPIC_API_KEY</code>{' '}
                no arquivo <code className="font-mono">.env.local</code> para usar o modelo de verdade.
              </Alert>
            )}

            {user.driver === 'local' && (
              <Alert tone="warning" title="Armazenamento de desenvolvimento">
                Seus dados estão num arquivo JSON nesta máquina. Para colocar o produto no ar,
                configure o Supabase — o driver local é bloqueado em produção justamente para
                ninguém perder dados sem perceber.
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Privacidade"
            description="O que guardamos e o que você pode fazer a respeito."
          />
          <CardBody className="space-y-3 text-sm leading-relaxed text-ink-soft">
            <p>
              Seu currículo é visível apenas para você. Nenhuma consulta do sistema busca currículo
              sem filtrar pelo dono, e nada do seu conteúdo entra em log.
            </p>
            <p>
              Detalhes completos na{' '}
              <Link href="/privacidade" className="font-medium text-brand-700 underline">
                política de privacidade
              </Link>
              .
            </p>
          </CardBody>
        </Card>

        <Card className="border-danger/20">
          <CardHeader title="Excluir conta" description="Remove todos os seus dados deste sistema." />
          <CardBody>
            <DeleteAccountForm driver={user.driver} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
