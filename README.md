# francisneyliberato-gestao-patrimonial-publica

Site premium, responsivo e pronto para Cloudflare Pages para aplicação do **Questionário Aprimorado de Autoavaliação da Gestão Patrimonial da Administração Pública**, de Francisney Liberato.

O projeto contém as 60 perguntas oficiais, distribuídas em 12 eixos, cálculo ponderado, exclusão de respostas N/A, gatilhos críticos, travas de maturidade, relatório PDF, plano de ação, captura de leads no Cloudflare D1 e exportação administrativa em CSV e Excel.

## Estrutura

- `index.html`: estrutura visual e conteúdo institucional.
- `styles.css`: identidade visual, animações e responsividade.
- `questionnaire-data.js`: 60 perguntas, pesos, evidências, faixas, gatilhos e recomendações.
- `app.js`: validação, cálculo, resultados, PDF, compartilhamento e salvamento.
- `functions/api/leads.js`: recebe e salva o diagnóstico no D1.
- `functions/api/leads-export.js`: exporta leads em CSV.
- `functions/api/leads-export-excel.js`: exporta leads em Excel.
- `functions/api/dashboard.js`: fornece indicadores agregados para o dashboard em tempo real.
- `schema.sql`: cria a tabela `leads`.
- `wrangler.toml`: configura o projeto e o binding D1 `DB`.
- `_headers`: cabeçalhos de segurança e cache.
- `_redirects`: fallback de rotas.
- `favicon.svg`: ícone com a letra F.

## 1. Testar rapidamente no computador

É possível visualizar a interface sem instalar nada:

1. Entre na pasta do projeto.
2. Abra um terminal.
3. Execute um servidor estático, por exemplo:

   ```bash
   npx serve .
   ```

4. Abra o endereço exibido no terminal.

Nesse modo, o site funciona, calcula resultados, gera PDF e salva uma cópia no `localStorage`. A API D1 não estará ativa.

O código de acesso inicial é:

```text
francisneyliberato
```

## 2. Testar com Pages Functions e D1 local

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Abra o endereço local informado pelo Wrangler. O banco local fica no diretório interno `.wrangler`.

## 3. Onde alterar o conteúdo

### Perguntas, pesos, faixas e gatilhos

Edite `questionnaire-data.js`.

- `axes`: nomes dos eixos, perguntas, evidências e pesos.
- `maturityLevels`: faixas, nomes, diagnóstico e recomendação.
- `riskTriggers`: questões críticas, limites, riscos e recomendações.

Cada pergunta usa:

```js
q(numero, "Texto da pergunta", "Evidência esperada", peso)
```

### Código de acesso

Em `questionnaire-data.js`, altere:

```js
accessCode: "francisneyliberato"
```

O código não diferencia maiúsculas de minúsculas.

> Observação: esse bloqueio é uma barreira simples no navegador, adequada ao fluxo solicitado, não um sistema de autenticação criptográfica.

### WhatsApp

Pesquise por `5565999031061` em:

- `index.html`;
- `app.js`, no rodapé do PDF;
- `README.md`;
- `RESUMO-PARA-LEIGOS.txt`.

### Links das redes sociais

Em `index.html`, procure por:

```html
<!-- EDITAR AQUI: inserir link oficial do ... -->
```

Substitua o `href="#"` pelo endereço oficial. Os links desconhecidos foram intencionalmente deixados sem URL para não inventar perfis.

### Textos institucionais

Edite as seções `livros`, `curriculo`, `redes` e o rodapé em `index.html`.

### Cores e visual

No início de `styles.css`, altere as variáveis de `:root`, como `--navy`, `--gold`, `--orange` e `--teal`.

## 4. Criar conta e projeto no Cloudflare

