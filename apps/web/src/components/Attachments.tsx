import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, download, get, qs, upload } from '../api';
import { useAuth } from '../auth';
import { ErrorNotice, fmtBytes, fmtDateTime, useToast } from './ui';

interface Attachment {
  id: string;
  fileName: string;
  size: number;
  mimeType: string;
  sha256: string;
  createdAt: string;
}

/** Evidências/comprovantes de um registro (tarefa, ocorrência, entrega de EPI…). */
export function Attachments({ entity, entityId, writePerm, title = 'Evidências e anexos' }: { entity: string; entityId: string; writePerm: string; title?: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const key = ['attachments', entity, entityId];
  const list = useQuery({ queryKey: key, queryFn: () => get<Attachment[]>(`/attachments${qs({ entity, entityId })}`) });
  const send = useMutation({
    mutationFn: (f: File) => upload(`/attachments/${entity}/${entityId}`, f),
    onSuccess: () => {
      toast('Arquivo anexado');
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/attachments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <div className="card">
      <div className="page-head" style={{ marginBottom: 8 }}>
        <h3>{title}</h3>
        {can(writePerm) && (
          <>
            <input ref={input} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.odt,.ods,.csv,.txt" onChange={(e) => e.target.files?.[0] && send.mutate(e.target.files[0])} />
            <button className="btn sm" onClick={() => input.current?.click()} disabled={send.isPending}>{send.isPending ? 'Enviando…' : '+ Anexar arquivo'}</button>
          </>
        )}
      </div>
      {list.error ? <ErrorNotice error={list.error} /> : null}
      {!list.data?.length ? (
        <p className="muted small">Nenhum arquivo anexado.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {list.data.map((a) => (
            <li key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eef0ef' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.fileName}</div>
                <div className="muted small" title={`SHA-256 ${a.sha256}`}>{fmtBytes(a.size)} · {fmtDateTime(a.createdAt)}</div>
              </div>
              <button className="btn sm" onClick={() => download(`/attachments/${a.id}/download`, a.fileName)}>Baixar</button>
              {can(writePerm) && <button className="btn sm danger" onClick={() => confirm('Remover anexo?') && remove.mutate(a.id)}>Remover</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
