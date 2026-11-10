import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'standalone',publicDir:'../public',plugins:[react()],build:{outDir:'../standalone-dist',emptyOutDir:true}});
