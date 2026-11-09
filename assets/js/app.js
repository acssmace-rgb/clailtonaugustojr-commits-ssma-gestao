/* Aplicação: roteamento, telas e ações. */
(function () {
  'use strict';
  const e = U.esc; const M = MOD.M;
  const $ = (s, r) => (r || document).querySelector(s);
  const estado = { filtros: {} };

  // ---------- UI básica ----------
  const UI = {
    modal({ titulo, corpo, rodape, largo, aoAbrir }) {
      UI.fechar();
      const f = document.createElement('div'); f.className = 'modal-fundo'; f.id = 'modal';
      f.innerHTML = `<div class="modal${largo ? ' largo' : ''}" role="dialog" aria-modal="true"><div class="m-cab"><h2>${e(titulo)}</h2><button class="fechar" aria-label="Fechar">×</button></div>
        <div class="m-corpo">${corpo}</div>${rodape ? `<div class="m-rodape">${rodape}</div>` : ''}</div>`;
      document.body.appendChild(f);
      f.querySelector('.fechar').onclick = UI.fechar;
      f.addEventListener('mousedown', (ev) => { if (ev.target === f) UI.fechar(); });
      aoAbrir && aoAbrir(f);
      const pri = f.querySelector('input,select,textarea'); pri && pri.focus();
    },
    fechar() { const m = $('#modal'); m && m.remove(); },
    // Confirmação/entrada dentro da página (o navegador embutido bloqueia confirm/prompt)
    confirmar(msg, o) {
      o = o || {};
      return new Promise((ok) => {
        const f = document.createElement('div'); f.className = 'modal-fundo'; f.style.zIndex = 60;
        f.innerHTML = `<div class="modal" style="max-width:480px" role="alertdialog" aria-modal="true"><div class="m-cab"><h2>${e(o.titulo || 'Confirmação')}</h2></div>
          <div class="m-corpo"><div style="white-space:pre-wrap">${e(msg)}</div>${o.campo ? `<input id="dlgCampo" style="margin-top:12px" value="${e(o.valor || '')}" placeholder="${e(o.campo)}">` : ''}</div>
          <div class="m-rodape">${o.soOk ? '' : '<button class="btn" data-r="n">Cancelar</button>'}<button class="btn ${o.perigo ? 'escuro' : 'primario'}" data-r="s">${e(o.ok || 'OK')}</button></div></div>`;
        document.body.appendChild(f);
        const fim = (v) => { f.remove(); ok(v); };
        f.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (!b) return; ev.stopPropagation(); fim(b.dataset.r === 's' ? (o.campo ? f.querySelector('#dlgCampo').value : true) : null); });
        f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && o.campo) fim(f.querySelector('#dlgCampo').value); if (ev.key === 'Escape') { ev.stopPropagation(); fim(null); } });
        (f.querySelector('#dlgCampo') || f.querySelector('[data-r="s"]')).focus();
      });
    },
    avisar(msg, titulo) { return UI.confirmar(msg, { soOk: true, titulo: titulo || 'Atenção' }); },
    toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
  };
  window.UI = UI;
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !ev.defaultPrevented) UI.fechar(); });

  // ---------- Navegação ----------
  const MENU = [
    ['Gestão', [['painel', '◧', 'Painel'], ['agenda', '◷', 'Vencimentos e prazos'], ['clientes', '▣', 'Clientes'], ['pendencias', '✓', 'Pendências']]],
    ['Programas e documentos', [['documentos', '▤', 'PGR, PCMSO, LTCAT…'], ['psicossocial', '◎', 'Psicossocial NR-01']]],
    ['Operação', [['treinamentos', '✎', 'Treinamentos'], ['cipa', '◈', 'CIPA'], ['esocial', '⇪', 'eSocial SST'], ['visitas', '⌖', 'Visitas técnicas'], ['auditorias', '☑', 'Auditorias SGI/ABVTEX']]],
    ['Sistema', [['config', '⚙', 'Configurações']]]
  ];
  function contadores() {
    const v = R.vencimentos();
    return {
      agenda: v.filter((x) => x.sit.cls === 'vencido').length,
      pendencias: S.lista('pendencias').filter((p) => p.status !== 'concluida' && p.prazo && U.diasAte(p.prazo) < 0).length,
      esocial: S.lista('esocial').filter((x) => x.status !== 'enviado' && U.diasAte(R.prazoESocial(x)) < 0).length
    };
  }
  function menu(rota) {
    const k = contadores();
    $('#menu').innerHTML = MENU.map(([g, itens]) => `<div class="grupo">${g}</div>` + itens.map(([r, i, t]) =>
      `<a href="#${r}" class="${rota === r || (rota === 'cliente' && r === 'clientes') ? 'ativo' : ''}"><span class="ico">${i}</span>${t}${k[r] ? `<span class="cont" title="vencidos/atrasados">${k[r]}</span>` : ''}</a>`).join('')).join('');
    $('#sidebar').classList.remove('aberta');
  }

  function render() {
    const h = location.hash.replace(/^#\/?/, '') || 'painel';
    const [rota, arg] = h.startsWith('cliente-') ? ['cliente', h.slice(8)] : h.startsWith('cliente/') ? ['cliente', h.slice(8)] : [h];
    menu(rota);
    const tela = TELAS[rota] || (M[rota] ? () => telaLista(rota) : TELAS.painel);
    const r = tela(arg) || {};
    $('#titulo').textContent = r.titulo || '';
    $('#acoes-topo').innerHTML = r.acoes || '';
    $('#conteudo').innerHTML = r.html || '';
    r.depois && r.depois();
    window.scrollTo(0, 0);
  }
  window.APP = { render };

  function filtroClienteHTML(chave, valor) {
    return `<select data-filtro="cliente" data-chave="${chave}"><option value="">Todos os clientes</option>${S.clientesAtivos().map((c) => `<option value="${c.id}"${valor === c.id ? ' selected' : ''}>${e(c.fantasia || c.razaoSocial)}</option>`).join('')}</select>`;
  }

  // ---------- Tela de lista genérica ----------
  function telaLista(chave) {
    const mod = M[chave];
    const f = estado.filtros[chave] || (estado.filtros[chave] = { status: mod.filtroStatus ? mod.filtroStatus[0][0] : '' });
    let itens = S.lista(mod.colecao).slice();
    if (f.cliente && !mod.semCliente) itens = itens.filter((x) => x.clienteId === f.cliente);
    if (mod.aplicarStatus) itens = itens.filter((x) => mod.aplicarStatus(x, f.status));
    if (f.busca) { const b = f.busca.toLowerCase(); itens = itens.filter((x) => JSON.stringify(x).toLowerCase().includes(b) || S.nomeCliente(x.clienteId).toLowerCase().includes(b)); }
    if (mod.ordemPadrao) itens.sort(mod.ordemPadrao);
    else if (chave === 'clientes') itens.sort((a, b) => (a.fantasia || a.razaoSocial).localeCompare(b.fantasia || b.razaoSocial, 'pt-BR'));
    const extra = chave === 'esocial' ? `<div class="aviso">${NORMAS.eventosESocial.map((x) => `<b>${x.id}:</b> ${e(x.regra)}`).join('<br>')}<br><span class="mudo">Prazos calculados sem considerar feriados. Não registre diagnósticos/CID aqui — use apenas matrícula ou referência interna.</span></div>` : '';
    return {
      titulo: mod.titulo,
      acoes: `<button class="btn primario" data-acao="novo" data-mod="${chave}">+ Novo ${mod.singular}</button>`,
      html: `${extra}<div class="cartao"><div class="filtros">
          <input type="search" placeholder="Buscar…" data-filtro="busca" data-chave="${chave}" value="${e(f.busca || '')}">
          ${mod.semCliente ? '' : filtroClienteHTML(chave, f.cliente)}
          ${mod.filtroStatus ? `<select data-filtro="status" data-chave="${chave}">${mod.filtroStatus.map(([v, l]) => `<option value="${v}"${f.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` : ''}
          <span class="mudo">${itens.length} registro(s)</span>
          <button class="btn peq" data-acao="csv" data-mod="${chave}" style="margin-left:auto">Exportar CSV</button>
        </div>${MOD.tabela(chave, itens, { dicaVazio: chave === 'clientes' ? 'Comece cadastrando seus clientes, ou carregue dados de exemplo em Configurações.' : '' })}</div>`
    };
  }

  // ---------- Telas especiais ----------
  const TELAS = {};

  TELAS.painel = () => {
    const v = R.vencimentos(); const cfg = S.cfg;
    const venc = v.filter((x) => x.sit.cls === 'vencido');
    const alerta = v.filter((x) => x.sit.cls === 'alerta');
    const pend = S.lista('pendencias').filter((p) => p.status !== 'concluida');
    const atras = pend.filter((p) => p.prazo && U.diasAte(p.prazo) < 0);
    const esoc = S.lista('esocial').filter((x) => x.status !== 'enviado');
    const ativos = S.clientesAtivos();
    const proximos = v.filter((x) => x.sit.cls === 'vencido' || (x.sit.dias != null && x.sit.dias <= cfg.alertaDias)).slice(0, 14);
    const visitasMes = S.lista('visitas').filter((x) => (x.data || '').slice(0, 7) === U.iso(new Date()).slice(0, 7)).length;
    const treinMes = S.lista('treinamentos').filter((x) => (x.data || '').slice(0, 7) === U.iso(new Date()).slice(0, 7));
    const linhasCli = ativos.map((c) => {
      const vc = v.filter((x) => x.clienteId === c.id);
      const nv = vc.filter((x) => x.sit.cls === 'vencido').length; const na = vc.filter((x) => x.sit.cls === 'alerta').length;
      const np = pend.filter((p) => p.clienteId === c.id).length;
      const temPGR = S.lista('documentos').some((d) => d.clienteId === c.id && d.tipo === 'pgr' && d.status !== 'substituido');
      const temPCMSO = S.lista('documentos').some((d) => d.clienteId === c.id && d.tipo === 'pcmso' && d.status !== 'substituido');
      const ps = S.lista('psicossocial').find((p) => p.clienteId === c.id);
      return { c, nv, na, np, temPGR, temPCMSO, ps: ps ? R.statusPsico(ps).pct : null };
    }).sort((a, b) => b.nv - a.nv || b.na - a.na);
    return {
      titulo: 'Painel',
      acoes: `<button class="btn" onclick="location.hash='#agenda'">Ver todos os prazos</button>`,
      html: `
      ${S.lista('clientes').some((c) => c.exemplo) ? `<div class="aviso"><b>Você está vendo dados de exemplo (empresas e pessoas fictícias).</b> <button class="btn peq" data-acao="remexemplo">Remover exemplos</button> e cadastre seus clientes reais.</div>` : ''}
      ${!ativos.length ? `<div class="aviso verde"><b>Bem-vindo ao SSMA Gestão.</b> Cadastre seus clientes em <a href="#clientes">Clientes</a> ou carregue dados de exemplo em <a href="#config">Configurações</a> para conhecer o sistema.</div>` : ''}
      <div class="grade k4" style="margin-bottom:18px">
        <div class="kpi verde" onclick="location.hash='#clientes'"><div class="rot">Clientes ativos</div><div class="val">${ativos.length}</div><div class="sub">${S.lista('clientes').length - ativos.length} inativo(s)</div></div>
        <div class="kpi vermelho" onclick="location.hash='#agenda'"><div class="rot">Vencidos</div><div class="val">${venc.length}</div><div class="sub">documentos, treinamentos e prazos</div></div>
        <div class="kpi ambar" onclick="location.hash='#agenda'"><div class="rot">A vencer</div><div class="val">${alerta.length}</div><div class="sub">próximos ${cfg.alertaDias} dias (docs/trein.)</div></div>
        <div class="kpi azul" onclick="location.hash='#pendencias'"><div class="rot">Pendências abertas</div><div class="val">${pend.length}</div><div class="sub">${atras.length} atrasada(s) · ${pend.filter((p) => p.status === 'aguardando').length} aguardando cliente</div></div>
      </div>
      <div class="grade k2">
        <div class="cartao"><div class="cab"><h2>Próximos vencimentos</h2><div class="dir"><a href="#agenda">ver todos</a></div></div>
          ${tabelaVenc(proximos)}
        </div>
        <div>
          <div class="cartao"><h2>Este mês</h2><div class="faixa-verde"></div>
            <dl class="lista-dl">
              <dt>Visitas técnicas</dt><dd>${visitasMes}</dd>
              <dt>Treinamentos</dt><dd>${treinMes.length} turma(s) · ${treinMes.reduce((s, t) => s + (t.participantes || []).length, 0)} participante(s)</dd>
              <dt>eSocial pendentes</dt><dd>${esoc.length} evento(s)${esoc.filter((x) => U.diasAte(R.prazoESocial(x)) < 0).length ? ` · <span class="selo vencido">${esoc.filter((x) => U.diasAte(R.prazoESocial(x)) < 0).length} fora do prazo</span>` : ''}</dd>
              <dt>Auditorias agendadas</dt><dd>${S.lista('auditorias').filter((a) => a.status === 'planejada' && U.diasAte(a.data) >= 0).length}</dd>
            </dl>
          </div>
          <div class="cartao"><h2>Atalhos</h2><div class="faixa-verde"></div><div class="linha">
            <button class="btn" data-acao="novo" data-mod="visitas">+ Visita</button>
            <button class="btn" data-acao="novo" data-mod="treinamentos">+ Treinamento</button>
            <button class="btn" data-acao="novo" data-mod="documentos">+ Documento</button>
            <button class="btn" data-acao="novo" data-mod="pendencias">+ Pendência</button>
            <button class="btn" data-acao="novo" data-mod="esocial">+ Evento eSocial</button>
          </div></div>
        </div>
      </div>
      <div class="cartao"><div class="cab"><h2>Situação por cliente</h2></div>
        ${linhasCli.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Cliente</th><th>GR</th><th>PGR</th><th>PCMSO</th><th>Psicossocial NR-01</th><th>Vencidos</th><th>A vencer</th><th>Pendências</th></tr></thead><tbody>
        ${linhasCli.map((l) => `<tr><td><span class="semaforo ${l.nv ? 'vencido' : l.na ? 'alerta' : 'ok'}"></span><a href="#cliente-${l.c.id}">${e(l.c.fantasia || l.c.razaoSocial)}</a></td><td>${e(l.c.grauRisco || '—')}</td>
          <td>${l.temPGR ? '✔' : '<span class="selo vencido">Falta</span>'}</td><td>${l.temPCMSO ? '✔' : '<span class="selo vencido">Falta</span>'}</td>
          <td>${l.ps == null ? '<span class="selo alerta">Não iniciado</span>' : `<div class="barra" title="${l.ps}%"><div style="width:${l.ps}%"></div></div><span class="sub">${l.ps}%</span>`}</td>
          <td>${l.nv ? `<b style="color:var(--vermelho)">${l.nv}</b>` : '0'}</td><td>${l.na}</td><td>${l.np}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="vazio">Nenhum cliente ativo.</div>'}
      </div>`
    };
  };

  function tabelaVenc(itens, semCliente) {
    if (!itens.length) return '<div class="vazio">Nada vencido ou a vencer no período. ✔</div>';
    return `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Data</th>${semCliente ? '' : '<th>Cliente</th>'}<th>Tipo</th><th>Item</th><th>Situação</th></tr></thead><tbody>
      ${itens.map((x) => `<tr><td>${U.br(x.venc)}</td>${semCliente ? '' : `<td><a href="#cliente-${x.clienteId}">${e(S.nomeCliente(x.clienteId))}</a></td>`}<td>${e(x.tipo)}</td>
        <td><a href="#" data-acao="editar" data-mod="${x.rota}" data-id="${x.id}">${e(x.titulo)}</a></td><td>${U.seloSit(x.sit)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  TELAS.agenda = () => {
    const f = estado.filtros.agenda || (estado.filtros.agenda = { status: 'atencao', tipo: '' });
    let v = R.vencimentos(f.cliente || null);
    if (f.tipo) v = v.filter((x) => x.tipo === f.tipo);
    if (f.status === 'atencao') v = v.filter((x) => ['vencido', 'alerta'].includes(x.sit.cls) || (x.sit.cls === 'info' && x.sit.dias != null && x.sit.dias <= S.cfg.alertaDias));
    else if (f.status) v = v.filter((x) => x.sit.cls === f.status);
    return {
      titulo: 'Vencimentos e prazos',
      acoes: `<button class="btn" data-acao="csvagenda">Exportar CSV</button>`,
      html: `<div class="cartao"><div class="filtros">
        ${filtroClienteHTML('agenda', f.cliente)}
        <select data-filtro="tipo" data-chave="agenda"><option value="">Todos os tipos</option>${['Documento', 'Treinamento', 'Pendência', 'eSocial', 'CIPA', 'Auditoria'].map((t) => `<option${f.tipo === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <select data-filtro="status" data-chave="agenda">${[['atencao', 'Requer atenção'], ['vencido', 'Vencidos'], ['alerta', 'A vencer'], ['ok', 'Em dia'], ['', 'Todos']].map(([a, b]) => `<option value="${a}"${f.status === a ? ' selected' : ''}>${b}</option>`).join('')}</select>
        <span class="mudo">${v.length} item(ns) · alerta configurado: ${S.cfg.alertaDias} dias</span></div>
        ${tabelaVenc(v)}</div>`
    };
  };

  TELAS.clientes = () => telaLista('clientes');

  TELAS.cliente = (id) => {
    const c = S.cliente(id);
    if (!c) return { titulo: 'Cliente não encontrado', html: '<div class="cartao">Cliente não encontrado. <a href="#clientes">Voltar</a></div>' };
    const aba = estado.abaCliente || 'resumo';
    const abas = [['resumo', 'Resumo'], ['documentos', 'Documentos'], ['treinamentos', 'Treinamentos'], ['pendencias', 'Pendências'], ['cipa', 'CIPA'], ['esocial', 'eSocial'], ['visitas', 'Visitas'], ['auditorias', 'Auditorias']];
    let corpo;
    if (aba === 'resumo') {
      const v = R.vencimentos(id);
      const ps = S.lista('psicossocial').find((p) => p.clienteId === id);
      corpo = `<div class="grade k2"><div><h3>Dados cadastrais</h3><dl class="lista-dl">
          <dt>Razão social</dt><dd>${e(c.razaoSocial)}</dd><dt>CNPJ</dt><dd>${e(c.cnpj || '—')}</dd>
          <dt>CNAE / GR</dt><dd>${e(c.cnae || '—')} / Grau ${e(c.grauRisco || '—')}</dd><dt>Empregados</dt><dd>${e(c.empregados || '—')}</dd>
          <dt>Unidade</dt><dd>${e(c.unidade || '—')}</dd><dt>Endereço</dt><dd>${e(c.endereco || '—')}</dd>
          <dt>Contato DP/RH</dt><dd>${e(c.contatoNome || '—')}<br><span class="mudo">${e(c.contatoEmail || '')} ${e(c.contatoFone || '')}</span></dd>
          <dt>Serviços</dt><dd>${(c.servicos || []).map((s) => `<span class="etq">${e(s)}</span>`).join('') || '—'}</dd>
          <dt>Repositório</dt><dd><code>${e(c.repositorio || '')}</code></dd>
          ${c.obs ? `<dt>Observações</dt><dd style="white-space:pre-wrap">${e(c.obs)}</dd>` : ''}</dl></div>
        <div><h3>Psicossocial NR-01</h3>${ps ? `<div class="barra"><div style="width:${R.statusPsico(ps).pct}%"></div></div><p class="mudo">${R.statusPsico(ps).ok} de ${R.statusPsico(ps).tot} etapas concluídas. <a href="#" data-acao="psico" data-id="${id}">Abrir checklist</a></p>` : `<p><span class="selo alerta">Não iniciado</span> <a href="#" data-acao="psico" data-id="${id}">Iniciar checklist</a></p>`}
        <h3 style="margin-top:18px">Prazos e vencimentos</h3>${tabelaVenc(v, true)}</div></div>`;
    } else {
      const mod = M[aba];
      const itens = S.lista(mod.colecao).filter((x) => x.clienteId === id).sort(mod.ordemPadrao || (() => 0));
      corpo = `<div class="linha" style="margin-bottom:12px"><button class="btn primario" data-acao="novo" data-mod="${aba}" data-cliente="${id}">+ Novo ${mod.singular}</button></div>${MOD.tabela(aba, itens, { semCliente: true })}`;
    }
    return {
      titulo: c.fantasia || c.razaoSocial,
      acoes: `<button class="btn" data-acao="situacao" data-id="${id}">Relatório de situação</button><button class="btn" data-acao="readme" data-id="${id}">README GitHub</button><button class="btn escuro" data-acao="editar" data-mod="clientes" data-id="${id}">Editar cliente</button>`,
      html: `<div class="cartao"><div class="abas">${abas.map(([k, l]) => `<button data-aba="${k}" class="${aba === k ? 'ativo' : ''}">${l}</button>`).join('')}</div>${corpo}</div>`,
      depois() { document.querySelectorAll('[data-aba]').forEach((b) => { b.onclick = () => { estado.abaCliente = b.dataset.aba; render(); }; }); }
    };
  };

  TELAS.psicossocial = () => {
    const linhas = S.clientesAtivos().map((c) => ({ c, p: S.lista('psicossocial').find((x) => x.clienteId === c.id) }));
    return {
      titulo: 'Riscos psicossociais – NR-01 (GRO/PGR)',
      html: `<div class="aviso">A NR-01 exige que os fatores de risco psicossociais relacionados ao trabalho sejam identificados, avaliados e controlados no GRO e registrados no inventário de riscos do PGR. Use o checklist para acompanhar cada cliente.</div>
      <div class="cartao">${linhas.length ? `<div class="tabela-wrap"><table class="tab"><thead><tr><th>Cliente</th><th>Metodologia</th><th>Progresso</th><th>Última atualização</th><th></th></tr></thead><tbody>
      ${linhas.map(({ c, p }) => { const st = p ? R.statusPsico(p) : null; return `<tr><td><a href="#cliente-${c.id}">${e(c.fantasia || c.razaoSocial)}</a></td><td>${e((p && p.metodologia) || '—')}</td>
        <td style="min-width:180px">${st ? `<div class="barra"><div style="width:${st.pct}%"></div></div><span class="sub">${st.ok}/${st.tot} etapas</span>` : '<span class="selo alerta">Não iniciado</span>'}</td>
        <td>${p ? U.br((p.atualizadoEm || '').slice(0, 10)) : '—'}</td><td class="acoes"><button class="btn peq" data-acao="psico" data-id="${c.id}">Checklist</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhum cliente ativo.</div>'}</div>`
    };
  };

  function abrirPsico(cid) {
    let p = S.lista('psicossocial').find((x) => x.clienteId === cid) || { clienteId: cid, etapas: [], metodologia: '', obs: '' };
    UI.modal({
      titulo: `Psicossocial NR-01 – ${S.nomeCliente(cid)}`, largo: true,
      corpo: `<div class="form" style="margin-bottom:14px"><div class="campo"><label>Metodologia / instrumento</label><input id="ps_met" value="${e(p.metodologia || '')}" placeholder="Ex.: COPSOQ II, HSE-IT, entrevistas"></div>
        <div class="campo"><label>Reavaliação prevista</label><input type="date" id="ps_reav" value="${e(p.reavaliacao || '')}"></div></div>
        <ul class="checklist">${NORMAS.etapasPsicossocial.map((t, i) => { const et = (p.etapas || [])[i] || {}; return `<li><input type="checkbox" data-i="${i}" ${et.feito ? 'checked' : ''}><div class="txt">${i + 1}. ${e(t)}<input data-obs="${i}" placeholder="Observação / evidência" value="${e(et.obs || '')}" style="margin-top:4px"></div><input type="date" data-dt="${i}" value="${e(et.data || '')}"></li>`; }).join('')}</ul>
        <div class="form" style="margin-top:12px"><div class="campo total"><label>Observações gerais</label><textarea id="ps_obs">${e(p.obs || '')}</textarea></div></div>`,
      rodape: `<button class="btn" data-m="pend" style="margin-right:auto">Criar pendências das etapas abertas</button><button class="btn" data-m="x">Cancelar</button><button class="btn primario" data-m="ok">Salvar</button>`,
      aoAbrir(m) {
        m.querySelectorAll('[data-i]').forEach((cb) => cb.onchange = () => { const d = m.querySelector(`[data-dt="${cb.dataset.i}"]`); if (cb.checked && !d.value) d.value = U.iso(new Date()); });
        const coletar = () => {
          p.metodologia = $('#ps_met', m).value; p.reavaliacao = $('#ps_reav', m).value; p.obs = $('#ps_obs', m).value;
          p.etapas = NORMAS.etapasPsicossocial.map((_, i) => ({ feito: m.querySelector(`[data-i="${i}"]`).checked, data: m.querySelector(`[data-dt="${i}"]`).value, obs: m.querySelector(`[data-obs="${i}"]`).value }));
        };
        m.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-m]'); if (!b) return;
          if (b.dataset.m === 'x') return UI.fechar();
          coletar(); p = S.gravar('psicossocial', p);
          if (b.dataset.m === 'pend') {
            let n = 0;
            NORMAS.etapasPsicossocial.forEach((t, i) => {
              if (p.etapas[i].feito) return;
              const tit = t.split(' (')[0];
              if (S.lista('pendencias').some((x) => x.clienteId === cid && x.categoria === 'Psicossocial' && x.titulo === tit && x.status !== 'concluida')) return;
              S.gravar('pendencias', { clienteId: cid, categoria: 'Psicossocial', titulo: tit, status: 'aberta', etiquetas: ['NR-01'] }); n++;
            });
            UI.toast(`${n} pendência(s) criada(s).`);
          } else UI.toast('Salvo.');
          UI.fechar(); render();
        });
      }
    });
  }

  TELAS.config = () => {
    const c = S.cfg;
    const linhaTipo = (t, k) => `<tr><td><b>${e(t.sigla || t.nr || '')}</b></td><td>${e(t.nome)}</td><td style="width:120px"><input type="number" min="0" data-val="${k}" data-id="${t.id}" value="${t.validade == null ? '' : t.validade}" placeholder="—"></td></tr>`;
    return {
      titulo: 'Configurações',
      html: `
      <div class="grade k2">
        <div class="cartao"><h2>Dados da SSMA</h2><div class="faixa-verde"></div><form class="form" id="cfgEmp">
          ${[['nome', 'Razão social'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['emails', 'E-mails'], ['telefone', 'Telefone'], ['cidade', 'Cidade (certificados)']].map(([k, l]) => `<div class="campo${k === 'endereco' || k === 'nome' ? ' total' : ''}"><label>${l}</label><input name="${k}" value="${e(c.empresa[k] || '')}"></div>`).join('')}
        </form></div>
        <div class="cartao"><h2>Instrutor / responsável técnico padrão</h2><div class="faixa-verde"></div><form class="form" id="cfgInst">
          ${[['nome', 'Nome'], ['formacao', 'Formação'], ['registro', 'Registro profissional'], ['cbo', 'CBO']].map(([k, l]) => `<div class="campo${k === 'nome' ? ' total' : ''}"><label>${l}</label><input name="${k}" value="${e(c.instrutor[k] || '')}"></div>`).join('')}
          <div class="campo"><label>Alerta de vencimento (dias)</label><input type="number" min="1" name="alertaDias" value="${c.alertaDias}"></div>
        </form></div>
      </div>
      <div class="grade k2">
        <div class="cartao"><h2>Logo oficial e assinatura</h2><div class="faixa-verde"></div>
          <p class="mudo">Ficam salvos <b>somente neste navegador</b> (não vão para o GitHub). Usados no cabeçalho dos documentos e certificados.</p>
          <div class="linha" style="margin-bottom:10px"><img src="${c.logo || 'assets/img/logo-ssma.svg'}" style="height:48px;background:#fff;border:1px solid #ddd;padding:4px;border-radius:6px">
            <label class="btn">Carregar logo<input type="file" accept="image/*" data-img="logo" hidden></label>${c.logo ? '<button class="btn peq perigo" data-acao="limparimg" data-k="logo">Remover</button>' : ''}</div>
          <div class="linha">${c.assinatura ? `<img src="${c.assinatura}" style="height:48px;border:1px solid #ddd;padding:4px;border-radius:6px">` : '<span class="mudo">Sem assinatura digitalizada</span>'}
            <label class="btn">Carregar assinatura<input type="file" accept="image/*" data-img="assinatura" hidden></label>${c.assinatura ? '<button class="btn peq perigo" data-acao="limparimg" data-k="assinatura">Remover</button>' : ''}</div>
        </div>
        <div class="cartao"><h2>Backup e dados</h2><div class="faixa-verde"></div>
          <p class="mudo">Os dados ficam no armazenamento local deste navegador. Faça backup com frequência e guarde o arquivo em local seguro (Drive da SSMA) — <b>nunca</b> em repositório público.</p>
          <div class="linha"><button class="btn primario" data-acao="backup">Baixar backup (.json)</button>
          <label class="btn">Restaurar backup<input type="file" accept=".json,application/json" id="restaurar" hidden></label><button class="btn" data-acao="colarbackup">Colar backup</button></div>
          <div class="linha" style="margin-top:12px"><button class="btn" data-acao="exemplo">Carregar dados de exemplo</button><button class="btn perigo" data-acao="zerar">Apagar todos os dados</button></div>
          <p class="mudo" style="margin-top:10px">${S.lista('clientes').length} clientes · ${S.lista('documentos').length} documentos · ${S.lista('treinamentos').length} treinamentos · ${S.lista('pendencias').length} pendências · uso aprox. ${Math.round((localStorage.getItem('ssma-gestao-v1') || '').length / 1024)} KB</p>
        </div>
      </div>
      <div class="grade k2">
        <div class="cartao"><h2>Validade padrão dos documentos (meses)</h2><div class="faixa-verde"></div><p class="mudo">Em branco = sem periodicidade fixa. Valores sugeridos — ajuste conforme a norma e o contrato.</p>
          <div class="tabela-wrap"><table class="tab"><thead><tr><th>Sigla</th><th>Documento</th><th>Meses</th></tr></thead><tbody>${c.tiposDocumento.map((t) => linhaTipo(t, 'tiposDocumento')).join('')}</tbody></table></div></div>
        <div class="cartao"><h2>Reciclagem dos treinamentos (meses)</h2><div class="faixa-verde"></div><p class="mudo">Em branco = sem reciclagem periódica fixa.</p>
          <div class="tabela-wrap"><table class="tab"><thead><tr><th>NR</th><th>Curso</th><th>Meses</th></tr></thead><tbody>${c.cursos.map((t) => linhaTipo(t, 'cursos')).join('')}</tbody></table></div></div>
      </div>`,
      depois() {
        const salvarForm = (id, alvo) => $(id).addEventListener('change', (ev) => {
          if (ev.target.name === 'alertaDias') c.alertaDias = Math.max(1, +ev.target.value || 60); else alvo[ev.target.name] = ev.target.value;
          S.salvar(); UI.toast('Configuração salva.');
        });
        salvarForm('#cfgEmp', c.empresa); salvarForm('#cfgInst', c.instrutor);
        document.querySelectorAll('[data-val]').forEach((i) => i.onchange = () => {
          const t = c[i.dataset.val].find((x) => x.id === i.dataset.id); t.validade = i.value === '' ? null : +i.value; S.salvar(); UI.toast('Validade atualizada.');
        });
        document.querySelectorAll('[data-img]').forEach((i) => i.onchange = () => {
          const f = i.files[0]; if (!f) return; if (f.size > 600 * 1024) return UI.avisar('Imagem muito grande (máx. 600 KB). Reduza antes de carregar.');
          const r = new FileReader(); r.onload = () => { c[i.dataset.img] = r.result; S.salvar(); render(); }; r.readAsDataURL(f);
        });
        $('#restaurar').onchange = (ev) => {
          const f = ev.target.files[0]; if (!f) return;
          const r = new FileReader(); r.onload = () => restaurar(r.result); r.readAsText(f);
        };
      }
    };
  };

  async function restaurar(txt) {
    if (!await UI.confirmar('Restaurar este backup vai SUBSTITUIR todos os dados atuais. Continuar?', { ok: 'Restaurar', perigo: true })) return;
    try { S.importar(txt); UI.fechar(); UI.toast('Backup restaurado.'); render(); } catch (err) { UI.avisar(err.message); }
  }

  // ---------- Ações (delegação global) ----------
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]'); if (!b) return;
    const a = b.dataset.acao; const id = b.dataset.id; ev.preventDefault();
    const acoes = {
      novo: () => MOD.abrirForm(b.dataset.mod, null, b.dataset.cliente ? { clienteId: b.dataset.cliente } : (estado.filtros[b.dataset.mod] && estado.filtros[b.dataset.mod].cliente ? { clienteId: estado.filtros[b.dataset.mod].cliente } : null)),
      editar: () => { const mod = M[b.dataset.mod]; const o = S.obter(mod.colecao, id); if (o) MOD.abrirForm(b.dataset.mod, o); },
      renovar: () => {
        const d = S.obter('documentos', id);
        MOD.abrirForm('documentos', null, { clienteId: d.clienteId, tipo: d.tipo, responsavel: d.responsavel, descricao: '', emissao: U.iso(new Date()) }, () => { d.status = 'substituido'; S.gravar('documentos', d); render(); });
      },
      registro: () => IMP.registro(S.obter('treinamentos', id)),
      certificados: () => IMP.certificados(S.obter('treinamentos', id)),
      relvisita: () => IMP.relatorioVisita(S.obter('visitas', id)),
      situacao: () => IMP.situacaoCliente(id),
      concluir: () => { const p = S.obter('pendencias', id); p.status = 'concluida'; p.conclusao = U.iso(new Date()); S.gravar('pendencias', p); UI.toast('Pendência concluída.'); render(); },
      enviado: async () => { const x = S.obter('esocial', id); const rec = await UI.confirmar('Informe o nº do recibo do eSocial (opcional):', { titulo: 'Marcar como enviado', campo: 'Nº do recibo', valor: x.recibo || '', ok: 'Marcar enviado' }); if (rec === null) return; x.status = 'enviado'; x.recibo = rec; x.envio = U.iso(new Date()); S.gravar('esocial', x); render(); },
      psico: () => abrirPsico(id),
      cronograma: () => {
        const c = S.obter('cipa', id);
        UI.modal({ titulo: `Cronograma eleitoral – ${S.nomeCliente(c.clienteId)}`, corpo: `<div class="aviso">Cronograma sugerido a partir do fim do mandato, com os prazos mínimos da NR-05. Confira a norma e o calendário da empresa.</div>
          <table class="tab"><thead><tr><th>Etapa</th><th>Data</th><th>Situação</th></tr></thead><tbody>${R.cronogramaCIPA(c).map((x) => `<tr><td>${e(x.etapa)}</td><td>${U.br(x.data)}${x.ate ? ' a ' + U.br(x.ate) : ''}</td><td>${U.diasAte(x.data) < 0 ? '<span class="selo neutro">Passou</span>' : U.seloSit(U.situacaoPrazo(x.data, 30))}</td></tr>`).join('')}</tbody></table>`,
          rodape: `<button class="btn" data-m="pend">Criar pendências do cronograma</button><button class="btn primario" onclick="UI.fechar()">Fechar</button>`,
          aoAbrir(m) { m.querySelector('[data-m="pend"]').onclick = () => { R.cronogramaCIPA(c).filter((x) => U.diasAte(x.data) >= 0 && !/Fim do mandato/.test(x.etapa)).forEach((x) => S.gravar('pendencias', { clienteId: c.clienteId, categoria: 'CIPA', titulo: x.etapa.split(' (')[0], prazo: x.data, status: 'aberta', etiquetas: ['prazo'] })); UI.fechar(); UI.toast('Pendências criadas.'); render(); }; } });
      },
      issue: () => {
        const p = S.obter('pendencias', id); const i = IMP.issuePendencia(p); const c = S.cliente(p.clienteId) || {};
        const cmd = `gh issue create --repo <usuario>/${c.repositorio || 'cliente-' + U.slug(c.fantasia || c.razaoSocial)} --title "${i.titulo.replace(/"/g, '\\"')}" --body "${i.corpo.replace(/"/g, '\\"')}"${i.etiquetas ? ` --label "${i.etiquetas}"` : ''}`;
        UI.modal({ titulo: 'Issue no padrão SSMA', corpo: `<p><b>Título:</b> ${e(i.titulo)}</p><p><b>Etiquetas:</b> ${e(i.etiquetas || '—')}</p><pre class="codigo">${e(i.corpo)}</pre><p class="mudo">Comando para o GitHub CLI (troque &lt;usuario&gt;):</p><pre class="codigo">${e(cmd)}</pre>`,
          rodape: `<button class="btn" id="cpT">Copiar título</button><button class="btn" id="cpB">Copiar corpo</button><button class="btn primario" id="cpC">Copiar comando</button>`,
          aoAbrir(m) { [['#cpT', i.titulo], ['#cpB', i.corpo], ['#cpC', cmd]].forEach(([s, t]) => { m.querySelector(s).onclick = async () => UI.toast(await U.copiar(t) ? 'Copiado.' : 'Não foi possível copiar.'); }); } });
      },
      readme: () => {
        const md = IMP.readmeCliente(id); const c = S.cliente(id);
        UI.modal({ titulo: 'README.md do repositório do cliente', largo: true, corpo: `<p class="mudo">Conteúdo no padrão SSMA para o repositório <b>privado</b> <code>${e(c.repositorio || '')}</code>.</p><pre class="codigo">${e(md)}</pre>`,
          rodape: `<button class="btn" id="cpMd">Copiar</button><button class="btn primario" id="dlMd">Baixar README.md</button>`,
          aoAbrir(m) { m.querySelector('#cpMd').onclick = async () => UI.toast(await U.copiar(md) ? 'Copiado.' : 'Não foi possível copiar.'); m.querySelector('#dlMd').onclick = () => U.baixar('README.md', md, 'text/markdown;charset=utf-8'); } });
      },
      csv: () => {
        const mod = M[b.dataset.mod]; const itens = S.lista(mod.colecao);
        const tmp = document.createElement('div');
        const txt = (h) => { tmp.innerHTML = h; return tmp.textContent.trim(); };
        U.baixar(`${b.dataset.mod}_${U.iso(new Date())}.csv`, U.csv([mod.colunas.map((c) => c.r), ...itens.map((x) => mod.colunas.map((c) => txt(String(c.v(x)))))]), 'text/csv;charset=utf-8');
      },
      csvagenda: () => U.baixar(`vencimentos_${U.iso(new Date())}.csv`, U.csv([['Data', 'Cliente', 'Tipo', 'Item', 'Situação'], ...R.vencimentos().map((x) => [U.br(x.venc), S.nomeCliente(x.clienteId), x.tipo, x.titulo, x.sit.txt])]), 'text/csv;charset=utf-8'),
      backup: () => {
        const js = S.exportar(); const nome = `ssma-gestao-backup_${U.iso(new Date())}.json`;
        UI.modal({ titulo: 'Backup dos dados', corpo: `<p class="mudo">Baixe o arquivo e guarde no Drive da SSMA. Se o download não começar (visualização incorporada), copie o texto abaixo e salve como <code>${nome}</code>.</p><textarea id="bkTxt" readonly style="min-height:220px;font-family:monospace;font-size:.75rem">${e(js)}</textarea>`,
          rodape: `<button class="btn" id="bkCp">Copiar</button><button class="btn primario" id="bkDl">Baixar arquivo</button>`,
          aoAbrir(m) { m.querySelector('#bkDl').onclick = () => U.baixar(nome, js, 'application/json'); m.querySelector('#bkCp').onclick = async () => { if (await U.copiar(js)) UI.toast('Copiado.'); else { const t = m.querySelector('#bkTxt'); t.focus(); t.select(); UI.toast('Use Ctrl+C para copiar.'); } }; } });
      },
      colarbackup: () => UI.modal({ titulo: 'Restaurar backup colado', corpo: '<p class="mudo">Cole aqui o conteúdo do arquivo de backup (.json).</p><textarea id="bkCola" style="min-height:220px;font-family:monospace;font-size:.75rem"></textarea>',
        rodape: '<button class="btn primario" id="bkOk">Restaurar</button>', aoAbrir(m) { m.querySelector('#bkOk').onclick = () => restaurar(m.querySelector('#bkCola').value); } }),
      remexemplo: async () => { if (!await UI.confirmar('Remover todos os dados de exemplo (fictícios)? Seus cadastros reais não são afetados.', { ok: 'Remover exemplos' })) return; S.removerExemplos(); UI.toast('Exemplos removidos.'); render(); },
      limparimg: () => { S.cfg[b.dataset.k] = null; S.salvar(); render(); },
      exemplo: async () => { if (S.lista('clientes').length && !await UI.confirmar('Já existem dados. Adicionar os dados de exemplo mesmo assim?')) return; window.carregarExemplo(); UI.toast('Dados de exemplo carregados.'); location.hash = '#painel'; render(); },
      zerar: async () => { const r = await UI.confirmar('Isto apaga TODOS os dados deste navegador. Digite APAGAR para confirmar.', { titulo: 'Apagar todos os dados', campo: 'APAGAR', ok: 'Apagar', perigo: true }); if (r === 'APAGAR') { S.zerar(); UI.toast('Dados apagados.'); render(); } }
    };
    acoes[a] && acoes[a]();
  });

  // Filtros
  document.addEventListener('input', (ev) => {
    const t = ev.target; if (!t.dataset || !t.dataset.filtro) return;
    const f = estado.filtros[t.dataset.chave] || (estado.filtros[t.dataset.chave] = {});
    f[t.dataset.filtro] = t.value;
    if (t.dataset.filtro === 'busca') { clearTimeout(estado._t); estado._t = setTimeout(() => { render(); const i = document.querySelector('[data-filtro="busca"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); }
    else render();
  });

  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#cliente')) estado.abaCliente = 'resumo'; render(); });
  document.addEventListener('DOMContentLoaded', () => {
    $('#btnMenu').onclick = () => $('#sidebar').classList.toggle('aberta');
    $('#ano').textContent = new Date().getFullYear();
    if (window.SSMA_DEMO_AUTO && !S.lista('clientes').length && !S.cfg._demoVisto) { window.carregarExemplo(); S.cfg._demoVisto = true; S.salvar(); }
    render();
  });
})();
