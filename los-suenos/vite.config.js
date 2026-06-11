import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      // Vite no decodifica %23 → # antes de buscar archivos estáticos en disco.
      // Este middleware lo hace, permitiendo servir archivos con # en el nombre.
      name: 'decode-hash-in-static-urls',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url) req.url = req.url.replace(/%23/g, '#');
          next();
        });
      },
    },
  ],
});