1. Crie uma conta em [dash.cloudflare.com](https://dash.cloudflare.com/).
2. No painel, abra **Workers & Pages**.
3. Crie um projeto Pages com o nome exato:

   ```text
   francisneyliberato-gestao-patrimonial-publica
   ```

4. Use esse mesmo nome para o repositório Git sugerido.

Você pode publicar por Git ou pelo Wrangler. Para usar Functions e dependências npm, a integração com Git ou o Wrangler é a opção recomendada.

## 5. Criar e configurar o banco D1

Autentique o Wrangler:

```bash
npx wrangler login
```

Crie o banco:

```bash
npm run db:create
```

O comando retorna um `database_id`. Abra `wrangler.toml` e substitua:

Substitua o identificador provisório `00000000-0000-0000-0000-000000000000`
pelo `database_id` retornado pelo Cloudflare.

Execute o schema no banco remoto:

```bash
npm run db:migrate
```

O binding obrigatório já está configurado com o nome:

```toml
binding = "DB"
```

Se o projeto for configurado pelo painel, confirme em **Settings > Bindings** que o D1 está vinculado à variável `DB`.

## 6. Configurar o token administrativo

Crie um token longo e impossível de adivinhar. Não o coloque no front-end, no Git ou em `wrangler.toml`.

Via terminal:

```bash
npx wrangler pages secret put TOKEN_ADMIN --project-name francisneyliberato-gestao-patrimonial-publica
```

Cole o token quando solicitado.

Também é possível cadastrar no painel do Pages em **Settings > Variables and Secrets**, com o nome `TOKEN_ADMIN` e o tipo **Secret**.

## 7. Publicar no Cloudflare Pages

Com o banco e o token configurados:

```bash
npm install
npm run deploy
```

O endereço padrão será semelhante a:

```text
https://francisneyliberato-gestao-patrimonial-publica.pages.dev
```

### Publicar por Git

1. Envie a pasta para um repositório GitHub ou GitLab com o nome sugerido.
2. Conecte o repositório ao Cloudflare Pages.
3. Comando de build: deixe vazio.
4. Diretório de saída: `.`.
5. Adicione o binding D1 `DB`.
6. Adicione o segredo `TOKEN_ADMIN`.
7. Faça o primeiro deploy.

## 8. Baixar os leads

Substitua `SEU_TOKEN` pelo segredo administrativo.

CSV:

```text
https://francisneyliberato-gestao-patrimonial-publica.pages.dev/api/leads-export?token=SEU_TOKEN
```

Excel:

```text
https://francisneyliberato-gestao-patrimonial-publica.pages.dev/api/leads-export-excel?token=SEU_TOKEN
```

Não compartilhe esses endereços contendo o token. Em caso de exposição, troque o segredo imediatamente.

## 9. Configurar domínio personalizado

1. Abra o projeto no Cloudflare Pages.
2. Vá a **Custom domains**.
3. Clique em **Set up a custom domain**.
4. Informe o domínio ou subdomínio.
5. Siga a validação de DNS apresentada.

## 10. Atualizar o site

### Projeto conectado ao Git

Edite os arquivos, faça commit e envie para o repositório. O Cloudflare publica automaticamente.

### Publicação pelo terminal

Depois das alterações:

```bash
npm run deploy
```

## 11. Regras implementadas

- Nota 0, 1 ou 2 exige observação/justificativa.
- Na primeira etapa, somente nome completo, WhatsApp, e-mail, consentimento LGPD e código de acesso são obrigatórios.
- Todos os dados institucionais da segunda etapa são facultativos.
- Nota 4 ou 5 exige evidência indicada.
- N/A exige justificativa e é excluído da pontuação obtida e máxima.
- O usuário não avança sem preencher a etapa.
- Resultado ponderado por peso.
- Percentual bruto e percentual ajustado por gatilhos.
- Plano de ação para notas até 2.
- Plano de aperfeiçoamento para nota 3.
- Manutenção e monitoramento para notas 4 e 5.
- Fallback automático para `localStorage` quando a API não está disponível.
- Dashboard agregado com atualização automática a cada 30 segundos, sem exibir dados pessoais.

## 12. Problemas comuns

### “Binding D1 DB não configurado”

Confirme que o banco foi criado, que o `database_id` foi substituído e que o binding se chama exatamente `DB`.

### A tabela `leads` não existe

Execute:

```bash
npm run db:migrate
```

### Exportação retorna 401

O token da URL não corresponde ao segredo `TOKEN_ADMIN`.

### Excel não é gerado

Execute `npm install` e confirme que a dependência `xlsx` foi instalada no build.

### PDF não abre

Verifique a conexão com a internet: jsPDF é carregado por CDN. Confira também se a política de segurança não foi alterada.

### O site abre sem estilo

Publique todos os arquivos na mesma raiz e não apenas o `index.html`.

### Redes sociais não abrem

Os links desconhecidos estão como `#`. Edite os comentários `EDITAR AQUI` em `index.html`.

## Segurança e privacidade

O projeto aplica validação no navegador e no servidor, sanitização básica, token de exportação, cabeçalhos de segurança e proteção contra fórmulas maliciosas nos arquivos exportados.

Antes do uso em produção, publique uma política de privacidade, defina prazo de retenção, controle quem acessa o banco e revise o tratamento de dados com o encarregado de proteção de dados da instituição.

---

**Projeto:** francisneyliberato-gestao-patrimonial-publica  
**Site institucional:** [www.francisney.com.br](https://www.francisney.com.br/)  
**WhatsApp:** [Falar com Francisney Liberato](https://wa.me/5565999031061)
