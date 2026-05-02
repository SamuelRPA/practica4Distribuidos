# Arquitectura y Decisiones Tecnológicas: Sistema Nacional de Cómputo Electoral

Este documento detalla todas las tecnologías utilizadas en el proyecto, cómo interactúan entre sí y, lo más importante, **la justificación técnica de por qué se eligieron** frente a otras alternativas del mercado. Esto es ideal para una defensa de proyecto o tesis.

---

## 1. Bases de Datos: El Enfoque Políglota

El sistema utiliza un enfoque de **Persistencia Políglota**, usando la mejor herramienta para cada tipo de dato, dividiendo el Cómputo Oficial de los Resultados Preliminares (RRV).

### A. PostgreSQL (Cómputo Oficial)
* **Cómo lo usamos:** Almacena el padrón electoral estricto (mesas, recintos, distribución territorial) y las actas del cómputo oficial (`votos_oficiales`, `logs_oficial`, `transcripciones_pendientes`).
* **Por qué PostgreSQL y NO MySQL:** 
  * PostgreSQL es el estándar de oro para bases de datos relacionales con **cumplimiento ACID estricto**. En un sistema electoral, no podemos perder un solo voto por fallos de concurrencia.
  * Tiene mejor soporte para **concurrencia multiversión (MVCC)** que MySQL, lo que significa que las lecturas pesadas del Dashboard no bloquean las escrituras masivas de las actas.
  * Su motor de joins y subconsultas es más eficiente para generar las vistas complejas del dashboard (ej. promedios de tiempos por recinto cruzado con distribución territorial).

### B. MongoDB Atlas (Resultados Preliminares - RRV)
* **Cómo lo usamos:** Almacena la ingesta masiva y rápida de fotos (metadatos del OCR), SMS, y resultados preliminares en formato de documentos (`actas`, `sms_logs`, `ocr_results`).
* **Por qué MongoDB y NO Cassandra o PostgreSQL JSONB:**
  * **Frente a Cassandra:** Cassandra es excelente para escrituras, pero terrible para consultas dinámicas y búsquedas si no conoces la *Partition Key*. Mongo permite índices flexibles para buscar rápidamente un acta preliminar por cualquier campo.
  * **Frente a Postgres:** El RRV necesita un esquema flexible (Schemaless). Los resultados de OCR varían enormemente (algunas actas devuelven 5 campos leídos, otras 10, otras traen metadatos de errores de imagen). En Mongo, simplemente guardamos el JSON tal cual llega, sin alterar esquemas rígidos. Priorizamos la **velocidad de escritura** sobre la integridad referencial.

---

## 2. Asincronía y Mensajería: RabbitMQ

* **Cómo lo usamos:** Actúa como el sistema circulatorio del backend. Cuando llega una foto del acta, en lugar de procesarla inmediatamente (lo que bloquearía al usuario), el backend pone un mensaje en RabbitMQ. Los *workers* en segundo plano toman esos mensajes, hacen el trabajo pesado (OCR, validación) y guardan en BD.
* **Por qué RabbitMQ y NO Apache Kafka o Redis Pub/Sub:**
  * **Frente a Kafka:** Kafka está diseñado para streaming de eventos de Big Data (millones de eventos por segundo que no se borran). Nosotros necesitamos un sistema de **colas de tareas (Task Queues)** tradicional, donde si un *worker* procesa el acta, el mensaje se borra de la cola. RabbitMQ maneja excelentemente los `ACK` (reconocimiento). Si el worker del OCR colapsa a mitad de lectura, RabbitMQ detecta que no hubo `ACK` y le reasigna el acta a otro worker.
  * **Frente a Redis Pub/Sub:** Redis no garantiza la persistencia del mensaje si no hay consumidores activos. RabbitMQ guarda el mensaje en disco hasta que alguien esté listo para procesarlo.

---

## 3. Servicio de Visión Artificial (OCR)

