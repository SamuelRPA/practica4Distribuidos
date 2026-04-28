import { createHash } from 'node:crypto';

export function hashContenidoActa(actaDatos) {
    const ordered = {
        codigo_mesa: actaDatos.codigo_mesa,
        votos_emitidos: actaDatos.votos_emitidos,
        ausentismo: actaDatos.ausentismo,
        p1: actaDatos.p1,
        p2: actaDatos.p2,
        p3: actaDatos.p3,
        p4: actaDatos.p4,
        votos_blancos: actaDatos.votos_blancos,
        votos_nulos: actaDatos.votos_nulos,
    };
    return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

export function hashBuffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
