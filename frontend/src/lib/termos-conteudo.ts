// Texto dos Termos de Uso e da Política de Privacidade mostrados no
// cadastro aberto (ver /auth/registro no backend e RegistroScreen em
// AuthGate.tsx) - versão inicial, redigida a partir do que o ATLAS
// realmente faz hoje (radar de decisões, carteira de clientes, Copiloto
// com IA, automação de Mídia Social usando o próprio token do Instagram
// de cada usuário). Textos como [RAZÃO SOCIAL], [CNPJ] e [E-MAIL DE
// CONTATO] precisam ser preenchidos pelo responsável pelo ATLAS antes de
// valerem oficialmente - e, por serem termos legais de verdade (não só
// texto de produto), o ideal é passar por revisão de um advogado antes de
// depender deles.

export const VERSAO_TERMOS = "1.0";

export interface SecaoTermos {
  titulo: string;
  paragrafos: string[];
}

export const TERMOS_USO: SecaoTermos[] = [
  {
    titulo: "1. O que é o ATLAS",
    paragrafos: [
      "O ATLAS é uma ferramenta de inteligência econômico-jurídica voltada a escritórios e profissionais da área tributária. Ele reúne decisões de tribunais e órgãos públicos, organiza essas informações por setor e tema, permite manter uma carteira de clientes, oferece um assistente conversacional (\"Copiloto ATLAS\") e uma automação opcional de publicação de conteúdo no Instagram do próprio usuário.",
      "O ATLAS é operado por [RAZÃO SOCIAL], inscrita no CNPJ [CNPJ], doravante \"nós\". Ao criar uma conta, você concorda com estes Termos de Uso e com a Política de Privacidade descrita abaixo.",
    ],
  },
  {
    titulo: "2. Sua conta",
    paragrafos: [
      "Você é responsável por manter a confidencialidade da sua senha e por tudo que acontecer usando o seu login. Avise-nos imediatamente se suspeitar de acesso indevido à sua conta.",
      "As informações que você cadastra (carteira de clientes, conversas do Copiloto, configuração de automação) pertencem a você e são isoladas das de outros usuários - ninguém mais que usa o ATLAS enxerga os seus dados.",
      "Contas criadas pelo cadastro aberto nascem no nível \"básico\", com limites semanais de uso descritos na própria plataforma. Alterações de nível dependem de contato com quem administra o ATLAS.",
    ],
  },
  {
    titulo: "3. Conteúdo gerado por Inteligência Artificial",
    paragrafos: [
      "O Copiloto ATLAS, a geração de pareceres e a automação de posts usam modelos de IA de terceiros (Claude, da Anthropic) para produzir texto a partir das decisões coletadas e das informações que você fornece.",
      "Esse conteúdo é gerado automaticamente e pode conter imprecisões, desatualizações ou interpretações que não correspondem à sua análise profissional. Ele é uma ferramenta de apoio e NÃO substitui a revisão de um advogado antes de qualquer uso profissional, publicação ou decisão baseada nele. Você é responsável por revisar e validar qualquer conteúdo antes de usá-lo com clientes ou publicá-lo.",
    ],
  },
  {
    titulo: "4. Automação de Mídia Social",
    paragrafos: [
      "Se você ativar a automação de Instagram, o ATLAS publica no perfil que você conectar, usando o token de acesso que você mesmo fornece através da API oficial da Meta. Esse token fica armazenado de forma restrita à sua conta e nunca é compartilhado com outros usuários.",
      "Você é o responsável final pelo conteúdo publicado no seu perfil - recomendamos revisar a pré-visualização antes de ativar a publicação automática, e pode desativá-la a qualquer momento.",
    ],
  },
  {
    titulo: "5. Uso aceitável",
    paragrafos: [
      "Você concorda em não usar o ATLAS para fins ilícitos, para tentar acessar dados de outros usuários, para sobrecarregar deliberadamente o sistema, ou para automatizar cadastros em massa.",
      "Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos ou que representem risco de segurança para a plataforma ou para outros usuários.",
    ],
  },
  {
    titulo: "6. Disponibilidade e limitações",
    paragrafos: [
      "Fazemos esforços razoáveis para manter o ATLAS disponível, mas não garantimos operação ininterrupta. Fontes externas (tribunais, órgãos públicos, Meta/Instagram, provedores de IA) podem ficar indisponíveis ou mudar sem aviso, o que pode afetar funcionalidades que dependem delas.",
      "Na máxima medida permitida por lei, não nos responsabilizamos por decisões profissionais tomadas com base no conteúdo gerado pela plataforma, nem por indisponibilidades de serviços de terceiros dos quais o ATLAS depende.",
    ],
  },
  {
    titulo: "7. Cancelamento",
    paragrafos: [
      "Você pode solicitar o encerramento da sua conta e a exclusão dos seus dados a qualquer momento, entrando em contato pelo e-mail [E-MAIL DE CONTATO]. Também podemos encerrar contas nos casos previstos na seção 5.",
    ],
  },
  {
    titulo: "8. Alterações destes termos",
    paragrafos: [
      "Podemos atualizar estes termos conforme o ATLAS evolui. Mudanças relevantes serão comunicadas na plataforma antes de entrarem em vigor.",
    ],
  },
];

