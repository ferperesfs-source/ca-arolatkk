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
- O checkout registra pedidos e calcula os preços no servidor antes de criar o pagamento.
- O esquema reproduzível está em `supabase/schema.sql`.

## PrimeCash

O painel possui a rota `#gateways`, onde o administrador ativa ou desativa a PrimeCash e cadastra a Secret Key. A chave é validada pela função segura, armazenada criptografada no Supabase Vault e nunca é devolvida ao navegador. A integração usa o checkout hospedado oficial com Pix e cartão. O postback consulta novamente a PrimeCash antes de atualizar o status do pedido no Supabase.

O processamento fica na Edge Function `primecash`, que usa as credenciais administrativas fornecidas automaticamente pelo próprio Supabase. Não é necessário cadastrar chaves da PrimeCash ou do Supabase na Vercel.

Credenciais, chaves secretas e tokens de gerenciamento não devem ser adicionados ao Git. A chave presente no cliente é apenas a chave publicável do projeto.

## Deploy na Vercel

Importe este repositório na Vercel como um projeto sem framework. Não é necessário comando de build nem diretório de saída: os arquivos estáticos são servidos diretamente da raiz.
