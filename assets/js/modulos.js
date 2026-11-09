/* Definição dos módulos (cadastros) e componentes genéricos de lista/formulário. */
(function () {
  'use strict';
  const e = U.esc;

  const opcClientes = (atual) => {
    const l = S.clientesAtivos().map((c) => [c.id, c.fantasia || c.razaoSocial]);
    if (atual && !l.find((x) => x[0] === atual) && S.cliente(atual)) l.push([atual, S.nomeCliente(atual)]);
    return l;
  };
  const colCliente = { r: 'Cliente', v: (x) => `<a href="#/cliente/${x.clienteId}">${e(S.nomeCliente(x.clienteId))}</a>`, ord: (x) => S.nomeCliente(x.clienteId) };

  const M = {};

  M.clientes = {
    titulo: 'Clientes', singular: 'cliente', colecao: 'clientes', semCliente: true,
    campos: [
      { n: 'razaoSocial', r: 'Razão social', obr: true, total: true },
      { n: 'fantasia', r: 'Nome fantasia' },
      { n: 'cnpj', r: 'CNPJ', dica: 'Somente números ou formatado' },
      { n: 'cnae', r: 'CNAE principal', dica: 'Ex.: 23.11-7-00' },
      { n: 'grauRisco', r: 'Grau de risco (NR-04)', t: 'select', opc: ['', '1', '2', '3', '4'] },
      { n: 'empregados', r: 'Nº de empregados', t: 'number' },
      { n: 'unidade', r: 'Unidade / filial' },
      { n: 'endereco', r: 'Endereço', total: true },
      { n: 'contatoNome', r: 'Contato DP/RH' },
      { n: 'contatoEmail', r: 'E-mail do contato' },
      { n: 'contatoFone', r: 'Telefone / WhatsApp' },
      { n: 'inicioContrato', r: 'Início do contrato', t: 'date' },
      { n: 'servicos', r: 'Serviços contratados', t: 'tags', opc: ['PGR', 'PCMSO', 'LTCAT', 'AEP', 'CIPA', 'eSocial', 'Treinamentos', 'Brigada/PAE', 'Psicossocial NR-01', 'SGI', 'ABVTEX', 'Visitas mensais'], total: true },
      { n: 'repositorio', r: 'Repositório GitHub', dica: 'Ex.: cliente-fort-vidros (privado)' },
      { n: 'ativo', r: 'Situação', t: 'select', opc: [['true', 'Ativo'], ['false', 'Inativo']], padrao: 'true' },
      { n: 'obs', r: 'Observações', t: 'textarea', total: true }
    ],
    antesGravar(o) { o.cnpj = U.fmtCNPJ(o.cnpj); o.ativo = o.ativo !== 'false' && o.ativo !== false; if (!o.repositorio) o.repositorio = 'cliente-' + U.slug(o.fantasia || o.razaoSocial); },
    validar(o) { if (o.cnpj && !U.cnpjValido(o.cnpj)) return 'CNPJ inválido. Confira os dígitos.'; },
    colunas: [
      { r: 'Cliente', v: (c) => `<a href="#/cliente/${c.id}"><b>${e(c.fantasia || c.razaoSocial)}</b></a><div class="sub">${e(c.razaoSocial)}</div>`, ord: (c) => c.fantasia || c.razaoSocial },
      { r: 'CNPJ', v: (c) => e(c.cnpj || '') },
      { r: 'GR', v: (c) => e(c.grauRisco || '—') },
      { r: 'Empreg.', v: (c) => e(c.empregados || '—') },
      { r: 'Contato', v: (c) => `${e(c.contatoNome || '')}<div class="sub">${e(c.contatoFone || '')}</div>` },
      { r: 'Situação SST', v: (c) => { const v = R.vencimentos(c.id); const n = v.filter((x) => x.sit.cls === 'vencido').length; const a = v.filter((x) => x.sit.cls === 'alerta').length; return `<span class="semaforo ${n ? 'vencido' : a ? 'alerta' : 'ok'}"></span>${n} vencido(s) · ${a} a vencer`; } },
      { r: 'Status', v: (c) => c.ativo === false ? '<span class="selo neutro">Inativo</span>' : '<span class="selo ok">Ativo</span>' }
    ],
    filtroStatus: [['ativos', 'Ativos'], ['inativos', 'Inativos'], ['', 'Todos']],
    aplicarStatus: (c, f) => !f || (f === 'ativos' ? c.ativo !== false : c.ativo === false)
  };

  M.documentos = {
    titulo: 'Documentos e programas', singular: 'documento', colecao: 'documentos',
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'tipo', r: 'Tipo', t: 'select', obr: true, opc: () => S.cfg.tiposDocumento.map((t) => [t.id, `${t.sigla} – ${t.nome}`]) },
      { n: 'descricao', r: 'Descrição / revisão', dica: 'Ex.: Revisão 02 – unidade Maracanaú' },
      { n: 'responsavel', r: 'Responsável técnico', dica: 'Ex.: médico coordenador (PCMSO)' },
      { n: 'emissao', r: 'Data de emissão', t: 'date', obr: true },
      { n: 'validade', r: 'Vencimento (opcional)', t: 'date', dica: 'Em branco = calculado pela validade padrão do tipo.' },
      { n: 'status', r: 'Status', t: 'select', opc: [['vigente', 'Vigente'], ['em_elaboracao', 'Em elaboração'], ['substituido', 'Substituído (histórico)']], padrao: 'vigente' },
      { n: 'arquivo', r: 'Arquivo / link', dica: 'Caminho no repositório ou link do Drive' },
      { n: 'obs', r: 'Observações', t: 'textarea', total: true }
    ],
    aoMudar(f) {
      const t = S.tipoDoc(f.tipo.value); const calc = f.emissao.value ? U.somaMeses(f.emissao.value, t.validade) : null;
      f._dica('validade', t.validade ? `Padrão do tipo: ${t.validade} meses${calc ? ' → ' + U.br(calc) : ''}. ${t.obs || ''}` : `Sem periodicidade fixa. ${t.obs || ''}`);
      if (!f.arquivo.value && f.clienteId.value && f.emissao.value) f.arquivo.placeholder = IMP.nomeArquivo({ tipo: f.tipo.value, clienteId: f.clienteId.value, emissao: f.emissao.value });
    },
    colunas: [
      colCliente,
      { r: 'Documento', v: (d) => `<b>${e(S.tipoDoc(d.tipo).sigla)}</b> ${e(d.descricao || '')}<div class="sub">${e(S.tipoDoc(d.tipo).nome)}</div>`, ord: (d) => S.tipoDoc(d.tipo).sigla },
      { r: 'Emissão', v: (d) => U.br(d.emissao), ord: (d) => d.emissao },
      { r: 'Vencimento', v: (d) => U.br(R.vencDocumento(d)), ord: (d) => R.vencDocumento(d) || '9999' },
      { r: 'Situação', v: (d) => d.status === 'substituido' ? '<span class="selo neutro">Substituído</span>' : d.status === 'em_elaboracao' ? '<span class="selo info">Em elaboração</span>' : U.seloSit(U.situacao(R.vencDocumento(d), S.cfg.alertaDias)) },
      { r: 'Arquivo', v: (d) => d.arquivo ? (/^https?:/.test(d.arquivo) ? `<a href="${e(d.arquivo)}" target="_blank" rel="noopener">abrir</a>` : `<span class="sub">${e(d.arquivo)}</span>`) : '' }
    ],
    ordemPadrao: (a, b) => (R.vencDocumento(a) || '9999').localeCompare(R.vencDocumento(b) || '9999'),
    filtroStatus: [['', 'Todos'], ['vencido', 'Vencidos'], ['alerta', 'A vencer'], ['ok', 'Vigentes'], ['em_elaboracao', 'Em elaboração'], ['substituido', 'Histórico']],
    aplicarStatus(d, f) {
      if (!f) return d.status !== 'substituido';
      if (f === 'substituido' || f === 'em_elaboracao') return d.status === f;
      return d.status === 'vigente' && U.situacao(R.vencDocumento(d), S.cfg.alertaDias).cls === f;
    },
    acoes: (d) => `<button class="btn peq" data-acao="renovar" data-id="${d.id}" title="Cadastrar nova revisão e marcar esta como substituída">Renovar</button>`
  };

  M.treinamentos = {
    titulo: 'Treinamentos', singular: 'treinamento', colecao: 'treinamentos', largo: true,
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'cursoId', r: 'Curso (catálogo)', t: 'select', obr: true, opc: () => S.cfg.cursos.map((c) => [c.id, `${c.nr ? c.nr + ' – ' : ''}${c.nome}`]) },
      { n: 'titulo', r: 'Título no certificado', total: true, dica: 'Em MAIÚSCULAS, ex.: TREINAMENTO DE FORMAÇÃO DE BRIGADA DE INCÊNDIO' },
      { n: 'data', r: 'Data de realização', t: 'date', obr: true },
      { n: 'cargaHoraria', r: 'Carga horária', dica: 'Ex.: 20 horas' },
      { n: 'local', r: 'Local' },
      { n: 'validadeMeses', r: 'Reciclagem (meses)', t: 'number', dica: 'Em branco = padrão do curso.' },
      { n: 'conteudo', r: 'Conteúdo programático (um item por linha)', t: 'textarea', total: true },
      { n: 'descricao', r: 'Descrição / objetivo (verso do certificado)', t: 'textarea', total: true },
      { n: 'participantesTxt', r: 'Participantes – um por linha: NOME ; CPF', t: 'textarea', total: true, alto: true, dica: 'Pode colar direto da planilha (colunas nome e CPF). Dados pessoais ficam só neste navegador.' },
      { n: 'instrutorNome', r: 'Instrutor (se diferente do padrão)' },
      { n: 'instrutorRegistro', r: 'Registro do instrutor' }
    ],
    paraForm(t) { const o = Object.assign({}, t); o.participantesTxt = (t.participantes || []).map((p) => `${p.nome}${p.cpf ? ' ; ' + p.cpf : ''}`).join('\n'); return o; },
    antesGravar(o) {
      o.participantes = String(o.participantesTxt || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
        const cpf = m ? m[0] : '';
        const nome = (m ? l.replace(m[0], ' ') : l).replace(/[;\t,|]+/g, ' ').replace(/^\s*\d+\s*[.)-]?\s+/, '').replace(/\s+/g, ' ').trim();
        return { nome: nome.toUpperCase(), cpf: cpf ? U.fmtCPF(cpf) : '' };
      }).filter((p) => p.nome);
      delete o.participantesTxt;
      if (o.titulo) o.titulo = o.titulo.toUpperCase();
    },
    validar(o) {
      const ruins = (o.participantes || []).filter((p) => p.cpf && !U.cpfValido(p.cpf));
      const sem = (o.participantes || []).filter((p) => !p.cpf);
      const msgs = [];
      if (ruins.length) msgs.push(`CPF inválido: ${ruins.map((p) => p.nome + ' (' + p.cpf + ')').join(', ')}`);
      if (sem.length) msgs.push(`${sem.length} participante(s) sem CPF.`);
      if (msgs.length) return { aviso: msgs.join('\n') + '\n\nSalvar mesmo assim?' };
    },
    aoMudar(f, campo) {
      const c = S.curso(f.cursoId.value);
      if (campo === 'cursoId' && c.id !== 'outro') {
        f.titulo.value = ('TREINAMENTO DE ' + c.nome).toUpperCase().replace('TREINAMENTO DE TREINAMENTO', 'TREINAMENTO');
        if (!f.cargaHoraria.value || campo === 'cursoId') f.cargaHoraria.value = /^\d+ horas?$/.test(c.ch) ? c.ch : f.cargaHoraria.value;
        const m = NORMAS.conteudos[c.id];
        if (m) { f.conteudo.value = m.itens.join('\n'); f.descricao.value = m.descricao; }
      }
      const venc = f.data.value ? U.somaMeses(f.data.value, f.validadeMeses.value || c.validade) : null;
      f._dica('validadeMeses', `Padrão do curso: ${c.validade ? c.validade + ' meses' : 'sem reciclagem fixa'}${venc ? ' → vence em ' + U.br(venc) : ''}.`);
      const n = String(f.participantesTxt.value || '').split(/\n/).filter((l) => l.trim()).length;
      f._dica('participantesTxt', `${n} participante(s). Pode colar direto da planilha (colunas nome e CPF). Dados pessoais ficam só neste navegador.`);
    },
    colunas: [
      colCliente,
      { r: 'Treinamento', v: (t) => `<b>${e(t.titulo || S.curso(t.cursoId).nome)}</b><div class="sub">${e(S.curso(t.cursoId).nr || '')} · ${e(t.cargaHoraria || '')}</div>`, ord: (t) => t.titulo },
      { r: 'Data', v: (t) => U.br(t.data), ord: (t) => t.data },
      { r: 'Part.', v: (t) => (t.participantes || []).length },
      { r: 'Reciclagem', v: (t) => { const v = R.vencTreinamento(t); return v ? `${U.br(v)}<div>${U.seloSit(U.situacao(v, S.cfg.alertaDias))}</div>` : '<span class="selo neutro">Sem reciclagem fixa</span>'; }, ord: (t) => R.vencTreinamento(t) || '9999' }
    ],
    ordemPadrao: (a, b) => (b.data || '').localeCompare(a.data || ''),
    acoes: (t) => `<button class="btn peq" data-acao="registro" data-id="${t.id}">Lista de presença</button> <button class="btn peq" data-acao="certificados" data-id="${t.id}">Certificados</button>`
  };

  M.pendencias = {
    titulo: 'Pendências e plano de ação', singular: 'pendência', colecao: 'pendencias',
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'categoria', r: 'Tipo', t: 'select', opc: () => NORMAS.tiposPendencia, obr: true },
      { n: 'titulo', r: 'Título', obr: true, total: true, dica: 'Ex.: Revisar inventário de riscos' },
      { n: 'prazo', r: 'Data limite', t: 'date' },
      { n: 'status', r: 'Status', t: 'select', opc: [['aberta', 'Aberta'], ['andamento', 'Em andamento'], ['aguardando', 'Aguardando cliente'], ['concluida', 'Concluída']], padrao: 'aberta' },
      { n: 'etiquetas', r: 'Etiquetas', t: 'tags', opc: () => NORMAS.etiquetas, total: true },
      { n: 'descricao', r: 'Descrição', t: 'textarea', total: true },
      { n: 'conclusao', r: 'Data de conclusão', t: 'date' }
    ],
    antesGravar(o) { if (o.status === 'concluida' && !o.conclusao) o.conclusao = U.iso(new Date()); if (o.status === 'aguardando' && !(o.etiquetas || []).includes('aguardando-cliente')) o.etiquetas = (o.etiquetas || []).concat('aguardando-cliente'); },
    colunas: [
      colCliente,
      { r: 'Pendência', v: (p) => `<b>[${e(p.categoria)}] ${e(p.titulo)}</b><div>${(p.etiquetas || []).map((t) => `<span class="etq ${e(t)}">${e(t)}</span>`).join('')}</div>`, ord: (p) => p.titulo },
      { r: 'Prazo', v: (p) => U.br(p.prazo), ord: (p) => p.prazo || '9999' },
      { r: 'Status', v: (p) => { const m = { aberta: ['neutro', 'Aberta'], andamento: ['info', 'Em andamento'], aguardando: ['alerta', 'Aguardando cliente'], concluida: ['ok', 'Concluída'] }[p.status || 'aberta']; const atras = p.status !== 'concluida' && p.prazo && U.diasAte(p.prazo) < 0; return `<span class="selo ${m[0]}">${m[1]}</span>${atras ? ' <span class="selo vencido">Atrasada</span>' : ''}`; } }
    ],
    ordemPadrao: (a, b) => (a.status === 'concluida') - (b.status === 'concluida') || (a.prazo || '9999').localeCompare(b.prazo || '9999'),
    filtroStatus: [['abertas', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['aguardando', 'Aguardando cliente'], ['concluida', 'Concluídas'], ['', 'Todas']],
    aplicarStatus(p, f) {
      if (!f) return true; if (f === 'abertas') return p.status !== 'concluida';
      if (f === 'atrasadas') return p.status !== 'concluida' && p.prazo && U.diasAte(p.prazo) < 0;
      return p.status === f;
    },
    acoes: (p) => `${p.status !== 'concluida' ? `<button class="btn peq" data-acao="concluir" data-id="${p.id}">Concluir</button> ` : ''}<button class="btn peq" data-acao="issue" data-id="${p.id}" title="Texto da issue no padrão do GitHub SSMA">Issue</button>`
  };

  M.esocial = {
    titulo: 'eSocial – eventos de SST', singular: 'evento', colecao: 'esocial',
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'evento', r: 'Evento', t: 'select', obr: true, opc: () => NORMAS.eventosESocial.map((x) => [x.id, x.nome]) },
      { n: 'referencia', r: 'Referência', dica: 'Matrícula, setor ou nº interno (evite dados de saúde aqui)', obr: true },
      { n: 'dataFato', r: 'Data do fato', t: 'date', obr: true, dica: 'Acidente (S-2210), exame (S-2220) ou início/alteração (S-2240)' },
      { n: 'obito', r: 'Acidente com óbito?', t: 'check' },
      { n: 'prazo', r: 'Prazo (opcional)', t: 'date', dica: 'Em branco = calculado pela regra do evento.' },
      { n: 'status', r: 'Status', t: 'select', opc: [['pendente', 'Pendente'], ['enviado', 'Enviado']], padrao: 'pendente' },
      { n: 'recibo', r: 'Nº do recibo' },
      { n: 'obs', r: 'Observações', t: 'textarea', total: true }
    ],
    aoMudar(f) {
      const ev = NORMAS.eventosESocial.find((x) => x.id === f.evento.value);
      const calc = R.prazoESocial({ evento: f.evento.value, dataFato: f.dataFato.value, obito: f.obito.checked });
      f._dica('prazo', `${ev ? ev.regra : ''}${calc ? ' → ' + U.br(calc) : ''} (feriados não considerados).`);
    },
    colunas: [
      colCliente,
      { r: 'Evento', v: (x) => `<b>${e(x.evento)}</b> ${e(x.referencia || '')}${x.obito ? ' <span class="selo vencido">Óbito</span>' : ''}`, ord: (x) => x.evento },
      { r: 'Data do fato', v: (x) => U.br(x.dataFato), ord: (x) => x.dataFato },
      { r: 'Prazo', v: (x) => U.br(R.prazoESocial(x)), ord: (x) => R.prazoESocial(x) || '' },
      { r: 'Situação', v: (x) => x.status === 'enviado' ? `<span class="selo ok">Enviado</span><div class="sub">${e(x.recibo || '')}</div>` : U.seloSit(U.situacaoPrazo(R.prazoESocial(x), 5)) }
    ],
    ordemPadrao: (a, b) => (a.status === 'enviado') - (b.status === 'enviado') || (R.prazoESocial(a) || '').localeCompare(R.prazoESocial(b) || ''),
    filtroStatus: [['pendente', 'Pendentes'], ['enviado', 'Enviados'], ['', 'Todos']],
    aplicarStatus: (x, f) => !f || (x.status || 'pendente') === f,
    acoes: (x) => x.status !== 'enviado' ? `<button class="btn peq" data-acao="enviado" data-id="${x.id}">Marcar enviado</button>` : ''
  };

  M.cipa = {
    titulo: 'CIPA / Designado (NR-05)', singular: 'mandato', colecao: 'cipa',
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'modalidade', r: 'Modalidade', t: 'select', opc: [['CIPA', 'CIPA constituída'], ['Designado', 'Designado de CIPA']], padrao: 'CIPA' },
      { n: 'gestao', r: 'Gestão', dica: 'Ex.: 2026/2027' },
      { n: 'inicioMandato', r: 'Início do mandato', t: 'date', obr: true },
      { n: 'fimMandato', r: 'Fim do mandato', t: 'date', obr: true, dica: 'Mandato de 1 ano (NR-05).' },
      { n: 'efetivos', r: 'Nº de efetivos (empregados)', t: 'number' },
      { n: 'suplentes', r: 'Nº de suplentes (empregados)', t: 'number' },
      { n: 'presidente', r: 'Presidente (indicado pelo empregador)' },
      { n: 'vice', r: 'Vice-presidente (eleito)' },
      { n: 'designado', r: 'Designado (se aplicável)' },
      { n: 'reunioes', r: 'Calendário de reuniões ordinárias', dica: 'Ex.: toda 2ª terça-feira do mês' },
      { n: 'status', r: 'Status', t: 'select', opc: [['vigente', 'Vigente'], ['encerrado', 'Encerrado']], padrao: 'vigente' },
      { n: 'obs', r: 'Observações', t: 'textarea', total: true }
    ],
    aoMudar(f, campo) {
      if (campo === 'inicioMandato' && f.inicioMandato.value && !f.fimMandato.value) f.fimMandato.value = U.somaDias(U.somaMeses(f.inicioMandato.value, 12), -1);
    },
    colunas: [
      colCliente,
      { r: 'Modalidade', v: (c) => `<b>${e(c.modalidade)}</b> ${e(c.gestao || '')}<div class="sub">${c.modalidade === 'CIPA' ? `${e(c.efetivos || 0)} efetivo(s) / ${e(c.suplentes || 0)} suplente(s)` : e(c.designado || '')}</div>` },
      { r: 'Mandato', v: (c) => `${U.br(c.inicioMandato)} a ${U.br(c.fimMandato)}`, ord: (c) => c.fimMandato },
      { r: 'Próxima etapa', v: (c) => { if (c.status === 'encerrado') return '<span class="selo neutro">Encerrado</span>'; const p = R.cronogramaCIPA(c).find((x) => U.diasAte(x.data) >= 0); return p ? `${e(p.etapa.split(' (')[0])}<div class="sub">${U.br(p.data)} · ${U.seloSit(U.situacaoPrazo(p.data, 30))}</div>` : '<span class="selo vencido">Mandato encerrado – atualizar</span>'; } }
    ],
    ordemPadrao: (a, b) => (a.fimMandato || '').localeCompare(b.fimMandato || ''),
    acoes: (c) => `<button class="btn peq" data-acao="cronograma" data-id="${c.id}">Cronograma eleitoral</button>`
  };

  M.visitas = {
    titulo: 'Visitas técnicas', singular: 'visita', colecao: 'visitas', largo: true,
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'data', r: 'Data', t: 'date', obr: true, padrao: () => U.iso(new Date()) },
      { n: 'horario', r: 'Horário', dica: 'Ex.: 08:00 às 11:30' },
      { n: 'acompanhante', r: 'Acompanhante da empresa' },
      { n: 'setores', r: 'Setores visitados', total: true },
      { n: 'objetivo', r: 'Objetivo', total: true, dica: 'Ex.: Inspeção mensal / levantamento para PGR / entrega de documentos' },
      { n: 'constatacoes', r: 'Constatações', t: 'textarea', total: true, alto: true },
      { n: 'recomendacoes', r: 'Recomendações / ações', t: 'textarea', total: true, alto: true },
      { n: 'prazos', r: 'Prazos acordados', t: 'textarea', total: true },
      { n: 'gerarPendencias', r: 'Criar pendências a partir das recomendações (uma por linha)', t: 'check', soNovo: true }
    ],
    depoisGravar(v, novo) {
      if (novo && v.gerarPendencias) {
        String(v.recomendacoes || '').split(/\n/).map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean).forEach((t) => {
          S.gravar('pendencias', { clienteId: v.clienteId, categoria: 'Visita', titulo: t, status: 'aberta', etiquetas: [], descricao: `Origem: visita técnica de ${U.br(v.data)}.` });
        });
      }
      delete v.gerarPendencias; S.salvar();
    },
    colunas: [
      colCliente,
      { r: 'Data', v: (v) => `${U.br(v.data)}<div class="sub">${e(v.horario || '')}</div>`, ord: (v) => v.data },
      { r: 'Objetivo', v: (v) => `${e(v.objetivo || '')}<div class="sub">${e(v.setores || '')}</div>` },
      { r: 'Acompanhante', v: (v) => e(v.acompanhante || '') }
    ],
    ordemPadrao: (a, b) => (b.data || '').localeCompare(a.data || ''),
    acoes: (v) => `<button class="btn peq" data-acao="relvisita" data-id="${v.id}">Relatório</button>`
  };

  M.auditorias = {
    titulo: 'Auditorias (SGI / ABVTEX / fiscalização)', singular: 'auditoria', colecao: 'auditorias',
    campos: [
      { n: 'clienteId', r: 'Cliente', t: 'cliente', obr: true },
      { n: 'norma', r: 'Norma / tipo', t: 'select', opc: () => NORMAS.normasAuditoria, obr: true },
      { n: 'tipoAud', r: 'Natureza', t: 'select', opc: ['Interna', 'Externa / certificação', 'Manutenção', 'Recertificação', 'Fiscalização'] },
      { n: 'data', r: 'Data da auditoria', t: 'date', obr: true },
      { n: 'auditor', r: 'Auditor / organismo' },
      { n: 'resultado', r: 'Resultado', t: 'select', opc: ['', 'Aprovado', 'Aprovado com ressalvas', 'Reprovado', 'Pendente'] },
      { n: 'ncs', r: 'Nº de não conformidades', t: 'number' },
      { n: 'prazoTratamento', r: 'Prazo para tratar NCs', t: 'date' },
      { n: 'status', r: 'Status', t: 'select', opc: [['planejada', 'Planejada'], ['realizada', 'Realizada – NCs em tratamento'], ['concluida', 'Concluída']], padrao: 'planejada' },
      { n: 'obs', r: 'Não conformidades / observações', t: 'textarea', total: true }
    ],
    colunas: [
      colCliente,
      { r: 'Auditoria', v: (a) => `<b>${e(a.norma)}</b> ${e(a.tipoAud || '')}<div class="sub">${e(a.auditor || '')}</div>`, ord: (a) => a.norma },
      { r: 'Data', v: (a) => U.br(a.data), ord: (a) => a.data },
      { r: 'Resultado', v: (a) => `${e(a.resultado || '—')}${a.ncs ? `<div class="sub">${e(a.ncs)} NC(s) · prazo ${U.br(a.prazoTratamento)}</div>` : ''}` },
      { r: 'Status', v: (a) => ({ planejada: '<span class="selo info">Planejada</span>', realizada: '<span class="selo alerta">NCs em tratamento</span>', concluida: '<span class="selo ok">Concluída</span>' }[a.status || 'planejada']) }
    ],
    ordemPadrao: (a, b) => (b.data || '').localeCompare(a.data || '')
  };

  // ---------- Formulário genérico ----------
  function campoHTML(c, val) {
    const id = 'f_' + c.n; const req = c.obr ? ' required' : '';
    let inp;
    const opcs = typeof c.opc === 'function' ? c.opc(val) : c.opc;
    const norm = (o) => Array.isArray(o) ? o : [o, o];
    switch (c.t) {
      case 'textarea': inp = `<textarea id="${id}" name="${c.n}"${req} style="${c.alto ? 'min-height:150px' : ''}">${e(val || '')}</textarea>`; break;
      case 'select': inp = `<select id="${id}" name="${c.n}"${req}>${opcs.map(norm).map(([v, l]) => `<option value="${e(v)}"${String(val) === String(v) ? ' selected' : ''}>${e(l || '—')}</option>`).join('')}</select>`; break;
      case 'cliente': inp = `<select id="${id}" name="${c.n}"${req}><option value="">Selecione…</option>${opcClientes(val).map(([v, l]) => `<option value="${e(v)}"${val === v ? ' selected' : ''}>${e(l)}</option>`).join('')}</select>`; break;
      case 'tags': inp = `<div class="chk">${opcs.map((o) => `<label><input type="checkbox" name="${c.n}" value="${e(o)}"${(val || []).includes(o) ? ' checked' : ''}> ${e(o)}</label>`).join('')}</div>`; break;
      case 'check': inp = `<div class="chk"><label><input type="checkbox" id="${id}" name="${c.n}"${val ? ' checked' : ''}> Sim</label></div>`; break;
      default: inp = `<input id="${id}" name="${c.n}" type="${c.t || 'text'}" value="${e(val == null ? '' : val)}"${req}>`;
    }
    return `<div class="campo${c.total || c.t === 'textarea' ? ' total' : ''}"><label for="${id}">${e(c.r)}${c.obr ? ' *' : ''}</label>${inp}<div class="dica" data-dica="${c.n}">${e(c.dica || '')}</div></div>`;
  }

  function abrirForm(chave, obj, presets, aoSalvar) {
    const mod = M[chave]; const novo = !obj || !obj.id;
    let dados = obj ? (mod.paraForm ? mod.paraForm(obj) : Object.assign({}, obj)) : {};
    if (novo) mod.campos.forEach((c) => { if (dados[c.n] == null && c.padrao != null) dados[c.n] = typeof c.padrao === 'function' ? c.padrao() : c.padrao; });
    if (presets) dados = Object.assign(dados, presets);
    if (chave === 'clientes' && !novo) dados.ativo = String(obj.ativo !== false);
    const campos = mod.campos.filter((c) => !(c.soNovo && !novo));
    if (!S.clientesAtivos().length && !mod.semCliente) { UI.toast('Cadastre um cliente primeiro.'); location.hash = '#/clientes'; return; }
    UI.modal({
      titulo: `${novo ? 'Novo' : 'Editar'} ${mod.singular}`, largo: mod.largo,
      corpo: `<form class="form" id="frm" autocomplete="off">${campos.map((c) => campoHTML(c, dados[c.n])).join('')}</form>`,
      rodape: `${!novo ? '<button class="btn perigo" data-m="excluir" style="margin-right:auto">Excluir</button>' : ''}<button class="btn" data-m="cancelar">Cancelar</button><button class="btn primario" data-m="salvar">Salvar</button>`,
      aoAbrir(m) {
        const frm = m.querySelector('#frm');
        const f = frm.elements; f._dica = (n, t) => { const d = frm.querySelector(`[data-dica="${n}"]`); if (d) d.textContent = t; };
        const atualizar = (campo) => { try { mod.aoMudar && mod.aoMudar(f, campo); } catch (err) { console.error(err); } };
        frm.addEventListener('change', (ev) => atualizar(ev.target.name));
        frm.addEventListener('input', (ev) => { if (ev.target.tagName === 'TEXTAREA') atualizar(ev.target.name); });
        atualizar(null);
        m.addEventListener('click', (ev) => {
          const a = ev.target.closest('[data-m]'); if (!a) return; ev.preventDefault();
          if (a.dataset.m === 'cancelar') return UI.fechar();
          if (a.dataset.m === 'excluir') {
            if (!confirm(chave === 'clientes' ? 'Excluir este cliente e TODOS os registros dele (documentos, treinamentos, pendências…)?' : `Excluir este ${mod.singular}?`)) return;
            chave === 'clientes' ? S.removerCliente(obj.id) : S.remover(mod.colecao, obj.id);
            UI.fechar(); UI.toast('Excluído.'); chave === 'clientes' ? (location.hash = '#/clientes') : APP.render(); return;
          }
          if (!frm.reportValidity()) return;
          const o = novo ? {} : { id: obj.id };
          campos.forEach((c) => {
            if (c.t === 'tags') o[c.n] = [...frm.querySelectorAll(`[name="${c.n}"]:checked`)].map((x) => x.value);
            else if (c.t === 'check') o[c.n] = f[c.n].checked;
            else o[c.n] = f[c.n].value.trim();
          });
          mod.antesGravar && mod.antesGravar(o);
          const v = mod.validar && mod.validar(o);
          if (typeof v === 'string') return alert(v);
          if (v && v.aviso && !confirm(v.aviso)) return;
          const salvo = S.gravar(mod.colecao, o);
          mod.depoisGravar && mod.depoisGravar(salvo, novo);
          UI.fechar(); UI.toast('Salvo.');
          aoSalvar ? aoSalvar(salvo) : APP.render();
        });
      }
    });
  }

  // ---------- Tabela genérica ----------
  function tabela(chave, itens, opts) {
    const mod = M[chave]; opts = opts || {};
    const cols = mod.colunas.filter((c) => !(opts.semCliente && c === colCliente));
    if (!itens.length) return `<div class="vazio">Nenhum registro.${opts.dicaVazio ? '<br>' + opts.dicaVazio : ''}</div>`;
    return `<div class="tabela-wrap"><table class="tab"><thead><tr>${cols.map((c) => `<th>${e(c.r)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${itens.map((x) => `<tr>${cols.map((c) => `<td>${c.v(x)}</td>`).join('')}<td class="acoes">${mod.acoes ? mod.acoes(x) : ''} <button class="btn peq" data-acao="editar" data-mod="${chave}" data-id="${x.id}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>`;
  }

  window.MOD = { M, abrirForm, tabela, campoHTML };
})();
