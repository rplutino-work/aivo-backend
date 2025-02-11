const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

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

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
const allowedOrigins = ['https://aivo-frontend.netlify.app', 'http://localhost:3000'];



const AI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.AI_API_KEY}`;

const validateJson = (json, conversation) => {
    // Verificar si ya se ha respondido alguna pregunta
    const userResponses = conversation.filter(entry => entry.role === 'user');

    if (!json.date && !userResponses.some(response => response.content.toLowerCase().includes('hoy') || response.content.toLowerCase().includes('ayer'))) {
        json.complete = false;
        json.question = "¿Cuál es la fecha del suceso?";
    } else if (!json.location && !userResponses.some(response => response.content.toLowerCase().includes("lugar"))) {
        json.complete = false;
        json.question = "¿Dónde ocurrió el suceso?";
    } else if (json.injuries === undefined || null) {
        json.complete = false;
        json.question = "¿Hubo heridos?";
    } else if (json.owner === undefined || null) {
        json.complete = false;
        json.question = "¿Eres el titular afectado?";
    } else {
        json.complete = true;
        json.question = "";
    }

    return json;
};

let jsonState = {
    date: "",
    location: "",
    description: "",
    injuries: undefined,
    owner: undefined,
    complete: false,
    question: ""
};

app.post("/api/analyze", async (req, res) => {
    try {
        console.log("🔹 Recibí una solicitud:", req.body);

        const { text, conversation } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Falta el parámetro 'text'" });
        }

        // Construir el prompt con el estado actual del JSON
        const prompt = `
        Analiza el siguiente texto y actualiza el siguiente JSON con la información proporcionada por el usuario. Solo actualiza los campos que estén vacíos o que necesiten corrección. No hagas preguntas sobre campos que ya estén completos.

        JSON actual:
        ${JSON.stringify(jsonState, null, 2)}

        Instrucciones:
        - date: Fecha en formato DD-MM-YYYY. Si es hoy usar el dia actual, si es ayer usar el dia anterior.
        - location: Lugar del suceso. Preguntar si no es claro.
        - description: Resumen breve en una oración.
        - injuries: true si hay heridos o lesiones o rompeduras de miembros o patologias fisicas, sino false. Siempre consultar si hubo heridos.
        - owner: true o false (si el usuario es el titular del objeto afectado).
        - complete: true si la información del json esta completa y la situacion es clara, false si falta algo.
        - question: Si falta información, haz una pregunta específica para completar el JSON. Si no falta nada, deja "".

        Texto del usuario: "${text}"

        Responde solo con el JSON actualizado. No agregues explicaciones ni texto adicional.`;

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

            // Actualizar solo los campos faltantes en el JSON
            if (parsedJson.date && !jsonState.date) {
                jsonState.date = parsedJson.date;
            }
            if (parsedJson.location && !jsonState.location) {
                jsonState.location = parsedJson.location;
            }
            if (parsedJson.description && !jsonState.description) {
                jsonState.description = parsedJson.description;
            }
            if (parsedJson.injuries !== undefined && jsonState.injuries === undefined) {
                jsonState.injuries = parsedJson.injuries;
            }
            if (parsedJson.owner !== undefined && jsonState.owner === undefined) {
                jsonState.owner = parsedJson.owner;
            }
            if (parsedJson.complete !== undefined) {
                jsonState.complete = parsedJson.complete;
            }
            if (parsedJson.question) {
                jsonState.question = parsedJson.question;
            }

            // Validar y corregir el JSON
            jsonState = validateJson(jsonState, conversation);

            console.log("🔹 Respuesta de la IA:", jsonState);
            res.json(jsonState);
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