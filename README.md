# Painel de Reposições

Dashboard em Next.js para acompanhar solicitações de reposição e auditorias de qualidade a partir do Google Sheets.

## Indicadores

- Total de solicitações
- Peças faltantes e volume das ordens
- Índice de falta
- Evolução mensal das solicitações
- Situação atual, áreas causadoras e principais motivos
- Auditorias aprovadas, reprovadas e taxa de conformidade
- Reposições produzidas no corte, volume, conclusão e backlog
- Lead time mediano, médio e P90, com tempos por etapa
- SLA de sete dias, fluxo mensal e distribuição do tempo de atendimento
- Materiais, componentes, motivos e status do processo no corte

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## Conectar a uma planilha corporativa privada

1. No Google Cloud corporativo, crie ou solicite uma **conta de serviço**.
2. Ative a **Google Sheets API** no projeto dessa conta.
3. Compartilhe a planilha como **Leitor** somente com o e-mail da conta de serviço.
4. Na Vercel, cadastre `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` como variáveis protegidas.
5. Cadastre também `GOOGLE_SHEETS_ID`, `BASE_SHEET_NAME` e `QUALITY_SHEET_NAME` conforme `.env.example`.

O servidor consulta as abas sem tornar a planilha pública. E-mails e observações não são enviados ao navegador.

## Publicar na Vercel

1. Envie este projeto para um repositório GitHub ou importe a pasta na Vercel.
2. Em **Settings → Environment Variables**, cadastre as variáveis descritas no `.env.example`.
3. Clique em **Deploy**.

Enquanto as credenciais corporativas não estiverem configuradas, o painel mostra o snapshot consolidado do arquivo fornecido.
