// Every setting has a working default, so .env is optional. See .env.example.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? 'data/dnd-playr.db',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  isProd: process.env.NODE_ENV === 'production',
}

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error(`PORT must be a valid port number, got: ${process.env.PORT}`)
}
