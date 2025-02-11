const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const AI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.AI_API_KEY}`;

// Función para obtener la fecha actual
const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

// Función para obtener la fecha de ayer
const getYesterdayDate = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, "0");
    const day = String(yesterday.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

// Función para validar y actualizar el JSON
const validateJson = (json, text) => {
    if (text.toLowerCase().includes("hoy")) {
        json.date = getCurrentDate();
    } else if (text.toLowerCase().includes("ayer")) {
        json.date = getYesterdayDate();
    }

    if (text.toLowerCase().includes("caí") || text.toLowerCase().includes("caída")) {
        if (!text.toLowerCase().includes("no hubo heridos")) {
            json.injuries = true;
        } else {
            json.injuries = false;
        }
    }

    if (!json.date && !json.question.includes("fecha")) {
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

app.post("/api/analyze", async (req, res) => {
    try {
        console.log("🔹 Recibí una solicitud:", req.body);

        const { text, conversation } = req.body;
        if (!text) {
            return res.status(400).json({ error: "Falta el parámetro 'text'" });
        }

        // Construir el prompt con el historial de la conversación
        let prompt = `
        Analiza el siguiente texto y extrae las siguientes variables en formato JSON:
        - date: Fecha en formato YYYY-MM-DD. Si el usuario dice "hoy", usa la fecha actual. Si dice "ayer", usa la fecha de ayer.
        - location: Lugar del suceso (dirección o "domicilio titular").
        - description: Resumen breve en una oración.
        - injuries: true o false (si hay heridos). Si el usuario menciona una caída, asume que hay heridos a menos que diga explícitamente "no hubo heridos".
        - owner: true o false (si el usuario es el titular del objeto afectado).
        - complete: true si la información es suficiente, false si falta algo.
        - question: Si falta información, haz una pregunta específica para completar el JSON, si no, deja ""

        Texto del usuario: "${text}"`;

        // Agregar el historial de la conversación al prompt
        if (conversation && conversation.length > 0) {
            prompt += `\n\nHistorial de la conversación:\n`;
            conversation.forEach((entry) => {
                prompt += `${entry.role === "user" ? "Usuario" : "IA"}: ${entry.content}\n`;
            });
        }

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
            parsedJson = validateJson(parsedJson, text);

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