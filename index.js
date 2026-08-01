const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Public static files
const staticPath = path.join(__dirname, 'public');
app.use(express.static(staticPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'NOTIGAS Web' });
});

app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('<h1>NOTIGAS Web App Active</h1>');
  }
});

app.listen(PORT, () => {
  console.log(`NOTIGAS Node.js Web App running on port ${PORT}`);
});
