const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
let currentLevel = LEVELS.info

function log(level, context, msg, data) {
  if (LEVELS[level] < currentLevel) return
  const ts = new Date().toISOString().slice(11, 23)
  const prefix = `[${ts}] [${level.toUpperCase()}] [${context}] ${msg}`
  const fn = console[level] ?? console.log
  data !== undefined ? fn(prefix, data) : fn(prefix)
}

const logger = {
  setLevel: (level) => { currentLevel = LEVELS[level] ?? LEVELS.info },
  debug: (ctx, msg, data) => log('debug', ctx, msg, data),
  info:  (ctx, msg, data) => log('info',  ctx, msg, data),
  warn:  (ctx, msg, data) => log('warn',  ctx, msg, data),
  error: (ctx, msg, data) => log('error', ctx, msg, data instanceof Error ? data.stack : data),
}

export default logger
