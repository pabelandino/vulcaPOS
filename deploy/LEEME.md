# VulcaPOS en otra máquina (sin código fuente)

Esta carpeta es lo único que se copia. No trae el código del programa: trae la imagen ya compilada y el archivo para arrancar Postgres y la aplicación con Docker.

## Qué necesita la máquina

- Docker Desktop encendido (Windows, Mac o Linux)
- Nada de Node.js ni el código fuente

## Arranque

En esta carpeta:

```bash
cp .env.example .env
gzip -dc vulcapos-app.tar.gz | docker load
docker compose up -d
```

En Windows PowerShell, si `gzip` no existe:

```powershell
docker load -i vulcapos-app.tar.gz
docker compose up -d
```

Abra `http://localhost:8080`.

En el celular o en otra caja de la misma red use `http://IP-DE-ESTA-PC:8080` e instale la app desde el navegador (botón Instalar app, o en iPhone: Compartir → Agregar a inicio).

## Usuarios de demostración

- Administrador: `admin` / `Admin123!`
- Caja: `caja` / `Caja123!`

La primera vez la base se llena sola con ventas y servicios de varias fechas.

## Respaldo

Entre como administrador → Ajustes → Crear respaldo. Espere el aviso de que está generando. Cuando termina, aparece la ventana para elegir la carpeta o el USB.

No borre el volumen de Docker (`docker compose down -v` borra las ventas).

## Actualizar

En la máquina de desarrollo se genera un `vulcapos-app.tar.gz` nuevo. Aquí se vuelve a cargar la imagen y se recrea solo el contenedor de la app:

```bash
gzip -dc vulcapos-app.tar.gz | docker load
docker compose up -d
```

Postgres y las ventas se quedan.
