# PostgreSQL – Entorno local con Docker

Este proyecto utiliza **PostgreSQL corriendo en Docker** como base de datos local de desarrollo.

La infraestructura está pensada para ser:

- ♻️ Reproducible
- 💾 Persistente
- 🔌 Independiente del backend
- ☁️ Fácilmente migrable a nube en el futuro

---

## 📦 Contenedor

- **Imagen**: `postgres:16`
- **Nombre del contenedor**: `finances_postgres`
- **Base de datos**: `finances`
- **Usuario**: `finances_user`
- **Puerto expuesto**: `5432`
- **Persistencia**: volumen Docker

---

## 📁 Ubicación de la infraestructura

```

finances_backend/
└── infra/
└── docker/
└── docker-compose.yml

````

---

## ▶️ Comandos básicos

### Levantar el contenedor

```bash
docker compose up -d
````

### Ver contenedores activos

```bash
docker ps
```

### Detener el contenedor

```bash
docker compose down
```

> ⚠️ Esto **NO borra los datos** (gracias al volumen Docker)

---

## 🧠 Logs y diagnóstico

### Ver logs de PostgreSQL

```bash
docker logs finances_postgres
```

Buscar el mensaje:

```
database system is ready to accept connections
```

---

## 🔐 Acceso a la base de datos (psql)

### Entrar al contenedor con psql

```bash
docker exec -it finances_postgres psql -U finances_user -d finances
```

### Comandos útiles dentro de psql

```sql
\l          -- listar bases de datos
\dt         -- listar tablas
\dn         -- listar schemas
\conninfo   -- info de conexión
\q          -- salir
```

---

## 💾 Persistencia de datos

Los datos **NO viven en el proyecto**, sino en un **volumen Docker**.

En el `docker-compose.yml` se define:

```yaml
volumes:
  finances_pgdata:
```

Docker Compose **prefija automáticamente** el nombre del volumen con el nombre del proyecto, por ejemplo:

```
docker_finances_pgdata
```

👉 Ese es el volumen real donde vive Postgres.

### Listar volúmenes

```bash
docker volume ls
```

---

### ⚠️ Borrar datos (solo si querés resetear TODO)

```bash
docker volume rm docker_finances_pgdata
```

> ❗ Esto elimina **toda la base de datos**

---

## 🧪 Checks rápidos de estado

### Ver si Postgres responde

```bash
docker exec -it finances_postgres pg_isready -U finances_user
```

Resultado esperado:

```
accepting connections
```

---

## 💼 Backup & Restore (migrar datos a otra PC)

Esta sección permite **copiar toda la base de datos** a otra computadora **sin perder nada**.

---

### 📤 Backup del volumen (PC origen)

#### 1️⃣ Detener el contenedor (OBLIGATORIO)

```bash
docker compose down
```

---

#### 2️⃣ Crear backup del volumen

Desde la carpeta del proyecto:

```bash
docker run --rm `
  -v docker_finances_pgdata:/volume `
  -v ${PWD}:/backup `
  busybox `
  tar czf /backup/docker_finances_pgdata.tar.gz -C /volume .
```

📦 Se genera el archivo:

```
docker_finances_pgdata.tar.gz
```

➡️ Copiar este archivo a la otra PC (pendrive, Drive, scp, etc).

---

### 📥 Restore del volumen (PC destino)

#### 1️⃣ Crear el volumen vacío

```bash
docker volume create docker_finances_pgdata
```

---

#### 2️⃣ Restaurar los datos

Ubicate en la carpeta donde esté el `.tar.gz` y ejecutá:

```bash
docker run --rm `
  -v docker_finances_pgdata:/volume `
  -v ${PWD}:/backup `
  busybox `
  tar xzf /backup/docker_finances_pgdata.tar.gz -C /volume
```

---

#### 3️⃣ Levantar el contenedor

```bash
docker compose up -d
```

---

#### 4️⃣ Verificación

```bash
docker exec -it finances_postgres psql -U finances_user -d finances
```

Si ves tus tablas → ✅ restore correcto.

---

## 🔧 Configuración importante

* Las credenciales **son solo para desarrollo**
* No usar estas credenciales en producción
* No commitear `.env` ni secretos reales

---

## 🚫 Qué NO hace este contenedor

* ❌ No crea tablas
* ❌ No maneja migraciones
* ❌ No conoce el backend
* ❌ No contiene lógica de negocio

👉 Es **solo infraestructura**.
