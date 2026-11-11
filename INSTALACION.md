# VulcaPOS — instalar y actualizar

La app que se usa en la caja es la de Docker, en http://localhost:8080.

La hora queda en Nicaragua (`America/Managua`).

## Antes de instalar

1. Instale [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. En Docker Desktop: **Settings → General → Start Docker Desktop when you sign in**.
3. Con eso, al encender la computadora Postgres y VulcaPOS vuelven solos. No hay que correr estos comandos cada día.

No use `docker compose down` ni `docker compose down -v`. El segundo borra las ventas.

## Instalar (solo la primera vez)

En la carpeta del proyecto:

```bash
cd /Users/pabel/Documents/Development/POS-services
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Abra http://localhost:8080.

Usuarios de demostración, si la base está vacía:

- `admin` / `Admin123!`
- `caja` / `Caja123!`

Desde el celular, en la misma red: `http://IP-DE-ESTA-PC:8080`.

## Actualizar después de un cambio

Cuando ya cambió el sistema y quiere que la caja use esa versión:

```bash
cd /Users/pabel/Documents/Development/POS-services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Eso recompila la app, la vuelve a levantar y aplica los cambios de la base. Las ventas, la caja y los usuarios se quedan.

Espere a que termine el build y vuelva a abrir http://localhost:8080. Si el navegador muestra la versión vieja, recargue la página.

## Ver los cambios mientras se trabaja

Esto no reemplaza la app instalada. Sirve para probar en esta computadora:

```bash
cd /Users/pabel/Documents/Development/POS-services
docker compose up -d
npm install
npm run dev
```

- Prueba: http://localhost:5174
- App instalada: http://localhost:8080

`npm run dev` hay que volver a abrirlo a mano. La de 8080 sí arranca sola con Docker.

Cuando el cambio ya está listo, use el comando de **Actualizar**.

## Llevar la misma versión a otra computadora

En esta máquina:

```bash
cd /Users/pabel/Documents/Development/POS-services
npm run package:release
```

Copie la carpeta `release/` a la otra computadora. Allá, la primera vez:

```bash
cp .env.example .env
gzip -dc vulcapos-app.tar.gz | docker load
docker compose up -d
```

Para actualizar esa otra computadora, copie el `vulcapos-app.tar.gz` nuevo y repita:

```bash
gzip -dc vulcapos-app.tar.gz | docker load
docker compose up -d
```

Postgres y las ventas de esa máquina se quedan. El detalle también está en `deploy/LEEME.md`.
