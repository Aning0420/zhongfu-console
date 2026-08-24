import worker from '../../../cloudflare-worker/src/index';

interface PagesContext {
  request: Request;
  env: Parameters<typeof worker.fetch>[1];
}

export function onRequest(context: PagesContext) {
  return worker.fetch(context.request, context.env);
}
