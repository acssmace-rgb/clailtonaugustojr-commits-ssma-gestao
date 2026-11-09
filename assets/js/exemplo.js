/* Dados FICTÍCIOS para demonstração (empresas, CNPJs e pessoas inventados). */
window.carregarExemplo = function () {
  const hoje = U.iso(new Date());
  const d = (n) => U.somaDias(hoje, n);
  const m = (n) => U.somaMeses(hoje, n);
  const add = (c, o) => S.gravar(c, o);

  const c1 = add('clientes', { razaoSocial: 'VIDRAÇARIA EXEMPLO LTDA', fantasia: 'Vidraçaria Exemplo', cnpj: '11.222.333/0001-81', cnae: '23.11-7-00', grauRisco: '3', empregados: '48', unidade: 'Matriz – Maracanaú', endereco: 'Rua Fictícia, 100 – Maracanaú/CE', contatoNome: 'Ana (RH)', contatoEmail: 'rh@exemplo.com.br', contatoFone: '(85) 90000-0001', servicos: ['PGR', 'PCMSO', 'LTCAT', 'Treinamentos', 'eSocial', 'Psicossocial NR-01'], ativo: true, repositorio: 'cliente-vidracaria-exemplo' });
  const c2 = add('clientes', { razaoSocial: 'MÓVEIS DEMONSTRAÇÃO INDÚSTRIA LTDA', fantasia: 'Móveis Demo', cnpj: '22.333.444/0001-81', cnae: '31.01-2-00', grauRisco: '3', empregados: '120', unidade: 'Fábrica – Fortaleza', contatoNome: 'Carlos (DP)', contatoEmail: 'dp@demo.com.br', contatoFone: '(85) 90000-0002', servicos: ['PGR', 'PCMSO', 'CIPA', 'Brigada/PAE', 'ABVTEX', 'Visitas mensais'], ativo: true, repositorio: 'cliente-moveis-demo' });
  const c3 = add('clientes', { razaoSocial: 'CONFECÇÕES MODELO EIRELI', fantasia: 'Confecções Modelo', cnpj: '33.444.555/0001-81', cnae: '14.12-6-01', grauRisco: '2', empregados: '35', unidade: 'Fortaleza', contatoNome: 'Júlia (RH)', contatoEmail: 'rh@modelo.com.br', contatoFone: '(85) 90000-0003', servicos: ['PGR', 'PCMSO', 'AEP', 'ABVTEX'], ativo: true, repositorio: 'cliente-confeccoes-modelo' });

  add('documentos', { clienteId: c1.id, tipo: 'pgr', descricao: 'Revisão 01', emissao: U.somaMeses(hoje, -23), status: 'vigente', responsavel: 'Clailton Lima' });
  add('documentos', { clienteId: c1.id, tipo: 'pcmso', descricao: '2026', emissao: U.somaMeses(hoje, -13), status: 'vigente', responsavel: 'Dr. Médico Coordenador' });
  add('documentos', { clienteId: c1.id, tipo: 'ltcat', emissao: U.somaMeses(hoje, -6), status: 'vigente' });
  add('documentos', { clienteId: c2.id, tipo: 'pgr', descricao: 'Revisão 03', emissao: U.somaMeses(hoje, -4), status: 'vigente' });
  add('documentos', { clienteId: c2.id, tipo: 'pcmso', emissao: U.somaMeses(hoje, -11), status: 'vigente' });
  add('documentos', { clienteId: c2.id, tipo: 'pae', emissao: U.somaMeses(hoje, -12), status: 'vigente' });
  add('documentos', { clienteId: c3.id, tipo: 'pgr', emissao: U.somaMeses(hoje, -8), status: 'vigente' });
  add('documentos', { clienteId: c3.id, tipo: 'aep', emissao: U.somaMeses(hoje, -8), status: 'vigente' });

  const b = NORMAS.conteudos['nr23-brigada'];
  add('treinamentos', { clienteId: c2.id, cursoId: 'nr23-brigada', titulo: 'TREINAMENTO DE FORMAÇÃO DE BRIGADA DE INCÊNDIO', data: U.somaMeses(hoje, -11), cargaHoraria: '20 horas', local: 'Auditório da empresa', conteudo: b.itens.join('\n'), descricao: b.descricao,
    participantes: [{ nome: 'FULANO DE TAL EXEMPLO', cpf: '529.982.247-25' }, { nome: 'BELTRANA DA SILVA MODELO', cpf: '' }, { nome: 'CICRANO SOUZA TESTE', cpf: '' }] });
  add('treinamentos', { clienteId: c1.id, cursoId: 'nr35-altura', titulo: 'TREINAMENTO DE TRABALHO EM ALTURA', data: U.somaMeses(hoje, -22), cargaHoraria: '8 horas', conteudo: NORMAS.conteudos['nr35-altura'].itens.join('\n'), descricao: NORMAS.conteudos['nr35-altura'].descricao, participantes: [{ nome: 'OPERADOR EXEMPLO UM', cpf: '' }, { nome: 'OPERADOR EXEMPLO DOIS', cpf: '' }] });

  add('pendencias', { clienteId: c1.id, categoria: 'PGR', titulo: 'Revisar inventário de riscos', prazo: d(20), status: 'andamento', etiquetas: ['prazo'] });
  add('pendencias', { clienteId: c1.id, categoria: 'eSocial', titulo: 'Enviar lista de admitidos do mês', prazo: d(-3), status: 'aguardando', etiquetas: ['aguardando-cliente', 'eSocial'] });
  add('pendencias', { clienteId: c3.id, categoria: 'Auditoria', titulo: 'Fechar plano de ação da pré-auditoria ABVTEX', prazo: d(12), status: 'aberta', etiquetas: ['auditoria'] });

  add('esocial', { clienteId: c1.id, evento: 'S-2220', referencia: 'Matrícula 0042 – ASO periódico', dataFato: d(-10), status: 'pendente' });
  add('esocial', { clienteId: c2.id, evento: 'S-2240', referencia: 'Novo setor de pintura', dataFato: d(-25), status: 'enviado', recibo: '1.2.0000000000000000001' });

  add('cipa', { clienteId: c2.id, modalidade: 'CIPA', gestao: 'atual', inicioMandato: U.somaDias(m(-10), 0), fimMandato: U.somaDias(m(2), -1), efetivos: 2, suplentes: 2, status: 'vigente' });
  add('cipa', { clienteId: c1.id, modalidade: 'Designado', inicioMandato: m(-3), fimMandato: U.somaDias(m(9), -1), designado: 'Encarregado de produção', status: 'vigente' });

  add('visitas', { clienteId: c2.id, data: d(-5), horario: '08:00 às 11:00', acompanhante: 'Carlos (DP)', setores: 'Corte, montagem, expedição', objetivo: 'Inspeção mensal de SST', constatacoes: 'Extintor do setor de corte com lacre rompido.\nProteção da serra circular removida.', recomendacoes: 'Substituir/recarregar extintor do corte\nReinstalar proteção da serra circular e orientar operador (NR-12)' });
  add('auditorias', { clienteId: c3.id, norma: 'ABVTEX', tipoAud: 'Externa / certificação', data: d(35), auditor: 'Organismo certificador', status: 'planejada' });

  add('psicossocial', { clienteId: c1.id, metodologia: 'Questionário + grupos focais', etapas: NORMAS.etapasPsicossocial.map((_, i) => ({ feito: i < 3, data: i < 3 ? d(-30 + i * 7) : '' })) });
};
