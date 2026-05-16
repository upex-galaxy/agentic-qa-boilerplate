import { defineConfig } from 'allure';

export default defineConfig({
  name: 'Agentic QA Boilerplate',
  output: './allure-report',
  plugins: {
    awesome: {
      options: {
        reportLanguage: 'en',
      },
    },
  },
});
