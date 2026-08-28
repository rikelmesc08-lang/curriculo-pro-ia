# Migrations do banco

Esta pasta guarda os **deltas** aplicados ao esquema depois da instalação inicial.

`docs/schema.sql`, um nível acima, continua sendo a **fonte da verdade do
esquema completo**. Quem for instalar o banco do zero (projeto Supabase
novo) roda só `docs/schema.sql` inteiro e pronto — não precisa passar por
esta pasta.

Quem já tem o banco de pé e precisa alcançar um estado mais novo do esquema
roda os arquivos desta pasta, **na ordem do nome** (a data no início do nome
é a ordem de aplicação):

1. `2026-08-24-grants-service-role.sql`
2. `2026-08-28-reserva-atomica-ia.sql`

Cada migration é auto-contida e comentada em português, com o motivo da
mudança, se é destrutiva ou não, e uma consulta de verificação no final.
Nunca edite uma migration já aplicada em produção — se algo precisar de
correção, crie uma migration nova.

Depois de aplicar uma migration nesta pasta, atualize `docs/schema.sql` para
refletir o estado final, para que uma instalação nova a partir dele já saia
correta sem precisar repetir os deltas.
