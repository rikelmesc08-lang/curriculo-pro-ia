import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseResumeContent } from '@/lib/resume/schema';
import { emptyResumeContent } from '@/types/resume';

/**
 * Isolamento entre contas — IDOR / BOLA.
 *
 * O contrato do repositório diz que TODO método recebe `ownerId` e filtra por
 * ele. Um teste é o que impede essa regra de virar boa intenção: basta um
 * método novo esquecer o filtro para o currículo de uma pessoa — com nome,
 * telefone, e-mail e histórico profissional — aparecer para outra, sem erro
 * nenhum em lugar nenhum.
 *
 * O ataque simulado é o mais simples e o mais comum: a pessoa descobre o id de
 * um registro alheio e o usa nas próprias chamadas.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cpro-idor-'));
process.env.LOCAL_DATA_DIR = dataDir;
process.env.DB_DRIVER = 'local';

import { localRepository } from './repository';

const ANA = 'conta-da-ana';
const BRUNO = 'conta-do-bruno';

let curriculoDaAna = '';
let candidaturaDaAna = '';

before(async () => {
  const conteudo = {
    ...emptyResumeContent(),
    personal: {
      ...emptyResumeContent().personal,
      fullName: 'Ana Souza',
      email: 'ana@exemplo.test',
      phone: '(19) 90000-0000',
    },
  };

  curriculoDaAna = (await localRepository.createResume(ANA, conteudo)).id;
  candidaturaDaAna = (
    await localRepository.createApplication(ANA, {
      company: 'Empresa Confidencial',
      role: 'Analista',
      appliedAt: '2026-08-01',
      status: 'aplicado',
      link: '',
      notes: 'anotação privada',
    })
  ).id;

  await localRepository.createResume(BRUNO, emptyResumeContent());
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
  delete process.env.DB_DRIVER;
});

describe('currículo de outra pessoa', () => {
  it('não é lido com o id certo e o dono errado', async () => {
    const roubado = await localRepository.getResume(BRUNO, curriculoDaAna);
    assert.equal(roubado, null, 'Bruno leu o currículo da Ana informando o id dela');
  });

  it('não aparece na listagem de quem não é dono', async () => {
    const listaDoBruno = await localRepository.listResumes(BRUNO);
    assert.ok(
      listaDoBruno.every((r) => r.ownerId === BRUNO),
      'a listagem devolveu currículo de outra conta'
    );
    assert.ok(!listaDoBruno.some((r) => r.id === curriculoDaAna));
  });

  it('não é alterado por quem não é dono', async () => {
    const tentativa = await localRepository.updateResume(BRUNO, curriculoDaAna, {
      ...emptyResumeContent(),
      title: 'INVADIDO',
    });
    assert.equal(tentativa, null, 'Bruno sobrescreveu o currículo da Ana');

    const original = await localRepository.getResume(ANA, curriculoDaAna);
    assert.notEqual(original?.title, 'INVADIDO');
    assert.equal(original?.personal.fullName, 'Ana Souza');
  });

  it('não é apagado por quem não é dono', async () => {
    await localRepository.deleteResume(BRUNO, curriculoDaAna);

    // A operação não lança — mas também não pode ter efeito.
    const aindaExiste = await localRepository.getResume(ANA, curriculoDaAna);
    assert.ok(aindaExiste, 'Bruno apagou o currículo da Ana');
  });
});

describe('candidatura de outra pessoa', () => {
  it('não aparece na listagem alheia', async () => {
    const lista = await localRepository.listApplications(BRUNO);
    assert.ok(!lista.some((a) => a.id === candidaturaDaAna));
    assert.ok(
      !JSON.stringify(lista).includes('Empresa Confidencial'),
      'o nome da empresa vazou para outra conta'
    );
  });

  it('não é alterada por quem não é dona', async () => {
    const tentativa = await localRepository.updateApplication(BRUNO, candidaturaDaAna, {
      company: 'INVADIDO',
    });
    assert.equal(tentativa, null);

    const original = (await localRepository.listApplications(ANA)).find(
      (a) => a.id === candidaturaDaAna
    );
    assert.equal(original?.company, 'Empresa Confidencial');
  });

  it('não é apagada por quem não é dona', async () => {
    await localRepository.deleteApplication(BRUNO, candidaturaDaAna);
    const aindaExiste = (await localRepository.listApplications(ANA)).some(
      (a) => a.id === candidaturaDaAna
    );
    assert.ok(aindaExiste, 'Bruno apagou a candidatura da Ana');
  });
});

describe('campos controlados pelo servidor (mass assignment)', () => {
  it('descarta campos que o cliente inventou', () => {
    const adulterado = parseResumeContent({
      ...emptyResumeContent(),
      ownerId: 'conta-de-outra-pessoa',
      id: 'id-escolhido-pelo-cliente',
      plan: 'pro',
      isAdmin: true,
      creditos: 999999,
    });

    // `z.object` remove chave desconhecida em vez de repassá-la. É o que
    // impede o corpo da requisição de carregar campo administrativo até uma
    // camada que confie no objeto inteiro.
    for (const proibido of ['ownerId', 'id', 'plan', 'isAdmin', 'creditos']) {
      assert.ok(
        !(proibido in adulterado),
        `o campo "${proibido}" sobreviveu à validação`
      );
    }
  });

  it('o dono vem do servidor, nunca do corpo da requisição', async () => {
    const criado = await localRepository.createResume(BRUNO, {
      ...emptyResumeContent(),
      // Um cliente adulterado mandaria isto para gravar na conta alheia.
      ...({ ownerId: ANA, id: 'id-forjado' } as object),
    });

    assert.equal(criado.ownerId, BRUNO, 'o ownerId do corpo sobrescreveu o da sessão');
    assert.notEqual(criado.id, 'id-forjado', 'o cliente escolheu o id do registro');

    // E o registro não pode ter ido parar na conta da Ana.
    assert.equal(await localRepository.getResume(ANA, criado.id), null);
  });
});

describe('dados da conta', () => {
  it('o hash de senha nunca sai do repositório', async () => {
    // `toAppUser` existe para isto. Se um método novo devolver a linha crua do
    // banco, o hash viaja até a tela — e daí para qualquer log de erro.
    const usuario = await localRepository.findUserById(ANA);
    assert.ok(!usuario || !('passwordHash' in usuario));
  });

  it('apagar uma conta não toca nos dados da outra', async () => {
    const antesDoBruno = (await localRepository.listResumes(BRUNO)).length;
    await localRepository.deleteUserData('conta-inexistente');

    assert.equal((await localRepository.listResumes(BRUNO)).length, antesDoBruno);
    assert.ok(await localRepository.getResume(ANA, curriculoDaAna));
  });
});
