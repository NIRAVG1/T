import { createApp } from './app';

// Vercel's Express runtime invokes the exported app as a function.
const { app } = createApp();
export default app;
