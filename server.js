const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

// Variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_fallback_desarrollo_123';

// Cliente Supabase con privilegios de administrador (bypassa RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Middleware para verificar JWT
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado: Token requerido' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

// ==========================================
// RUTAS DE AUTENTICACIÓN
// ==========================================

// Login General (Admins, Repartidores, Compradores)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) return res.status(401).json({ error: 'Usuario no encontrado' });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Registro
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role } = req.body;
  
  try {
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ email: email.toLowerCase(), password_hash: hash, role: role || 'comprador' }])
      .select('id, email, role')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: 'El usuario ya existe o los datos son inválidos' });
  }
});

// ==========================================
// RUTAS DE PUBLICACIONES
// ==========================================

// Obtener todas las publicaciones (Público)
app.get('/api/publicaciones', async (req, res) => {
  const { data, error } = await supabase.from('publicaciones').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Crear publicación (Protegido)
app.post('/api/publicaciones', requireAuth, async (req, res) => {
  const postData = { ...req.body, user_id: req.user.id, user_email: req.user.email };
  const { data, error } = await supabase.from('publicaciones').insert([postData]).select().single();
  
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Borrar publicación (Protegido - Solo dueño o Admin)
app.delete('/api/publicaciones/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  // Verificar si es dueño
  const { data: post } = await supabase.from('publicaciones').select('user_id').eq('id', id).single();
  if (!post) return res.status(404).json({ error: 'No encontrada' });

  if (post.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No tienes permiso para borrar esto' });
  }

  await supabase.from('publicaciones').delete().eq('id', id);
  res.json({ success: true });
});

// ==========================================
// ARCHIVOS ESTÁTICOS Y FRONTEND
// ==========================================
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else {
    res.send('<h1>NOTIGAS Web App API Activa</h1>');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NOTIGAS Express API ejecutándose en el puerto ${PORT}`);
});