export const POLITICA_PRIVACIDADE: SecaoTermos[] = [
  {
    titulo: "1. Quais dados coletamos",
    paragrafos: [
      "Dados de cadastro: usuário e senha (a senha nunca é armazenada em texto puro - apenas um hash criptográfico com salt individual).",
      "Dados que você insere ao usar o ATLAS: carteira de clientes, perguntas e respostas do Copiloto, configuração de identidade visual e credenciais de automação do Instagram (quando você ativa essa função), e o histórico de posts gerados.",
      "Dados técnicos de sessão: um identificador de sessão (cookie), guardado só o necessário para manter você conectado com segurança.",
    ],
  },
  {
    titulo: "2. Como usamos os dados",
    paragrafos: [
      "Para operar as funcionalidades que você usa: mostrar sua carteira de clientes, responder no Copiloto, gerar e publicar posts quando a automação está ativa, e aplicar os limites de uso do seu nível de acesso.",
      "Não vendemos seus dados a terceiros. Trechos das informações que você envia ao Copiloto ou à geração de conteúdo são processados por provedores de IA (Anthropic) apenas para gerar a resposta solicitada, sob os termos de processamento desses provedores.",
    ],
  },
  {
    titulo: "3. Onde os dados ficam armazenados",
    paragrafos: [
      "Os dados ficam em um banco de dados e em armazenamento de arquivos operados em infraestrutura de nuvem (Railway), com acesso restrito à operação do ATLAS.",
      "Cada conta só acessa os próprios dados - carteira de clientes, conversas do Copiloto, configuração e histórico de automação são isolados por login.",
    ],
  },
  {
    titulo: "4. Seus direitos",
    paragrafos: [
      "Nos termos da Lei Geral de Proteção de Dados (LGPD), você pode solicitar a qualquer momento: acesso aos seus dados, correção de informações incorretas, exclusão da sua conta e dos seus dados, ou esclarecimentos sobre como eles são tratados.",
      "Para exercer esses direitos, entre em contato pelo e-mail [E-MAIL DE CONTATO].",
    ],
  },
  {
    titulo: "5. Retenção de dados",
    paragrafos: [
      "Mantemos seus dados enquanto sua conta estiver ativa. Ao solicitar o encerramento da conta, seus dados de automação (token do Instagram, identidade visual) são removidos; o histórico de carteira de clientes e conversas pode ser mantido por um período adicional para fins de auditoria, salvo pedido expresso de exclusão total.",
    ],
  },
  {
    titulo: "6. Segurança",
    paragrafos: [
      "Senhas são protegidas com hash PBKDF2-HMAC-SHA256 e salt individual por conta. A sessão é transmitida em um cookie protegido contra acesso por scripts (HttpOnly). Tentativas de login incorretas são limitadas para dificultar ataques de força bruta.",
    ],
  },
  {
    titulo: "7. Contato",
    paragrafos: [
      "Dúvidas sobre privacidade ou sobre estes termos podem ser enviadas para [E-MAIL DE CONTATO].",
    ],
  },
];
