import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const portfolioJson = fileURLToPath(new URL('../src/main/resources/portfolio.json', import.meta.url));

// In `npm run dev`, serve the portfolio JSON straight from the Spring resources folder
// so the front end can be worked on without starting Spring Boot.
const devPortfolioApi = {
  name: 'dev-portfolio-api',
  configureServer(server) {
    server.middlewares.use('/api/portfolio', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(readFileSync(portfolioJson));
    });
  },
};

// The built site is written straight into Spring Boot's static resources,
// so `mvn package` produces a single jar that serves everything.
export default defineConfig({
  plugins: [devPortfolioApi],
  build: {
    outDir: '../target/classes/static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], physics: ['cannon-es'] },
      },
    },
  },
  server: {
    port: 5173,
    // Other API calls (contact form) go to the running Spring Boot app.
    proxy: { '/api/contact': 'http://localhost:8690', '/actuator': 'http://localhost:8690' },
  },
});
