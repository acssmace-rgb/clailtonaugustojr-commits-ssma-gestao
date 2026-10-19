import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../api';
import { useAuth } from '../auth';
import { ErrorNotice, Field } from '../components/ui';

function AuthShell({ children }: { children: ReactNode }) {
  const { brand } = useAuth();
  return (
    <div className="auth-page">
      <section className="auth-brand">
        {brand.logos.fullDarkBackground ? <img className="logo" src={brand.logos.fullDarkBackground} alt={brand.name} /> : <h2>{brand.productName}</h2>}
        <div>
          <h1>Gestão integrada de Saúde, Segurança e Meio Ambiente</h1>
          <p>Cadastros, riscos, documentos, atividades, alertas, relatórios e preparação dos eventos SST do eSocial em um só lugar.</p>
        </div>
        <small style={{ color: 'var(--brand-neutral)' }}>{brand.tagline}</small>
        {brand.logos.symbol ? <img className="symbol" src={brand.logos.symbol} alt="" aria-hidden /> : null}
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}

export function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { refresh, me } = useAuth();
  const [step, setStep] = useState<'login' | 'mfa'>(me?.mfaPending ? 'mfa' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    await refresh();
    nav('/');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'login') {
        const r = await post<{ mfaRequired: boolean }>('/auth/login', { email, password });
        if (r.mfaRequired) setStep('mfa');
        else await done();
      } else {
        await post('/auth/mfa/verify', { code });
        await done();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <h2>{step === 'login' ? 'Entrar' : 'Verificação em duas etapas'}</h2>
        {step === 'login' ? (
          <div className="grid" style={{ gap: 14 }}>
            <Field label="E-mail"><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Senha"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </div>
        ) : (
          <Field label="Código do aplicativo autenticador" help="Digite o código de 6 dígitos gerado no seu aplicativo (Google Authenticator, Microsoft Authenticator etc.).">
            <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </Field>
        )}
        <div style={{ marginTop: 14 }}><ErrorNotice error={error} /></div>
        <button className="btn primary" style={{ width: '100%', marginTop: 16 }} disabled={busy}>{busy ? 'Aguarde…' : step === 'login' ? 'Entrar' : 'Confirmar'}</button>
        {step === 'login' && <p className="small" style={{ textAlign: 'center', marginTop: 14 }}><Link to="/esqueci-senha">Esqueci minha senha</Link></p>}
      </form>
    </AuthShell>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<null | boolean>(null);
  const [error, setError] = useState<unknown>(null);
  return (
    <AuthShell>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await post<{ emailConfigured: boolean }>('/auth/password/forgot', { email });
            setSent(r.emailConfigured);
          } catch (err) {
            setError(err);
          }
        }}
      >
        <h2>Recuperar senha</h2>
        {sent === null ? (
          <>
            <Field label="E-mail cadastrado"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <div style={{ marginTop: 12 }}><ErrorNotice error={error} /></div>
            <button className="btn primary" style={{ width: '100%', marginTop: 16 }}>Enviar link</button>
          </>
        ) : (
          <div className={`notice ${sent ? 'ok' : 'warn'}`}>
            {sent
              ? 'Se o e-mail estiver cadastrado, você receberá um link para definir uma nova senha.'
              : 'O envio de e-mails não está configurado neste ambiente. Solicite ao administrador a redefinição do seu acesso.'}
          </div>
        )}
        <p className="small" style={{ textAlign: 'center', marginTop: 14 }}><Link to="/login">Voltar ao login</Link></p>
      </form>
    </AuthShell>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <AuthShell>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return setError(new Error('As senhas não conferem'));
          try {
            await post('/auth/password/reset', { token: params.get('token') ?? '', password });
            nav('/login');
          } catch (err) {
            setError(err);
          }
        }}
      >
        <h2>Definir nova senha</h2>
        <div className="grid" style={{ gap: 14 }}>
          <Field label="Nova senha" help="Mínimo de 10 caracteres, com letras e números."><input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirme a senha"><input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12 }}><ErrorNotice error={error} /></div>
        <button className="btn primary" style={{ width: '100%', marginTop: 16 }}>Salvar senha</button>
      </form>
    </AuthShell>
  );
}
