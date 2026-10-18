export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Registro') => new HttpError(404, `${what} não encontrado`, 'not_found');
export const forbidden = (msg = 'Você não tem permissão para esta ação') => new HttpError(403, msg, 'forbidden');
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const conflict = (msg: string, code = 'conflict') => new HttpError(409, msg, code);
