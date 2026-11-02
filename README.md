# LPP2 - Game Dev Studio Hub 🎮

Uma central completa para desenvolvimento e organização de jogos independentes entre sócios e equipe, empacotada em **Electron.js** com **React 19**, **Tailwind CSS** e **WebSockets**.

---

## 🚀 Como Iniciar

Dentro da pasta `LPP2`:

### 1. Iniciar o Aplicativo Desktop (Electron + Servidor + Interface)
```bash
npm run dev
```
Isso iniciará concorrentemente:
- O servidor de sinalização WebRTC e chat em tempo real (`localhost:3001`)
- O servidor Vite de desenvolvimento (`localhost:5173`)
- A janela nativa do Electron

### 2. Iniciar no Navegador (Opcional)
Se algum dos seus sócios preferir abrir no navegador sem abrir o Electron:
```bash
npm run web
```
E acesse `http://localhost:5173`.

---

## 🧩 Módulos Inclusos

### 1. 💬 Módulo Discord (Chat, Voz & Transmissão de Tela)
- **Canais de Texto:** `#geral`, `#gamedev-prog`, `#arte-e-sprites`, `#bugs-e-tarefas`.
- **Canais de Voz P2P:** Chamadas de voz de baixa latência usando **WebRTC** e servidores STUN públicos gratuitos da Google (`stun.l.google.com:19302`).
- **Transmissão de Tela:** Compartilhamento de tela e janelas em tempo real para pair programming ou testes de gameplay.
- **Lista de Sócios:** Indicador de membros online, cargos (*Diretor, Programador, Artista 2D, Game Designer, Músico*) e status de microfone/tela.

### 2. 🎨 Módulo Pixel Art Studio (Estilo Aseprite)
- **Grid de Pixels:** 16x16, 24x24, 32x32, 64x64 com suporte a zoom pixel-perfect.
- **Ferramentas:** Lápis, Borracha, Balde de Tinta (Flood Fill recursivo), Conta-gotas, Linha Reta e Formas Geométricas.
- **Paletas Clássicas:** PICO-8, Game Boy, DawnBringer e Cyber Neon, além de seletor Hexadecimal/RGB.
- **Camadas (Layers):** Criação, visibilidade, opacidade e sobreposição.
- **Animação & Linha do Tempo:** Frames múltiplos, controle de FPS (1 a 24), modo **Onion Skinning** (casca de cebola para ver o frame anterior) e caixa de reprodução em tempo real.
- **Exportação:** Download em PNG e botão de **"Enviar pro Chat"** com 1 clique.

### 3. 📐 Módulo de Quadro Compartilhado (Estilo Figma / FigJam)
- **Colaboração em Tempo Real:** Sincronização via WebSockets.
- **Cursors Multiplayer:** Visualize onde seus sócios estão apontando com nome e cursor em tempo real.
- **Ferramentas:** Caneta livre, Post-its coloridos para brainstorming de mecânicas, Retângulos, Círculos, Setas conectoras e Caixas de texto.
- **Exportação:** Download do quadro e compartilhamento direto no canal da reunião.

### 4. 📦 Módulo de Backups & Builds do Jogo
- Histórico completo de versões (`v0.1.0-alpha`, etc.), títulos e changelogs.
- Upload de arquivos de projeto (`.zip`, `.exe`, `.rar`, assets) com limite de 50 MB usando Supabase Storage.
- Download e restauração direta de builds.

### 5. 🛡️ Sistema de Identidade & Perfil
- Escolha de apelido, avatar em pixel-art e cargo no projeto.
- Configuração de URL do servidor (permite chavear entre `localhost:3001` e um servidor gratuito na nuvem como o Render.com).

---

## 🌐 Hospedagem 100% Gratuita na Nuvem (Opcional)

Para permitir que seus sócios se conectem de casas diferentes sem precisar de portas abertas no roteador:
1. Suba o arquivo `server/index.cjs` e `package.json` para o **Render.com** como um *Web Service Gratuito*.
2. No app, clique na engrenagem no canto inferior esquerdo e cole a URL do seu Render (ex: `https://meu-lpp2-server.onrender.com`).
3. O WebRTC continuará 100% gratuito e direto (P2P), usando apenas a nuvem para sinalização inicial.
4. No painel do serviço, defina `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY` e `REQUIRE_SOCKET_AUTH=true`. Use o mesmo projeto e a mesma chave publishable/anon configurados no app. Sem essas variáveis o servidor de produção rejeita conexões.
5. Use uma URL HTTPS para o servidor remoto. O app só permite HTTP em `localhost`, pois a sessão Supabase é enviada ao servidor para validar a equipe.

## 🔐 Configuração segura do Supabase

1. No app, informe a URL do projeto e a chave **publishable/anon**. Nunca use uma chave `service_role` ou `secret` no app.
2. No SQL Editor do Supabase, execute `supabase_schema.sql`. O script pode ser executado novamente e substitui as políticas antigas de acesso público.
3. Autorize os e-mails da equipe no SQL Editor, antes de criar as contas. Exemplo:

```sql
INSERT INTO public.lpp2_allowed_emails (email)
VALUES (lower('pessoa@exemplo.com'))
ON CONFLICT (email) DO NOTHING;
```

4. Em **Configurações & Conexão → Banco Supabase**, cada pessoa cria sua conta com um e-mail autorizado. Se a confirmação por e-mail estiver ligada no Supabase, ela precisa confirmar o endereço antes de entrar.
5. O script cria o bucket privado `lpp2-files`. Mensagens, quadro, builds e arquivos ficam disponíveis somente para e-mails autorizados; uploads podem ter até 50 MB.

O modo alternativo sem login funciona apenas no desenvolvimento local. O histórico desse modo fica na memória e se perde quando o processo reinicia. Em produção, o servidor Socket.IO valida a sessão e a lista de e-mails permitidos no Supabase.
