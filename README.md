# Colinox Store + Admin

Projeto estático pronto para hospedagem na Vercel.

## Rotas

- `/` — login administrativo
- `/admin.html` ou `/admin` — painel administrativo
- `/produto.html` ou `/loja` — página do produto
- `/checkout.html` ou `/checkout` — checkout

## Acesso demonstrativo

- E-mail: `admin@colinox.com.br`
- Senha: `admin123`

> O login atual usa `sessionStorage` e serve apenas como demonstração local. Para produção com dados reais, conecte o painel a um backend com autenticação no servidor.

## Deploy na Vercel

Importe este repositório na Vercel como um projeto sem framework. Não é necessário comando de build nem diretório de saída: os arquivos são servidos diretamente da raiz.
