export function getUrl() {
  const base = (() => {
    if (typeof window !== 'undefined') return '';
    if (process.env.APP_URL) return process.env.APP_URL;
    return 'http://localhost:3000';
  })();
  return `${base}/api/trpc`;
}

export enum TRPCErrorCodes {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  PRECONDITION_REQUIRED = 'PRECONDITION_REQUIRED',
}