// Worker del sitio: sirve los archivos estáticos y atiende /api/* y las caricaturas.
import { handleContact } from './contact.js';
import { handleAdmin } from './admin.js';
import { handlePublicApi, servePublicImage } from './public.js';
import { getAdmin } from './auth.js';
import { error } from './lib/util.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/api/contact') return await handleContact(request, env, url);
      if (p.startsWith('/api/admin/')) return await handleAdmin(request, env, url);
      if (p.startsWith('/api/')) return await handlePublicApi(request, env, url);
      if (p.startsWith('/img/ninos/')) return await servePublicImage(request, env, url);
      // El panel también exige login aquí, por si alguien entra por una URL que Access no cubre.
      if (p === '/admin' || p.startsWith('/admin/')) {
        if (!(await getAdmin(request, env, url))) return error('unauthorized', 401);
        return env.ASSETS.fetch(request);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('Error no controlado', err);
      return error('server_error', 500);
    }
  },
};
