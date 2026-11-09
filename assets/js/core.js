/* Núcleo: utilitários, armazenamento local e regras de vencimento. */
(function () {
  'use strict';

  // ---------- Utilitários ----------
  const U = {};
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  U.iso = (d) => { if (!d) return ''; const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
  U.parse = (s) => { if (!s) return null; const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); if (!a) return null; return new Date(a, m - 1, d); };
  U.br = (s) => { const d = U.parse(s); return d ? d.toLocaleDateString('pt-BR') : '—'; };
  U.meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  U.extenso = (s) => { const d = U.parse(s); return d ? `${d.getDate()} de ${U.meses[d.getMonth()]} de ${d.getFullYear()}` : ''; };
  U.somaMeses = (s, m) => {
    const d = U.parse(s); if (!d || m == null || m === '') return null;
    const dia = d.getDate(); const r = new Date(d.getFullYear(), d.getMonth() + Number(m), 1);
    const ult = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(dia, ult)); return U.iso(r);
  };
  U.somaDias = (s, n) => { const d = U.parse(s); if (!d) return null; d.setDate(d.getDate() + n); return U.iso(d); };
  U.diasAte = (s) => { const d = U.parse(s); if (!d) return null; return Math.round((d - U.hoje()) / 86400000); };
  U.proxDiaUtil = (s) => { const d = U.parse(s); if (!d) return null; do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); return U.iso(d); };
  U.dia15MesSeguinte = (s) => { const d = U.parse(s); if (!d) return null; return U.iso(new Date(d.getFullYear(), d.getMonth() + 1, 15)); };
  U.slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|sa)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  U.soDigitos = (s) => String(s || '').replace(/\D/g, '');
  U.fmtCNPJ = (s) => { const d = U.soDigitos(s); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : s; };
  U.fmtCPF = (s) => { const d = U.soDigitos(s); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : s; };
  U.cpfValido = (s) => {
    const c = U.soDigitos(s); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    let t = 0; for (let i = 0; i < 9; i++) t += c[i] * (10 - i); let r = (t * 10) % 11 % 10; if (r !== +c[9]) return false;
    t = 0; for (let i = 0; i < 10; i++) t += c[i] * (11 - i); r = (t * 10) % 11 % 10; return r === +c[10];
  };
  U.cnpjValido = (s) => {
    const c = U.soDigitos(s); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = (n) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let t = 0; for (let i = 0; i < n; i++) t += c[i] * p[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === +c[12] && calc(13) === +c[13];
  };
  U.baixar = (nome, conteudo, tipo) => {
    const blob = new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.csv = (linhas) => '﻿' + linhas.map((l) => l.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  U.copiar = async (txt) => { try { await navigator.clipboard.writeText(txt); return true; } catch (e) { return false; } };

  // ---------- Situação de vencimento ----------
  // Retorna {cls: ok|alerta|vencido|neutro, txt, dias}
  U.situacao = (vencimento, alertaDias) => {
    if (!vencimento) return { cls: 'neutro', txt: 'Sem vencimento', dias: null };
    const dias = U.diasAte(vencimento);
    if (dias < 0) return { cls: 'vencido', txt: `Vencido há ${-dias} d`, dias };
    if (dias <= (alertaDias || 60)) return { cls: 'alerta', txt: dias === 0 ? 'Vence hoje' : `Vence em ${dias} d`, dias };
    return { cls: 'ok', txt: 'Vigente', dias };
  };
  // Para prazos (pendências, eSocial, CIPA): mostra "Em N d" em vez de "Vigente"
  U.situacaoPrazo = (data, alertaDias) => { const s = U.situacao(data, alertaDias); if (s.cls === 'ok') s.txt = `Em ${s.dias} d`; return s; };
  U.seloSit = (s) => `<span class="selo ${s.cls}">${U.esc(s.txt)}</span>`;

  // ---------- Armazenamento ----------
  const CHAVE = 'ssma-gestao-v1';
  const COLECOES = ['clientes', 'documentos', 'treinamentos', 'pendencias', 'esocial', 'cipa', 'visitas', 'auditorias', 'psicossocial'];

  function configPadrao() {
    return {
      alertaDias: 60,
      empresa: {
        nome: 'SSMA Assessoria e Consultoria em Segurança do Trabalho',
        cnpj: '27.774.241/0001-44',
        endereco: 'Av. Sargento Hermínio Sampaio, 3100, Sala 1220 – Presidente Kennedy – Fortaleza/CE – CEP 60.355-512',
        emails: 'comercial@acssma.com / clailton.lima@acssma.com',
        telefone: '(85) 98714-1207',
        cidade: 'Fortaleza/CE'
      },
      instrutor: {
        nome: 'Clailton Augusto Sousa de Lima Junior',
        formacao: 'Técnico em Segurança do Trabalho',
        registro: 'MTE-CE nº 0003480',
        cbo: 'CBO 351605'
      },
      logo: null,        // dataURL opcional (logo oficial)
      assinatura: null,  // dataURL opcional (fica só neste navegador)
      tiposDocumento: JSON.parse(JSON.stringify(NORMAS.tiposDocumento)),
      cursos: JSON.parse(JSON.stringify(NORMAS.cursos))
    };
  }

  function vazio() { const o = { versao: 1, config: configPadrao() }; COLECOES.forEach((c) => { o[c] = []; }); return o; }

  let DB;
  function carregar() {
    try { DB = JSON.parse(localStorage.getItem(CHAVE)) || vazio(); } catch (e) { DB = vazio(); }
    const p = configPadrao();
    DB.config = Object.assign(p, DB.config || {});
    DB.config.empresa = Object.assign(p.empresa, DB.config.empresa || {});
    DB.config.instrutor = Object.assign(configPadrao().instrutor, DB.config.instrutor || {});
    // acrescenta tipos/cursos novos do catálogo sem sobrescrever os ajustes do usuário
    ['tiposDocumento', 'cursos'].forEach((k) => {
      const ids = new Set(DB.config[k].map((x) => x.id));
      NORMAS[k].forEach((x) => { if (!ids.has(x.id)) DB.config[k].push(JSON.parse(JSON.stringify(x))); });
    });
    COLECOES.forEach((c) => { if (!Array.isArray(DB[c])) DB[c] = []; });
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(DB)); DB.config._ultimoSalvo = new Date().toISOString(); }
    catch (e) { alert('Não foi possível salvar: o armazenamento do navegador está cheio. Faça um backup e remova imagens grandes (logo/assinatura).'); }
  }

  const S = {
    get db() { return DB; },
    get cfg() { return DB.config; },
    COLECOES,
    lista: (c) => DB[c],
    obter: (c, id) => DB[c].find((x) => x.id === id),
    gravar(c, obj) {
      if (!obj.id) { obj.id = U.id(); obj.criadoEm = new Date().toISOString(); DB[c].push(obj); }
      else { const i = DB[c].findIndex((x) => x.id === obj.id); if (i >= 0) DB[c][i] = Object.assign(DB[c][i], obj); else DB[c].push(obj); }
      obj.atualizadoEm = new Date().toISOString(); salvar(); return obj;
    },
    remover(c, id) { DB[c] = DB[c].filter((x) => x.id !== id); salvar(); },
    removerCliente(id) { COLECOES.forEach((c) => { DB[c] = DB[c].filter((x) => (c === 'clientes' ? x.id !== id : x.clienteId !== id)); }); salvar(); },
    salvar,
    cliente: (id) => DB.clientes.find((c) => c.id === id),
    nomeCliente(id) { const c = S.cliente(id); return c ? (c.fantasia || c.razaoSocial) : '(cliente removido)'; },
    clientesAtivos: () => DB.clientes.filter((c) => c.ativo !== false).sort((a, b) => (a.fantasia || a.razaoSocial).localeCompare(b.fantasia || b.razaoSocial, 'pt-BR')),
    tipoDoc: (id) => DB.config.tiposDocumento.find((t) => t.id === id) || { sigla: id, nome: id, validade: null },
    curso: (id) => DB.config.cursos.find((t) => t.id === id) || { nome: id, nr: '', validade: null },
    exportar() { const c = JSON.parse(JSON.stringify(DB)); return JSON.stringify(c, null, 2); },
    importar(txt) {
      const o = JSON.parse(txt);
      if (!o || typeof o !== 'object' || !Array.isArray(o.clientes)) throw new Error('Arquivo não parece um backup do SSMA Gestão.');
      localStorage.setItem(CHAVE, JSON.stringify(o)); carregar(); salvar();
    },
    zerar() { DB = vazio(); salvar(); }
  };

  // ---------- Regras derivadas ----------
  const R = {};
  R.vencDocumento = (d) => d.validade || (d.emissao ? U.somaMeses(d.emissao, S.tipoDoc(d.tipo).validade) : null);
  R.vencTreinamento = (t) => {
    if (t.vencimento) return t.vencimento;
    const m = t.validadeMeses != null && t.validadeMeses !== '' ? t.validadeMeses : S.curso(t.cursoId).validade;
    return m ? U.somaMeses(t.data, m) : null;
  };
  R.prazoESocial = (e) => {
    if (e.prazo) return e.prazo;
    if (e.evento === 'S-2210') return e.obito ? e.dataFato : U.proxDiaUtil(e.dataFato);
    return U.dia15MesSeguinte(e.dataFato);
  };
  R.cronogramaCIPA = (c) => {
    if (!c.fimMandato) return [];
    const fim = c.fimMandato;
    const edital = U.somaDias(fim, -60);
    return [
      { etapa: 'Publicação do edital de convocação da eleição (mín. 60 dias antes do fim do mandato)', data: edital },
      { etapa: 'Período de inscrições (mín. 15 dias corridos)', data: U.somaDias(edital, 1), ate: U.somaDias(edital, 15) },
      { etapa: 'Eleição (mín. 30 dias antes do fim do mandato)', data: U.somaDias(fim, -30) },
      { etapa: 'Treinamento dos eleitos (antes da posse)', data: U.somaDias(fim, -10) },
      { etapa: 'Fim do mandato atual', data: fim },
      { etapa: 'Posse da nova gestão (1º dia após o término)', data: U.somaDias(fim, 1) }
    ];
  };
  R.statusPsico = (p) => { const tot = NORMAS.etapasPsicossocial.length; const ok = (p.etapas || []).filter((e) => e && e.feito).length; return { ok, tot, pct: Math.round((ok / tot) * 100) }; };

  // Lista unificada de vencimentos / prazos (para painel e relatórios)
  R.vencimentos = (clienteId) => {
    const a = S.cfg.alertaDias; const out = [];
    const f = (x) => !clienteId || x.clienteId === clienteId;
    DB.documentos.filter(f).filter((d) => d.status !== 'substituido').forEach((d) => {
      const v = R.vencDocumento(d); const t = S.tipoDoc(d.tipo);
      out.push({ tipo: 'Documento', rota: 'documentos', id: d.id, clienteId: d.clienteId, titulo: `${t.sigla} ${d.descricao ? '– ' + d.descricao : ''}`.trim(), venc: v, sit: d.status === 'em_elaboracao' ? { cls: 'info', txt: 'Em elaboração', dias: U.diasAte(v) } : U.situacao(v, a) });
    });
    // Treinamentos: considera apenas a turma mais recente de cada curso por cliente
    const ult = {};
    DB.treinamentos.filter(f).forEach((t) => { const k = t.clienteId + '|' + (t.cursoId === 'outro' ? t.titulo : t.cursoId); if (!ult[k] || (t.data || '') > (ult[k].data || '')) ult[k] = t; });
    Object.values(ult).forEach((t) => { const v = R.vencTreinamento(t); if (v) out.push({ tipo: 'Treinamento', rota: 'treinamentos', id: t.id, clienteId: t.clienteId, titulo: t.titulo || S.curso(t.cursoId).nome, venc: v, sit: U.situacao(v, a) }); });
    DB.pendencias.filter(f).filter((p) => p.status !== 'concluida' && p.prazo).forEach((p) => {
      out.push({ tipo: 'Pendência', rota: 'pendencias', id: p.id, clienteId: p.clienteId, titulo: `[${p.categoria}] ${p.titulo}`, venc: p.prazo, sit: U.situacaoPrazo(p.prazo, 7) });
    });
    DB.esocial.filter(f).filter((e) => e.status !== 'enviado').forEach((e) => {
      const v = R.prazoESocial(e); out.push({ tipo: 'eSocial', rota: 'esocial', id: e.id, clienteId: e.clienteId, titulo: `${e.evento} – ${e.referencia || ''}`, venc: v, sit: U.situacaoPrazo(v, 5) });
    });
    DB.cipa.filter(f).filter((c) => c.status !== 'encerrado').forEach((c) => {
      if (c.modalidade === 'CIPA') { const ed = R.cronogramaCIPA(c)[0]; if (ed) out.push({ tipo: 'CIPA', rota: 'cipa', id: c.id, clienteId: c.clienteId, titulo: 'Edital de eleição da CIPA', venc: ed.data, sit: U.situacaoPrazo(ed.data, 30) }); }
      out.push({ tipo: 'CIPA', rota: 'cipa', id: c.id, clienteId: c.clienteId, titulo: `Fim do mandato ${c.modalidade === 'CIPA' ? 'da CIPA' : 'do designado'}`, venc: c.fimMandato, sit: U.situacaoPrazo(c.fimMandato, a) });
    });
    DB.auditorias.filter(f).filter((x) => x.status !== 'concluida').forEach((x) => {
      if (x.data && U.diasAte(x.data) >= 0) out.push({ tipo: 'Auditoria', rota: 'auditorias', id: x.id, clienteId: x.clienteId, titulo: `Auditoria ${x.norma}`, venc: x.data, sit: { cls: 'info', txt: `Em ${U.diasAte(x.data)} d`, dias: U.diasAte(x.data) } });
      if (x.prazoTratamento && (x.ncs || 0) > 0) out.push({ tipo: 'Auditoria', rota: 'auditorias', id: x.id, clienteId: x.clienteId, titulo: `Tratar ${x.ncs} NC – ${x.norma}`, venc: x.prazoTratamento, sit: U.situacaoPrazo(x.prazoTratamento, 15) });
    });
    return out.filter((x) => x.venc).sort((x, y) => x.venc.localeCompare(y.venc));
  };

  carregar();
  window.U = U; window.S = S; window.R = R;
})();
