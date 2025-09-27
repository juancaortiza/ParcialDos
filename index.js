require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Joi = require("joi");
const sql = require("mssql");
const swaggerUi = require("swagger-ui-express");
const swaggerJSDoc = require("swagger-jsdoc");

const app = express();
app.use(cors());
app.use(express.json());

/* ====== Validación ====== */
const movieSchema = Joi.object({
  imdbID: Joi.string().trim().required(),
  Title: Joi.string().trim().required(),
  Year: Joi.string().trim().required(),
  Type: Joi.string().trim().required(),
  Poster: Joi.string().uri().required(),
  Estado: Joi.boolean().required(),
  description: Joi.string().trim().required(),
  Ubication: Joi.string().trim().required()
});

/* ====== Conexión SQL Server ====== */
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST === "true"
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let pool;
async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(dbConfig);
  console.log("✅ Conectado a SQL Server");
  return pool;
}

/* ====== Swagger ====== */
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "API Cartelera - Serie I",
      version: "1.0.0",
      description: "Examen: Solo POST /api/cartelera"
    },
    servers: [
      { url: "http://localhost:" + (process.env.PORT || 3000), description: "Local" }
    ],
    components: {
      schemas: {
        Movie: {
          type: "object",
          required: ["imdbID","Title","Year","Type","Poster","Estado","description","Ubication"],
          properties: {
            imdbID: { type: "string", example: "80000" },
            Title:  { type: "string", example: "Titanes del Atlantico" },
            Year:   { type: "string", example: "2013" },
            Type:   { type: "string", example: "Ciencia Ficcion" },
            Poster: { type: "string", example: "https://demo/demoimages.png" },
            Estado: { type: "boolean", example: true },
            description: { type: "string", example: "La humanidad se transforma..." },
            Ubication:   { type: "string", example: "POPCINEMA" }
          }
        },
        ApiReply: {
          type: "object",
          properties: {
            codError: { type: "string", example: "200" },
            msgRespuesta: { type: "string", example: "Registro Insertado" }
          }
        }
      }
    },
    paths: {
      "/api/cartelera": {
        post: {
          summary: "Inserta un nuevo registro de película",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Movie" } } }
          },
          responses: {
            "200": {
              description: "Registro insertado correctamente",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ApiReply" } } }
            },
            "400": { description: "Solicitud inválida o datos repetidos (Bad Request)" },
            "500": { description: "Error interno del servidor" }
          }
        }
      }
    }
  },
  apis: []
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

/* ====== Rutas ====== */

// Salud
app.get("/", (_req, res) => res.send("API Cartelera (Serie I). Documentación en /docs"));

// Serie I: POST /api/cartelera
app.post("/api/cartelera", async (req, res) => {
  try {
    const { error, value } = movieSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        codError: "400",
        msgRespuesta: "Solicitud inválida (Bad Request)",
        detalles: error.details.map(d => d.message)
      });
    }

    const pool = await getPool();
    const q = `
      INSERT INTO dbo.Cartelera (imdbID, Title, [Year], [Type], Poster, Estado, [description], Ubication)
      VALUES (@imdbID, @Title, @Year, @Type, @Poster, @Estado, @description, @Ubication);
    `;
    const r = pool.request()
      .input("imdbID", sql.VarChar(50), value.imdbID)
      .input("Title", sql.NVarChar(200), value.Title)
      .input("Year", sql.VarChar(10), value.Year)
      .input("Type", sql.NVarChar(100), value.Type)
      .input("Poster", sql.NVarChar(500), value.Poster)
      .input("Estado", sql.Bit, value.Estado)
      .input("description", sql.NVarChar(sql.MAX), value.description)
      .input("Ubication", sql.NVarChar(100), value.Ubication);

    await r.query(q);

    return res.status(200).json({ codError: "200", msgRespuesta: "Registro Insertado" });
  } catch (e) {
    // Duplicado PK (imdbID)
    if (e && (e.number === 2627 || e.number === 2601)) {
      return res.status(400).json({ codError: "400", msgRespuesta: "Ya existe un registro con ese imdbID" });
    }
    console.error("❌ Error:", e);
    return res.status(500).json({ codError: "500", msgRespuesta: "Error interno del servidor" });
  }
});

/* ====== Arranque ====== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  console.log(`Swagger:   http://localhost:${PORT}/docs`);
});
