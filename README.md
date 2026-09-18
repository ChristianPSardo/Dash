# Painel de Reposições

Dashboard em Next.js para acompanhar solicitações de reposição e auditorias de qualidade a partir do Google Sheets.

## Indicadores

- Total de solicitações
- Peças faltantes e volume das ordens
- Índice de falta
- Evolução mensal das solicitações
- Situação atual, áreas causadoras e principais motivos
- Auditorias aprovadas, reprovadas e taxa de conformidade

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## Conectar ao Google Sheets

1. Na planilha, use **Compartilhar → Acesso geral → Qualquer pessoa com o link → Leitor**.
2. Copie `.env.example` para `.env.local`.
3. Confirme o ID em `GOOGLE_SHEETS_ID`.
4. As abas precisam se chamar `BASE` e `QUALIDADE`. Se tiverem outros nomes, altere as variáveis correspondentes.

O servidor consulta as abas a cada cinco minutos. E-mails e observações da planilha não são enviados ao navegador.

## Publicar na Vercel

1. Envie este projeto para um repositório GitHub ou importe a pasta na Vercel.
2. Em **Settings → Environment Variables**, cadastre `GOOGLE_SHEETS_ID`, `BASE_SHEET_NAME` e `QUALITY_SHEET_NAME` com os valores do `.env.example`.
3. Clique em **Deploy**.

Enquanto a planilha estiver privada, o painel mostra o snapshot consolidado do arquivo fornecido. Assim que o compartilhamento for liberado, ele passa automaticamente para os dados ao vivo.
