const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
const allowedOrigins = ['https://aivo-frontend.netlify.app', 'http://localhost:3000'];

const corsOptions = {
    origin: (origin, callback) => {
      if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  };

const AI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.AI_API_KEY}`;

app.post("/api/analyze", async (req, res) => {
    try {
        console.log("🔹 Recibí una solicitud:", req.body);

        const { text, conversation } = req.body;
        if (!text) {
            return res.status(400).json({ error: "Falta el parámetro 'text'" });
        }

        // Obtener la fecha actual
        const getCurrentDate = () => {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, "0");
            const day = String(today.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        // Obtener la fecha de ayer
        const getYesterdayDate = () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            const year = yesterday.getFullYear();
            const month = String(yesterday.getMonth() + 1).padStart(2, "0");
            const day = String(yesterday.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        };

        // Construir el prompt
        const prompt = `
        Analiza el siguiente texto y extrae las siguientes variables en formato JSON:
        - date: Fecha en formato YYYY-MM-DD. Si el usuario dice "hoy", usa la fecha actual. Si dice "ayer", usa la fecha de ayer.
        - location: Lugar del suceso (dirección o "domicilio titular").
        - description: Resumen breve en una oración.
        - injuries: true o false (si hay heridos). Siempre consultar si hubo heridos salvo que este implicitamente dicho".
        - owner: true o false (si el usuario es el titular del objeto afectado).
        - complete: true si la información es suficiente, false si falta algo.
        - question: Si falta información, haz una pregunta específica para completar el JSON, si no, deja ""

        Texto del usuario: "${text}"

        Responde solo con el JSON. No agregues explicaciones ni texto adicional.`;

        const response = await axios.post(AI_API_URL, {
            contents: [{ parts: [{ text: prompt }] }],
        });

        let aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiResponse) {
            return res.status(500).json({ error: "Error al procesar la respuesta de la IA." });
        }

        // Limpiar la respuesta antes de parsearla
        aiResponse = aiResponse.replace(/```json|```/g, "").trim();

        try {
            let parsedJson = JSON.parse(aiResponse);

            // Validar y corregir el JSON
            if (text.toLowerCase().includes("hoy")) {
                parsedJson.date = getCurrentDate();
            } else if (text.toLowerCase().includes("ayer")) {
                parsedJson.date = getYesterdayDate();
            }
            if (text.toLowerCase().includes("caí") || text.toLowerCase().includes("caída")) {
                if (!text.toLowerCase().includes("no hubo heridos")) {
                    parsedJson.injuries = true;
                } else {
                    parsedJson.injuries = false;
                }
            }

            const validateJson = (json) => {
                if (!json.date && !json.question.includes("fecha") || json.date === "YYYY-MM-DD") {
                    json.complete = false;
                    json.question = "¿Cuál es la fecha del suceso?";
                }
                if (!json.location && !json.question.includes("lugar")) {
                    json.complete = false;
                    json.question = "¿Dónde ocurrió el suceso?";
                }
                if (json.injuries === undefined && !json.question.includes("heridos")) {
                    json.complete = false;
                    json.question = "¿Hubo heridos en el incidente?";
                }
                if (json.owner === undefined && !json.question.includes("titular")) {
                    json.complete = false;
                    json.question = "¿Eres el titular del objeto afectado?";
                }
                return json;
            };

            parsedJson = validateJson(parsedJson);

            console.log("🔹 Respuesta de la IA:", parsedJson);
            res.json(parsedJson);
        } catch (parseError) {
            console.error("❌ Error al parsear JSON:", aiResponse);
            res.status(500).json({ error: "La IA devolvió un JSON mal formado." });
        }
    } catch (error) {
        console.error("❌ Error en el backend:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error al procesar la solicitud." });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));