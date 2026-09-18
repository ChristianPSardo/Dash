# Dashboard de Reposições — Google Apps Script

Dashboard corporativo que lê diretamente a planilha privada e mostra somente indicadores consolidados. Não exige conta de serviço, chave privada ou publicação da planilha.

## Instalação

1. Abra a planilha no Google Sheets com sua conta corporativa.
2. Acesse **Extensões → Apps Script**.
3. Crie/copie os arquivos deste diretório: `Code.gs`, `Index.html`, `Stylesheet.html`, `JavaScript.html` e `appsscript.json`.
4. Em **Configurações do projeto**, habilite a exibição do arquivo de manifesto para substituir `appsscript.json`.
5. Execute `getDashboardData` uma vez no editor e autorize o acesso à planilha.
6. Clique em **Implantar → Nova implantação → Aplicativo da Web**.
7. Selecione **Executar como: Eu** e, em acesso, **qualquer pessoa da organização** (nunca “qualquer pessoa”).
8. Publique e compartilhe a URL corporativa gerada.

## Estrutura esperada

- Planilha: `1ExgwfrUZy9a_aKla_Q4qgfgCY3Rm5cCchDMxPcYU05g`
- Abas: `BASE`, `QUALIDADE`, `REPOSIÇÔES`
- A aba `REPOSIÇÔES` é interpretada pelas posições atuais das colunas, pois não possui cabeçalho.

## Segurança

- A planilha continua privada.
- O navegador recebe apenas totais, percentuais e agrupamentos.
- Não são enviados e-mails, observações ou linhas individuais.
- O cache guarda somente o JSON consolidado por 5 minutos.

## Atualizações

Após alterar o código, use **Gerenciar implantações → Editar → Nova versão**. O botão `↻` no dashboard recalcula os indicadores; o cache pode levar até cinco minutos para expirar.
