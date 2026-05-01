// Logger con colores ANSI — sin dependencias.
// Estilo: [modulo] icono mensaje  ↳ datos

const C = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    gray:    '\x1b[90m',
};

function ts() {
    const d = new Date();
    return `${d.toLocaleTimeString('es-BO', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function tag(color, mod) {
    return `${C.gray}${ts()}${C.reset} ${color}[${mod.padEnd(14)}]${C.reset}`;
}

function dump(data) {
    if (data === undefined || data === null || data === '') return '';
    if (typeof data === 'string') return ` ${C.dim}${data}${C.reset}`;
    return `\n${C.dim}   ↳ ${JSON.stringify(data, null, 2).replace(/\n/g, '\n     ')}${C.reset}`;
}

export function makeLogger(modulo) {
    return {
        info:    (msg, data) => console.log(`${tag(C.cyan, modulo)} ${msg}${dump(data)}`),
        success: (msg, data) => console.log(`${tag(C.green, modulo)} ${C.green}✓${C.reset} ${msg}${dump(data)}`),
        warn:    (msg, data) => console.warn(`${tag(C.yellow, modulo)} ${C.yellow}⚠${C.reset} ${msg}${dump(data)}`),
        error:   (msg, err)  => console.error(`${tag(C.red, modulo)} ${C.red}✗${C.reset} ${msg}${dump(err?.message || err)}`),
        recv:    (msg, data) => console.log(`${tag(C.magenta, modulo)} ${C.magenta}📥${C.reset} ${msg}${dump(data)}`),
        send:    (msg, data) => console.log(`${tag(C.blue, modulo)} ${C.blue}📤${C.reset} ${msg}${dump(data)}`),
        photo:   (msg, data) => console.log(`${tag(C.magenta, modulo)} ${C.magenta}📷${C.reset} ${msg}${dump(data)}`),
        sms:     (msg, data) => console.log(`${tag(C.magenta, modulo)} ${C.magenta}📨${C.reset} ${msg}${dump(data)}`),
        cog:     (msg, data) => console.log(`${tag(C.cyan, modulo)} ${C.cyan}⚙${C.reset}  ${msg}${dump(data)}`),
        db:      (msg, data) => console.log(`${tag(C.green, modulo)} ${C.green}🗄${C.reset}  ${msg}${dump(data)}`),
    };
}

export function banner(titulo) {
    const sep = '═'.repeat(60);
    console.log(`\n${C.bold}${C.cyan}${sep}\n  ${titulo}\n${sep}${C.reset}\n`);
}
