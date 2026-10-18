/**
 * Catálogo de permissões por módulo. Papéis combinam permissões.
 * Dados de saúde (exames/ASO, atestados) exigem `health.read` / `health.write`.
 */
export const PERMISSIONS = {
  'admin.users': 'Gerenciar usuários e acessos do cliente',
  'admin.settings': 'Configurar cliente (alertas, identidade, prazos)',
  'audit.read': 'Consultar trilha de auditoria',
  'org.read': 'Ver empresas, unidades, setores e cargos',
  'org.write': 'Cadastrar empresas, unidades, setores e cargos',
  'workers.read': 'Ver trabalhadores',
  'workers.write': 'Cadastrar trabalhadores',
  'risks.read': 'Ver perigos e riscos',
  'risks.write': 'Gerenciar perigos e riscos',
  'health.read': 'Ver dados de saúde (exames, ASO, atestados) — acesso restrito',
  'health.write': 'Registrar dados de saúde — acesso restrito',
  'accidents.read': 'Ver acidentes, incidentes e quase acidentes',
  'accidents.write': 'Registrar e investigar acidentes',
  'ppe.read': 'Ver EPIs e entregas',
  'ppe.write': 'Gerenciar EPIs e entregas',
  'trainings.read': 'Ver treinamentos',
  'trainings.write': 'Gerenciar treinamentos',
  'tasks.read': 'Ver tarefas e planos de ação',
  'tasks.write': 'Criar e atualizar tarefas e planos de ação',
  'tasks.approve': 'Aprovar ou reprovar tarefas',
  'documents.read': 'Ver documentos',
  'documents.write': 'Cadastrar documentos e enviar versões',
  'documents.approve': 'Revisar e aprovar versões de documentos',
  'reports.read': 'Ver painéis e exportar relatórios',
  'reports.schedule': 'Agendar envio de relatórios',
  'esocial.read': 'Ver eventos eSocial',
  'esocial.prepare': 'Preparar, validar e exportar eventos eSocial',
  'esocial.transmit': 'Enviar eventos eSocial (quando a transmissão oficial estiver configurada)',
  'lgpd.manage': 'Atender solicitações LGPD (exportar/anonimizar dados)',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

const readAll = ALL_PERMISSIONS.filter((p) => p.endsWith('.read') && p !== 'health.read' && p !== 'audit.read');

/** Papéis padrão do sistema (podem ser copiados e ajustados por cliente). */
export const SYSTEM_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  {
    key: 'admin',
    name: 'Administrador do cliente',
    description: 'Acesso total aos dados do cliente, incluindo saúde e administração',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'tecnico_sst',
    name: 'Técnico/Engenheiro de Segurança',
    description: 'Gestão de SST, documentos, tarefas e eSocial (sem dados de saúde)',
    permissions: [
      ...readAll,
      'org.write', 'workers.write', 'risks.write', 'accidents.write', 'ppe.write', 'trainings.write',
      'tasks.write', 'tasks.approve', 'documents.write', 'documents.approve', 'reports.schedule', 'esocial.prepare',
    ],
  },
  {
    key: 'saude',
    name: 'Saúde ocupacional (médico/enfermagem)',
    description: 'Exames, ASO e dados de saúde; preparação do S-2220',
    permissions: [
      'org.read', 'workers.read', 'health.read', 'health.write', 'accidents.read', 'tasks.read', 'tasks.write',
      'documents.read', 'documents.write', 'documents.approve', 'reports.read', 'esocial.read', 'esocial.prepare',
    ],
  },
  {
    key: 'gestor',
    name: 'Gestor',
    description: 'Acompanha indicadores, aprova tarefas e consulta documentos',
    permissions: [...readAll, 'tasks.write', 'tasks.approve'],
  },
  {
    key: 'colaborador',
    name: 'Colaborador',
    description: 'Executa tarefas atribuídas e consulta documentos',
    permissions: ['org.read', 'tasks.read', 'tasks.write', 'documents.read'],
  },
];
