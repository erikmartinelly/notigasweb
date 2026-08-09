const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Servir archivos estáticos del directorio actual
app.use(express.static(__dirname));

// Para cualquier ruta que no sea un archivo, devolver index.html (SPA/PWA routing fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`NOTIGAS PWA Server running on port ${PORT}`);
});
