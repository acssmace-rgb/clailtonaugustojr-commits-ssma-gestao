/* Catálogos e valores padrão de SST usados pelo sistema.
   Todas as validades são PADRÕES SUGERIDOS e podem ser ajustadas em Configurações.
   Conferir sempre o texto vigente da NR/norma antes de usar em documento oficial. */
window.NORMAS = (function () {
  // Tipos de documento / programa (validade em meses; null = sem periodicidade fixa)
  const tiposDocumento = [
    { id: 'pgr', sigla: 'PGR', nome: 'Programa de Gerenciamento de Riscos (NR-01)', validade: 24, pasta: 'pgr', obs: 'Revisão a cada 2 anos (3 anos com SGSST certificado) ou quando houver mudança.' },
    { id: 'pcmso', sigla: 'PCMSO', nome: 'Programa de Controle Médico de Saúde Ocupacional (NR-07)', validade: 12, pasta: 'pcmso', obs: 'Relatório analítico anual.' },
    { id: 'ltcat', sigla: 'LTCAT', nome: 'Laudo Técnico das Condições Ambientais do Trabalho', validade: 12, pasta: 'ltcat', obs: 'Sem prazo legal fixo; atualizar a cada mudança. Revisão anual sugerida.' },
    { id: 'aep', sigla: 'AEP', nome: 'Avaliação Ergonômica Preliminar (NR-17)', validade: 24, pasta: 'aep', obs: 'Acompanha o ciclo do PGR.' },
    { id: 'aet', sigla: 'AET', nome: 'Análise Ergonômica do Trabalho (NR-17)', validade: null, pasta: 'aep', obs: 'Quando indicada pela AEP.' },
    { id: 'insalubridade', sigla: 'LI', nome: 'Laudo de Insalubridade (NR-15)', validade: null, pasta: 'outros', obs: 'Atualizar a cada mudança. Deve ficar disponível a trabalhadores/sindicato/fiscalização.' },
    { id: 'periculosidade', sigla: 'LP', nome: 'Laudo de Periculosidade (NR-16)', validade: null, pasta: 'outros', obs: 'Atualizar a cada mudança.' },
    { id: 'pae', sigla: 'PAE', nome: 'Plano de Atendimento a Emergências', validade: 12, pasta: 'brigada-pae', obs: 'Revisão anual sugerida.' },
    { id: 'brigada', sigla: 'BRIG', nome: 'Plano/Atestado de Brigada de Incêndio', validade: 12, pasta: 'brigada-pae', obs: 'Reciclagem anual da brigada.' },
    { id: 'pca', sigla: 'PCA', nome: 'Programa de Conservação Auditiva', validade: 12, pasta: 'outros', obs: '' },
    { id: 'ppr', sigla: 'PPR', nome: 'Programa de Proteção Respiratória', validade: 12, pasta: 'outros', obs: '' },
    { id: 'psicossocial', sigla: 'PSICO', nome: 'Avaliação de Riscos Psicossociais (NR-01)', validade: 24, pasta: 'psicossocial-nr01', obs: 'Integra o inventário de riscos do PGR.' },
    { id: 'os', sigla: 'OS', nome: 'Ordens de Serviço de SST (NR-01)', validade: null, pasta: 'outros', obs: '' },
    { id: 'pronto-nr10', sigla: 'PIE', nome: 'Prontuário das Instalações Elétricas (NR-10)', validade: null, pasta: 'outros', obs: '' },
    { id: 'spda', sigla: 'SPDA', nome: 'Laudo de SPDA (NBR 5419)', validade: 12, pasta: 'outros', obs: 'Periodicidade conforme a norma/estrutura.' },
    { id: 'cbm', sigla: 'CBM', nome: 'Certificado de Conformidade – Corpo de Bombeiros (CBMCE)', validade: 12, pasta: 'brigada-pae', obs: 'Conferir validade no próprio certificado.' },
    { id: 'outro', sigla: 'OUTRO', nome: 'Outro documento', validade: null, pasta: 'outros', obs: '' }
  ];

  // Catálogo de treinamentos (validade em meses; null = sem reciclagem periódica fixa)
  const cursos = [
    { id: 'nr01-integracao', nr: 'NR-01', nome: 'Integração / Ordem de Serviço de SST', ch: '4 horas', validade: null },
    { id: 'nr05-cipa', nr: 'NR-05', nome: 'Treinamento de Membros da CIPA', ch: '8 a 20 horas (conforme grau de risco)', validade: 12 },
    { id: 'nr05-designado', nr: 'NR-05', nome: 'Treinamento do Designado da CIPA', ch: '8 a 20 horas', validade: 12 },
    { id: 'nr06-epi', nr: 'NR-06', nome: 'Uso, Guarda e Conservação de EPI', ch: '2 horas', validade: null },
    { id: 'nr10-basico', nr: 'NR-10', nome: 'Segurança em Instalações e Serviços com Eletricidade – Básico', ch: '40 horas', validade: 24 },
    { id: 'nr10-sep', nr: 'NR-10', nome: 'Segurança no Sistema Elétrico de Potência – SEP', ch: '40 horas', validade: 24 },
    { id: 'nr11-empilhadeira', nr: 'NR-11', nome: 'Operador de Empilhadeira', ch: '16 horas', validade: 12 },
    { id: 'nr11-ponte', nr: 'NR-11', nome: 'Operador de Ponte Rolante', ch: '16 horas', validade: 12 },
    { id: 'nr12-maquinas', nr: 'NR-12', nome: 'Segurança em Máquinas e Equipamentos', ch: '8 horas', validade: null },
    { id: 'nr17-ergonomia', nr: 'NR-17', nome: 'Ergonomia', ch: '4 horas', validade: null },
    { id: 'nr18-construcao', nr: 'NR-18', nome: 'Segurança na Indústria da Construção – Admissional', ch: '4 horas', validade: null },
    { id: 'nr20-basico', nr: 'NR-20', nome: 'Inflamáveis e Combustíveis – Básico', ch: '8 horas', validade: 36 },
    { id: 'nr20-intermediario', nr: 'NR-20', nome: 'Inflamáveis e Combustíveis – Intermediário', ch: '16 horas', validade: 24 },
    { id: 'nr23-brigada', nr: 'NR-23', nome: 'Formação de Brigada de Incêndio', ch: '20 horas', validade: 12 },
    { id: 'nr23-combate', nr: 'NR-23', nome: 'Prevenção e Combate a Incêndio', ch: '4 horas', validade: 12 },
    { id: 'nr26-gho', nr: 'NR-26', nome: 'Sinalização e Rotulagem de Produtos Químicos (GHS)', ch: '4 horas', validade: null },
    { id: 'nr33-trabalhador', nr: 'NR-33', nome: 'Espaço Confinado – Trabalhador Autorizado e Vigia', ch: '16 horas', validade: 12 },
    { id: 'nr33-supervisor', nr: 'NR-33', nome: 'Espaço Confinado – Supervisor de Entrada', ch: '40 horas', validade: 12 },
    { id: 'nr35-altura', nr: 'NR-35', nome: 'Trabalho em Altura', ch: '8 horas', validade: 24 },
    { id: 'primeiros-socorros', nr: 'NR-07', nome: 'Primeiros Socorros', ch: '8 horas', validade: 12 },
    { id: 'psicossocial', nr: 'NR-01', nome: 'Riscos Psicossociais e Saúde Mental no Trabalho', ch: '4 horas', validade: null },
    { id: 'outro', nr: '', nome: 'Outro treinamento', ch: '', validade: null }
  ];

  // Conteúdos programáticos-modelo (podem ser editados em cada turma)
  const conteudos = {
    'nr23-brigada': {
      itens: [
        'Introdução (objetivos e comportamento do brigadista)', 'Aspectos legais', 'Teoria do fogo', 'Propagação do fogo',
        'Classes de incêndio', 'Prevenção de incêndios', 'Métodos de extinção', 'Agentes extintores',
        'Equipamentos de Proteção Individual (EPI) para o brigadista',
        'Sistemas de combate a incêndio (extintores, hidrantes e chuveiros automáticos)',
        'Sistemas de detecção e alarme, iluminação de emergência, sinalização e comunicação',
        'Riscos específicos da planta', 'Emergências químicas e tecnológicas', 'Procedimentos de abandono de área'
      ],
      descricao: 'A Brigada de Incêndio tem como objetivo preservar a vida e proteger os bens de uma instituição. É responsável por agir em situações de princípio de incêndio e também na prestação de socorro em casos de desmaios ou outras ocorrências que exijam atendimento de primeiros socorros, conforme estabelece a NR nº 23.'
    },
    'nr35-altura': {
      itens: ['Normas e regulamentos aplicáveis ao trabalho em altura', 'Análise de Risco e condições impeditivas',
        'Riscos potenciais inerentes ao trabalho em altura e medidas de prevenção e controle',
        'Sistemas, equipamentos e procedimentos de proteção coletiva',
        'Equipamentos de Proteção Individual: seleção, inspeção, conservação e limitação de uso',
        'Acidentes típicos em trabalhos em altura', 'Condutas em situações de emergência, noções de técnicas de resgate e primeiros socorros'],
      descricao: 'Capacitação para trabalho em altura conforme a NR-35, abordando planejamento, organização e execução seguros das atividades realizadas acima de 2,00 m do nível inferior.'
    },
    'nr05-cipa': {
      itens: ['Estudo do ambiente, das condições de trabalho e dos riscos dos processos produtivos', 'Noções sobre acidentes e doenças relacionadas ao trabalho',
        'Metodologia de investigação e análise de acidentes', 'Princípios gerais de higiene do trabalho e medidas de prevenção',
        'Noções sobre legislação trabalhista e previdenciária relativas à SST', 'Noções sobre inclusão de pessoas com deficiência e reabilitados',
        'Organização da CIPA e outros assuntos necessários ao exercício das atribuições', 'Prevenção e combate ao assédio sexual e a outras formas de violência no trabalho'],
      descricao: 'Capacitação dos membros da Comissão Interna de Prevenção de Acidentes e de Assédio – CIPA, conforme a NR-05.'
    },
    'nr06-epi': {
      itens: ['Conceito e finalidade do EPI', 'Obrigações do empregador e do empregado (NR-06)', 'Certificado de Aprovação (CA)',
        'Seleção do EPI adequado ao risco', 'Uso correto, guarda, higienização e conservação', 'Registro de entrega e substituição'],
      descricao: 'Orientação sobre uso, guarda e conservação dos Equipamentos de Proteção Individual, conforme a NR-06.'
    }
  };

  // Etapas do gerenciamento de riscos psicossociais (NR-01 / GRO)
  const etapasPsicossocial = [
    'Sensibilização da liderança e comunicação aos trabalhadores',
    'Levantamento preliminar de perigos psicossociais (organização do trabalho, metas, jornada, relações, assédio)',
    'Aplicação de instrumento de avaliação (questionário, entrevistas, grupos focais)',
    'Análise dos resultados e avaliação dos riscos (probabilidade × severidade)',
    'Inclusão dos riscos psicossociais no inventário de riscos do PGR',
    'Plano de ação com medidas, responsáveis e prazos',
    'Integração com o PCMSO (NR-07) e canal de acolhimento',
    'Participação dos trabalhadores / CIPA na avaliação e nas medidas',
    'Monitoramento, indicadores e reavaliação periódica'
  ];

  const etiquetas = ['prazo', 'aguardando-cliente', 'eSocial', 'auditoria', 'NR-01'];
  const tiposPendencia = ['PGR', 'PCMSO', 'LTCAT', 'AEP', 'CIPA', 'eSocial', 'Treinamento', 'Brigada/PAE', 'Psicossocial', 'Auditoria', 'SGI', 'Visita', 'Outro'];
  const normasAuditoria = ['ABVTEX', 'ISO 9001', 'ISO 14001', 'ISO 45001', 'SGI integrado', 'Auditoria interna SST', 'Fiscalização MTE', 'Corpo de Bombeiros', 'Outra'];

  const eventosESocial = [
    { id: 'S-2210', nome: 'S-2210 – Comunicação de Acidente de Trabalho (CAT)', regra: 'Até o 1º dia útil seguinte ao acidente; em caso de óbito, imediatamente.' },
    { id: 'S-2220', nome: 'S-2220 – Monitoramento da Saúde do Trabalhador (ASO)', regra: 'Até o dia 15 do mês subsequente à realização do exame.' },
    { id: 'S-2240', nome: 'S-2240 – Condições Ambientais do Trabalho – Agentes Nocivos', regra: 'Até o dia 15 do mês subsequente ao início da atividade ou à alteração das condições.' }
  ];

  return { tiposDocumento, cursos, conteudos, etapasPsicossocial, etiquetas, tiposPendencia, normasAuditoria, eventosESocial };
})();
