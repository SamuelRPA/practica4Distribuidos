"""Orquesta la carga completa de datos maestros."""
import parse_distribucion
import parse_recintos
import parse_mesas


def main():
    print('==== Carga de datos maestros ====')
    parse_distribucion.main()
    parse_recintos.main()
    parse_mesas.main()
    print('==== OK ====')


if __name__ == '__main__':
    main()