* **Cómo lo usamos:** Un microservicio independiente que recibe una imagen (Base64), mejora su calidad y extrae los números de los votos.
* **Tecnologías:** **Python, Tesseract OCR, OpenCV, Docker.**
* **Por qué estas librerías y NO APIs de terceros (Google Vision / AWS Textract):**
  * **Soberanía de Datos:** Un sistema electoral nacional no puede depender de enviar fotos de actas oficiales a servidores de Amazon o Google en Estados Unidos. El procesamiento debe ser *On-Premise* (local).
  * **Por qué Python:** Es el lenguaje rey indiscutible para procesamiento de imágenes e Inteligencia Artificial.
  * **Por qué OpenCV:** Antes de leer el texto, el acta puede venir girada, con sombras o borrosa. OpenCV nos permite binarizar la imagen, aplicar umbrales adaptativos (Thresholding) y corregir la inclinación para que Tesseract no falle.
  * **Por qué Dockerizado:** Tesseract requiere binarios en C++ (`tesseract-ocr`, `libgl1`) a nivel de sistema operativo. Instalar esto nativamente en Windows o Mac es una pesadilla. Docker nos asegura un contenedor Linux puro y reproducible en cualquier máquina.

---

## 4. Orquestador de Backend: Node.js (Express)

* **Cómo lo usamos:** El servidor principal que expone las APIs REST, atiende a los usuarios, al dashboard y empuja datos a RabbitMQ.
* **Por qué Node.js y NO Java (Spring Boot) o Python (Django):**
  * Node.js utiliza un modelo **orientado a eventos y no bloqueante (Event Loop)**. Esto significa que puede manejar miles de conexiones simultáneas (ej. miles de notarios enviando SMS o actas al mismo tiempo) sin agotar la memoria RAM creando un hilo (*Thread*) por cada petición, como lo haría Java por defecto.
  * Dado que la mayoría de nuestro trabajo es I/O Bound (esperar a la base de datos o a RabbitMQ), Node.js es extremadamente rápido y ligero.

---

## 5. Ingesta Masiva y Automatización: n8n

* **Cómo lo usamos:** Para simular y automatizar la ingesta de las más de 5,000 actas de los operadores desde un archivo CSV hacia el backend.
* **Por qué n8n y NO Scripts Nativos o Apache Airflow:**
  * Escribir un script de Node o Python para leer un CSV está bien para 100 filas, pero para miles de filas sujetas a fallos de red, necesitamos **lógica de reintentos (Retries), control de errores, paralelismo y monitoreo visual**.
  * **Frente a Airflow:** Airflow es demasiado pesado y requiere escribir DAGs en Python. n8n es Node-based, ligero, y permite armar *pipelines* visuales en minutos con manejo automático de errores.

---

## 6. Frontend y Dashboard: Next.js + Tailwind CSS

* **Cómo lo usamos:** El portal web para los notarios, los digitadores y el centro de monitoreo (Dashboard y Mapas).
* **Por qué Next.js (React) y NO Angular o Vue:**
  * Next.js nos permite hacer **Server-Side Rendering (SSR)** o revalidación de datos rápida. Si millones de ciudadanos entran a ver los resultados, la carga de la página es casi instantánea.
  * **Tailwind CSS** nos permite construir interfaces hermosas y consistentes directamente en el HTML sin tener que pelear con miles de archivos `.css` separados.
  * Ecosistema inmenso para gráficas (Recharts) y mapas geográficos interactivos (Leaflet) que necesitamos para visualizar el territorio boliviano.

---

## Resumen de la Arquitectura Distribuida

El proyecto no es un monolito rígido, es una **Arquitectura Orientada a Servicios y Microservicios**:
1. El **Frontend** pide datos al **Backend API**.
2. El **Backend API** no se ahoga, delega el trabajo pesado a **RabbitMQ**.
3. Los **Workers** sacan tareas de RabbitMQ, llaman al **Servicio OCR (Python)** si es necesario, y guardan en **PostgreSQL o MongoDB**.
4. Todo encapsulado en **Docker Compose**, lo que hace que el sistema pueda escalarse fácilmente agregando más contenedores de Workers o más instancias de OCR si la carga aumenta.
