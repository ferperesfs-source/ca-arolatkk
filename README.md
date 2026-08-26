# Colinox Store + Admin

Projeto estático pronto para hospedagem na Vercel.

## Rotas

- `/` — login administrativo
- `/admin.html` ou `/admin` — painel administrativo
- `/produto.html` ou `/loja` — página do produto
- `/checkout.html` ou `/checkout` — checkout

## Dados e autenticação

O projeto usa o Supabase `cacarola-prod` para autenticação administrativa, catálogo, pedidos e métricas de navegação. O painel não inclui registros simulados: quando ainda não existem pedidos, os indicadores começam em zero.

- As sessões são emitidas pelo Supabase Auth.
- O acesso ao painel exige vínculo na tabela `admin_users`.
- Produtos ativos são públicos; pedidos e dados de clientes só podem ser lidos por administradores.
- O checkout registra pedidos pendentes usando preços validados no banco.
- O esquema reproduzível está em `supabase/schema.sql`.

Credenciais, chaves secretas e tokens de gerenciamento não devem ser adicionados ao Git. A chave presente no cliente é apenas a chave publicável do projeto.

## Deploy na Vercel

Importe este repositório na Vercel como um projeto sem framework. Não é necessário comando de build nem diretório de saída: os arquivos são servidos diretamente da raiz.
