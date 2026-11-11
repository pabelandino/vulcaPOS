# VulcaPOS

Punto de venta para una vulcanizadora. La caja es mobile first. El panel del administrador usa las tarjetas y las gráficas de [Horizon UI](https://github.com/horizon-ui/horizon-ui-chakra) (ApexCharts y la paleta `#4318FF`) construidas con Tailwind, para que el cobro en el teléfono no cargue Chakra.

## Qué incluye

- Ventas rápidas y órdenes de servicio (llanta u otro producto que trae el cliente, más el total)
- Búsqueda por nombre, SKU o código de barras
- Efectivo, tarjeta, transferencia y pago mixto
- Boucher para imprimir, con RUC, nombre de la empresa y textos editables
- Inventario en el momento del cobro
- Apertura, cierre y arqueo de caja
- Descuentos, IVA y devoluciones
- Reportes del día y por rango, con tarjetas de totales y tablas paginadas
- Clientes, proveedores, usuarios y roles
- Sucursales y cajas
- PWA instalable
- Cola local si se corta la red, y sincronización al volver
- Respaldo: primero el loader, y solo al terminar el modal para elegir dónde guardarlo

## Desarrollo en esta máquina

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:push
npm run dev
```

- App: http://localhost:5174
- API: http://localhost:3010/api

Usuarios demo (se crean solos si la base está vacía):

- `admin` / `Admin123!`
- `caja` / `Caja123!`

## Todo en Docker, en esta misma máquina

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Abra http://localhost:8080. La imagen final lleva JavaScript compilado y el esquema de Prisma. No lleva el código TypeScript ni el de React.

## Llevarlo a otra máquina sin el código

```bash
npm run package:release
```

Eso deja la carpeta `release/` con la imagen, el compose y las instrucciones. Esa carpeta es la que se copia. El detalle está en `deploy/LEEME.md`.
